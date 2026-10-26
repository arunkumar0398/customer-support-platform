# Acceptance Status

**Baseline:** Workspace/database setup, schema constraints, deterministic two-organization seed, authentication, current membership, role/ownership policies, and membership administration have supporting local tests. A03 has passed its API-only scope; other complete checks remain NOT_RUN. Ticket routes, browser journeys, complete Docker application startup, CI, and deployment are pending.
**Latest implementation source SHA:** `15a4095df9902397c51795685b54bdbfac9d5671` (TK-13). Each checkpoint binds its executed commands to its own exact source SHA and environment.
**Rule:** Do not change a result from `NOT_RUN` without observed command/output, exit code, environment, and SHA.

| ID | Result | Evidence |
|---|---|---|
| A01 | NOT_RUN | [TK-08](TK-08.md): real-DB credential/session API checks; browser login pending. |
| A02 | NOT_RUN | [TK-08](TK-08.md): expiry/revocation/replay denied on auth endpoints; protected product endpoints pending. |
| A03 | PASS | Source `3a94144e93875d75b24a2f9a286e6444e836c1ba`; `npm run test:api -- tests/memberships/memberships.test.ts` exit 0, 45/45 real PostgreSQL/HTTP cases; independently replayed. [TK-11](TK-11.md), [review](../reviews/tk11-2026-10-26-3a94144.md). |
| A04 | NOT_RUN | [TK-09](TK-09.md), [TK-10](TK-10.md): context/visibility foundations; ticket GET pending. |
| A05 | NOT_RUN | [TK-09](TK-09.md), [TK-10](TK-10.md): context/action policies; actual tenant mutation routes pending. |
| A06 | NOT_RUN | [TK-10](TK-10.md): ownership policy unit cases; customer product-route/browser negatives pending. |
| A07 | NOT_RUN | [TK-13](TK-13.md): list counts are tenant-scoped; dashboard counts remain pending. |
| A08 | NOT_RUN | [TK-11](TK-11.md): scoped roster/add/role/deactivate/reactivate API with concurrent last-admin protection; browser administration pending. |
| A09 | NOT_RUN | [TK-05](TK-05.md): real cross-org FK negatives; assignment API and role eligibility pending. |
| A10 | NOT_RUN | [TK-12](TK-12.md): role-scoped create API; actual list/detail/visibility and browser journey pending. |
| A11 | NOT_RUN | [TK-12](TK-12.md): create allowlist/range API cases; other operation/browser field journeys pending. |
| A12 | NOT_RUN | [TK-10](TK-10.md): staff policy unit cases; actual update/assignment journey pending. |
| A13 | NOT_RUN | |
| A14 | NOT_RUN | [TK-10](TK-10.md): comment permission foundation; persistence/order/API/browser checks pending. |
| A15 | NOT_RUN | [TK-12](TK-12.md): atomic creation event tested; events for update/comment/assignment still pending. |
| A16 | NOT_RUN | [TK-12](TK-12.md): create/event DB fault rollback tested; remaining ticket mutation paths pending. |
| A17 | NOT_RUN | [TK-13](TK-13.md): API filter coverage; browser filtering journey pending. |
| A18 | NOT_RUN | [TK-13](TK-13.md): scoped case-insensitive API search tests; pending independent checkpoint review. |
| A19 | NOT_RUN | |
| A20 | NOT_RUN | |
| A21 | NOT_RUN | |
| A22 | NOT_RUN | |
| A23 | NOT_RUN | |
| A24 | NOT_RUN | [TK-02](TK-02.md): Compose database only; full fresh Docker app startup pending. |
| A25 | NOT_RUN | [TK-06](TK-06.md): deterministic seed and hashes verified; complete setup/sign-in journey pending. |
| A26 | NOT_RUN | [TK-03](TK-03.md), [TK-07](TK-07.md), [TK-08](TK-08.md): partial documentation/API contracts; full submission audit pending. |
| A27 | NOT_RUN | [TK-03](TK-03.md): architecture/operational design documents; final delivery audit pending. |
| A28 | NOT_RUN | [TK-03](TK-03.md): assumptions and operational design; engineering-defense rehearsal pending. |
| A29 | NOT_RUN | [TK-05](TK-05.md): version field present; concurrent stale PATCH proof pending. |
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
