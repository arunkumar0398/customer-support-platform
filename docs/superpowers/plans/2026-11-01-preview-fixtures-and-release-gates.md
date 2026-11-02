# Preview Fixtures and Release Gates Implementation Plan

> **For agentic workers:** execute this plan task-by-task with `superpowers:executing-plans`. Tasks use test-first steps. Do not run the hosted Preview writes until the project owner gives explicit approval for the exact endpoint/database and run ID.

**Goal:** add a guarded, auditable way to provision and clean temporary synthetic Preview fixtures, then close Preview, audit, UI, and assessment gates with evidence.

**Architecture:** the provisioner uses the existing PostgreSQL driver and app password hashing format. It verifies the connection hostname/endpoint, actual database and role before writes; creates two tagged tenants and their test identities/tickets in one transaction; writes plaintext temporary passwords only to an exclusive file outside the repo; and emits a credential-free manifest. Cleanup requires the same run ID and a manifest, verifies run markers/relationships, and removes only that run's records transactionally.

**Tech Stack:** Node 24, TypeScript/tsx, PostgreSQL via `pg`, Vitest, existing Prisma schema and app scrypt parameters.

**Spec:** user-provided action plan in the current task; assessment contract in `reference/assessment.pdf`, especially pages 1–3.

## Global Constraints

- Starting candidate is `f55decb8368f5ea3997020845577372a8eafb6a0`; implementation branch is `codex/preview-provisioner-f55decb` in an isolated worktree.
- Preserve the separate dirty checkout and its screenshots/output. Never stage from it or copy over it.
- Never use or weaken the local-only seed guard. Never put database URLs, password hashes, plaintext passwords, cookies, or tokens in Git, logs, screenshots, or the sanitized manifest.
- Local integration tests may write only to verified loopback `support_test` as `support_test`; never use `support_dev`, Preview, or Production for those tests.
- Hosted execution requires a separate explicit owner approval naming target endpoint/database and run ID. No migration, seed, or Production operation is part of this plan.
- No dependency installation/fetch is allowed during the Cloudflare audit. The Preview implementation may use the lockfile-pinned repository toolchain for local testing.
- Treat the eight items in assessment Section 8 as required submission deliverables. Treat deployment URL, CI pipeline, notifications, attachments, richer analytics, and observability dashboard as assessment-optional. Preview authorization, the bounded audit, UI acceptance, A28 rehearsal, evaluator access, and G7 are additional internal release gates.
- Preserve the distinction between local code recovery and SQL down-migration/hosted PITR; A36 evidence does not prove either of the latter.

## Preflight Snapshot

- Source worktree: `D:/__superset/cactro-tests/_react-node-apps/customer-support-platform-ui-2dee30d`, clean at `f55decb8368f5ea3997020845577372a8eafb6a0`.
- New worktree: `D:/__superset/cactro-tests/_react-node-apps/customer-support-platform-preview-provisioner-f55decb`, branch `codex/preview-provisioner-f55decb`, initially clean at the same SHA.
- Read `AGENTS.md`, the complete 3-page assessment PDF, and `evidence/checkpoints/UI_A22_A23_MATRIX_2026-11-01.md` before edits. The assessment requires the vertical slice and eight deliverables; deployment URL/CI are optional. The matrix records incomplete A22/A23/A37; A35 and the audit are blocked.
- Initial implementation scope: the verify/provision/cleanup TypeScript CLI scripts, shared preview fixture/target services, shared password hashing module, focused tests, package scripts, `docs/preview-validation.md`, and sanitized task evidence. Later work remains separately gated below.

## Review Focus

- A URL query parameter or mismatched connection target can redirect writes: reject unsupported URL overrides before connecting and compare connected database/role before `BEGIN`.
- A duplicate run ID or unique object collision can overwrite existing data: preflight every generated org/user/ticket identity and use plain inserts, never upsert.
- A failure after some inserts can leave partial fixtures: prove rollback through a PostgreSQL trigger that fails an activity insert and compare all run-tagged tables.
- Cleanup input can name unrelated data: require exact manifest run ID, marker-prefixed organization/account/ticket values, and run-owned relationship checks before deletion.
- Password output may leak through Git or process/log output: require an absolute exclusive-create credential file outside the repository, omit passwords/hashes/URLs from manifest/logs, and remove the credential file on failed provisioning.

---

## Tasks

### Task 1: Establish scope and implementation record

**Owner:** repo maintainer.

**Files:** create this plan; later append implementation proof to `evidence/checkpoints/preview-fixtures-local.md`.

- [x] Record base SHA, new branch, clean initial status, intended first-task files, and preserved checkout boundary.
- [x] Read repository rules, assessment, and current A22/A23/A37 matrix; record required vs optional assessment scope and internal release gates.

**Completion evidence:** worktree branch/HEAD/status and the plan itself. No application changes in this task.

### Task 2: Share the app password hash implementation

**Owner:** repo maintainer. **Prerequisite:** clean isolated branch and existing scrypt verifier reviewed.

**Files:** create `api/src/modules/auth/password.ts`; modify `api/src/modules/auth/service.ts`; create `api/tests/auth/password.test.ts`.

- [x] Write tests for the existing `$scrypt$32768$8$1$<salt>$<digest>` format, successful verification, wrong-password rejection, malformed-hash rejection, and unique salts.
- [x] Run the focused test and observe the expected missing-module failure.
- [x] Implement `hashPassword(password: string): Promise<string>` and `verifyPassword(password: string, encodedHash: string): Promise<boolean>` with the exact current parameters (`N=32768`, `r=8`, `p=1`, 16-byte random salt, 32-byte digest, 128 MiB max memory); use timing-safe digest comparison.
- [x] Change auth service to import the shared verifier without changing login semantics; the complete API suite passed.

**Observed:** 6/6 password helper tests passed; final local API suite passed 419/419 after the target/fixture regression coverage was added. Generated hashes use the same verifier and format as login.

### Task 3: Enforce explicit database-target verification

**Owner:** repo maintainer. **Prerequisite:** Task 2 done.

**Files:** create `scripts/preview/target.ts`, `scripts/preview/cli.ts`, `scripts/preview/verify-target.ts`; integration/CLI guard tests in `api/tests/preview/provisioning.test.ts`.

- [x] Test missing expected endpoint/branch/database/user, malformed URL, wrong endpoint, wrong database/role, unsupported target-override query options, local non-loopback URL, refusal of any local identity except support_test/support_test, regional direct Neon host versus pooler, and hosted target without explicit write acknowledgement.
- [x] Verify target guards against the disposable DB; direct target mismatch tests fail closed before connect. Fixture integration tests initially exposed a quoted Prisma column-name mismatch, which was corrected before the final focused run.
- [x] Implement pure URL validation before connect and compare actual `current_database()`/`current_user` before writes. `local-test` is loopback `support_test`/`support_test`; `preview` requires a regional direct endpoint ID, owner-confirmed branch ID, database/user, strict TLS, and `--confirm-preview-write` for writes.
- [x] Add a read-only CLI that accepts URLs only from `TEST_DATABASE_URL` or `PREVIEW_DIRECT_DATABASE_URL`, never argv, prints sanitized identity, and does not print connection strings.

**Observed:** local CLI identity check passed against the isolated DB; mismatch and missing-target assertions passed in the focused suite.

### Task 4: Implement atomic fixture creation and scoped cleanup

**Owner:** repo maintainer. **Prerequisite:** Task 3 done.

**Files:** create `scripts/preview/fixtures.ts`, `scripts/preview/provision-fixtures.ts`, `scripts/preview/cleanup-fixtures.ts`; create `api/tests/preview/provisioning.test.ts`.

- [x] Add tests for external credential-path restriction, two synthetic tenants/roles/tickets, no password/hash in the manifest/log, collision refusal, and cleanup marker confinement.
- [x] Add PostgreSQL integration tests only against the verified loopback `support_test` DB: inject a pre-commit failure and assert rollback, simulate a committed transaction with a lost COMMIT response and assert recovery files remain, preserve a colliding sentinel, exercise foreign-membership/child-actor cleanup refusal with unchanged fixture rows, reject tampered manifest relationships, create two runs and prove cleaning one leaves the other unchanged; verify cleanup confirmation and retry behavior.
- [x] Implement unique run-tagged IDs/slugs/emails/ticket markers. Create two organizations; each has an admin, agent, two customers, and two customer-owned tickets with initial `TICKET_CREATED` activity.
- [x] Create rows transactionally with plain inserts. Refuse existing IDs, slugs, emails, ticket numbers, or titles; no upserts.
- [x] Generate temporary passwords and hash through Task 2. Store plaintext only in an absolute exclusive-create credential file outside the repository; never print file contents. The sanitized manifest has endpoint/branch/database identity, object IDs, synthetic roles, and creation time, but no password/hash/URL.
- [x] Require manifest, matching run ID/target, and explicit cleanup acknowledgement. Validate the fixture graph and stop on foreign memberships/child actors; delete only manifest IDs and fixture-owned children in one transaction.

**Observed:** 21/21 fixture integration tests passed on disposable PostgreSQL; provision, cleanup, rollback, lost-COMMIT recovery, collision, target mismatch, manifest tampering, and ownership refusal were exercised. The local CLI created 2 orgs/8 accounts/4 tickets and cleaned only its run; no output files remained. Hosted provisioning remains gated.

### Task 5: Add local commands, documentation, and evidence

**Owner:** repo maintainer. **Prerequisite:** Tasks 2–4 green.

**Files:** modify root `package.json`; create `docs/preview-validation.md`; create `evidence/checkpoints/preview-fixtures-local.md`.

- [x] Add explicit `preview:verify-target`, `preview:provision-fixtures`, and `preview:cleanup-fixtures` scripts. Focused tests use `npm run test:api -- tests/preview/provisioning.test.ts tests/auth/password.test.ts`.
- [x] Document environment variables, endpoint/branch/database confirmation, local-test restrictions, credentials/manifest handling, transaction guarantees, hosted approval stop, A35 matrix, and cleanup.
- [x] Apply existing migrations only to the newly created disposable local PostgreSQL databases; no hosted URLs were used.
- [x] Run targeted and complete suites, `npm run check`, ESLint on the Preview scripts, documentation contract, and `git diff --check`; record commands/results in the checkpoint. Final full suite: API 419/419, Web 12/12; 46 Playwright tests listed by `npm run check` but not executed by that command. Separately, `npm run test:e2e -- auth.spec.ts` passed 8/8, and `npm run test:e2e -- preview-fixture-lifecycle.spec.ts` passed 1/1 on local `support_test`, with seven 404 denials, unchanged denied-target snapshots, zero residual run-owned rows, and private files removed. `npm audit --json` reported ten moderate dev-tree findings; triage and the unsafe forced downgrade suggestion are recorded in the evidence file. All checks were on source changes based at `f55decb8368f5ea3997020845577372a8eafb6a0`, before commit; no exact-SHA CI is claimed.

**Observed:** local setup and CLI are documented. Preview owner approval and the separate audit runner remain open.

### Task 6: Provision and verify one Preview environment

**Owner:** Preview/Neon owner, then acceptance tester. **Prerequisites:** Tasks 2–5 reviewed; owner explicitly approves exact Preview endpoint, database, run ID, temporary credential destination; Preview compute active; new disposable Neon branch is preferred; API/Web Preview deployment settings can target it.

- [ ] Owner creates or selects a disposable Preview branch. Record project/branch/endpoint IDs and deployed API/Web SHAs without exposing credentials.
- [ ] Provision with the explicit Preview confirmation switch, expected endpoint/database/user, unique run ID, and external credential path.
- [ ] Bind API Preview to that branch and Web Preview to API Preview. Confirm deployed SHA and aliases.
- [ ] Use a unique provisioned ticket through the app to verify runtime API-to-Neon binding; health checks alone do not satisfy this.

**Expected:** app, API deployment, database endpoint/branch, manifest, and run ID agree; every temporary role account can authenticate. No migration, seed, or Production access.

### Task 7: Execute A35 Preview acceptance

**Owner:** acceptance tester. **Prerequisite:** Task 6 evidence and credentials delivered outside Git/chat.

- [ ] Use separate admin/agent/customer browser contexts and run the allowed create/list/detail/comment/update/membership journeys.
- [ ] Test same-tenant other-customer and cross-tenant ticket reads/writes, assignment, comments, and admin-membership routes.
- [ ] Capture sanitized statuses/responses and before/after ticket fields/version, comment counts, and activity counts; denied writes must preserve state.
- [ ] Revoke/delete synthetic accounts and clean only this run's fixture graph; remove plaintext credential file after successful cleanup.

**Expected:** every requested A35 row is observed; denied writes have zero side effects. Otherwise keep A35 blocked/not-run with exact prerequisite.

### Task 8: Prepare the offline audit toolchain as a separate package

**Owner:** audit runner owner. **Prerequisite:** a compatible Linux build/runner with all required tools and validators already available; no audit target code runs while preparing it.

**Files:** in a separate reviewable package, create `audit/provision/Dockerfile`, `audit/provision/toolchain-manifest.json`, `audit/run/preflight.sh`, `audit/run/run-offline.sh`, and `docs/offline-security-audit.md`.

- [ ] Match Node/npm, lockfile, Vitest, Supertest, Prisma engines/client, Playwright/browser, PostgreSQL, and pinned Cloudflare validators; record image digest and provenance.
- [ ] Preflight verifies no egress, empty allowlist, read-only source/toolchain, scratch-only writes, CPU/memory/process/file/disk/time ceilings, and tool versions.
- [ ] Do not install/fetch dependencies in the audit run, reuse Windows dependency symlinks, or contact Vercel/Neon.

**Expected:** immutable bundle and successful controls-only preflight before audit execution; if unavailable, keep audit incomplete and state the missing capability.

### Task 9: Execute bounded security audit lanes

**Owner:** audit operator and independent verifier. **Prerequisite:** Task 8 preflight passes on exact candidate.

- [ ] Run session/CSRF; membership and ticket authorization; database atomicity; then proxy boundaries, local throttle hypothesis, query plans, supply chain, and client rendering using dummy data and loopback-only services.
- [ ] Record exact SHA, tools, commands, inputs, exit codes, limits, and invariant per lane. Independently challenge findings and run both official validators.
- [ ] Keep deployed behavior, multi-instance throttle, SQL down-migration, and hosted PITR unknown unless evidence actually establishes them.

**Expected:** each coverage unit is pass/fail/deferred with evidence. Do not call the audit complete unless all required phases and validators reach terminal success.

### Task 10: Close UI and assessment delivery

**Owner:** Web maintainer and evaluator liaison. **Prerequisites:** local UI baseline from `f55decb` retained; browser and screen-reader tools available; evaluator identity/access can be checked.

- [ ] Update the matrix only for actual remaining cells and reference existing passing test names.
- [ ] Execute role × route × mobile/desktop × success/loading/empty/validation/forbidden/failure/retry where applicable; justify N/A cells.
- [ ] Perform keyboard and manual screen-reader journey through sign-in, creation, detail/comment, and error recovery; record tool/browser and limitations.
- [ ] Verify all eight required Section 8 submission items and private evaluator access. Rehearse README setup, login/create/update, tenant boundaries, concurrent edits, query investigation, outage and recovery. Record A28 only after a human rehearsal.

**Expected:** every required item has a readable path; every applicable matrix cell has evidence or a reasoned exclusion; assessment-required and optional items stay distinct.

### Task 11: Exact-candidate CI and independent G7

**Owner:** repo maintainer, then separate reviewer. **Prerequisite:** Tasks 6–10 complete or explicitly dispositioned; no unresolved blocking finding.

- [ ] Consolidate substantive evidence once, run local checks, commit the complete package, and run exact-SHA CI.
- [ ] Request one read-only G7 review on that exact SHA covering source provenance, assessment requirements, A35, audit, UI, evidence integrity, and remaining risks.
- [ ] Keep merge/submission on hold if any release blocker is unresolved; keep deployment explicitly optional under assessment Section 8.

**Expected:** reviewer names the exact SHA and returns a clear release verdict; no status-only follow-up commit is created to restate the same run.

## Interface and Ordering Review

- Task 2 produces the app hash API consumed by Task 4 and reused by login; tests pin byte format/verification.
- Task 3 produces a verified target identity consumed by Tasks 4 and 6; no fixture writer may accept an unverified database client.
- Task 4 produces a sanitized manifest and external credential file consumed by Tasks 6–7; cleanup depends on the manifest’s run-tagged object IDs.
- Task 5 publishes the commands and local evidence for Tasks 6–7; Task 8 is independent and remains a separate package.
- Tasks 6–7 depend on owner approval and safe Preview fixtures; Tasks 8–9 depend on the runner owner’s toolchain; Task 10 can progress locally alongside them; Task 11 depends on all required acceptance evidence.
- **Ruling:** keep hosted fixture execution gated behind explicit target/run approval. The requested implementation is local and testable now; skipping the gate would contradict `AGENTS.md` and could create hosted data prematurely.
