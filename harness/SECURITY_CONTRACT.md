# Security and Data Integrity Contract (Must-Fail Negative Cases)

## Identity and membership
- Login uses stored password hashes and durable session storage, invalidated on logout and expiry. Sessions are opaque, HttpOnly, Secure when HTTPS, and SameSite chosen with actual deployed rewrite/cookie behavior.
- An active organization identifier may be supplied as a request selector but is **never trusted** until current authenticated membership for that user is verified on the server. Verify after role changes, not only at initial login.
- A user may belong to multiple organizations: every operation uses exactly one valid active org; cross-org switching must invalidate or namespace frontend caches.

## Tenant isolation
- Every tenant-owned query includes organization scope and object-level role/ownership constraints **in the query or a locked transactional path**; avoid fetch-by-ID followed by dangerous unconditional write.
- Composite FK or transaction checks prevent a ticket from referencing an assignee/customer from another org. Unique membership `(organizationId,userId)`, scoped indexes and role constraints must be deliberate.
- Same-org customer A must not see customer B's ticket, via list, search, detail, comment, event, aggregate, link, export or known foreign ID.
- Where hiding existence is appropriate return consistent 404 for inaccessible IDs, and never leak cross-tenant counts via the dashboard or errors.

## Write integrity
- Zod strict allowlists on create/update: reject body-provided `organizationId`, `authorId`, `createdBy`, `passwordHash`, role, and other server-controlled fields.
- Explicit ticket state graph and who may transition; invalid transition no ticket mutation/no audit event.
- Ticket update + audit event in one DB transaction; write failures roll back both. Comments carry verified author and ticket scope.
- Version/ETag compare-and-swap on mutating changes; stale writes yield 409 with no spurious activity event, including concurrent PATCH race tests.
- Document behavior for duplicate ticket creation/idempotency and interrupted request; implement idempotency if within scope, otherwise disclose as a gap.

## Browser and API
- Test CSRF/origin check on all cookie-authenticated state-changing methods, allow only configured origins; same-origin Vercel rewrite is a UX choice and not a substitute for CSRF defense.
- Validate and cap length of queries, page sizes, filters and body fields; stable bounded sorting; prevent prototype pollution or unsafe nested writes.
- Handle 401, 403/404, 409, 422 and 5xx consistently; safe JSON and request ID; no stack traces or DB internals in responses.
- Auth throttling, secret-safe request logging, no session cookie/token/password leakage; synthetic seed users only.

## Minimum attack fixture
- Alpha org admin/agent/customerA/customerB, Beta org admin/agent/customer; a known Alpha ticket, a known Beta ticket, and a same-org other-customer ticket.
- Execute denied GET/PATCH/assignment/comment/events/list-search/dashboard/membership with foreign object IDs and mass-assignment payloads.
- Force a DB/audit failure, then assert whole transaction rollback.
- Race two updates using identical version; exactly one successful write, other rejected; activity timeline matches commits.
- Validate that authorization remains correct after customer refresh, logout, org switch and role removal.

Release blockers: any tenant escape, broken same-org customer ownership, role bypass, loss of committed data, partial ticket/audit write or stale write overwrite.
