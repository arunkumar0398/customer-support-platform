# Acceptance Status

**Baseline:** Workspace/database setup, schema constraints, deterministic two-organization seed, authentication, current membership, role/ownership policies, membership administration, ticket/comment/history APIs, ticket lifecycle, dashboard metrics, and health/readiness have supporting local tests. A03, A04, A09, A13, A18, A19, A20, A21 and A29 have passed their documented API-only scopes; other complete checks remain NOT_RUN. Browser journeys, complete Docker application startup, CI, and deployment are pending.
**Latest implementation source SHA:** `49f0a2c5c94cf24efe980d6862cda34e8d99985c` (TK-22 health/readiness and API contract). Each checkpoint binds its executed commands to its own exact source SHA and environment.
**Rule:** Do not change a result from `NOT_RUN` without observed command/output, exit code, environment, and SHA.

| ID | Result | Evidence |
|---|---|---|
| A01 | NOT_RUN | [TK-08](TK-08.md): real-DB credential/session API checks; browser login pending. |
| A02 | NOT_RUN | [TK-08](TK-08.md): expiry/revocation/replay denied on auth endpoints; protected product endpoints pending. |
| A03 | PASS | Source `3a94144e93875d75b24a2f9a286e6444e836c1ba`; `npm run test:api -- tests/memberships/memberships.test.ts` exit 0, 45/45 real PostgreSQL/HTTP cases; independently replayed. [TK-11](TK-11.md), [review](../reviews/tk11-2026-10-26-3a94144.md). |
| A04 | PASS | Source `22598cad56d45d1cb7a2c73a44517e9756aea34f`; `npm run test:api -- tests/tickets/detail.test.ts` exit 0, 7/7 real PostgreSQL/API; independently replayed. Foreign-org ticket GET denied with generic 404. [TK-15](TK-15.md), [review](../reviews/tk15-2026-10-27-22598ca.md). |
| A05 | NOT_RUN | [TK-17](TK-17.md), [TK-19](TK-19.md): assignment and comment cross-org mutations have scoped denials; full cross-route mutation acceptance remains incomplete. |
| A06 | NOT_RUN | [TK-15](TK-15.md), [TK-19](TK-19.md): same-org other-customer read/write comment denials have scoped evidence; complete ticket/comment mutation acceptance remains incomplete. |
| A07 | NOT_RUN | [TK-13](TK-13.md) and [TK-21](TK-21.md): list counts and dashboard metrics have tenant-scoped evidence; combined acceptance review that dashboard/list counts stay mutually tenant-scoped remains pending. |
| A08 | NOT_RUN | [TK-11](TK-11.md): scoped roster/add/role/deactivate/reactivate API with concurrent last-admin protection; browser administration pending. |
| A09 | PASS | Source `3f7598c80a490fffce6b7be40c32714b1cf98ec6`; `npm run test:api -- tests/tickets/assignment.test.ts` exit 0, 13/13 real PostgreSQL/API, independently replayed. API eligibility denials and actual composite-FK cross-org rejection. [TK-17](TK-17.md), [review](../reviews/tk17-2026-10-27-3f7598c.md). |
| A10 | NOT_RUN | [TK-12](TK-12.md): role-scoped create API; actual list/detail/visibility and browser journey pending. |
| A11 | NOT_RUN | [TK-12](TK-12.md): create allowlist/range API cases; other operation/browser field journeys pending. |
| A12 | NOT_RUN | [TK-10](TK-10.md): staff policy unit cases; actual update/assignment journey pending. |
| A13 | PASS | Source `d5cce1829cc0fd5790869a05302a0f2c0911e5bd`; `npm run test:api -- tests/tickets/update.test.ts` exit 0, 30/30 real PostgreSQL/API, independently replayed. Legal/illegal transitions and no-side-effect rejection verified. [TK-16](TK-16.md), [review](../reviews/tk16-2026-10-27-d5cce18.md). |
| A14 | NOT_RUN | [TK-19](TK-19.md): comment persistence, chronological API history, and visibility have PostgreSQL/API evidence; browser conversation flow remains pending. |
| A15 | NOT_RUN | [TK-12](TK-12.md), [TK-16](TK-16.md), [TK-17](TK-17.md), [TK-18](TK-18.md), [TK-19](TK-19.md): create/update/assignment/comment events and history reads have scoped evidence; full acceptance review remains pending. |
| A16 | NOT_RUN | [TK-12](TK-12.md), [TK-18](TK-18.md), [TK-19](TK-19.md): create/update/comment event-failure rollback tested against PostgreSQL; assignment rollback/full acceptance review remains pending. |
| A17 | NOT_RUN | [TK-13](TK-13.md): API filter coverage; browser filtering journey pending. |
| A18 | PASS | Source `00120c7fa2ad2ffff7dd7af687b6cfb145098899`; `npm run test:api -- tests/tickets/list.test.ts` exit0, 36/36 real PostgreSQL/API cases; independently replayed after literal wildcard correction. [TK-13](TK-13.md), [review](../reviews/tk13-2026-10-26-15a4095.md). |
| A19 | PASS | Source `c68d652db632090bbcde89d5d725a1ae2d224fca`; root `npm run check` exit 0 (API281/281), independent `npm run test:api -- tests/tickets/pagination.test.ts` exit 0 (17/17), guarded PostgreSQL. Stable tie order, bounds, filters, and unchanged-set page coverage; 100,000-row offset limit documented. [TK-14](TK-14.md), [review](../reviews/tk14-2026-10-26-c68d652.md). |
| A20 | PASS | Source `93485ad0c10d4247a2ed6d7c1852bcc282488da7`; `npm run test:api -- tests/dashboard/dashboard.test.ts` exit 0, 6/6 real PostgreSQL/API cases, independently replayed. Exact organization status and priority totals match seeded rows. See [TK-21](TK-21.md) and [review](../reviews/tk21-2026-10-27-93485ad.md). |
| A21 | PASS | Source `93485ad0c10d4247a2ed6d7c1852bcc282488da7`; `npm run test:api -- tests/dashboard/dashboard.test.ts` exit 0, 6/6 real PostgreSQL/API cases, independently replayed. Tests match overdue boundary/exclusions and assigned OPEN/IN_PROGRESS workload formulas for active agents, including zero-workload agent. See [TK-21](TK-21.md) and [review](../reviews/tk21-2026-10-27-93485ad.md). |
| A22 | NOT_RUN | |
| A23 | NOT_RUN | |
| A24 | NOT_RUN | [TK-02](TK-02.md): Compose database only; full fresh Docker app startup pending. |
| A25 | NOT_RUN | [TK-06](TK-06.md): deterministic seed and hashes verified; complete setup/sign-in journey pending. |
| A26 | NOT_RUN | [TK-03](TK-03.md), [TK-07](TK-07.md), [TK-08](TK-08.md): partial documentation/API contracts; full submission audit pending. |
| A27 | NOT_RUN | [TK-03](TK-03.md): architecture/operational design documents; final delivery audit pending. |
| A28 | NOT_RUN | [TK-03](TK-03.md): assumptions and operational design; engineering-defense rehearsal pending. |
| A29 | PASS | Source `84106fa3fff66ad304b1e56d7a690d4e20445a28`; `npm run test:api -- tests/tickets/concurrency.test.ts` exit 0, 7/7 guarded PostgreSQL/API tests, independently replayed. Concurrent content and assignment writes using one ETag produce one success, one 409, one version increment, and one matching event. Stale no-op requests also reject with 409. See [TK-20](TK-20.md) and [review](../reviews/tk20-2026-10-27-84106fa.md). |
| A30 | NOT_RUN | |
| A31 | NOT_RUN | [TK-07](TK-07.md), [TK-09](TK-09.md): allowlist/context foundations; product-route attack suite pending. |
| A32 | NOT_RUN | [TK-08](TK-08.md): cookie flags and HTTP origin/CSRF tests; browser/proxy proof pending. |
| A33 | NOT_RUN | [TK-07](TK-07.md), [TK-08](TK-08.md): errors/request IDs/logs/local throttling; [OPEN P2 capacity concern](../reviews/security-foundation-2026-10-26-2f95a1a.md), full attack suite pending. |
| A34 | NOT_RUN | [TK-01](TK-01.md), [TK-08](TK-08.md): local checks only; actual browser and CI gate pending. |
| A35 | NOT_RUN | |
| A36 | NOT_RUN | |
| A37 | NOT_RUN | |
| A38 | NOT_RUN | [TK-04](TK-04.md), [TK-05](TK-05.md): schema/index foundation; representative EXPLAIN pending. |
| A39 | NOT_RUN | [TK-06](TK-06.md): notifications scoped as future work; final limitation/demo review pending. |
| A40 | NOT_RUN | [TK-06](TK-06.md): optional feature scope recorded; final backlog/limitations audit pending. |
