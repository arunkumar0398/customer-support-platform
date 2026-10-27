# TK-31 Reliability and Performance Assessment Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Assess the existing tenant-scoped ticket list query and its index behavior with a bounded, rollback-only disposable PostgreSQL fixture, and document measured limits without implying production-scale load testing.

**Architecture:** Preserve the application query and schema. Add a small guarded command-line assessment utility that inserts 50,000 synthetic tickets inside one disposable-database transaction, runs representative PostgreSQL EXPLAIN ANALYZE statements for first-page, deep-offset, count, and substring-search paths, then rolls the transaction back. Save observed plans, existing concurrency guarantees, duplicate-request behavior, and growth recommendations in docs/performance.md.

**Tech Stack:** Node.js 24, PostgreSQL, node:assert/Node test runner, pg, Prisma schema and existing service.

**Spec:** harness/ACCEPTANCE_MATRIX.md A29, A30, A38; harness/SECURITY_CONTRACT.md; docs/superpowers/specs/2026-10-26-customer-support-design.md.

## Global Constraints

- Only use TEST_DATABASE_URL after scripts/database-identity.mjs validates loopback host, support_test database, support_test user, and actual connected identity.
- The synthetic fixture is 50,000 rows, transaction-scoped, and rolled back in finally; never use support_dev, production, or an external database.
- Bound statement and lock timeouts; print query-plan measurements, not connection strings or secrets.
- Do not change API behavior or schema without a measured defect and regression-first correction.
- Do not describe this as a million-row benchmark or concurrency/load test.
- Preserve existing user edits, branches, and database contents; no reset, clean, push, merge, or deployment.

## Review Focus

- Verify each assessed item-list and count predicate independently keeps organization scope and status filter.
- Check stable ordering by createdAt DESC then id DESC and the planner’s use of a tenant-first index.
- Measure the effect of offset depth and substring search; do not generalize one local sample into production latency.
- Verify transaction rollback leaves no synthetic organizations, users, memberships, or tickets.
- Reconcile application retry behavior with A30: no idempotency key currently exists; do not label duplicates safe.
- Keep the 100,000-offset API ceiling distinct from the 50,000-row assessment fixture.

## Task 1: Guarded ticket-list plan assessment

**Files:**
- Create: scripts/explain-ticket-list.test.mjs
- Create: scripts/explain-ticket-list.mjs
- Create: docs/performance.md
- Modify: evidence/checkpoints/acceptance-status.md
- Create: evidence/checkpoints/TK-31.md
- Create: evidence/reviews/tk31-2026-10-27-<sha>.md
- Modify: evidence/checkpoints/CURRENT_HANDOFF.md

**Interfaces:**
- The utility exports a pure function buildTicketListExplainQueries(organizationId) returning named, parameterized SQL and values for a tenant/status first page, a deep page (LIMIT 100, OFFSET 2,400), a tenant/status count, and an organization-scoped literal substring query.
- The CLI loads root .env if present, validates TEST_DATABASE_URL with the existing database identity helpers, confirms actual support_test/support_test, starts a transaction with local statement_timeout=30 seconds and lock_timeout=5 seconds, inserts 50,000 synthetic ticket rows, ANALYZEs Ticket, runs the query plans, and rolls back.
- The plan is an assessment aid, not a production endpoint or an additional automatic npm test gate.

- [x] Step 1: Write scripts/explain-ticket-list.test.mjs first. Assert SQL for item, count, deep-offset, and substring queries contains organizationId scope and bound parameters; item ordering is createdAt DESC, id DESC; page and search values are passed as values, not interpolated into SQL.
- [x] Step 2: Run node --test scripts/explain-ticket-list.test.mjs. Expected RED: module export is not present yet. Fix test setup errors until the expected missing-export failure is observed.
- [x] Step 3: Implement the query builder and guarded CLI in scripts/explain-ticket-list.mjs. The CLI must check identity before BEGIN, use generated UUID fixtures, create ten synthetic organizations, users, and customer memberships so each tenant has a representative 5,000-row slice, use generate_series for ticket rows, and rollback in finally.
- [x] Step 4: Run node --test scripts/explain-ticket-list.test.mjs. Expected GREEN: all SQL scope/order/parameterization assertions pass.
- [x] Step 5: Run node scripts/verify-test-database.mjs, then node scripts/explain-ticket-list.mjs. Record exact fixture size, commands, index names, actual/estimated rows, buffers, plan node, and actual time for each representative query. Confirm rollback removed all synthetic rows and no database identity other than support_test/support_test was used.
- [x] Step 6: Write docs/performance.md from observed output. Include the existing five ticket-list indexes, Prisma list/count query behavior and RepeatableRead transaction, the maximum 100,000 offset, substring-search scan/index limitation, A29 stale-write evidence, A30 non-idempotent retry behavior, and limits of the local sample. Recommendations may include cursor pagination or pg_trgm only as future work unless an actual defect is demonstrated.
- [x] Step 7: Run py -3 scripts/check-doc-contract.py and git diff --check. Expected: both exit 0.
- [ ] Step 8: Commit the utility, test, and documentation on codex/assessment-mvp; obtain static and runtime exact-SHA review using the sibling 100xdevs_assessment_review_agent_skill fallback. Runtime replay must first verify support_test and must not overlap the builder's DB command.
- [ ] Step 9: Record evidence on the exact committed source SHA. Mark A38 PASS only if the actual EXPLAIN output assesses the tenant/status item query and confirms the intended index behavior; keep A29 as previously passed, A30 NOT_RUN (or explicit not implemented if the status vocabulary allows), and G5 NOT_RUN.

**Commit:** test(perf): assess ticket list query plan; then a separate evidence commit after review.

## Plan self-review

The assessment contract requires a representative query plan, not an arbitrary benchmark. The selected list query uses the application's organization scope, status filter, stable ordering, and bounded limit/offset. The script records both common and expensive cases without asserting planner output that can vary by PostgreSQL version or data distribution. The 50,000-row synthetic transaction is large enough to make index selection observable locally while remaining an explicit bounded sample. No production behavior changes or remote resources are part of this task.
