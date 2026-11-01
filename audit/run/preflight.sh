#!/usr/bin/env bash
set -euo pipefail

fail() { printf 'PREFLIGHT_FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PREFLIGHT_PASS: %s\n' "$1"; }

for writable_path in "${HOME:-}" "${TMPDIR:-}"; do
  [[ "$writable_path" == /scratch/* ]] || fail 'HOME and TMPDIR must be isolated beneath /scratch'
  mkdir -p "$writable_path"
  chmod 0700 "$writable_path"
done

[[ "$(id -u)" != "0" ]] || fail 'container must run as a non-root uid'
[[ -d /scratch && -w /scratch ]] || fail '/scratch is missing or not writable'
[[ -r /input/source.tar && -r /input/launch-record.json ]] || fail 'read-only source archive or launch record is missing'
[[ -r /runner/run-offline.sh && -r /runner/promote_artifacts.py && -r /runner/verify_input.py ]] || fail 'read-only trusted runner scripts are missing'
[[ -x /opt/cloudflare-security-audit-skill/skills/security-audit/validate-findings.cjs ]] || fail 'pinned Cloudflare findings validator is missing'
[[ -x /opt/cloudflare-security-audit-skill/skills/security-audit/validate-coverage-ledger.cjs ]] || fail 'pinned Cloudflare coverage validator is missing'
[[ "$(cat /opt/cloudflare-security-audit-skill/.git/HEAD 2>/dev/null || true)" == 'c1c8a8c1471069fb0e188eeaff69b8e8db6564a8' ]] || fail 'Cloudflare skill checkout does not match the pinned commit'
[[ "$(git -c safe.directory=/opt/cloudflare-security-audit-skill -C /opt/cloudflare-security-audit-skill rev-parse HEAD 2>/dev/null || true)" == 'c1c8a8c1471069fb0e188eeaff69b8e8db6564a8' ]] || fail 'Cloudflare skill Git object does not match the pinned commit'

root_options="$(findmnt -n -o OPTIONS /)"
[[ ",$root_options," == *,ro,* ]] || fail 'container root filesystem is not read-only'
input_options="$(findmnt -n -o OPTIONS /input)"
[[ ",$input_options," == *,ro,* ]] || fail 'source archive mount is not read-only'
runner_options="$(findmnt -n -o OPTIONS /runner)"
[[ ",$runner_options," == *,ro,* ]] || fail 'trusted runner mount is not read-only'
scratch_options="$(findmnt -n -o OPTIONS /scratch)"
[[ ",$scratch_options," == *,rw,* ]] || fail 'scratch mount is not writable'

routes="$(ip -o route show 2>/dev/null || true)"
if printf '%s\n' "$routes" | grep -q '^default '; then
  fail 'default route exists; expected an isolated loopback-only network namespace'
fi
interfaces="$(ip -o link show | awk -F': ' '$3 ~ /<[^>]*UP[^>]*>/ {name=$2; sub(/@.*/, "", name); print name}' | sort -u | paste -sd, -)"
[[ "$interfaces" == 'lo' ]] || fail "unexpected active network interfaces: ${interfaces}"
if env | cut -d= -f1 | grep -Eiq '^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|http_proxy|https_proxy|all_proxy|no_proxy)$'; then
  fail 'proxy environment variable exists'
fi
while IFS= read -r variable_name; do
  case "$variable_name" in
    AUDIT_ARCHIVE_SHA256|AUDIT_EXPECTED_IMAGE_DIGEST|AUDIT_LAUNCH_RECORD_SHA256|AUDIT_LOCK_SHA256|AUDIT_SOURCE_SHA|AUDIT_TREE_MANIFEST_SHA256|CI|DATABASE_URL|DATABASE_URL_UNPOOLED|HOME|HOSTNAME|NODE_ENV|NODE_VERSION|PATH|PLAYWRIGHT_BROWSERS_PATH|PWD|SHLVL|TEST_DATABASE_URL|TMPDIR|YARN_VERSION|_)
      ;;
    *) fail "environment variable is outside the explicit allowlist: ${variable_name}" ;;
  esac
done < <(env | cut -d= -f1)

[[ "$(node --version)" == 'v24.22.1' ]] || fail 'Node version does not match the manifest'
[[ "$(npm --version)" == '11.19.1' ]] || fail 'npm version does not match the manifest'
[[ "$(vitest --version)" == *'vitest/5.0.5'* ]] || fail 'Vitest version does not match the lockfile'
[[ "$(playwright --version)" == 'Version 1.64.1' ]] || fail 'Playwright version does not match the lockfile'
prisma --version 2>&1 | grep -Eq '^prisma *: 7\.10\.1$' || fail 'Prisma version does not match the lockfile'
node -e "if (require('/opt/toolchain/project/node_modules/supertest/package.json').version !== '7.3.1') process.exit(1)" || fail 'Supertest version does not match the lockfile'
browser_binary="$(find /opt/pw-browsers -type f \( -path '*/chrome-linux/chrome' -o -path '*/chrome-linux64/chrome' \) -print -quit 2>/dev/null || true)"
[[ -n "$browser_binary" && -x "$browser_binary" ]] || fail 'matching Playwright Chromium binary is missing'
psql --version | grep -q 'PostgreSQL' || fail 'PostgreSQL client is unavailable'
initdb_path="$(find /usr/lib/postgresql -mindepth 3 -maxdepth 3 -type f -name initdb -print -quit 2>/dev/null || true)"
[[ -x "$initdb_path" ]] || fail 'PostgreSQL server tools are unavailable'

memory_limit="$(cat /sys/fs/cgroup/memory.max 2>/dev/null || true)"
swap_limit="$(cat /sys/fs/cgroup/memory.swap.max 2>/dev/null || true)"
cpu_limit="$(cat /sys/fs/cgroup/cpu.max 2>/dev/null || true)"
pids_limit="$(cat /sys/fs/cgroup/pids.max 2>/dev/null || true)"
[[ "$memory_limit" =~ ^[0-9]+$ ]] || fail 'finite cgroup memory limit is not visible'
(( memory_limit > 0 && memory_limit <= 1610612736 )) || fail 'memory limit is missing or exceeds 1536 MiB'
[[ "$swap_limit" =~ ^[0-9]+$ ]] || fail 'finite cgroup swap limit is not visible'
(( swap_limit == 0 )) || fail 'swap must be disabled (memory.swap.max must be zero)'
[[ "$cpu_limit" =~ ^[0-9]+[[:space:]][0-9]+$ ]] || fail 'finite cgroup CPU limit is not visible'
cpu_quota="${cpu_limit%% *}"
cpu_period="${cpu_limit##* }"
(( cpu_quota > 0 && cpu_period > 0 && cpu_quota <= cpu_period )) || fail 'CPU limit is missing or exceeds 1 CPU'
[[ "$pids_limit" =~ ^[0-9]+$ ]] || fail 'finite cgroup process limit is not visible'
(( pids_limit > 0 && pids_limit <= 256 )) || fail 'process limit is missing or exceeds 256 PIDs'
file_limit="$(awk '$1 == "Max" && $2 == "file" && $3 == "size" {print $4}' /proc/self/limits)"
file_hard_limit="$(awk '$1 == "Max" && $2 == "file" && $3 == "size" {print $5}' /proc/self/limits)"
file_units="$(awk '$1 == "Max" && $2 == "file" && $3 == "size" {print $6}' /proc/self/limits)"
[[ "$file_limit" =~ ^[0-9]+$ && "$file_hard_limit" =~ ^[0-9]+$ && "$file_units" == bytes ]] || fail 'finite byte-based file-size ulimit is not visible'
(( file_limit == 1073741824 && file_hard_limit == 1073741824 )) || fail 'file-size ulimit must be exactly 1 GiB (1073741824 bytes) for the bounded PostgreSQL WAL setup'
scratch_kib="$(df -Pk /scratch | awk 'NR==2 {print $2}')"
[[ "$scratch_kib" =~ ^[0-9]+$ ]] && (( scratch_kib <= 1150000 )) || fail 'scratch disk limit is missing or exceeds 1.1 GiB'

[[ "$AUDIT_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'AUDIT_SOURCE_SHA must be a full commit id'
[[ "$AUDIT_ARCHIVE_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail 'AUDIT_ARCHIVE_SHA256 must be a source digest'
[[ "$AUDIT_LAUNCH_RECORD_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail 'AUDIT_LAUNCH_RECORD_SHA256 must be a launch-record digest'
[[ "$AUDIT_TREE_MANIFEST_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail 'AUDIT_TREE_MANIFEST_SHA256 must be a Git tree-manifest digest'
[[ "$AUDIT_EXPECTED_IMAGE_DIGEST" == 'sha256:e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3' ]] || fail 'unexpected toolchain image digest'
[[ "$AUDIT_LOCK_SHA256" == '30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0' ]] || fail 'lockfile hash differs from prepared toolchain'
python3 /runner/verify_input.py || fail 'trusted source binding verification failed'
pass "source archive, launch record, tree identity and runner hashes verified for $AUDIT_SOURCE_SHA"
[[ -z "${DATABASE_URL:-}" || "$DATABASE_URL" == 'postgresql://support_dev:audit-only@127.0.0.1:5432/support_dev' ]] || fail 'DATABASE_URL must be the fixed loopback dummy URL'
[[ -z "${DATABASE_URL_UNPOOLED:-}" || "$DATABASE_URL_UNPOOLED" == 'postgresql://support_dev:audit-only@127.0.0.1:5432/support_dev' ]] || fail 'DATABASE_URL_UNPOOLED must be the fixed loopback dummy URL'
[[ -z "${TEST_DATABASE_URL:-}" || "$TEST_DATABASE_URL" == 'postgresql://support_test:audit-only@127.0.0.1:5432/support_test' ]] || fail 'TEST_DATABASE_URL must be the fixed loopback dummy URL'

pass "non-root uid $(id -u)"
pass 'root filesystem, source archive and runner mounts read-only; scratch writable'
pass 'loopback-only network namespace with no inherited proxy'
pass "Node $(node --version), npm $(npm --version), Vitest, Supertest, Prisma, Playwright, PostgreSQL present"
pass "cgroup memory=${memory_limit}, cpu=${cpu_limit}, pids=${pids_limit}; file-size=${file_limit}/${file_hard_limit} bytes and scratch limits active"
pass "cgroup swap=${swap_limit} (disabled); pinned Cloudflare skill commit c1c8a8c1471069fb0e188eeaff69b8e8db6564a8"
printf 'PREFLIGHT_COMPLETE: source binding and sandbox controls passed before target execution.\n'
