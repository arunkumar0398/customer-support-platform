# Supabase Preview portability package

**Base:** `main` at `70a30e413e286748bd8b298ec96a99ee5c46d0c8`
**Branch:** `feat/supabase-preview-migration`
**Initial worktree:** clean isolated worktree at `D:/__superset/cactro-tests/_react-node-apps/customer-support-platform-supabase-preview`
**Design:** approved repository-only design in [the availability ADR/spec](../specs/2026-11-03-neon-supabase-availability-and-preview.md). Approval does not cover any hosted project, data, settings, deployment, paid plan, or Production cutover.

## Scope

Keep the current PostgreSQL schema, app authentication, role model, API contract, same-origin proxy, and current Production provider. Add only a serverless pool-size policy, provider-neutral local configuration comments, and documentation for an owner-approved Supabase Preview rehearsal. Do not change the Neon-specific Production demo-account PR or any hosted service.

## Tasks and verification

1. **Pool policy:** add a pure helper that selects pool max `1` when Vercel's documented runtime marker `VERCEL=1` is present and retains `10` locally. Keep the cached module-scope Prisma client. Add unit tests for Vercel Preview/Production markers and local mode. Run the focused API unit test and typecheck.
2. **Environment/docs:** clarify `DATABASE_URL` runtime and `DATABASE_URL_UNPOOLED` migration roles in `.env.example`. Update architecture and operations docs without replacing the current Neon topology; link the proposed Supabase Preview design and note that it has not been executed.
3. **Preview runbook:** document project/role design, Data API decision, connection modes, pooler limitations, backup/restore/migration comparison, synthetic-only acceptance, cleanup/recovery, and explicit owner approval gates. Include no actual URLs or secret values.
4. **Validation:** run focused API tests, `npm run check`, documentation contract, internal Markdown-link validation, and `git diff --check` on this branch. Use only local/disposable test infrastructure. Do not fetch/install dependencies unless the existing lockfile installation is needed and available; do not run hosted migrations.
5. **Review:** inspect the complete diff for secrets, stale provider claims, untested availability claims, and accidental Production behavior changes. Report exact local SHA and test exits. Do not push, open a PR, deploy, or merge without the separate authorization required by AGENTS.md.

## Known evidence limits

- No live Neon/Supabase target or hosted data metadata is inspected by this package.
- The pool size of one is a conservative Vercel start point, not a throughput validation. Preview concurrency tests and Supavisor metrics are required before increasing it.
- Supavisor behavior for the locked Prisma adapter versions must be tested in an owner-approved Preview project.
- No migration/restore rehearsal, Vercel environment change, deployment, or Production cutover is part of this package.

## Local execution record

**Source baseline:** `main` at `70a30e413e286748bd8b298ec96a99ee5c46d0c8`. The working candidate is uncommitted; no candidate commit SHA or CI result exists yet.

| Command | Result | Scope and limitation |
|---|---|---|
| `npm ci --ignore-scripts` | PASS, exit 0 | Used only dependencies already present in the lockfile; Prisma client was generated separately with `npm run db:generate --workspace api`. No dependency or lockfile changes. |
| `npm run test:api -- tests/db/pool-config.test.ts` | PASS, exit 0; 3/3 | Focused pool policy unit tests. |
| `npm run db:migrate:test` | PASS, exit 0 | Three checked-in migrations applied to the newly created isolated `support_test` database on local PostgreSQL. |
| `npm run db:verify-test` | PASS, exit 0 | Verified database/user identity `support_test` / `support_test`. |
| `C:\nvm4w\nodejs\node.exe --env-file=.env C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js run check` | PASS, exit 0 | Lint and API/Web typechecks passed; API 434/434, Web 17/17; Playwright discovery listed 47; API and Web builds passed. A private ignored `.env` was created for the run and removed afterward. |
| `C:\nvm4w\nodejs\node.exe --env-file=.env C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js run test:e2e` | PASS, exit 0; 47/47 | Full Playwright browser suite passed against the local synthetic test database. The local lifecycle test reconciled and cleaned its run-owned fixtures, reporting zero residual organizations, users, and tickets and removal of private credential/manifest files. |
| `python scripts/check-doc-contract.py` | PASS, exit 0 | Required documentation sections and acceptance-ledger structure. |
| Local Markdown link check | PASS | Temporary checker verified relative file links in six changed Markdown documents; checker was removed afterward. |
| `git diff --check` | PASS, exit 0 | No whitespace errors. |
| Docker engine and isolated database | PASS | Docker Desktop 4.97.0, Linux engine 29.9.2 (`linux/amd64`); `postgres:18.6-alpine` was already present. The local database used unique Compose project `csp-supabase-preview-20261103`, a separate port, and its own named volume. After tests, the unique test container, network, volume, and private `.env` were removed; the pre-existing original-worktree database volume was retained. |

**Local container recovery note:** the first database start used the Compose file's fixed default project name and would have reused the original worktree's database volume. I stopped that container before migrations or tests, restored the original database service using its own worktree configuration, and reran all database work under the unique isolated Compose project above. The original persistent volume received no migration, seed, or test writes; the original worktree remained unchanged.

**Setup failures and resolution:** the initial bare `npm run check` exited 1 because no `TEST_DATABASE_URL` was inherited; the guarded API suites rejected running without it. The first isolated `npm run db:migrate:test` also stopped at authentication before migrations because its local URL still referenced port 5433. I corrected only the ignored worktree `.env` to use the isolated port, verified `support_test` / `support_test`, and then the full check and browser suite passed. No hosted URL was involved. The isolated environment and volume were removed after validation.

No hosted project, database, Vercel setting, deployment, or migration was touched. The pool sizing is source-reviewed and locally unit-tested only; its Vercel runtime behavior and Supavisor compatibility remain unverified until a separately approved Preview deployment.

The Playwright run changed 12 committed TK-29 screenshot fixtures in this isolated worktree. All 12 were restored to their pre-run versions after confirming they were clean before the run; final `git status` contains no screenshot edits. The original dirty screenshot worktrees were not used or changed.
