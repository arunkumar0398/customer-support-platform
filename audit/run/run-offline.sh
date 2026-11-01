#!/usr/bin/env bash
set -euo pipefail

fail() { printf 'AUDIT_RUN_REFUSED: %s\n' "$1" >&2; exit 2; }

lane="${1:-}"
case "$lane" in
  api) ;;
  web) ;;
  browser) ;;
  all) ;;
  *) fail 'usage: run-offline.sh {api|web|browser|all}; no arbitrary command execution is supported' ;;
esac

[[ -z "$(find /scratch -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail '/scratch must be empty at lane start'
mkdir -p /scratch/home /scratch/tmp
chmod 0700 /scratch/home /scratch/tmp

[[ "${AUDIT_SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'AUDIT_SOURCE_SHA must identify the reviewed source commit'
[[ -d /scratch/source && -r /scratch/source/package-lock.json ]] || fail 'trusted parent must place the exact candidate copy in /scratch/source'
[[ -r /scratch/source/.audit-source-sha ]] || fail 'trusted parent must write the source SHA marker into the scratch copy'
[[ "$(cat /scratch/source/.audit-source-sha)" == "$AUDIT_SOURCE_SHA" ]] || fail 'scratch source SHA marker does not match AUDIT_SOURCE_SHA'
[[ -L /scratch/source/node_modules ]] || fail 'scratch candidate node_modules must point to the immutable preinstalled toolchain'
[[ "$(sha256sum /scratch/source/package-lock.json | awk '{print $1}')" == '30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0' ]] || fail 'candidate lockfile does not match the toolchain manifest'

export DATABASE_URL='postgresql://support_dev:audit-only@127.0.0.1:5432/support_dev'
export DATABASE_URL_UNPOOLED="$DATABASE_URL"
export TEST_DATABASE_URL='postgresql://support_test:audit-only@127.0.0.1:5432/support_test'
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

"/opt/audit-runner/preflight.sh" >/scratch/preflight.out || { cat /scratch/preflight.out >&2; fail 'sandbox preflight did not pass'; }
cat /scratch/preflight.out

[[ -r /input/source.tar ]] || fail 'trusted parent must mount the exact source archive read-only at /input/source.tar'
input_options="$(findmnt -n -o OPTIONS -T /input/source.tar 2>/dev/null || true)"
[[ ",$input_options," == *,ro,* ]] || fail 'source archive mount must be read-only'
[[ "${AUDIT_ARCHIVE_SHA256:-}" =~ ^[0-9a-f]{64}$ ]] || fail 'AUDIT_ARCHIVE_SHA256 must identify the source archive'
[[ "$(sha256sum /input/source.tar | awk '{print $1}')" == "$AUDIT_ARCHIVE_SHA256" ]] || fail 'source archive checksum mismatch'
mkdir -p /scratch/source
archive_size="$(stat -c '%s' /input/source.tar)"
[[ "$archive_size" =~ ^[0-9]+$ ]] && (( archive_size <= 600 * 1024 * 1024 )) || fail 'source archive exceeds the 600 MiB compressed input bound'
python3 - <<'PY'
import os
import pathlib
import tarfile

root = pathlib.Path('/scratch/source')
total = 0
per_file_limit = 100 * 1024 * 1024
total_limit = 500 * 1024 * 1024

with tarfile.open('/input/source.tar', 'r:') as archive:
    members = archive.getmembers()
    if not members:
        raise SystemExit('source archive is empty')
    if len(members) > 50000:
        raise SystemExit('source archive contains more than 50,000 entries')
    for item in members:
        path = pathlib.PurePosixPath(item.name)
        if path.is_absolute() or not path.parts or any(part in ('', '.', '..') for part in path.parts):
            raise SystemExit(f'unsafe archive path: {item.name!r}')
        if not (item.isdir() or item.isfile()):
            raise SystemExit(f'non-regular archive entry refused: {item.name!r}')
        if item.isfile():
            if item.size < 0 or item.size > per_file_limit:
                raise SystemExit(f'archive file exceeds size bound: {item.name!r}')
            total += item.size
            if total > total_limit:
                raise SystemExit('source archive exceeds cumulative size bound')
        destination = root.joinpath(*path.parts)
        if not destination.resolve().is_relative_to(root):
            raise SystemExit(f'archive path escapes scratch: {item.name!r}')
        if item.isdir():
            destination.mkdir(mode=0o700, parents=True, exist_ok=True)
            if not destination.is_dir() or destination.is_symlink():
                raise SystemExit(f'archive directory conflicts with an unsafe path: {item.name!r}')
            continue
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
        descriptor = os.open(destination, flags, 0o600)
        try:
            source = archive.extractfile(item)
            if source is None:
                raise SystemExit(f'archive file data missing: {item.name!r}')
            with source, os.fdopen(descriptor, 'wb', closefd=False) as output:
                copied = 0
                while block := source.read(1024 * 1024):
                    copied += len(block)
                    if copied > item.size or copied > per_file_limit:
                        raise SystemExit(f'archive file changed size: {item.name!r}')
                    output.write(block)
                if copied != item.size:
                    raise SystemExit(f'archive file truncated: {item.name!r}')
        finally:
            os.close(descriptor)

source_sha = os.environ['AUDIT_SOURCE_SHA']
(root / '.audit-source-sha').write_text(source_sha + '\n', encoding='ascii')
os.symlink('/opt/toolchain/project/node_modules', root / 'node_modules')
PY

pg_bin="$(find /usr/lib/postgresql -mindepth 2 -maxdepth 2 -type d -name bin -print -quit)"
[[ -x "$pg_bin/initdb" && -x "$pg_bin/pg_ctl" && -x "$pg_bin/psql" ]] || fail 'PostgreSQL server/client binaries are missing from the prepared toolchain'
export PATH="$pg_bin:$PATH"
initdb -D /scratch/pgdata --username=audit --auth-local=trust --auth-host=trust >/scratch/initdb.out
cleanup() {
  trap - EXIT INT TERM
  if pg_ctl -D /scratch/pgdata status >/dev/null 2>&1; then
    pg_ctl -D /scratch/pgdata stop -m fast >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir -p /scratch/pgsocket
pg_ctl -D /scratch/pgdata -o '-h 127.0.0.1 -p 5432 -k /scratch/pgsocket' -l /scratch/postgres.log start >/dev/null
psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U audit -d postgres <<'SQL'
CREATE ROLE support_dev LOGIN PASSWORD 'audit-only';
CREATE ROLE support_test LOGIN PASSWORD 'audit-only';
CREATE DATABASE support_dev OWNER support_dev;
CREATE DATABASE support_test OWNER support_test;
SQL

cd /scratch/source
mkdir -p api/src
npm run db:generate --workspace api
case "$lane" in
  api)
    npm run db:migrate:test
    npm run test:api
    ;;
  web)
    npm run test:web
    ;;
  browser)
    npm run db:migrate:test
    npm run test:e2e -- --workers=1
    ;;
  all)
    npm run db:migrate:test
    npm run check
    npm run test:e2e -- --workers=1
    ;;
esac
