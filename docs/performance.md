# Ticket list performance and reliability note

## Scope and environment

This is a local PostgreSQL query-plan assessment, not a production latency claim or a million-row load test.

- Assessment utility source: a74ee31f3198425f9afed8dda58b63cdb3eddb9c (based on application source 469b3c9d1b8c75613cf4df6a9e751b6bfe8d551e).
- Environment: Windows local workspace, Node 24.22.1, npm 11.19.1, PostgreSQL 18.6, disposable database support_test / user support_test.
- Fixture: 50,000 synthetic tickets distributed evenly across ten synthetic organizations; the target tenant had 5,000 rows, split evenly between OPEN and IN_PROGRESS.
- The assessment starts a transaction, sets 30-second statement and 5-second lock timeouts, ANALYZEs the Ticket table, runs EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), then rolls the transaction back. The runner confirmed that no synthetic organization remained.
- Output is from one local warm-cache run. Every reported plan had zero shared reads; insertion and ANALYZE warmed the table and indexes. Times are comparative observations on this machine, not a service-level objective.
- Repeat with node scripts/verify-test-database.mjs followed by node scripts/explain-ticket-list.mjs. The runner refuses a non-loopback or non-support_test/support_test target.

The assessment utility mirrors the application list projection and predicate shape in api/src/modules/tickets/service.ts: tenant scope AND status filter; stable createdAt DESC, id DESC order; bounded LIMIT/OFFSET. It assesses the SQL operations on the actual Ticket table and indexes, but does not include Express/authentication, Prisma serialization, or network latency.

## Existing ticket indexes

The Prisma schema and migrations define these tenant-first query indexes:

| Index | Leading/filter/order columns | Intended use |
|---|---|---|
| Ticket_org_created_id_idx | organizationId, createdAt DESC, id DESC | Tenant ticket list without a status/priority filter |
| Ticket_org_status_created_id_idx | organizationId, status, createdAt DESC, id DESC | Tenant list filtered by status and stable order |
| Ticket_org_priority_created_id_idx | organizationId, priority, createdAt DESC, id DESC | Tenant list filtered by priority and stable order |
| Ticket_org_requester_status_created_id_idx | organizationId, requesterUserId, status, createdAt DESC, id DESC | Customer-owned list and requester/status filter |
| Ticket_org_assignee_status_created_id_idx | organizationId, assigneeUserId, status, createdAt DESC, id DESC | Assignee/status filter |
| Ticket_org_due_status_idx | organizationId, dueAt, status | Due-time/dashboard and other due-date filtering |

The table also has unique indexes for organization/ticket ID and organization/ticket number. This assessment does not recommend adding another index without a measured production-like workload.

## Observed PostgreSQL plans

Command sequence:

1. node scripts/verify-test-database.mjs — exit 0; confirmed support_test / support_test.
2. node scripts/explain-ticket-list.mjs — exit 0; PostgreSQL 18.6, 50,000 fixture rows, rollback verified.
3. node --test scripts/explain-ticket-list.test.mjs — exit 0; 1/1 query-construction test passed.

For the target tenant (5,000 rows, 2,500 OPEN), the assessed plans were:

| Query | Plan and index | Rows visited/returned | Observed plan time | Buffers | Interpretation |
|---|---|---:|---:|---:|---|
| First OPEN page, LIMIT 25 / OFFSET 0 | Limit → Index Scan on Ticket_org_status_created_id_idx | 25 returned | 0.121 ms | 14 shared hits / 0 reads | The primary status-filtered page uses the intended tenant/status/order index and stops after the requested page. |
| Deep OPEN page, LIMIT 100 / OFFSET 2,400 | Limit → Sort (quicksort) → Bitmap Heap Scan → Bitmap Index Scan on Ticket_org_due_status_idx | 2,500 scanned; 100 returned | 3.431 ms | 1,070 shared hits / 0 reads | The planner chose a tenant-first bitmap path and sorted all matching rows before applying the offset. This is visibly more work than the first page in this sample. |
| OPEN count | Aggregate → Bitmap Heap Scan → Bitmap Index Scan on Ticket_org_due_status_idx | 2,500 scanned and counted | 1.690 ms | 1,067 shared hits / 0 reads | Count requires visiting matching rows in this plan; it is a separate query from page retrieval. |
| OPEN substring query with no matching needle | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan on Ticket_org_due_status_idx | 2,500 candidates; 0 returned | 6.087 ms | 1,067 shared hits / 0 reads | Tenant/status filtering narrows the candidates, but the ordinary B-tree indexes do not index arbitrary substring text. Every candidate must be checked for the substring. |

The item query uses a tenant-first ordered B-tree for the first page. The planner changes strategy for a deep offset and count. The index name selected for those paths includes dueAt between organizationId and status; PostgreSQL 18.6 used its bitmap path for the tested tenant/status predicate and sorted the deep-page rows. Re-check this behavior with the deployed PostgreSQL major version and representative data distribution before tuning. Do not infer that every plan will choose the same index.

The application supports page numbers up to 1,000 and page sizes up to 100, so the maximum offset is 99,900. The 2,400 offset in this fixture is near the end of that tenant's 2,500 OPEN rows; it does not simulate a million-row tenant. A cursor/keyset pagination path should be measured before tenant volume approaches the offset cap.

## Search and growth assumptions

The application implements case-insensitive substring matching over title and description. The current B-tree indexes do not provide general substring lookup. The no-match sample confirms the query can inspect every row left by tenant/status filtering. If search becomes a measured bottleneck, evaluate a PostgreSQL trigram index and its write/storage cost with the same query shape and realistic data before adding it. Full-text search would change semantics and is not an equivalent drop-in replacement for arbitrary substring matching.

No million-row fixture or concurrent load test was run. The 50,000-row transactional assessment demonstrates index/query-plan behavior on one local server only; it does not establish production throughput, cache state, pool saturation, or tail latency. Keep the 100,000-row offset ceiling documented and prefer cursor pagination as a growth path.

## Concurrency and duplicate request behavior

A29 remains PASS on the separately reviewed real-PostgreSQL race evidence in evidence/checkpoints/TK-20.md: two simultaneous updates with the same ETag yield one success and one 409, one version increment, and one matching activity event. TK-31 did not re-run or change this contract.

Ticket creation has no idempotency key. api/tests/tickets/create.test.ts verifies that repeating the same POST creates distinct tickets and distinct creation events. A replay after a client timeout can therefore create a duplicate. This is documented behavior, not a claim of safe retry or idempotency. Clients should not automatically retry an ambiguous create until an idempotency-key contract is implemented; future implementation should atomically persist a key scoped to the actor/organization and replay the original result.

## Acceptance disposition

- A29: remains PASS from TK-20's exact real-PostgreSQL race evidence.
- A30: N/A for the optional idempotency-key behavior because the API does not implement a key; duplicate POST behavior and retry mitigation are documented. It is not PASS.
- A38: PASS for the stated criterion: tenant-first indexes exist and the actual tenant/status list query was assessed with EXPLAIN ANALYZE. The first-page query used Ticket_org_status_created_id_idx. The deep-page and search plans show areas to reassess as tenant data grows.
- G5 remains NOT_RUN. This local plan assessment does not establish Docker clean-clone, GitHub Actions, full security hardening, or the release gate.
