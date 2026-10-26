# Proposed Defaults to Confirm During C0/C1

These are suggested project decisions; they are not requirements imposed by the employer. The authoritative PDF permits engineering assumptions if disclosed.

1. **One shared PostgreSQL database, shared schema** with `organizationId` on every tenant-owned object, composite foreign-key strategy and tests. Document RLS as optional defense-in-depth, not as a replacement for API authorization.
2. **Membership-based RBAC** with roles `ADMIN`, `AGENT`, `CUSTOMER`. A membership always belongs to an organization; do not add an independent global permission system.
3. **Agent access** to any ticket within own org; customer limited to tickets where it is the requester. Admin can manage own membership roster; last-admin protection.
4. **Status graph:** `OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED`; permit `OPEN -> RESOLVED` for quick resolution and `RESOLVED -> IN_PROGRESS` with an audit reason. Any other transition is rejected unless justified and documented.
5. **Comments** by authorized users on non-closed tickets; audit events immutable/append-only, deterministic stable ordering and transaction consistency.
6. **Dashboard overdue definition:** e.g. tickets open/in-progress with `dueAt` earlier than UTC now; dueAt derived by documented priority policy. Actual formulas and evaluation timestamp must be frozen, seeded and asserted in tests before implementing dashboard.
7. **Listings:** tenant-scoped status/priority/assignee/requester search, bounded page size and stable tie-break order. Document offset pagination MVP and cursor growth path, or implement keyset if time permits.
8. **Session:** opaque session cookie persisted in database, secure attributes and tested CSRF/origin check; do not rely solely on JWT claims for roles after revocation.
9. **Concurrency:** optimistic ticket `version` compare-and-swap with consistent 409; ticket mutation plus event in one transaction. Idempotent create is desirable but conditional and honestly documented if not built.
10. **Application platform:** npm workspace, React/Vite frontend, Express API, Prisma Postgres with pinned tested versions. Avoid pinning speculative version numbers in planning; lock versions during C0 and commit lockfile.
11. **Local vs remote:** Docker Compose/local Postgres mandatory; Vercel frontend + Express Node Function + Neon only after MVP tests and human approval. Preview DB separate from production.
12. **Out of initial scope:** attachment storage, realtime WebSockets, email delivery, advanced analytics, microservices, managed cache, hosted observability dashboards. Design notification failure/retry strategy in documentation.

Any materially different decision must be recorded in `docs/adr/` with why, impact on acceptance IDs and independent review.
