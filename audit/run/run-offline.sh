#!/usr/bin/env bash
set -euo pipefail

fail() { printf 'AUDIT_RUN_REFUSED: %s\n' "$1" >&2; exit 2; }

lane="${1:-}"
case "$lane" in
  api) ;;
  web) ;;
  browser) ;;
  browser-smoke) ;;
  all) ;;
  *) fail 'usage: run-offline.sh {api|web|browser|browser-smoke|all}; no arbitrary command execution is supported' ;;
esac

[[ -z "$(find /scratch -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail '/scratch must be empty at lane start'
mkdir -p /scratch/home /scratch/tmp
chmod 0700 /scratch/home /scratch/tmp
exec > /scratch/lane.log 2>&1
finish() { status=$?; trap - EXIT; if [[ -d /scratch/pgdata ]] && pg_ctl -D /scratch/pgdata status >/dev/null 2>&1; then pg_ctl -D /scratch/pgdata stop -m fast >/dev/null 2>&1 || true; fi; printf '{"lane":"%s","exitCode":%s}\n' "$lane" "$status" > /scratch/lane-result.json; exit "$status"; }
trap finish EXIT

[[ "${AUDIT_SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'AUDIT_SOURCE_SHA must identify the reviewed source commit'

export DATABASE_URL='postgresql://support_dev:audit-only@127.0.0.1:5432/support_dev'
export DATABASE_URL_UNPOOLED="$DATABASE_URL"
export TEST_DATABASE_URL='postgresql://support_test:audit-only@127.0.0.1:5432/support_test'
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

/bin/bash /runner/preflight.sh >/scratch/preflight.out || { cat /scratch/preflight.out >&2; fail 'sandbox preflight did not pass'; }
cat /scratch/preflight.out

[[ -r /input/source.tar ]] || fail 'trusted parent must mount the exact source archive read-only at /input/source.tar'
input_options="$(findmnt -n -o OPTIONS -T /input/source.tar 2>/dev/null || true)"
[[ ",$input_options," == *,ro,* ]] || fail 'source archive mount must be read-only'
[[ "${AUDIT_ARCHIVE_SHA256:-}" =~ ^[0-9a-f]{64}$ ]] || fail 'AUDIT_ARCHIVE_SHA256 must identify the source archive'
[[ "$(sha256sum /input/source.tar | awk '{print $1}')" == "$AUDIT_ARCHIVE_SHA256" ]] || fail 'source archive checksum mismatch'
[[ "$(git get-tar-commit-id < /input/source.tar)" == "$AUDIT_SOURCE_SHA" ]] || fail 'Git archive commit marker mismatch'
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
toolchain_modules = pathlib.Path('/opt/toolchain/project/node_modules')
modules = root / 'node_modules'
if modules.exists() or modules.is_symlink():
    raise SystemExit('archive must not contain a node_modules path')
modules.mkdir(mode=0o700)
for item in sorted(toolchain_modules.iterdir(), key=lambda path: path.name):
    if item.name == '.vite-temp':
        continue
    os.symlink(item, modules / item.name, target_is_directory=item.is_dir())
(modules / '.vite-temp').mkdir(mode=0o700)
PY

[[ -r /scratch/source/package-lock.json ]] || fail 'archive did not contain the package lockfile'
[[ "$(cat /scratch/source/.audit-source-sha)" == "$AUDIT_SOURCE_SHA" ]] || fail 'scratch source SHA marker does not match AUDIT_SOURCE_SHA'
[[ -d /scratch/source/node_modules && ! -L /scratch/source/node_modules ]] || fail 'scratch candidate node_modules overlay is missing'
[[ -L /scratch/source/node_modules/.bin && -d /scratch/source/node_modules/.vite-temp && -w /scratch/source/node_modules/.vite-temp ]] || fail 'scratch-only Vite temp path or immutable binary links are missing'
[[ "$(sha256sum /scratch/source/package-lock.json | awk '{print $1}')" == '30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0' ]] || fail 'candidate lockfile does not match the toolchain manifest'

pg_bin="$(find /usr/lib/postgresql -mindepth 2 -maxdepth 2 -type d -name bin -print -quit)"
[[ -x "$pg_bin/initdb" && -x "$pg_bin/pg_ctl" && -x "$pg_bin/psql" ]] || fail 'PostgreSQL server/client binaries are missing from the prepared toolchain'
export PATH="$pg_bin:$PATH"
initdb -D /scratch/pgdata --username=audit --auth-local=trust --auth-host=trust >/scratch/initdb.out
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir -p /scratch/pgsocket
pg_ctl -D /scratch/pgdata -o '-h 127.0.0.1 -p 5432 -k /scratch/pgsocket' -l /scratch/postgres.log start >/dev/null
psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U audit -d postgres <<'SQL'
CREATE ROLE support_dev LOGIN PASSWORD 'audit-only';
CREATE ROLE support_test LOGIN PASSWORD 'audit-only';
CREATE DATABASE support_dev OWNER support_dev;
CREATE DATABASE support_test OWNER support_test;
REVOKE CONNECT ON DATABASE support_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE support_dev TO support_dev;
REVOKE CONNECT ON DATABASE support_test FROM PUBLIC;
GRANT CONNECT ON DATABASE support_test TO support_test;
SQL

cd /scratch/source
mkdir -p api/src
npm run db:generate --workspace api
case "$lane" in
  api)
    npm run db:migrate:test
    npm run test:api -- --fsModuleCachePath=/scratch/vitest-cache --maxWorkers=2
    ;;
  web)
    npm run test:web -- --fsModuleCachePath=/scratch/vitest-cache --maxWorkers=2
    ;;
  browser)
    npm run db:migrate:test
    npm run test:e2e -- --workers=1 --timeout=90000
    ;;
  browser-smoke)
    npm run db:migrate:test
    if DEBUG='pw:browser' NODE_OPTIONS='--report-on-fatalerror --report-directory=/scratch' npm run test:e2e -- --workers=1 --timeout=90000 --grep='redirects unauthenticated visits to the sign-in page'; then
      browser_status=0
    else
      browser_status=$?
    fi
    python3 -c 'import glob,json; [print("NODE_FATAL_REPORT:", f, json.dumps({"header":(r:=json.load(open(f))).get("header"),"javascriptStack":r.get("javascriptStack"),"nativeStack":r.get("nativeStack")},indent=2)[:12000]) for f in glob.glob("/scratch/report.*.json")]'
    exit "$browser_status"
    ;;
  all)
    npm run db:migrate:test
    npm run lint
    npm run typecheck
    npm run test:api -- --fsModuleCachePath=/scratch/vitest-cache --maxWorkers=2
    npm run test:web -- --fsModuleCachePath=/scratch/vitest-cache --maxWorkers=2
    npm run test:e2e -- --list
    npm run build
    npm run test:e2e -- --workers=1 --timeout=90000
    ;;
esac
