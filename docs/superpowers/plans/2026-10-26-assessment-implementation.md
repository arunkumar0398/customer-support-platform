# Multi-Tenant Customer Support Platform Implementation Plan

> **For agentic workers:** Use the user-specified serialized checkpoint workflow: one bounded TK task at a time, test RED → GREEN → REFACTOR, and independent spec/security review before advancing. Use `superpowers:subagent-driven-development` only where a genuinely independent owner and supported isolated worktree are available; otherwise implement and review serially.

**Goal:** Deliver and prove the assessment's secure Docker-local MVP, then complete optional deployment and final submission work only after their gates and approvals.

**Architecture:** A TypeScript npm-workspace modular monolith with a React/Vite client, Express API, Prisma/PostgreSQL persistence, shared-schema tenant scoping, and a same-origin browser API. Local Compose is mandatory; two Vercel projects and Neon are later optional deployment targets.

**Tech Stack:** Node.js 24 LTS, npm workspaces, TypeScript, React, Vite, Express, Zod, Prisma, PostgreSQL, Tailwind, TanStack Query, Vitest, Supertest, Playwright, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-customer-support-design.md`

## Global Constraints

- `reference/assessment.pdf` is the external contract; the approved design records implementation assumptions.
- Use Node 24 LTS and pin exact dependency versions in the committed `package-lock.json`; confirm any version-specific Prisma adapter/configuration against current official docs during C0/C1.
- `api/index.ts` default-exports the Express app; local listening belongs in `api/src/local-server.ts`.
- Derive active organization and role from a current server-validated membership; never trust client tenant IDs or stale role claims.
- Scope every tenant-owned query, aggregate, relation, filter, search, assignment, comment, and event to authorized `organizationId` plus role/ownership policy.
- Use real PostgreSQL integration tests for tenant constraints and transactions; do not claim mocks prove DB behavior.
- Ticket mutation and append-only activity event commit atomically; version conflicts return 409 without an event.
- Use synthetic seed records only. Keep credentials and database URLs out of source, logs, screenshots, and evidence.
- Never reset, clean, force checkout, or run destructive SQL against a database whose disposable test identity has not been verified.
- Deployment, provider provisioning, production migrations, push, merge, or publishing require the distinct approvals specified in the master prompt and `AGENTS.md`.
- Every A01–A40 result begins `NOT_RUN`; change a result only with command, exit code, SHA, and saved evidence.

## Review Focus

1. **Spoofed, revoked, or stale organization membership:** test active-org selection, role changes, revoked sessions, and membership removal against protected routes in TK-08–TK-10.
2. **Cross-org relationships through nested IDs or filters:** test assignee, customer, ticket, comment, event, membership, and dashboard joins with foreign-org IDs in TK-04–TK-05, TK-09–TK-21, and TK-30.
3. **Partial writes or concurrent updates:** force an event insert failure and race two versioned updates; prove rollback and exactly one winner in TK-18 and TK-20.
4. **Cookie/CSRF behavior through local proxy and hosted rewrite:** test absent/wrong origin, session reload, cookie flags, and same-origin browser requests in TK-08, TK-23, TK-29–TK-30, and TK-34.
5. **Database/test environment confusion and unbounded queries:** fail closed on a non-test DB identity before destructive fixtures; verify page limits, stable ordering, tenant indexes, and representative EXPLAIN output in TK-02, TK-14, TK-31–TK-33.

## File Map

- Root `package.json`, lockfile, `.npmrc`, `.nvmrc`, `.env.example`, and `.gitignore`: pinned workspaces, supported runtime, safe scripts, and local configuration.
- `api/`: Express app, domain modules, Prisma schema/migrations/seed, and unit/API/database integration tests.
- `web/`: React app, API client, feature routes, components, and browser tests.
- `docker/` + `docker-compose.yml`: local PostgreSQL roles/databases and health behavior.
- `docs/`: architecture, assumptions, ADRs, data model/indexes, API, operations, performance, limitations, and AI disclosure.
- `.github/workflows/ci.yml`: reproducible clean-checkout gates; no secrets required for local verification.
- `evidence/checkpoints/`: initial acceptance ledger and per-task proof; `evidence/reviews/` and `evidence/releases/` hold sanitized review/release records.

---

## Ordered Task Plan

Each TK task has one owner and one gate. For a new behavior, add the named failing assertion first, run it to observe RED, implement the smallest change, then run the targeted test and relevant quality checks. Configuration bootstrap uses a failing preflight command as its RED proof. Commit only a verified task with exact evidence; do not commit fabricated test results.

**Command contract:** TK-01 defines `test:api` and `test:web` as Vitest pass-through scripts that execute from each workspace, so run API tests with `npm run test:api -- tests/<path>.test.ts` and web unit tests with `npm run test:web -- tests/<path>.test.tsx`. Run a Playwright file from the repository root with `npm run test:e2e -- web/tests/e2e/<path>.spec.ts`. Global gates use `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, or `npm run check`. Run `npm run db:migrate` and `npm run db:seed` only after the DB verifier passes; tests must target the disposable test database.

### TK-01 — Workspace and runtime bootstrap

**Depends on:** Approved design; npm available. **Gate:** G0. **Acceptance:** A26, A34.

**Files:** Create root `package.json`, `package-lock.json`, `.nvmrc`, `.npmrc`, `eslint.config.js`, `playwright.config.ts`, `api/package.json`, `web/package.json`, `api/tsconfig.json`, `web/tsconfig.json`, `api/index.ts`, API/web skeletons, `api/tests/bootstrap.test.ts`, and `web/tests/bootstrap.test.tsx`.

**RED:** Before files exist, record `npm run check` failing because the root manifest is absent.  
**GREEN:** `npm ci`, real ESLint, `npm run typecheck`, `npm run test:api`, `npm run test:web`, `npm run test:e2e -- --list`, `npm run build`, and `npm run check` each execute real commands and return zero. Define root pass-through scripts for `test:api`, `test:web`, `test:e2e`, `db:migrate`, `db:seed`, and `check`; `api`/`web` tests must not be no-op scripts. Add an API serverless-entrypoint and health smoke test plus a web app-render smoke test; assert an intentionally invalid TS fixture fails typecheck, then remove it. Keep toolchain versions exact in the lockfile and runtime declaration.

### TK-02 — Local PostgreSQL and safe database identities

**Depends on:** TK-01. **Gate:** G1. **Supporting acceptance coverage:** A24 (Compose database foundation), A25 (separate test identity only). This task does not satisfy either acceptance check; full Docker app verification and two-organization seed evidence are later tasks.

**Files:** Create `docker-compose.yml`, `docker/postgres/init-databases.sh`, `scripts/db-health.ps1`, `scripts/verify-test-database.mjs`, `api/tests/db/database-identity.test.ts`; update `.env.example` and root scripts.

**RED:** `docker compose ps --services --filter status=running` and `npm run db:wait` fail before startup. Add a negative test where `verify-test-database.mjs` rejects a dev/non-test database identity.  
**GREEN:** Compose creates separate dev and test DB roles/databases, passes health checks, and the verifier refuses destructive test setup unless the connection identifies the test database.

### TK-03 — Requirements trace, assumptions, and architecture ADRs

**Depends on:** Approved spec. **Gate:** G0. **Acceptance:** A26–A28.

**Files:** Create `scripts/check-doc-contract.py`, `docs/assumptions.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/adr/0001-shared-postgres-and-membership-rbac.md`; create or maintain `evidence/checkpoints/acceptance-status.md`.

**RED:** `py -3 scripts/check-doc-contract.py` reports missing required sections or acceptance IDs.  
**GREEN:** `py -3 scripts/check-doc-contract.py` asserts all A01–A40 appear exactly once in the status ledger with `NOT_RUN`; architecture/assumptions/data-model docs explain requirements versus choices, role matrix, tenant boundary, schema/indexes, local/cloud shape, notification outbox/retry/recovery future-work design, failed integration behavior, and required operational discussion: TLS, secrets, networking, backups/restore, CI/CD, migrations, monitoring/alerts, rollback, cost drivers, scale, and tradeoffs.

### TK-04 — Organization, user, and membership schema

**Depends on:** TK-02, TK-03. **Gate:** G1. **Acceptance:** A03, A08, A09, A25.

**Files:** Create `api/prisma/schema.prisma`, initial migration, `api/src/db/client.ts`, `api/tests/db/organization-membership.test.ts`.

**RED:** Assert duplicate `(organizationId,userId)` membership and missing organization/user FK fail against real PostgreSQL.  
**GREEN:** Apply migration to empty test DB; verify uniqueness, FK behavior, and membership indexes with Prisma metadata/SQL assertions.

### TK-05 — Ticket, comment, activity, session schema

**Depends on:** TK-04. **Gate:** G1. **Acceptance:** A09, A15, A16, A25, A29.

**Files:** Update `api/prisma/schema.prisma`; create migration and `api/tests/db/tenant-relations.test.ts`.

**RED:** Real-DB tests attempt cross-org requester/assignee/comment/event links and duplicate org ticket numbers; each must fail.  
**GREEN:** Composite tenant constraints, ticket version, session token hash uniqueness, timestamps, enums, event append-only service contract, and tenant-first indexes are present and migrations apply cleanly.

### TK-06 — Deterministic synthetic two-org seed

**Depends on:** TK-05. **Gate:** G1. **Acceptance:** A25, A39, A40.

**Files:** Create `api/prisma/seed.ts`, `api/tests/db/seed.test.ts`, `docs/demo-accounts.md`.

**RED:** Seed assertion fails when either organization, role, or negative-case fixture is missing.  
**GREEN:** Repeated seed is deterministic/idempotent and creates Alpha/Beta admins, agents, multiple customers, own/other-customer/foreign-org tickets and status/priority/overdue fixtures using documented synthetic credentials.

### TK-07 — API app, error envelope, validation, request IDs

**Depends on:** TK-01, TK-05. **Gate:** G2. **Acceptance:** A11, A26, A33.

**Files:** Update `api/src/app.ts`; create `api/src/middleware/{errors,request-id,validate}.ts` and `api/tests/http/errors.test.ts`.

**RED:** Supertest asserts malformed JSON, invalid schema, and thrown error responses; expected envelope/status tests fail.  
**GREEN:** App returns documented sanitized envelopes with request ID; Zod rejects unknown/forbidden fields; logs redact request body secrets.

### TK-08 — Password login, session, logout, CSRF/origin

**Depends on:** TK-05, TK-07. **Gate:** G2. **Acceptance:** A01, A02, A32, A33.

**Files:** Create `api/src/modules/auth/{routes,service,session}.ts`, `api/src/middleware/authenticate.ts`, `api/tests/auth/auth.test.ts`.

**RED:** Tests fail for correct login, bad login, logout, expiry/revocation, cookie flags, and unsafe request without valid origin/CSRF proof.  
**GREEN:** Hashed passwords, hashed opaque persisted session token, short expiry, rate-limited login, HttpOnly/SameSite cookie and Secure in production pass API tests; no localStorage token flow exists.

### TK-09 — Active organization context

**Depends on:** TK-08. **Gate:** G2. **Acceptance:** A02, A04, A05, A07, A31.

**Files:** Create `api/src/middleware/active-membership.ts`, `api/tests/auth/active-membership.test.ts`.

**RED:** Protected route tests fail when org selector is missing, foreign, stale, or membership revoked.  
**GREEN:** Server reloads current membership and derives role/org scope; changing body/header `organizationId` cannot expand access.

### TK-10 — Central role and ticket ownership policies

**Depends on:** TK-09. **Gate:** G2. **Acceptance:** A03–A06, A10, A12.

**Files:** Create `api/src/lib/policy.ts`, `api/tests/auth/policy.test.ts`.

**RED:** Table-driven tests fail for customer-other-customer, cross-org, customer-staff-action, and agent/admin policy boundaries.  
**GREEN:** Shared policy functions enforce admin/agent/customer capabilities and hide inaccessible ticket existence consistently.

### TK-11 — Membership administration API

**Depends on:** TK-10. **Gate:** G2. **Acceptance:** A03, A08.

**Files:** Create `api/src/modules/memberships/{routes,service,schema}.ts`, `api/tests/memberships/memberships.test.ts`.

**RED:** Non-admin, foreign-org ID, duplicate membership, and last-admin demotion/removal tests fail.  
**GREEN:** Admin-only create/update/list operations are tenant scoped and transactionally prevent removing the last active admin.

### TK-12 — Ticket creation

**Depends on:** TK-10. **Gate:** G3. **Acceptance:** A10, A11, A15, A16.

**Files:** Create `api/src/modules/tickets/{routes,service,schemas}.ts`, `api/tests/tickets/create.test.ts`.

**RED:** Valid create, bad required fields/ranges, customer-forged requester/org, audit event and rollback tests fail.  
**GREEN:** Valid create derives org/requester from server context, applies documented defaults, writes an initial event atomically, and rejects invalid payloads.

### TK-13 — Ticket list, filters, and tenant-scoped search

**Depends on:** TK-12. **Gate:** G3. **Acceptance:** A07, A17, A18.

**Files:** Update `api/src/modules/tickets/{routes,service}.ts`; create `api/tests/tickets/list.test.ts`.

**RED:** Filter-combination, search, customer visibility, and Beta-only match tests fail.  
**GREEN:** Status/priority/assignee/customer/search constraints apply in SQL with validated active-org scope before counts/results.

### TK-14 — Stable bounded pagination and sorting

**Depends on:** TK-13. **Gate:** G3. **Acceptance:** A19.

**Files:** Update ticket query module; create `api/tests/tickets/pagination.test.ts`.

**RED:** Equal timestamps produce unstable order or page overlap; oversized/negative page values are accepted.  
**GREEN:** Enforce capped page size and deterministic `createdAt DESC, id DESC`; unchanged fixtures have no duplicate/missing rows across pages.

### TK-15 — Ticket detail authorization

**Depends on:** TK-12. **Gate:** G3. **Acceptance:** A04, A06, A10.

**Files:** Update ticket routes/service; create `api/tests/tickets/detail.test.ts`.

**RED:** Tests show foreign-org and same-org other-customer ID lookup discloses a record.  
**GREEN:** Authorized detail is returned; inaccessible and absent records use the same non-disclosing response.

### TK-16 — Ticket edits, lifecycle, priority

**Depends on:** TK-15. **Gate:** G3. **Acceptance:** A12, A13, A15, A31.

**Files:** Update ticket schema/service; create `api/tests/tickets/update.test.ts`.

**RED:** Tests fail for legal edits and pass incorrectly for illegal transitions, customer status/priority tampering, and forbidden field injection.  
**GREEN:** Central transition graph and role policy validate all changes; meaningful field changes produce an event.

### TK-17 — Tenant-safe assignment

**Depends on:** TK-16. **Gate:** G3. **Acceptance:** A09, A12.

**Files:** Update ticket routes/service; create `api/tests/tickets/assignment.test.ts`.

**RED:** Cross-org member, customer-role assignee, unauthorized actor, and valid same-org agent tests fail.  
**GREEN:** Assignment requires agent/admin actor and eligible same-org target; mutation and audit event are atomic.

### TK-18 — Atomic immutable activity history

**Depends on:** TK-16. **Gate:** G3. **Acceptance:** A15, A16.

**Files:** Create `api/src/modules/activity/{service,routes}.ts`, `api/tests/activity/atomicity.test.ts`.

**RED:** Inject event-write failure and assert ticket mutation rolls back; assert event update/delete rejected through application API.  
**GREEN:** Transaction helper commits both or neither; API exposes ordered read only; event rows are append-only through app policy.

### TK-19 — Ticket comments and history endpoints

**Depends on:** TK-15, TK-18. **Gate:** G3. **Acceptance:** A05, A06, A14, A15.

**Files:** Create `api/src/modules/comments/{routes,service,schema}.ts`, `api/tests/tickets/comments.test.ts`.

**RED:** Unauthorized, closed-ticket, invalid-body, and chronology tests fail.  
**GREEN:** Visible users can comment where lifecycle permits; comments and activity are tenant-scoped, validated, and returned in deterministic order.

### TK-20 — Optimistic concurrency

**Depends on:** TK-16, TK-18. **Gate:** G3. **Acceptance:** A29.

**Files:** Update `api/src/modules/tickets/{routes,schemas,service}.ts`, ticket update/assignment API tests, `api/tests/tickets/concurrency.test.ts`, and `docs/api.md`.

**RED:** Two concurrent content updates or assignments using the same `X-Ticket-Version` value both succeed or both write audit history; stale/no-op mutations are accepted.
**GREEN:** Detail returns the strong version ETag; every ticket content or assignment PATCH requires a valid ETag and compares it inside the organization-locked transaction after authorization. Exactly one same-version concurrent write succeeds; the loser gets 409, stale no-op requests also get 409, version increments once, one winning event is recorded, and successful writes return the current ETag. Missing preconditions return 428 and malformed values return 422.

### TK-21 — Dashboard metrics

**Depends on:** TK-13, TK-16. **Gate:** G3. **Acceptance:** A07, A20, A21.

**Files:** Create `api/src/modules/dashboard/{routes,service}.ts`, mount it in `api/src/app.ts`, add `api/tests/dashboard/dashboard.test.ts`, and document exact formulas in `docs/api.md` and `docs/assumptions.md`.

**RED:** Fixture assertions fail for org-scope, status/priority totals, overdue exclusions, or agent workload.  
**GREEN:** Metrics use one captured UTC evaluation time and match formulas in spec/docs; customer dashboard access is denied.

### TK-22 — Health/readiness and API contract docs

**Depends on:** TK-07–TK-21. **Gate:** G3. **Acceptance:** A26, A27.

**Files:** Create `api/src/modules/health.ts`, `docs/api.md`; add API schema examples/contract check.

**RED:** Contract check fails for missing routes, error shapes, access policy, or readiness behavior.  
**GREEN:** Liveness is DB-independent, readiness checks DB without secrets, and endpoint docs match Supertest-observed status/payloads.

### TK-23 — React shell, API client, and sign-in

**Depends on:** TK-08, TK-22. **Gate:** G4. **Acceptance:** A01, A22, A23.

**Files:** Create `web/src/app/{router,providers}.tsx`, `web/src/lib/api.ts`, auth feature files and `web/tests/e2e/auth.spec.ts`.

**RED:** Playwright login, invalid login, reload session, and logged-out redirect tests fail.  
**GREEN:** Browser uses same-origin credentialed API calls and renders accessible sign-in, errors, and authenticated shell.

### TK-24 — Ticket list, search, filters, pagination UI

**Depends on:** TK-13, TK-23. **Gate:** G4. **Acceptance:** A17–A19, A22–A23.

**Files:** Create `web/src/features/tickets/list/` and `web/tests/e2e/ticket-list.spec.ts`.

**RED:** Filter/search/page browser tests fail, including customer own-ticket list.  
**GREEN:** UI synchronizes validated filters to API, shows loading/empty/error states, and preserves stable page navigation.

### TK-25 — New-ticket form

**Depends on:** TK-12, TK-23. **Gate:** G4. **Acceptance:** A10–A11, A22–A23.

**Files:** Create `web/src/features/tickets/create/` and `web/tests/e2e/ticket-create.spec.ts`.

**RED:** Required field, invalid input, successful create, and customer requester spoof tests fail.  
**GREEN:** Accessible validation mirrors API rules, successful submit navigates to created ticket, server remains authoritative.

### TK-26 — Ticket detail, edit, assignment, comments, history

**Depends on:** TK-16–TK-20, TK-23. **Gate:** G4. **Acceptance:** A12–A16, A22–A23, A29.

**Files:** Create `web/src/features/tickets/detail/` and `web/tests/e2e/ticket-detail.spec.ts`.

**RED:** Agent/customer role journeys, invalid transition, assignment denial, history and 409 conflict browser tests fail.  
**GREEN:** Detail actions vary by role, display comments/events, and stale writes provide a refresh/retry path without hiding server denial.

### TK-27 — Dashboard UI

**Depends on:** TK-21, TK-23. **Gate:** G4. **Acceptance:** A20–A23.

**Files:** Create `web/src/features/dashboard/` and `web/tests/e2e/dashboard.spec.ts`.

**RED:** Dashboard fixtures, denied customer, and refresh-after-mutation tests fail.  
**GREEN:** Display API-provided tenant metrics with formulas/timestamp explained in accessible labels.

### TK-28 — Admin membership controls UI

**Depends on:** TK-11, TK-23. **Gate:** G4. **Acceptance:** A03, A08, A22–A23.

**Files:** Create `web/src/features/memberships/` and `web/tests/e2e/memberships.spec.ts`.

**RED:** Admin add/edit, last-admin denial, non-admin hidden/denied controls, and cross-org ID tests fail.  
**GREEN:** Admin-only member screen calls protected API, surfaces validation/denials, and never assumes hidden controls secure the route.

### TK-29 — Responsive behavior, accessibility, UI states

**Depends on:** TK-23–TK-28. **Gate:** G4. **Acceptance:** A22, A23, A37.

**Files:** Update `web/src/**`; create `web/tests/e2e/accessibility.spec.ts`, `web/tests/e2e/responsive.spec.ts`.

**RED:** Keyboard, labels, visible errors, narrow viewport, 403/404/500 and loading/empty assertions fail.  
**GREEN:** Playwright checks semantic labels/focus and desktop/narrow journeys pass; attach screenshots with synthetic records only.

### TK-30 — Security attack suite

**Depends on:** TK-11–TK-29. **Gate:** G5. **Acceptance:** A02–A09, A31–A33.

**Files:** Create `api/tests/security/{tenant-escape,mass-assignment,session-csrf,rate-limit}.test.ts`.

**RED:** Adversarial matrix must reproduce each unauthorized access attempt against a named route before protection is asserted.  
**GREEN:** Cross-org and same-org ownership negatives, role/property checks, CSRF/origin, expired session, login throttle, response/log redaction all fail closed.

**Security follow-up for TK-30:** `SEC-FOUNDATION-01` in `evidence/reviews/security-foundation-2026-10-26-2f95a1a.md` requires a disposable limiter-key exhaustion/recovery probe and an explicit availability disposition. Shared/provider limiter overload behavior must be verified before public/serverless exposure; current process-local protection is not a hosted-release claim.

### TK-31 — Reliability and query plan evidence

**Depends on:** TK-13–TK-30. **Gate:** G5. **Acceptance:** A19, A21, A29–A30, A38.

**Files:** Create `api/tests/reliability/`, `docs/performance.md`, `scripts/capture-query-plan.mjs`.

**RED:** Representative filter query lacks bounded deterministic plan evidence; duplicate/replay behavior has no assertion.  
**GREEN:** Record sanitized `EXPLAIN (ANALYZE, BUFFERS)` for representative seeded tenant filter; document index use/limitations, million-row strategy, idempotency implemented or explicitly N/A, and concurrency proof.

### TK-32 — CI and clean checkout gates

**Depends on:** TK-29–TK-31. **Gate:** G5. **Acceptance:** A24, A26, A34.

**Files:** Create `.github/workflows/ci.yml`, update root scripts, `docs/testing.md`.

**RED:** Workflow validation or clean checkout run fails before gates are configured; prove one deliberately failing check blocks the job in a local disposable branch/test fixture.  
**GREEN:** CI installs from lockfile, starts isolated PostgreSQL, migrates/seeds, runs lint/typecheck/API/UI/e2e/build and uploads sanitized logs; no fake success jobs.

### TK-33 — Docker-local production build and runbook

**Depends on:** TK-32. **Gate:** G5. **Acceptance:** A24–A28.

**Files:** Create `Dockerfile`, `api/src/local-server.ts`, `docs/operations.md`, update README and Compose configuration.

**RED:** Fresh checkout README start path fails before image/build/run targets exist.  
**GREEN:** From clean checkout, documented Docker Compose, migration, seed, API/web launch and health checks work; production frontend/API builds succeed and containers run as non-root where supported.

### TK-34 — Vercel/Neon deploy configuration design check

**Depends on:** TK-33 and explicit human approval to enter C6. **Gate:** G6 preparation only. **Acceptance:** A27, A35–A36.

**Files:** Create `web/vercel.json` and `docs/deployment.md`; update operations docs. Use and verify the `api/index.ts` serverless entrypoint established in TK-01.

**RED:** Local Vercel preview/build check fails for API entrypoint, rewrite, cookie, SPA fallback, or pooled/direct DB mapping.  
**GREEN:** Validate current official platform behavior and local preview configuration without creating provider resources; write migration sequencing, region, secrets, backups, monitoring, CI, cost, rollback, and failure behavior.

### TK-35 — Approved preview deployment

**Depends on:** TK-34, explicit human approval. **Gate:** G6. **Acceptance:** A35–A36.

**Files:** Provider configuration plus sanitized `evidence/releases/preview.md`.

**RED:** Preview smoke against isolated synthetic Neon branch must detect incorrect SHA, production DB identity, broken rewrite/cookie, health, role, tenant, and 409 behavior before release.  
**GREEN:** Only after approval, configure two Vercel projects and isolated Neon preview, migrate once through direct URL, run HTTPS smoke, record exact URLs/SHA/build IDs/sanitized evidence. Do not configure or publish production in this task.

### TK-36 — Independent final review and remediation

**Depends on:** TK-32–TK-35 where deployment is approved; otherwise TK-32–TK-34. **Gate:** G7. **Acceptance:** A01–A38.

**Files:** `evidence/reviews/spec.md`, `evidence/reviews/security.md`, `evidence/reviews/backend.md`, `evidence/reviews/frontend.md`, `evidence/reviews/operations.md`, targeted fixes/tests.

**RED:** Fresh reviewer replay finds and records concrete failures/findings on exact candidate SHA; if none, independently replay all applicable gates and capture proof.  
**GREEN:** Fix each P0/P1 with regression tests, rerun impacted gates and the complete release suite on new SHA; preserve P2/P3 as documented follow-ups. If no agents/worktrees are supported, state serialized-review independence limits.

### TK-37 — Submission, demo, and AI disclosure

**Depends on:** TK-36. **Gate:** G7. **Acceptance:** A26–A28, A39–A40.

**Files:** Update README; create `docs/limitations.md`, `AI_USAGE.md`, `evidence/releases/release-evidence.md`, demo script.

**RED:** Final audit fails for any required deliverable, missing acceptance result, unverified claim, or AI disclosure gap.  
**GREEN:** Fresh-clone setup and final evidence audit cite exact reviewed SHA, commands, exits, tests, synthetic sample instructions, known limitations, notification future-work design, and demo/review talking points. Hosted URL is claimed only if independently verified.

## Acceptance Coverage Index

| Acceptance IDs | Primary tasks |
|---|---|
| A01–A03 | TK-08, TK-10–TK-11, TK-23, TK-28, TK-30 |
| A04–A09 | TK-04–TK-05, TK-09–TK-11, TK-15, TK-17, TK-21, TK-30 |
| A10–A16 | TK-05–TK-06, TK-12, TK-15–TK-20, TK-25–TK-26 |
| A17–A19 | TK-13–TK-14, TK-24, TK-31 |
| A20–A21 | TK-21, TK-27, TK-31 |
| A22–A23 | TK-23–TK-29 |
| A24–A28 | TK-02–TK-03, TK-22, TK-31–TK-33, TK-36–TK-37 |
| A29–A33 | TK-16–TK-20, TK-26, TK-30–TK-31 |
| A34–A38 | TK-01, TK-31–TK-36 |
| A39–A40 | TK-06, TK-31, TK-37 |

## Task Completion Evidence

For every TK task, append `evidence/checkpoints/TK-XX.md` with branch, pre-task SHA, final SHA, changed paths, acceptance IDs, environment/database identity (non-secret), exact RED command/output/exit, exact GREEN commands/output/exits, review findings, residual risks, and next task. Update `evidence/checkpoints/acceptance-status.md` only from this observed evidence. Do not commit known failures as passing tasks.

## Self-Review

- **Spec coverage:** Product, permissions, tenant boundaries, session/CSRF, schema, constraints, search/pagination, lifecycle, audit/concurrency, dashboard formulas, UI states, API errors, local Docker, optional cloud topology, evidence, AI disclosure, and final demo all have owning tasks.
- **Step and interface consistency:** API modules use routes/services/schemas under `api/src/modules`; `api/index.ts` exports the app, and local startup stays separate. Tests use API and web workspace scripts established in TK-01. TK-01 owns the serverless entrypoint; later deployment tasks verify and use it.
- **Review focus:** The five uncovered risk classes each name the test-owning TK tasks above.
- **Proportion:** This plan refines 37 user-specified task cards; it intentionally retains the requested checkpoints and keeps production approval distinct from code implementation.
- **Environment gap:** npm is now installed/active as Node 24.22.1's bundled npm 11.19.1 and the doctor detects it. Docker is installed; Compose-backed app behavior is still unverified.
- **Open scope:** A30 idempotency and C6 deployment are explicitly conditional/optional; no acceptance case can be marked PASS before executed evidence.
