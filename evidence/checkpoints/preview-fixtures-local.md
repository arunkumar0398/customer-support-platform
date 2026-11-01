# Preview fixture provisioner — local evidence

**Date:** 2026-11-01 (Asia/Calcutta)
**Branch:** `codex/preview-provisioner-f55decb`
**Base commit:** `f55decb8368f5ea3997020845577372a8eafb6a0`
**Candidate status:** package commit is on this branch; the recorded local commands ran against the same source tree immediately before commit. Exact-SHA CI has not run because the branch has not been pushed.
**Environment:** Windows 11, Node `v24.22.1`, npm `11.19.1`, Docker Desktop, PostgreSQL `18.6-alpine`.

## Scope delivered

- Shared application scrypt hash/verify implementation in `api/src/modules/auth/password.ts`; login now imports the same verifier. Hash parameters and encoded format are preserved.
- Strict Preview/local target CLI in `scripts/preview/target.ts`, `cli.ts`, `verify-target.ts`, `provision-fixtures.ts`, and `cleanup-fixtures.ts`.
- Run-scoped, transactional two-organization fixture creator and manifest-checked cleanup in `scripts/preview/fixtures.ts`.
- Focused password/target/provisioner tests and local commands in `api/tests/auth/password.test.ts`, `api/tests/preview/provisioning.test.ts`, and root `package.json`.
- Operator guide: `docs/preview-validation.md`.
- Execution plan: `docs/superpowers/plans/2026-11-01-preview-fixtures-and-release-gates.md`.

## Target and credential protections

- The tool never loads `.env`; database URLs come only from `TEST_DATABASE_URL` or `PREVIEW_DIRECT_DATABASE_URL`, never command-line arguments. The credential URL was not written to this evidence.
- The target check compares URL protocol, direct Neon endpoint hostname, owner-supplied Neon branch ID, database, and username before connecting; it then checks PostgreSQL `current_database()` and `current_user`. Neon endpoint-to-branch mapping remains an owner-confirmed fact; the script cannot independently query that mapping.
- Local mode requires loopback `support_test` / `support_test`. Preview write commands require an explicit `--confirm-preview-write`; the flag does not replace project-owner approval. Neon pooled hosts and unsafe connection options are rejected; TLS certificate verification is enforced.
- Provisioning writes random passwords only to an exclusive-create file outside the repository and returns only a sanitized manifest. Passwords/hashes/connection URLs are not logged or committed. On Windows the operator must use a private directory ACL; POSIX mode bits alone are not treated as Windows access control.
- Provisioning uses UUIDs, run-tagged identifiers, randomized high ticket numbers, collision checks, plain inserts, and one transaction. A confirmed rollback removes private output files. Once COMMIT begins—or if rollback cannot be confirmed—the credentials and manifest are preserved for operator reconciliation so a lost commit response cannot strand fixtures without recovery material.
- Cleanup requires a matching run ID, exact target and manifest, and explicit confirmation. It validates manifest schema, uniqueness, role/organization/requester relationships, organizations, accounts, memberships, tickets, and child actor ownership before deleting the selected run's data. It fails closed on unowned memberships or comments/activity. A retry after successful DB deletion can remove stale private files without broad deletes.
- Existing local seed guard and `api/prisma/seed.ts` were not changed.

## Disposable database evidence

Created a new container named `csp-preview-provisioner-test-20261101` from the already available `postgres:18.6-alpine` image and bound it only to `127.0.0.1:55439`. Its bootstrap administrator created distinct least-privilege `support_test` and `support_dev` roles/databases; `PUBLIC` access to `support_dev` was revoked. The test DB was migrated with the repository's existing three Prisma migrations. The test and development credentials were generated in the runner process, never printed or saved.

After verification the newly created container was removed by its exact name. The final full suite and CLI smoke used the pre-existing disposable loopback `localhost:55432` `support_test` database/user; target guards verified the identity and no connection string was recorded. The existing compose database/API containers were not changed. A post-cleanup aggregate check found 0 run-tagged organizations, users, and tickets. No Preview/Production database was contacted.

## Commands and observed results

All commands ran in this isolated worktree at the base commit above with uncommitted source edits. Exit status `0` means success.

| Command / action | Exit | Result |
|---|---:|---|
| `npm ci` | 0 | Lockfile install completed (459 packages added). npm reported 10 moderate audit findings; `npm audit --json` was later run and triaged below. |
| `npm run db:migrate:test` | 0 | Verified loopback `support_test`; applied 3 checked-in migrations to the newly created disposable DB. |
| `npm run preview:verify-target -- --mode local-test --expected-endpoint-id local --expected-branch-id local --expected-database support_test --expected-user support_test` | 0 | Printed sanitized local identity after an actual connection and identity query. |
| `npm run preview:provision-fixtures ...` followed by `npm run preview:cleanup-fixtures ... --confirm-cleanup` | 0 / 0 | CLI created 2 orgs, 8 accounts and 4 tickets in the disposable DB; it printed only output file paths/counts and then cleaned the matching run and removed both output files. |
| `npm run preview:provision-fixtures ...` then `npm run preview:cleanup-fixtures ... --confirm-cleanup` | 0 / 0 | Fresh unique run on disposable loopback DB created 2 organizations, 8 accounts, and 4 tickets; sanitized output reported no credentials; cleanup removed only that run and both private files. No files remained in the temporary output directory. |
| Read-only post-test aggregate count on `localhost:55432/support_test` | 0 | Confirmed 0 residual run-tagged fixture organizations, accounts, and tickets. |
| `npm run test:api -- tests/preview/provisioning.test.ts tests/auth/password.test.ts` | 0 | 27/27 focused tests passed (21 target/provisioner/cleanup, 6 password hashing). Includes lost-COMMIT-response recovery, support_test-only local targeting, foreign-membership cleanup refusal, child-owner refusal, and tampered manifest rejection. |
| `npm test` | 0 | API 419/419 across 26 files; Web 12/12 across 2 files. |
| `npm run typecheck` | 0 | API and Web typechecks passed. |
| `npm run lint` | 0 | API and Web lint passed. |
| `npx eslint scripts/preview --max-warnings 0` | 0 | Preview scripts passed ESLint. |
| `npm run test:e2e -- auth.spec.ts` | 0 | 8/8 authentication browser flows passed, including restored session after reload, sign-out, error/invalid credentials, keyboard focus, and responsive viewport/contrast checks. |
| `npm run test:e2e -- preview-fixture-lifecycle.spec.ts` | 0 | 1/1 local lifecycle passed on `support_test`: customer own-ticket read/comment/create; admin agent-role change/restoration; agent update/comment; same-tenant other-customer and cross-tenant read/update/assignment/comment denials all returned 404. Before/after snapshots were identical for denied target tickets. Final cleanup output for run `pv-e2e-7b1ac294fda44c80` reported 0 run-owned organizations, users, and tickets; private credential and manifest files were removed. No Preview/Production was used. |
| `npm run check` | 0 | Lint, typecheck, API 419/419 across 26 files, Web 12/12 across 2 files, Playwright discovery (46 tests listed), API/Web builds passed. Browser tests are listed by this command, not executed by it; the auth and lifecycle browser files above were separately executed. Vite emitted the >500 kB chunk warning. |
| `npm audit --json` | 1 (findings present) | npm reports 10 moderate findings; there are 10 distinct package paths shown below, all `dev: true` in this lockfile. This is dependency triage, not ten confirmed application vulnerabilities. `npm audit fix --force` proposes breaking `eslint@4.0.0`; it was not run. |
| `py -3 scripts/check-doc-contract.py` | 0 | Required sections and A01–A40 status/evidence shape passed. |
| `git diff --check` | 0 | No whitespace errors. |


### npm advisory triage (lockfile snapshot used for this local run)

The audit report identifies the `minimatch` globparts amplification advisory GHSA-g3hv-75wg-m249 (affected range `<11.0.1`) and its transitive ESLint/TypeScript-ESLint dependency chain. Installed versions and lockfile package paths:

| Package path | Locked version | Audit relationship / affected range | Runtime relevance |
|---|---:|---|---|
| `node_modules/minimatch` | 10.2.6 | Direct advisory, `<11.0.1` | Development only (`dev: true`); lint tooling |
| `node_modules/@eslint/config-array` | 0.23.5 | Transitive dependency on affected `minimatch` | Development only |
| `node_modules/eslint` | 10.13.0 | Audit dependency chain reports `0.7.1–2.0.0-rc.1` or `>=4.1.0` | Development only |
| `node_modules/@eslint-community/eslint-utils` | 4.10.1 | Audit dependency chain via ESLint | Development only |
| `node_modules/@typescript-eslint/eslint-plugin` | 8.72.0 | Audit dependency chain via parser/type-utils/utils and ESLint | Development only |
| `node_modules/@typescript-eslint/parser` | 8.72.0 | Audit dependency chain via typescript-estree and ESLint | Development only |
| `node_modules/@typescript-eslint/type-utils` | 8.72.0 | Audit range `>=5.9.2-alpha.0`, via typescript-estree/utils/ESLint | Development only |
| `node_modules/@typescript-eslint/typescript-estree` | 8.72.0 | Audit range `>=6.16.0`, depends on affected minimatch | Development only |
| `node_modules/@typescript-eslint/utils` | 8.72.0 | Audit dependency chain via eslint-utils/typescript-estree/ESLint | Development only |
| `node_modules/typescript-eslint` | 8.72.0 | Aggregate meta-package in the same dependency chain | Development only |

The audit summary counts 10 moderate package findings across this tree; the JSON names 10 installed package paths, all in the dev dependency tree, and traces them to the `minimatch` advisory. `npm audit fix --dry-run --json` exited 1 with 0 added/removed/changed and the 10 findings still present. npm advertises semver-major downgrades to `eslint@4.0.0` and `typescript-eslint@8.36.0`; these are not safe automatic fixes for the current toolchain. Safe next action is a reviewed compatible update of the lint dependency graph (or a narrowly tested override if upstream ranges still require the affected major), followed by lint/typecheck and a fresh audit. No remediation was attempted in this fixture package. The vulnerable tree is development-time, not part of application runtime dependencies according to `package-lock.json`.

The fixture test suite covers endpoint/database/role mismatch refusal, exact regional direct-Neon host vs pooled-host rejection, Prisma `schema=public` compatibility while rejecting private schemas, missing target values, strict URL options, Preview-write acknowledgement, secret output outside the repo, malformed run ID, forced transactional rollback after inserts/events, lost COMMIT response recovery, collision sentinel preservation, cleanup confirmation, cleanup confinement across two simultaneous runs, foreign-membership and child-actor fail-closed cleanup, tampered manifest rejection, and safe cleanup retry.

## Not run / still open

- No hosted Preview write, Neon fixture provisioning, deployment configuration change, Production operation, or Preview role journey was run. Hosted use still needs a project-owner approval naming the exact Neon branch/endpoint/database, unique run ID, and credential destination, as required by repository instructions.
- This package does not prove the deployed API's Neon branch binding. The owner must independently confirm endpoint-to-branch mapping, then an app-observed unique fixture must verify runtime binding.
- No audit image/toolchain was created or audit code run. The bounded Cloudflare audit still requires a separate immutable, compliant no-egress Linux bundle with preinstalled compatible tools and verified controls.
- The authentication suite (8 tests) and one purpose-built local lifecycle browser test were executed separately and passed. The full check only discovered the 46 Playwright tests; it did not execute the full browser suite. No manual screen-reader review was performed. A22/A23/A37 remain partial.
- A35 remains `BLOCKED / NOT_RUN`; safe hosted synthetic credentials and runtime binding are not established. A28 rehearsal, evaluator access, exact-candidate CI, and G7 remain open.
