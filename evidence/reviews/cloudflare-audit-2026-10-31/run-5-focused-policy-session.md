# Focused offline policy and session helper check — run 5

Date: 2026-10-31  
Application source SHA: 3e613c0b7df5bec290553cfb7b5a9404bfaec1a1  
Run status: INCOMPLETE; narrow helper-only execution.

## Scope

The exact-source TypeScript files api/src/lib/policy.ts and api/src/modules/auth/session.ts were extracted from the application source SHA above. A Node built-in test harness exercised exported pure helpers. A loader stubbed only the uncalled Prisma accessor and ApiError dependency. No Express route, middleware chain, database, deployment, browser, or application integration was run.

## Sandbox and execution

Cached Docker image node:24-alpine, Docker Engine 29.9.2. Execution used no network, read-only container root and target bind, scratch-only writable bind, dropped capabilities, no-new-privileges, UID/GID 1000, 128 MiB memory, 0.25 CPU, 16 PID limit, 1 MiB file limit, and a 16 MiB noexec/nosuid/nodev tmpfs. Environment was cleared and allowlisted to PATH, HOME=/scratch, and TMPDIR=/scratch. No dependencies were installed or fetched.

Command shape:

    docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 --memory 128m --cpus 0.25 --pids-limit 16 --ulimit fsize=1048576:1048576 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000 --mount type=bind,source=<run-5>/target,target=/target,readonly --mount type=bind,source=<run-5>/agents/parent/scratch,target=/scratch --entrypoint /usr/bin/env node:24-alpine -i PATH=<allowlisted> HOME=/scratch TMPDIR=/scratch node --experimental-strip-types --experimental-loader=/target/loader.mjs --test /target/policy.test.mjs /target/session.test.mjs

Exit code 0: 14 passed, 0 failed.

Policy cases covered generic denial for foreign-organization and same-organization other-customer objects, own-customer and staff same-organization visibility, composed tenant/requester scope, customer edit restrictions, closed-ticket comment conflict, and customer denial of staff-only management.

Session helper cases covered production HTTPS/secret configuration, strict session-cookie parsing, SHA-256/HMAC derivation, exact Origin enforcement, CSRF proof allow/deny behavior, and cookie options.

## Limitations and release status

This does not prove route authorization, middleware integration, database enforcement, mutation side effects, assignment atomicity, rate limiting, migration behavior, query bounds, proxy behavior, or UI behavior. Do not mark those acceptance cases PASS from this run.

The full Cloudflare security audit remains INCOMPLETE. Required application integration lanes and the five previously deferred areas are still open; there is no compliant preinstalled Linux Vitest/Supertest/Playwright/Prisma test toolchain available in this environment. No packages were installed or fetched. Windows Sandbox is unavailable. No deployed endpoint was probed.

Preview agent/customer journeys and foreign-ticket read/write no-side-effect checks remain BLOCKED / NOT_RUN. Owner-confirmed Neon Preview compute readiness, safe synthetic role credentials, and a verified second-tenant fixture are still required before fixture discovery or Preview requests.

The originating operator note is stored outside the repository at C:/Users/sivaa/security-audit-skill/customer-support-platform/run-5/focused-policy-session-check.md. This repository copy makes the scoped result reviewable; it does not upgrade the audit verdict.
