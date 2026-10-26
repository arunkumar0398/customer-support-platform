# Final Engineering Review — Independent Readiness Checklist

Run this from a **fresh clean clone at the final submission SHA**, using independent agents and repeatable commands. Assess everything as PASS/FAIL/BLOCKED/NOT_RUN with proof. The repository in this package has not yet been implemented, deployed or reviewed.

## 1. Release identity and provenance
- [ ] Git SHA, tree SHA, branch/tag, CI job URL, runtime and database version recorded.
- [ ] Source repo contents match deployed artifact; no uncommitted/untracked dependencies.
- [ ] Exact README commands reproduce app on a new machine/CI environment.
- [ ] AI tool usage/reused/generated code disclosure is specific and truthful.

## 2. Product and functional behavior
- [ ] Full 3-role user journeys executed end-to-end on seeded Alpha/Beta organizations.
- [ ] Admin membership/role changes work; last admin cannot be removed/demoted accidentally.
- [ ] Customer creates, views/comments on own ticket and cannot view another customer's.
- [ ] Agent transitions status, changes priority, assigns within org, comments and closes ticket.
- [ ] Ticket lifecycle rejects illegal transitions with no partial effects.
- [ ] Search, filters, sorting and pagination return correct tenant-scoped results.
- [ ] Dashboard counts exactly match documented status/priority/overdue/workload calculations.
- [ ] Meaningful changes appear in immutable event timeline and survive reload/restart.

## 3. Security/adversarial review
- [ ] All routes authenticate and perform server-side per-object/per-org authorization.
- [ ] Cross-organization enumeration via arbitrary known IDs fails on reads and writes.
- [ ] Same-org different-customer permissions fail correctly; no customer disclosure via list totals/search.
- [ ] Unauthorized assignment, status, priority and membership changes are rejected.
- [ ] Request body ignores/rejects `organizationId`, `role`, `createdBy`, `passwordHash`, `version` tampering not allowed by policy.
- [ ] Authentication expiry/logout enforced; cookie attributes and CSRF/origin handling documented/tested.
- [ ] Input validation and escaping prevent reflected/stored script execution; no raw stack trace or secret leaks.
- [ ] Admin credentials/test user passwords do not appear in production logs/screenshots; demo accounts are limited.
- [ ] Test cross-tenant FK attempts against database as well as API.
- [ ] Test concurrency and forced-error rollback of activity events and ticket updates.

## 4. Backend/data engineering
- [ ] `prisma migrate deploy` succeeds against empty DB and relevant upgrade scenario.
- [ ] Indexes cover tenant-first listing/filters, comments/history; sample `EXPLAIN` result recorded.
- [ ] Search and pagination bounded/stable; long-term million-ticket strategy explained.
- [ ] Uniform structured errors and request IDs; rate limiting does not falsely break valid UX.
- [ ] Duplicate requests handling described honestly, with implemented behavior tested.
- [ ] Dashboard/overdue counts exclude the wrong statuses correctly; timestamps UTC and timezone display explicit.
- [ ] No accidental query across org when optional joins/includes are added.

## 5. Frontend/accessibility
- [ ] Mobile/desktop layouts usable without clipped controls; login, tickets, dashboard accessible.
- [ ] Loading, empty, error, 401, 403, 404, conflict 409 states have actionable UX.
- [ ] Forms show field-level errors, success/invalid transitions, disabled unauthorized actions; backend still enforces all.
- [ ] Keyboard navigation, semantic labels, focus order and contrast checked with browser evidence.
- [ ] Session reload and browser back/refresh function properly; no stale cross-organization cache.
- [ ] Screen readers have labels on status/priority/assignment controls; alerts announced as appropriate.

## 6. DevOps, deployment, reliability
- [ ] Docker Compose startup and teardown preserve intended volumes/data.
- [ ] CI covers install, typecheck, lint, unit/API/e2e, build, migration; failures actually block merge.
- [ ] Healthz readiness independent of private data; DB loss shows not-ready, not false success.
- [ ] Hosted HTTPS, Vercel frontend `/api/*` rewrite to Express Function, secure cookies, Vite SPA fallback, no mixed content.
- [ ] Neon pooled runtime/direct migration connections, TLS, secrets, backup/restore and DB migration operations documented.
- [ ] Releases can roll back code; incompatible schema rollback caveats explicitly addressed.
- [ ] Logs include request correlation, no PII/password secrets, useful slow query metrics and error counts.
- [ ] Cost drivers: instance hours, managed DB plan/storage, egress, backups, logs/monitoring, build minutes.
- [ ] Scaling strategy from hundreds to tens of thousands: connection pooling, indices, pagination, caching, async notifications, read replicas as justified.

## 7. Five-minute demo script
1. `00:00–00:40`: architecture choices, exact commit and launch.
2. `00:40–01:25`: log in as customer Alpha; create ticket; validate form.
3. `01:25–02:20`: log in as agent Alpha; filter/assign/update/comment; demonstrate activity events.
4. `02:20–02:55`: admin dashboard and membership roles; overdue/workload refresh.
5. `02:55–03:50`: replay known ticket ID in Beta and as different Alpha customer; 404/denied; explain server filter.
6. `03:50–04:30`: stale edit conflict / invalid transition / failure state.
7. `04:30–05:00`: tests, CI, deployment, tradeoffs and future scaling.

## 8. Review questions to prepare (60–90 minutes)
- What makes tenant boundaries correct even if URL, body, session, or active-org selection is manipulated?
- Why shared-schema PostgreSQL instead of a database per tenant or MongoDB? Where is an RLS defense-in-depth layer useful?
- What is authorization at the object, property and function level? Can agent role see all org tickets, and why?
- How do simultaneous edits avoid lost updates and preserve audit integrity?
- Can ticket creation double-charge/double-create on network timeout? Explain idempotency choices.
- How do you investigate a slow filtered query on 3 million tickets? EXPLAIN, index selectivity, cursor strategy.
- What happens during PostgreSQL outage, mid-migration process kill, wrong release deploy and rollback?
- How do you avoid accidentally logging customer PII and session credentials?
- What did AI write, what did you reuse, how did you independently verify it, and what would you change in a second iteration?

## 9. Reviewer output schema

```
Review scope and SHA:
Environment:
Reproduced tests and commands:
Findings:
  - P0/P1/P2/P3
  - requirement/acceptance ID
  - path:line
  - precise reproduction
  - impact
  - minimal fix / regression test
Verdict: READY_FOR_REVIEW | NOT_READY | BLOCKED_BY_ENVIRONMENT
Open followups:
```
