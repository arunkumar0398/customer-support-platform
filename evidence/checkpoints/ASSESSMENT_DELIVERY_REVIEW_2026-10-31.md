# Assessment deliverables and review preparation

**Latest docs-status candidate:** `158ddaeffd7d3e61dbc49ea79e43d7300ee10ace`; Actions #103 `verify` passed on exact SHA. Vercel Web/API status markers say success but provider descriptions report ignored-build cancellation, not deployment/runtime evidence. Application source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` / #74. Exact-candidate G7 returned **BLOCKED_BY_ENVIRONMENT** ([report](../reviews/g7-158ddae-2026-11-01.md)); it predates this documentation reconciliation.

Review date: 2026-11-01 (Asia/Calcutta)
Repository: `arunkumar0398/customer-support-platform`, private branch `codex/clean-candidate-b2fd369`
Application implementation source: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`
Original documentation candidate reviewed: `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` (historical)

Reviewed docs-status candidate: `24f1d953ef487a42928ccc21923bf0dc3cca1dd7`, Actions #102 `verify` passed on the exact SHA. Its Vercel Web/API status markers are `success`, but both descriptions say “Canceled by Ignored Build Step”; neither is a deployment. The independent G7 review on this exact SHA returned **BLOCKED_BY_ENVIRONMENT**; see [the sanitized report](../reviews/g7-24f1d95-2026-11-01.md). Previous docs candidate `cd0b04ff830a187d45fd3370db97a22c2adba476` / #101 had provider deployment-completed statuses without runtime smoke. Application implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` / #74.

Latest exact-CI/Vercel-verified docs/test candidate before this review refresh: `acf01641263275507f4b781bc980cf9e810c9e49`, Actions #95, Web/API success.
Assessment basis: `reference/assessment.pdf`, implementation scope and deliverables section.

This is a repository-content review. It does not establish that an evaluator can access the private GitHub repository, that cloud controls are configured, or that blocked Preview/audit work ran.

## Preview and local gate refresh — 2026-11-01

Neon recovery and the one-time read-only synthetic fixture discovery are **reported PASS**: branch production, endpoint ep-shy-surf-b36pzssx; observed 2026-11-01 09:11 IST / 03:41 UTC; SELECT 1 returned 1; discovery found 15 active synthetic memberships and 15 tickets. Vercel Preview Web/API health checks passed against source a5673cbcee3c6b30178404c80c1eb1bf56f963a4. Exact API-to-Neon branch alignment is unverified. A35 preconditions are ready, but authenticated A35 role and denial acceptance remains BLOCKED / NOT_RUN because safe synthetic Preview passwords are not available. No migrations/seeding or Production checks occurred. Details: [readiness report](PREVIEW-READINESS-2026-11-01.md).

A36 is PASS only for the documented local disposable-DB recovery/restore-forward path and previous-code compatibility; SQL down-migration and hosted Neon PITR remain untested. A22/A23/A37 remain partial evidence and are not full acceptance passes. The full bounded security audit remains incomplete.

## Required submission items (A26)

| # | Assessment deliverable | Result | Repository evidence | Remaining action |
|---|---|---|---|---|
| 1 | Source repository | **PARTIAL** | Private source: [GitHub repository](https://github.com/arunkumar0398/customer-support-platform), branch `codex/clean-candidate-b2fd369`; source implementation `3e613c0…`; current docs/test candidate `e78b19c…`. | Evaluator identity/access is not known or confirmed. Owner must grant access or provide an approved private handoff. Keep visibility private. |
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

## Independent release review

Exact docs candidate `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` received a read-only G7 review after Actions #102 completed. Verdict: **BLOCKED_BY_ENVIRONMENT**. The sanitized report is [here](../reviews/g7-24f1d95-2026-11-01.md). The review preceded the local evidence now recorded in [the UI matrix](UI_A22_A23_MATRIX_2026-11-01.md) and [A36 recovery report](A36-migration-recovery-2026-11-01.md); a new G7 follow-up is still required after the next exact candidate. Preview role/tenant acceptance, the full compliant offline audit, evaluator access, broader A22/A23/A37 coverage, and A28 human rehearsal remain open. A36 local restore/forward recovery and previous-code compatibility now have evidence; this is not a SQL down migration or hosted PITR test. Vercel on 24f1 reports ignored-build cancellations, not runtime checks.

## Exact local acceptance rerun

Application implementation source under test: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Environment: Windows local checkout, Node 24.22.1, npm 11.19.1, Vitest 5.0.5, Playwright 1.64.1, disposable PostgreSQL 18.6 container bound only to loopback port 5544. `npm run db:verify-test` reported `support_test / support_test`; no Preview or Production database was used.

- Focused API command covering auth, policy, ticket detail/assignment/comments/update/create/list and dashboard: `npm run test:api -- tests/auth/auth.test.ts tests/auth/policy.test.ts tests/tickets/detail.test.ts tests/tickets/assignment.test.ts tests/tickets/comments.test.ts tests/tickets/update.test.ts tests/tickets/create.test.ts tests/tickets/list.test.ts tests/dashboard/dashboard.test.ts` — exit 0; 9 files, 221/221 passed.
- Full browser command `npm run test:e2e` — exit 0; 23/23 passed. This covers the existing synthetic fixture journeys, not the blocked Preview acceptance matrix or every route/viewport/state combination.
- Full check on the source worktree: `npm run check` — exit 0; lint/typecheck passed; API 391/391; web 12/12; 23 Playwright tests discovered; API and Web builds passed.
- Assignment-atomicity addition in this candidate: `npm run test:api -- tests/tickets/assignment.test.ts` — exit 0; 14/14 passed. A disposable PostgreSQL trigger forced the `ASSIGNMENT_CHANGED` insert to fail; the HTTP response was sanitized, assignee/version and event count remained unchanged, and assignment succeeded after trigger removal. Full check with this added regression test: exit 0; API 392/392, web 12/12, 23 Playwright tests discovered, builds passed. This tests code rollback, not migration reversal.

The new local full browser rerun at worktree HEAD `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` used verified disposable `support_test` on loopback port 5546: `npm run test:e2e` exit 0, 23/23; focused keyboard case exit 0, 1/1. Route/role/viewport/state limits are enumerated in [the matrix](UI_A22_A23_MATRIX_2026-11-01.md); A22/A23 remain NOT_RUN as complete criteria. A36 local migration/recovery and pre-fix compatibility evidence is in [the recovery report](A36-migration-recovery-2026-11-01.md). The commands did not use Preview or Production.
