# Production Synthetic Demo Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development`. Implement each task in order with its tests before its code. Keep the Production CLI unreachable from HTTP and CI.

**Goal:** Add a one-off guarded operator workflow for persistent synthetic Production demo accounts, with local PostgreSQL tests and no Production execution in this PR.

**Architecture:** A production-only CLI verifies exact Neon project/branch/endpoint metadata using read-only Neon API calls and verifies the direct PostgreSQL database/role before writes. A run-scoped transaction creates one synthetic tenant, four `example.test` accounts, and synthetic tickets; credentials and a secret-free recovery manifest go only into a permission-checked private directory. A verification-only retry never rewrites passwords or memberships. Integration tests call the same provisioning service only after verifying the disposable local `support_test` target.

**Tech Stack:** Existing Node.js 24, TypeScript, `pg`, Prisma password hashing, built-in `node:crypto`, Vitest/Supertest, and disposable PostgreSQL. No new dependency or migration.

## Global Constraints

- Keep `api/prisma/seed.ts` and its local `support_dev`/`support_test` safeguards unchanged.
- Never add an HTTP endpoint, public signup, GitHub Actions execution, migration, Production credential, database URL, password, hash, cookie, or token to tracked files or logs.
- The Production CLI accepts only explicit `production` mode; `local-test` exists only in the verified test harness, and Preview is not a supported target.
- The CLI must reject loopback/local, Preview, unknown, and mismatched target identities before opening a write transaction.
- Production accounts are persistent; no automatic expiry or cleanup. Lost credentials require a separately approved rotation operation, which is outside this PR.
- All automated database tests use only identity-verified disposable `support_test`.
- Production execution remains blocked until deployment identity, API-to-Neon binding, dedicated-tenant availability, credential custody, evaluator delivery, rotation, and recovery are verified and separately approved.

---

### Task 1: Implement a fail-closed Production target verifier

**Files:**
- Create: `api/scripts/production-demo/target.ts`
- Test: `api/tests/production-demo/target.test.ts`
- Modify: `api/package.json` only if needed for a focused test script

**Interfaces:**
- `ExpectedProductionTarget`: `{ projectId, branchId, endpointId, database, username }`.
- `verifyProductionTarget(options)`: validates an explicit production mode, direct Neon URL endpoint hostname, Neon API endpoint-to-project/branch response, and `SELECT current_database(), current_user`; returns a branded `pg.Client` plus sanitized identity.
- Injectable `fetch` and client factory keep unit tests offline; production defaults use fixed `https://console.neon.tech/api/v2` URLs and read-only `GET` calls.

- [ ] **Step 1: Write target-refusal tests** for loopback, local database names/roles, pooled Neon host, Preview endpoint, project/branch/endpoint mismatch, database/role mismatch, absent target values, and API failure. Assert no write-capable branded client is returned.
- [ ] **Step 2: Run the target test file** with `npm run test:api -- tests/production-demo/target.test.ts`; expect the new imports/functions to fail before implementation.
- [ ] **Step 3: Implement parsing, Neon metadata checks, safe database identity query, and client branding.** Never include the URL or API key in thrown/logged errors; reject unrecognized API response shapes.
- [ ] **Step 4: Re-run the target tests** and add a positive mocked Production metadata case plus a real local `support_test` identity case for test-only target creation.
- [ ] **Step 5: Run API lint/typecheck** with `npm run lint --workspace api` and `npm run typecheck --workspace api`.

### Task 2: Add private output and transactional persistent account provisioning

**Files:**
- Create: `api/scripts/production-demo/output.ts`
- Create: `api/scripts/production-demo/provision.ts`
- Create: `api/scripts/production-demo/local-cleanup.ts`
- Test: `api/tests/production-demo/output.test.ts`
- Test: `api/tests/production-demo/provisioning.test.ts`

**Interfaces:**
- `preparePrivateRunOutput(directory, repositoryRoot, runId)`: requires an absolute, canonical, empty directory outside the repository; verifies restrictive owner-only access; creates exclusive credential and manifest paths.
- `provisionPersistentDemo(target, runId, output)`: requires a branded write-approved target, writes generated credentials and a secret-free manifest, and transactionally inserts organization, users, memberships, sample tickets, and creation events.
- `cleanupLocalDemoRun(target, manifest)`: test-only cleanup accepts only a branded `local-test` target and removes only exact records in a validated run manifest after checking all ownership and dependent-row counts. It cannot clean a Production target and is never wired into the Production CLI.
- Manifest records only run ID, verified target identity, timestamps, and exact created IDs/counts. Credential output is one-time and contains generated passwords only in the private credentials file.

- [ ] **Step 1: Write tests** for outside-repo and empty-directory requirements, POSIX owner-only mode and Windows ACL rejection/acceptance, exclusive file creation, duplicate run ID, email/slug collision, malformed or modified manifest, cleanup ownership mismatch with zero deletion, and sanitized error output.
- [ ] **Step 2: Add transaction tests** against verified `TEST_DATABASE_URL`: provision four roles in one synthetic tenant and synthetic tickets; inject a failure between inserts and assert no organization/user/membership/ticket/event residue; simulate uncertain COMMIT and assert recovery files are retained.
- [ ] **Step 3: Run only the new output/provisioning tests** using `npm run test:api -- tests/production-demo/output.test.ts tests/production-demo/provisioning.test.ts`; require the new tests to fail before implementation.
- [ ] **Step 4: Implement exclusive private output, run-derived identity, fresh UUIDs, 32-byte random passwords, `hashPassword`, collision checks, transactional inserts, and no-op verification for an exact existing run.** Do not implement Production cleanup or automatic password rotation.
- [ ] **Step 5: Re-run the tests** and query the disposable database by exact run IDs to prove successful local teardown leaves zero run-owned records. Keep uncertain-commit recovery material until the test explicitly reconciles it.

### Task 3: Add the Production-only CLI and operator guide

**Files:**
- Create: `api/scripts/production-demo/cli.ts`
- Create: `docs/production-demo-accounts.md`
- Modify: `api/package.json`
- Modify: `docs/demo-accounts.md`

**Interfaces:**
- Package command: `npm run demo:production:provision -- --mode production --project-id <id> --branch-id <id> --endpoint-id <id> --database <name> --username <role> --run-id <id> --credential-dir <absolute-private-path>`.
- Private process environment: `PRODUCTION_DEMO_DATABASE_URL` and `NEON_API_KEY`. The command does not accept URLs/keys in arguments and refuses CI execution.
- Typed confirmation must repeat the expected project ID and run ID. Output reports only sanitized target identity, record counts, and credential-file path.

- [ ] **Step 1: Write CLI tests** for missing flags/environment, unsupported mode, CI refusal, confirmation mismatch, unknown/duplicate flags, and output redaction.
- [ ] **Step 2: Run CLI tests** with `npm run test:api -- tests/production-demo/cli.test.ts`; expect failure before CLI implementation.
- [ ] **Step 3: Implement strict flag parsing and orchestration** that calls target verification, requires exact typed confirmation, then prepares private output and invokes the transaction once. Never print stack traces from drivers or secrets.
- [ ] **Step 4: Document setup and operation**: assessment Section 8 remains satisfied by local seed instructions; Production feature is optional; exact expected-ID fields; private environment handling; no migrations/deployments; recovery after uncertain commit; credential delivery; periodic owner review; separate rotation and retirement approval; and the current Production gate as `BLOCKED / NOT_RUN`.
- [ ] **Step 5: Clarify `docs/demo-accounts.md`** that its documented shared account/password and `npm run db:seed` stay local-only and must never be reused in a deployed environment.
- [ ] **Step 6: Run CLI tests, link checks, documentation contract, and `git diff --check`.**

### Task 4: Prove the local account lifecycle and tenant boundaries

**Files:**
- Test: `api/tests/production-demo/lifecycle.test.ts`
- Reuse: `api/src/app.ts`, auth, ticket, membership, and dashboard routes without production code changes

**Interfaces:**
- Lifecycle test builds the normal API with the verified `support_test` database, signs in the new accounts through `createApp`, and uses a second synthetic test organization for denial controls.
- The production provisioner receives a test-only verifier-created client and run identity; test teardown deletes only IDs captured in the local manifest after exact ownership assertions.

- [ ] **Step 1: Write the lifecycle test** proving login, `/api/auth/me`, logout/revocation; customer create/list/detail/comment; agent assignment/update/comment; admin membership update/restore and tenant-only dashboard; same-tenant other-customer and foreign-tenant denials; unchanged state after denied writes; then exact local cleanup.
- [ ] **Step 2: Run the lifecycle test** with `npm run test:api -- tests/production-demo/lifecycle.test.ts`; expect missing provisioner interface/test failure.
- [ ] **Step 3: Reuse the provisioning service and ordinary app routes** with only the disposable local target. Keep Preview and Production unreachable from test code.
- [ ] **Step 4: Re-run the lifecycle and all production-demo tests**, then verify zero local run-owned organizations, users, memberships, sessions, tickets, comments, and events.

### Task 5: Review, validate, and prepare one isolated PR

**Files:**
- Review only the feature files above plus the spec and plan.

- [ ] **Step 1: Inspect the full diff** for target confusion, tenant-scoping omissions, unsafe path/ACL assumptions, secret output, and edits to the local seed guard.
- [ ] **Step 2: Run focused tests**: `npm run test:api -- tests/production-demo`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check`, the existing documentation contract, Markdown link validation, and `git diff --check`; record commands and exit codes.
- [ ] **Step 3: Confirm diff paths exclude** credentials, `.env`, screenshots, output/backups, and unrelated existing work.
- [ ] **Step 4: Prepare one conventional commit or a small coherent set**, push only the new feature branch, open one PR against `codex/assessment-mvp`, and request exact-head review of the target threat model, transaction/recovery, ACL handling, and output secrecy.
- [ ] **Step 5: Keep the PR open and unmerged.** Production provisioning remains `BLOCKED / NOT_RUN` until the owner’s private prerequisite record and exact-action approval are complete.
