# API contract — implemented foundation and ticket creation

Implemented endpoints are health, authentication, membership administration, ticket creation, and ticket listing with filters/search. Ticket detail/update, comments/history, assignment, dashboard, the local listener/launch command, and browser journeys remain later tasks.

## Health

`GET /api/health` returns HTTP 200 with `{ "status": "ok" }`. This is application liveness, not a database readiness probe.

## Authentication

Configure an exact `APP_ORIGIN` without a trailing slash, a securely generated `SESSION_SECRET` of at least 32 characters, and `DATABASE_URL` before using the auth endpoints. Production requires an HTTPS origin and sets Secure cookies. Missing configuration, placeholder/too-short secrets, and invalid origins fail closed with a sanitized 500 before a session is created. Secret length is checked; operators remain responsible for generating unpredictable values. No signup or password-reset endpoint is implemented.

| Endpoint | Request | Result |
|---|---|---|
| `POST /api/auth/login` | Exact approved `Origin`, `X-CSRF-Protection: 1`, JSON `{ "email": "...", "password": "..." }` | 200 with user, current active memberships, and `csrfToken`; sets the opaque session cookie. Invalid credentials return the same 401 for unknown accounts and wrong passwords. |
| `GET /api/auth/me` | Session cookie | 200 with the current user, active memberships, and session-bound `csrfToken`; absent, unknown, expired, or revoked sessions return 401. |
| `POST /api/auth/logout` | Session cookie, exact approved `Origin`, `X-CSRF-Token` from login/me | 204 after persisted revocation and browser cookie expiry; replay is rejected. |

Successful login/me JSON has only `user: { id, email }`, `memberships: [{ organizationId, role, organization: { name, slug } }]`, and `csrfToken`. A user with no active memberships has an empty list and gains no organization authority. Membership context is resolved separately; ticket object enforcement still needs its product routes. All auth responses use `Cache-Control: no-store`.

Email is trimmed/lowercased and limited to 320 characters; password must be a string of 1–256 characters. Unknown login properties are rejected. Password verification uses the fixed salted scrypt format of the seed (`N=32768`, `r=8`, `p=1`) and performs a dummy derivation for unknown accounts. The password is never returned or logged.

Each successful login generates 32 random bytes, stores only its SHA-256 token hash in PostgreSQL, and sets a host-only `support_session` cookie with `HttpOnly; SameSite=Lax; Path=/api` and a two-hour absolute lifetime. Production adds `Secure`. Re-login with an existing cookie revokes that token and creates its replacement in one transaction. Every authenticated request checks persisted expiry/revocation; duplicate cookies fail closed. Revoked/expired rows are retained for now; periodic cleanup and idle-timeout policy are operational follow-ups.

Login requires both the exact origin and a custom non-simple header, mitigating login CSRF without an anonymous session. Other authenticated unsafe methods require the exact origin plus a per-session HMAC token in `X-CSRF-Token`, compared in constant time. Login/me expose that token to the app, while the HttpOnly session cookie value is never returned in JSON. No cross-origin CORS access is configured. Future protected routes must use `createAuthenticate`, which applies these checks to unsafe methods. These decisions follow [OWASP's CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) and [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); actual browser/proxy behavior remains a later gate.

The local login limiter allows five attempts per normalized account and twenty per socket IP per fifteen-minute window, counting successful and failed attempts. It returns 429 plus `Retry-After`, ignores untrusted forwarding headers, and bounds its in-memory key table. This process-local state resets on restart and is not shared across replicas; it must be replaced or supplemented before a distributed/serverless release. Trusted-proxy configuration is not enabled; proxy clients may share one IP budget. These limits and the two-hour expiry are project design defaults, not employer requirements.

## Active organization context

Tenant-owned product routes will require `X-Organization-ID` after session authentication. The middleware accepts a single canonical UUID (case-insensitive), then queries PostgreSQL for that user's current active membership. It derives the organization, user ID, and role from the stored membership on each request. Missing selector returns `400 ORGANIZATION_REQUIRED`; malformed/ambiguous selector returns `400 INVALID_ORGANIZATION`; inactive, removed, foreign, and nonexistent memberships all return the same `404 NOT_FOUND` envelope.

Body/query role or organization fields never grant membership or replace the selector. Endpoint-specific body schemas must still reject forbidden properties. Users with memberships in multiple organizations can choose each valid selector with that organization's own current role. Removing membership or changing role takes effect on the next request with the same session.

`createActiveMembership` is used by the membership and ticket product routers and is also verified with test-only context-inspection routes. No context-inspection endpoint is exposed by the product app. Health and authentication routes do not require an organization selector; tenant-owned routers chain authentication and active membership before handling requests. Ticket detail/mutation and dashboard routes, and full ticket/customer isolation acceptance, remain pending.

## Membership administration

All membership endpoints require a current ADMIN membership in the organization selected by `X-Organization-ID`. Reads require a session; POST/PATCH additionally require the exact approved origin and session-bound `X-CSRF-Token`. Agent/customer calls return `403 FORBIDDEN`. Inaccessible organization selectors and foreign/missing membership IDs return the same `404 NOT_FOUND`. Responses are `no-store` and contain only authorized roster fields.

| Endpoint | Input | Result |
|---|---|---|
| `GET /api/memberships` | Optional `page` (1–1000, default 1), `pageSize` (1–100, default 25); no other query fields | 200 `{ items, total, page, pageSize }`, scoped to the active organization. Includes inactive memberships so an admin can reactivate them. |
| `POST /api/memberships` | Strict JSON `{ "email": "agent.beta@example.test", "role": "AGENT" }`; role is ADMIN/AGENT/CUSTOMER | 201 with the new active membership in the selected organization. The account must already exist. |
| `PATCH /api/memberships/{userId}` | Canonical user UUID; strict JSON with `role`, `isActive`, or both; at least one field required | 200 with the updated membership in the selected organization. Deactivate using `isActive: false`; reactivate using `true`. |

Each roster item/mutation response contains `{ organizationId, userId, email, role, isActive }`. Roster pages use deterministic `createdAt ASC, userId ASC`; counts and items share one PostgreSQL repeatable-read snapshot. No password hash or other organization's membership is returned.

MVP membership creation adds a **known existing account** by normalized email; it does not create a global user, change credentials, expose a global user directory, send invitations, or alter memberships elsewhere. An existing account can legitimately belong to multiple organizations with different roles. Unknown emails return a generic 404. This admin-only known-account workflow can reveal account existence for a submitted email; a consent/invitation-based onboarding workflow is outside this local synthetic assessment slice. Seed the documented demo accounts before use. Global user provisioning and email delivery remain separate scope.

Existing memberships, including inactive ones, return `409 MEMBERSHIP_EXISTS` on POST; use PATCH for reactivation or role changes. Attempting to demote/deactivate the last active ADMIN returns `409 LAST_ADMIN_REQUIRED` without mutation. An admin may remove their own authority only when another active admin remains; the new role/inactive state takes effect on the next request.

Every create/update transaction locks its organization's row, then reloads the acting user's current active ADMIN membership **after acquiring that lock**. All membership writes use that same lock protocol, so concurrent duplicates and competing admin removals are serialized. The authorization reload also rejects a role revoked while a request waited for the lock. Last-admin count and mutation commit together. Membership rows are retained on deactivation to preserve historical ticket/comment/event relationships; this endpoint does not rewrite assignments or history.

Body-provided organization/user IDs, email changes on PATCH, passwords/hashes, unknown fields, invalid role/boolean values, empty updates, malformed path IDs, and invalid/unbounded roster parameters return 422 `VALIDATION_ERROR`. These endpoints do not implement ticket permissions or status transitions.

Run `npm run test:api -- tests/memberships/memberships.test.ts` for real HTTP/PostgreSQL checks, including concurrent duplicates/removals, stale actor authority, and an observed database lock-wait probe. Browser membership controls remain TK-28 work.

## Ticket creation

`POST /api/tickets` requires an authenticated session, exact approved origin, session-bound CSRF token, and current active organization selected by `X-Organization-ID`. It is available to ADMIN, AGENT, and CUSTOMER memberships. Organization, requester for customers, ticket number, status, assignee, version, dates, and activity events are not client-controlled.

| Active role | Strict JSON body | Requester/defaults |
|---|---|---|
| CUSTOMER | `{ "title": "Printer outage", "description": "Cannot print the synthetic invoice." }` | Requester is the signed-in active customer; status OPEN, priority MEDIUM, unassigned, dueAt null, version 1. |
| ADMIN/AGENT | Same title/description plus required `requesterUserId` and optional priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`) | Requester must have an active CUSTOMER membership in the selected organization. Priority defaults MEDIUM. |

Title is trimmed and must contain 1–200 characters. Description is trimmed and must contain 1–10,000 characters. Empty content, customer-supplied priority/requester, staff without requester, inactive/non-customer/foreign requester, and extra properties return the sanitized 422 or 404 error without writes. Ticket numbers are allocated from the current organization maximum while holding its organization-row lock; concurrent API creates serialize and the database unique constraint remains a final guard. At the signed PostgreSQL integer ceiling return 409 `TICKET_NUMBER_LIMIT`.

The ticket row and one `TICKET_CREATED` event are nested in the same Prisma transaction. Event data captures title, OPEN status, priority, and requester ID; it does not store credentials. An event insert failure rolls back the ticket and does not consume its number. Repeating the same POST creates another ticket; there is no idempotency key and no duplicate-request suppression in this checkpoint.

The response contains only id, organizationId, ticketNumber, requesterUserId, assigneeUserId, title, description, status, priority, dueAt, version, createdAt, and updatedAt. `npm run test:api -- tests/tickets/create.test.ts` runs the real HTTP/PostgreSQL creation contract, including role-specific fields, cross-org negatives, concurrent numbering, and forced event rollback.

## Ticket list, filters, and search

`GET /api/tickets` requires a session and valid active `X-Organization-ID`. ADMIN/AGENT see the selected organization's tickets. CUSTOMER queries are always restricted to the authenticated user's own requester ID, even when a `customerId` filter is supplied. The organization and customer predicates are combined with every optional filter in SQL using AND, so caller filters cannot replace the server scope.

| Query | Accepted value | Behavior |
|---|---|---|
| `status` | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` | Exact status filter. |
| `priority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | Exact priority filter. |
| `assigneeId` | Canonical UUID or `unassigned` | Matches one assignee or null assignment. |
| `customerId` | Canonical UUID | Filters requester ID. Customer's own requester constraint still applies. |
| `search` | Trimmed non-empty text, max 100 chars | Case-insensitive contains match in title or description. The result DTO does not return description. |
| `page` | Integer 1–1000, default 1 | One-based page number. |
| `pageSize` | Integer 1–100, default 25 | Maximum results on this page. |

Unknown/repeated/nested parameters, non-integer/out-of-range page values, invalid enums/IDs, blank or oversized search, and body-controlled organization/requester fields are not accepted; invalid query fields return 422. Query matching and the result count use one repeatable-read snapshot. Results use deterministic `createdAt DESC, id DESC` ordering before applying the bounded page offset. Result items omit descriptions and credentials; `{ items, total, page, pageSize }` counts only rows visible through the same SQL scope. Search is a case-insensitive literal substring (including literal `%` and `_` characters), not full text/ranking.

`npm run test:api -- tests/tickets/list.test.ts` uses real PostgreSQL and HTTP fixtures for two tenants, all three role scopes, combined filters, unassigned tickets, case-insensitive title/description search, Beta-only search matches and strict query validation. Detail/update/comment routes are not implemented yet.

## Central authorization policies

`api/src/lib/policy.ts` consumes the server-derived membership context. Membership administration requires ADMIN; dashboard and staff ticket management require ADMIN or AGENT. Ticket visibility always requires the active organization, and CUSTOMER additionally requires its own requester ID. Inaccessible/missing tickets return the same 404 before action-specific restrictions disclose state. Customers may edit their own title/description only while OPEN; staff may edit visible ticket content. New comments require a visible non-closed ticket, with 409 `TICKET_CLOSED` on an otherwise visible closed ticket. A closed ticket's conversation/history remains readable within the same visibility policy, as clarified in ADR 0003.

`ticketScope` combines mandatory organization/customer ownership constraints with additional criteria using AND, so criteria cannot overwrite the boundary. It rejects incomplete contexts and unknown roles. Future services must use scoped queries or a locked transactional authorization path; checking a fetched object and then issuing an unconditional write is insufficient. These policy functions currently have unit/Prisma-query-contract coverage; real product-route and transactional authorization integration tests remain future tasks. The functions do not implement status transitions, assignee eligibility, last-admin protection, or product endpoints by themselves.

## Requests and errors

Every request receives a new server-generated UUID in the `X-Request-ID` response header. Incoming request IDs are ignored. Errors repeat that same ID in their JSON envelope so a caller can report a failure without disclosing request data:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid.",
    "requestId": "5abcbd5c-55d7-45b9-b4db-5d013cc6b37d"
  }
}
```

| HTTP status | Code | Meaning |
|---|---|---|
| 400 | `MALFORMED_JSON` | JSON could not be parsed. |
| 404 | `NOT_FOUND` | Unknown route or unavailable resource; the response does not repeat the path or record identifier. |
| 409 | `TICKET_NUMBER_LIMIT` | The organization's positive ticket number reached the PostgreSQL integer ceiling. |
| 413 | `PAYLOAD_TOO_LARGE` | JSON exceeds the 32 KiB request body limit. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Unsupported JSON charset or compressed body encoding. Send uncompressed JSON. |
| 422 | `VALIDATION_ERROR` | Body, query, or path input fails its schema or allowlist. |
| 500 | `INTERNAL_ERROR` | Unexpected server failure; no internal error message or stack is returned. |

`validateBody` enforces a strict top-level Zod object schema even when the supplied schema would otherwise strip unknown keys. It passes parsed/normalized values to the handler, rejects unknown properties, and never returns raw input or Zod internals. Nested objects must use strict nested schemas. Product routes will define their own required fields and ranges; middleware coverage alone does not verify ticket acceptance A11.

Authentication adds `401 INVALID_CREDENTIALS` / `UNAUTHENTICATED`, `403 CSRF_REJECTED`, and `429 RATE_LIMITED`. Membership authorization adds `403 FORBIDDEN` and `409 MEMBERSHIP_EXISTS` / `LAST_ADMIN_REQUIRED` using the same envelope. Ticket conflicts are not implemented yet.

## Safe error logging

Unexpected failures log only `event`, `code`, `status`, and the server-generated `requestId`. Request bodies, query strings, paths, headers, cookies, raw errors, stack traces, and database messages are excluded. Expected 4xx errors are not logged by the error handler. No credential-bearing access logger is installed. This is a minimal correlation log; richer operational diagnostics must preserve these redaction rules.

If a response has already started, its status and body cannot be replaced with an error envelope. The handler closes that connection and still logs only safe metadata; it does not pass the raw error to Express's default logger.

Run the actual HTTP contract checks with `npm run test:api -- tests/http/errors.test.ts`. These use Supertest with the production app and a test-only Express harness for validation and thrown-error routes; they do not claim PostgreSQL, authentication, browser, or deployment verification.
