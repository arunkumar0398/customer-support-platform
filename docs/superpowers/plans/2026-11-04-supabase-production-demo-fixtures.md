# Supabase Production Demo Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reviewed, operator-only, fail-closed command that creates persistent synthetic Alpha/Beta Production demo accounts and tickets in the owner-approved Supabase project.

**Architecture:** A separate Supabase Production profile and verifier own the only Production target. A small PostgreSQL provisioner generates credentials, hashes passwords with the existing auth implementation, writes private credential and sanitized manifest files, and inserts the entire run in one transaction. No cleanup mode or app-facing provisioning endpoint exists.

**Tech Stack:** TypeScript, existing `pg` 8.23.1, Node.js 24, Vitest, PostgreSQL, existing scrypt password hashing.

**Spec:** `docs/superpowers/specs/2026-11-04-supabase-production-demo-fixtures.md`

## Global Constraints

- Never read connection strings from CLI arguments, log them, or persist them in repository files.
- Production target is code-owned: project `ityzntsmumvtktjjdacs`, host `db.ityzntsmumvtktjjdacs.supabase.co`, database `postgres`, role `csp_prod_runtime`, direct TLS-validated port 5432.
- No hosted write occurs in this plan; tests use only loopback `support_test`.
- Exactly two organizations, eight users, four tickets, and four creation events per unique run.
- Account lifetime is persistent with no automatic expiry, rotation, or cleanup.
- Do not modify the existing local seed, Neon tooling, application auth/authorization, migrations, Vercel configuration, or dependencies.
- Production CLI requires both an explicit switch and interactive exact-project/run-ID confirmation.

## Review Focus

- URL query overrides or an untrusted host redirect the connection — test host, port, database, username, TLS, and unsupported query refusal before connect.
- An unsafe/inherited credential directory exposes plaintext passwords — test owner-only directory and file ACLs and fail closed if ACL inspection fails.
- A collision or partial failure mutates pre-existing or partial data — test run-marker collision, transaction rollback, and no-upsert behavior.
- COMMIT response loss leads an operator to retry and rotate credentials — preserve recovery files once COMMIT is attempted and refuse same-run re-execution.
- The runtime role has more power than intended — verify login role flags, prohibited memberships, no schema/database CREATE, required DML, and table presence before writes.

---

### Task 1: Fixed target verifier and operator contract

**Files:**
- Create: `scripts/supabase-production-demo/profile.ts`
- Create: `scripts/supabase-production-demo/target.ts`
- Create: `scripts/supabase-production-demo/cli.ts`
- Create: `scripts/supabase-production-demo/verify-target.ts`
- Create: `api/tests/supabase-production-demo/target.test.ts`
- Modify: root `package.json`

**Interfaces:** `profile.ts` exports immutable `productionTarget`; target module exports `connectProductionTarget(connectionString)` and a local-test verifier used only by tests; CLI accepts only run/output/confirmation flags, never target overrides.

- [ ] **Step 1: Write failing target-profile and verifier tests** for wrong provider, Preview/Neon/localhost, wrong project host, pooled port, wrong database/user, disabled TLS, connection-string override parameters, database identity mismatch, unsafe role flags/membership, missing app tables/grants, and absent operator environment.
- [ ] **Step 2: Run** `npm run test:api -- --maxWorkers=1 tests/supabase-production-demo/target.test.ts`; expected: named cases fail because target/verifier modules are absent.
- [ ] **Step 3: Implement** the immutable target profile, URL parser, certificate-validated `pg.Client` config, database identity and privilege checks, verified-client capability, read-only target command, and strict CLI flag/TTY confirmation parsing.
- [ ] **Step 4: Re-run** the focused tests; expected: all target contract tests pass without making a network connection to a hosted target.
- [ ] **Step 5: Commit** the verified target profile, CLI contract, root scripts, and target tests as `feat: add guarded Supabase Production demo target`.

### Task 2: Persistent synthetic provisioner and private output

**Files:**
- Create: `scripts/supabase-production-demo/fixtures.ts`
- Create: `scripts/supabase-production-demo/provision.ts`
- Create: `scripts/supabase-production-demo/private-files.ts`
- Create: `api/tests/supabase-production-demo/provisioning.test.ts`
- Modify: root `package.json`

**Interfaces:** `provisionProductionDemo({client, target, runId, outputDirectory, repositoryRoot, confirm})` returns sanitized manifest metadata and private paths only after commit. No delete/cleanup export exists. `private-files.ts` creates a new private directory and exclusive private files and verifies owner-only ACLs on Windows/POSIX.

- [ ] **Step 1: Write failing local database tests** for exact 2-org/8-account/4-ticket/4-event shape, role allocation, unique `example.test` emails, password verification, duplicate-run refusal, rollback with no residual rows, output path outside repository, existing/symlink path refusal, and private directory/file permissions.
- [ ] **Step 2: Run** `npm run test:api -- --maxWorkers=1 tests/supabase-production-demo/provisioning.test.ts`; expected: fail on missing provisioner behavior.
- [ ] **Step 3: Implement** run-ID validation, unique random identities/passwords/ticket labels, existing `hashPassword`, manifest and credential outputs, collision checks, one transaction, confirmed rollback cleanup, uncertain-COMMIT recovery retention, and private ACL handling.
- [ ] **Step 4: Re-run** the local tests; expected: all pass using only the verified disposable `support_test` database.
- [ ] **Step 5: Wire** the production command to `SUPABASE_PRODUCTION_DIRECT_DATABASE_URL`, require typed project ref and run ID plus `--confirm-production-write`, and emit only sanitized JSON.
- [ ] **Step 6: Commit** the provisioner and its integration tests as `feat: provision persistent synthetic Production fixtures`.

### Task 3: Operator documentation, checks, and review package

**Files:**
- Create: `docs/supabase-production-demo-accounts.md`
- Create: `evidence/checkpoints/TK-SUPABASE-PROD-DEMO.md`
- Create or update: PR title/body only after exact candidate validation.

- [ ] **Step 1: Document** environment setup, private directory ACL expectations, exact target verifier/provision commands, persistent lifecycle, private credential custody, failure recovery, role journey handoff, and explicit fact that code installation does not provision accounts.
- [ ] **Step 2: Run** focused provisioner tests, `npm run test:api -- --maxWorkers=1`, `npm run lint`, `npm run typecheck`, `npm run build`, documentation contract, secret scan for changed paths, and `git diff --check`.
- [ ] **Step 3: Inspect** final diff for target widening, cleanup capability, Vercel/data migration changes, and secret leakage; record SHA-bound commands/results and limitations.
- [ ] **Step 4: Request** fresh independent review of the exact candidate before any Production fixture write.
- [ ] **Step 5: Commit** the operator guide and evidence checkpoint with the implementation as `docs: document Supabase Production demo operation`.

## Plan self-review

- Spec coverage: optional assessment status, exact Production identity, persistent fixture shape, secure output, atomicity/recovery, local-only validation, PR/review gate, and later owner approvals are represented above.
- Interface consistency: target verifier returns the client capability consumed by the provisioner; local integration testing uses a separate fixed loopback test profile that the CLI cannot select.
- Review focus tests are attached to verifier, private-file, and transaction tasks.
- No migration, app behavior, Preview/Neon path, or provider settings are in scope.
