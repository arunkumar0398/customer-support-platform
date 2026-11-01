# Assessment deliverables and review preparation

Review date: 2026-10-31 (Asia/Calcutta)
Repository: `arunkumar0398/customer-support-platform`, private branch `codex/clean-candidate-b2fd369`
Application implementation source: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`
Documentation candidate reviewed: `5e27f68a7f2c8aa12c502995b26c2b5063e1309b`

Latest verified docs/test candidate before this review-record refresh: `224771c1515c8f39a425e5ef060eb39e0d534a04`, Actions #96 success, Vercel Web/API provider quota failures.

Latest exact-CI/Vercel-verified docs/test candidate before this review refresh: `acf01641263275507f4b781bc980cf9e810c9e49`, Actions #95, Web/API success.
Assessment basis: `reference/assessment.pdf`, implementation scope and deliverables section.

This is a repository-content review. It does not establish that an evaluator can access the private GitHub repository, that cloud controls are configured, or that blocked Preview/audit work ran.

## Required submission items (A26)

| # | Assessment deliverable | Result | Repository evidence | Remaining action |
|---|---|---|---|---|
| 1 | Source repository | **PARTIAL** | Private source: [GitHub repository](https://github.com/arunkumar0398/customer-support-platform), branch `codex/clean-candidate-b2fd369`; source implementation `3e613c0…`; docs candidate `5e27f68…`. | Evaluator identity/access is not known or confirmed. Owner must grant access or provide an approved private handoff. Keep visibility private. |
| 2 | README setup/run instructions | **COMPLETE** | `README.md`, `docs/operations.md`: prerequisites, environment values, guarded migrations/seed, local Docker run, checks and browser tests. | None for artifact presence; follow exact commands in the docs. |
| 3 | Architecture diagram | **COMPLETE** | `docs/architecture.md`: Mermaid topology for local Docker, Vite proxy and Vercel web proxy/API/Neon flow. | Deployment status is optional and separately SHA-bound. |
| 4 | Data model and key indexes | **COMPLETE** | `docs/data-model.md` against `api/prisma/schema.prisma` and the three checked-in migrations; entities, tenant composite FKs/checks, indexes, and pagination tradeoffs listed. | No schema discrepancy identified in this content review. SQL down migration remains untested. |
| 5 | API docs/examples | **COMPLETE** | `docs/api.md`: route methods/paths, session/CSRF and organization requirements, request/response/error examples, role limits, ticket and child-resource routes. | Preview behavior remains unverified. |
| 6 | Sample credentials or seed instructions | **COMPLETE** | `docs/demo-accounts.md`, `api/prisma/seed.ts`: synthetic local-only accounts and two-organization fixtures; seed guard is documented. | Use synthetic local fixtures only; these do not establish Preview/Production credentials. |
| 7 | Test instructions/results | **COMPLETE** | `docs/testing.md`, `evidence/checkpoints/acceptance-status.md`, checkpoint reports; exact source and CI SHAs/runs distinguished. | Preview and the full offline security audit remain blocked/not run. |
| 8 | Tradeoffs, limitations, next steps | **COMPLETE** | `docs/limitations.md`: process-local throttle, capped offset pagination, no public signup/password reset, ambiguous-create retry risk, missing monitoring/notifications and open release checks. | Close gates only with observed evidence. |

**A26 overall: BLOCKED** until item 1 evaluator access or an approved private handoff is confirmed. Items 2–8 are present/readable in the reviewed tree; this audit does not change repository visibility.

## Deployment-architecture documentation (A27)

| Topic | Documented evidence | Actual state / limit |
|---|---|---|
| Hosting | `docs/architecture.md`, `docs/operations.md` | Vercel static web + same-origin proxy + Express Function, Neon PostgreSQL; deployment is optional in the assessment. |
| TLS | `docs/operations.md` Preview environment variables require exact HTTPS origins; `docs/architecture.md` documents production `Secure` cookies. | No TLS configuration or certificate was freshly inspected at the provider in this review. Do not infer hosted endpoint health from docs. |
| Secrets | `docs/operations.md`, `docs/architecture.md`, `.env.example`, `.gitignore` | Local `.env` is ignored; separate runtime/migration secrets are described; no credential value belongs in this report. Actual provider secret values are not read back. |
| Networking | `docs/architecture.md`, `docs/operations.md` | Same-origin `/api` proxy, allowlisted forwarded headers/body, Vercel function region `sin1`, Neon Singapore region, and separate Preview/Production data paths are described. |
| Backups | `docs/architecture.md`, `docs/operations.md` | Provider restore/PITR setup and retention require owner-side verification; no backup restore was performed. |
| CI | `docs/testing.md`, `.github/workflows/ci.yml` | Disposable PostgreSQL, migrations/seed, sanitization, lint/typecheck/tests/Playwright/build gates are documented; exact run results are recorded separately by SHA. |
| Monitoring | `docs/architecture.md`, `docs/limitations.md` | Request IDs and sanitized errors exist; no full monitoring/alerting system is implemented. |
| Rollback | `docs/operations.md`, `docs/limitations.md`, `harness/VERCEL_NEON_DEPLOYMENT.md` | Controlled migration/code rollback guidance is distinguished. Code rollback compatibility is not a SQL reverse migration; migration reversal was not tested. |

**A27: PASS for documentation coverage only.** This is not operational evidence of backups, monitoring, TLS/provider configuration, deployed proxy behavior, or database rollback.

## Engineering discussion preparation (A28)

The following answer outlines are grounded in `docs/performance.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/operations.md`, and `docs/limitations.md`. They are study notes, not evidence that the repository owner completed a live interview rehearsal.

1. **How would you investigate a slow ticket query?** Start with the route's tenant/role predicates and bounded pagination, reproduce with a representative tenant, verify database identity, and inspect `EXPLAIN (ANALYZE, BUFFERS)`. The recorded 50,000-row synthetic experiment used the tenant/status/order index on the first page; a deep offset sorted matching rows, so compare cursor pagination and measured plans before adding indexes. It is not a production SLO/load test.
2. **How is tenant isolation enforced?** The active organization and role are taken from the session's current membership; list/detail/comment/event/dashboard operations use tenant and requester scope; composite membership/ticket foreign keys constrain cross-organization references. These controls complement each other; database constraints do not replace endpoint authorization.
3. **How are concurrent edits handled?** A ticket version/ETag guards writes. A stale version returns 409. The ticket update and corresponding event use a transaction; assignment uses organization locking and its own transaction. The newly added assignment fault-injection test checks rollback when the activity insert fails.
4. **What happens during an outage?** Readiness checks exercise database connectivity; API errors use a safe envelope/request ID. There is no complete alerting, queue, or retry system. Avoid automatic retries for ambiguous ticket creates because no idempotency key exists.
5. **What is the rollback plan?** Roll back application code only when the previous code is compatible with the already-applied schema; use controlled, forward-compatible migrations and backups/PITR for data recovery. No SQL down migration has been run, and restore/PITR must be confirmed with the provider.

**A28: NOT_RUN.** The written prompts/answers are ready for a human practice session; no live owner/reviewer rehearsal was observed.

## Exact local acceptance rerun

Application implementation source under test: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Environment: Windows local checkout, Node 24.22.1, npm 11.19.1, Vitest 5.0.5, Playwright 1.64.1, disposable PostgreSQL 18.6 container bound only to loopback port 5544. `npm run db:verify-test` reported `support_test / support_test`; no Preview or Production database was used.

- Focused API command covering auth, policy, ticket detail/assignment/comments/update/create/list and dashboard: `npm run test:api -- tests/auth/auth.test.ts tests/auth/policy.test.ts tests/tickets/detail.test.ts tests/tickets/assignment.test.ts tests/tickets/comments.test.ts tests/tickets/update.test.ts tests/tickets/create.test.ts tests/tickets/list.test.ts tests/dashboard/dashboard.test.ts` — exit 0; 9 files, 221/221 passed.
- Full browser command `npm run test:e2e` — exit 0; 23/23 passed. This covers the existing synthetic fixture journeys, not the blocked Preview acceptance matrix or every route/viewport/state combination.
- Full check on the source worktree: `npm run check` — exit 0; lint/typecheck passed; API 391/391; web 12/12; 23 Playwright tests discovered; API and Web builds passed.
- Assignment-atomicity addition in this candidate: `npm run test:api -- tests/tickets/assignment.test.ts` — exit 0; 14/14 passed. A disposable PostgreSQL trigger forced the `ASSIGNMENT_CHANGED` insert to fail; the HTTP response was sanitized, assignee/version and event count remained unchanged, and assignment succeeded after trigger removal. Full check with this added regression test: exit 0; API 392/392, web 12/12, 23 Playwright tests discovered, builds passed. This tests code rollback, not migration reversal.

The commands above did not use a live service. A25 now has a separate local result: the verified disposable `support_test` E2E setup seeds synthetic accounts and the existing browser session journey signs in as the seeded Alpha admin, reloads, and signs out (23/23 browser suite pass on loopback PostgreSQL port 5546). This closes only local A25. A22/A23 remain NOT_RUN because route-wide responsive/state criteria are broader than the performed suite. A16 has explicit assignment rollback evidence in addition to earlier create/update/comment rollback cases.
