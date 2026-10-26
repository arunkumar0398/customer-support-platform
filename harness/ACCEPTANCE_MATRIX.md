# Traceable Acceptance Matrix — Mandatory and Stretch

Source: Full Stack Engineer — Product Development Assessment (user-provided). 'P0' reflects essential PDF requirements and chosen design; P1 extends reliability; P2 is optional.

Use this matrix in `evidence/releases/release-evidence.md`. For each row record automated test path and observed run on final SHA. Pending is not Pass.

| ID | Priority | Acceptance check | Verification |
|---|---|---|---|
| A01 | P0 | Correct credentials log in and return authorized membership, wrong credentials rejected | API and browser |
| A02 | P0 | Expired/revoked session cannot access protected endpoints | API |
| A03 | P0 | Role checks enforce admin-only membership modifications | API |
| A04 | P0 | Member of org A cannot GET org B ticket, even with valid B ticket ID | API negative |
| A05 | P0 | Member of org A cannot PATCH/assign/comment on org B ticket | API negative |
| A06 | P0 | Customer 1 cannot read/change customer 2's ticket within same org | API negative |
| A07 | P0 | Org A dashboard/list counts never include org B | API negative |
| A08 | P0 | Admin can create/edit membership in own org but not another org | API + browser |
| A09 | P0 | Assigning ticket to user outside org or non-agent is rejected | API + DB FK |
| A10 | P0 | Customer can create valid ticket and see only own ticket in list/detail | API + browser |
| A11 | P0 | Ticket required fields and allowed input ranges validated | API + browser |
| A12 | P0 | Agent/admin can update authorized ticket status/priority and assignee | API + browser |
| A13 | P0 | Illegal ticket state transition rejected without side effects | API |
| A14 | P0 | Authorized comment stored and appears in chronological conversation | API + browser |
| A15 | P0 | Meaningful ticket mutation creates immutable activity event | DB/API |
| A16 | P0 | Ticket write and activity event succeed or fail atomically | DB/API fault test |
| A17 | P0 | Ticket list supports status/priority/assignee/customer filters | API + browser |
| A18 | P0 | Search is tenant-scoped and returns correct results | API |
| A19 | P0 | Sort and pagination deterministic without duplicates in unchanged dataset | API |
| A20 | P0 | Dashboard counts by status and priority match seed | DB/API |
| A21 | P0 | Overdue definition and workload counts match documented formulas | DB/API |
| A22 | P0 | Login, ticket list/detail/create, dashboard usable on narrow and desktop viewport | Playwright screenshots |
| A23 | P0 | Loading, empty, validation, forbidden and failure states visible/usable | Playwright |
| A24 | P0 | Fresh Docker-based local setup starts API/UI/database from README | Clean clone + Docker |
| A25 | P0 | Seed includes 2 orgs and multiple roles and sample sign-in steps | DB setup + readme |
| A26 | P0 | Source, README, architecture, schema/indexes, API docs, tests, limitations delivered | Document audit |
| A27 | P0 | Deployment architecture covers hosting, TLS, secrets, networking, backups, CI, monitoring, rollback | Document audit |
| A28 | P0 | Review can explain slow query investigation, isolation, concurrent edits, outage, rollback | Review rehearsal |
| A29 | P1 | Simultaneous stale PATCH yields 409 and leaves no incorrect history | Race test |
| A30 | P1 | Replayed ticket POST with same idempotency key is handled consistently (if implemented) | API replay |
| A31 | P1 | User cannot set forbidden ORM fields / role / org ID through mass assignment | API negative |
| A32 | P1 | Cookies are HttpOnly/Secure in production; CSRF/origin guard works | HTTP/browser |
| A33 | P1 | Throttled login, safe error shapes, requestId, no passwords/secrets in logs | API/log checks |
| A34 | P1 | Unit+API+browser/CI gates run on exact release SHA | CI artifact |
| A35 | P1 | HTTPS deployed site passes 3-role smoke + cross-org denial and health checks | Deployed smoke |
| A36 | P1 | `prisma migrate deploy` rollout and code rollback strategy documented/tested | Deploy runbook |
| A37 | P1 | Keyboard focus, form labels, visible errors and mobile navigation pass basics | Browser + accessibility |
| A38 | P1 | Query indexes are present and at least 1 list/filter query is assessed with EXPLAIN | DB evidence |
| A39 | P2 | Assignment notifications integrated or properly scoped as future work | Demo or limitation |
| A40 | P2 | Attachments, advanced analytics and observability optional, not required for slice | Backlog |

## Release evidence row template

```
ID: A##
Result: PASS | FAIL | BLOCKED | NOT_RUN | N/A (justify)
Commit SHA:
Command / environment:
Test file / CI job:
Evidence artifact:
Reproducer / residual risk:
```

**Fatal failures:** A04–A09, A16, A24, and A29 (when concurrent updates are implemented) are mandatory blocks; no security-critical case may be reclassified as harmless. If advanced duplicate handling A30 is not implemented, mark N/A with an honest mitigation and future design, not PASS.
