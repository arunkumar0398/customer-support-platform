# API contract — implemented foundation and ticket creation

Implemented endpoints are health, authentication, membership administration, ticket create/detail/list/update/assignment, comments, and activity history, with bounded list filters/search/pagination. Dashboard, the local listener/launch command, and browser journeys remain later tasks.

## Health

`GET /api/health` returns HTTP 200 with `{ "status": "ok" }`. This is application liveness, not a database readiness probe.

## Authentication

Configure an exact `APP_ORIGIN` without a trailing slash, a securely generated `SESSION_SECRET` of at least 32 characters, and `DATABASE_URL` before using the auth endpoints. Production requires an HTTPS origin and sets Secure cookies. Missing configuration, placeholder/too-short secrets, and invalid origins fail closed with a sanitized 500 before a session is created. Secret length is checked; operators remain responsible for generating unpredictable values. No signup or password-reset endpoint is implemented.

| Endpoint | Request | Result |
|---|---|---|
| `POST /api/auth/login` | Exact approved `Origin`, `X-CSRF-Protection: 1`, JSON `{ "email": "...", "password": "..." }` | 200 with user, current active memberships, and `csrfToken`; sets the opaque session cookie. Invalid credentials return the same 401 for unknown accounts and wrong passwords. |
| `GET /api/auth/me` | Session cookie | 200 with the current user, active memberships, and session-bound `csrfToken`; absent, unknown, expired, or revoked sessions return 401. |
| `POST /api/auth/logout` | Session cookie, exact approved `Origin`, `X-CSRF-Token` from login/me | 204 after persisted revocation and browser cookie expiry; replay is rejected. |

Successful login/me JSON has only `user: { id, email }`, `memberships: [{ organizationId, role, organization: { name, slug } }]`, and `csrfToken`. A user with no active memberships has an empty list and gains no organization authority. Membership context is resolved separately; ticket routes enforce object visibility through tenant-scoped queries. All auth responses use `Cache-Control: no-store`.

Email is trimmed/lowercased and limited to 320 characters; password must be a string of 1–256 characters. Unknown login properties are rejected. Password verification uses the fixed salted scrypt format of the seed (`N=32768`, `r=8`, `p=1`) and performs a dummy derivation for unknown accounts. The password is never returned or logged.

Each successful login generates 32 random bytes, stores only its SHA-256 token hash in PostgreSQL, and sets a host-only `support_session` cookie with `HttpOnly; SameSite=Lax; Path=/api` and a two-hour absolute lifetime. Production adds `Secure`. Re-login with an existing cookie revokes that token and creates its replacement in one transaction. Every authenticated request checks persisted expiry/revocation; duplicate cookies fail closed. Revoked/expired rows are retained for now; periodic cleanup and idle-timeout policy are operational follow-ups.

Login requires both the exact origin and a custom non-simple header, mitigating login CSRF without an anonymous session. Other authenticated unsafe methods require the exact origin plus a per-session HMAC token in `X-CSRF-Token`, compared in constant time. Login/me expose that token to the app, while the HttpOnly session cookie value is never returned in JSON. No cross-origin CORS access is configured. Future protected routes must use `createAuthenticate`, which applies these checks to unsafe methods. These decisions follow [OWASP's CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) and [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); actual browser/proxy behavior remains a later gate.

The local login limiter allows five attempts per normalized account and twenty per socket IP per fifteen-minute window, counting successful and failed attempts. It returns 429 plus `Retry-After`, ignores untrusted forwarding headers, and bounds its in-memory key table. This process-local state resets on restart and is not shared across replicas; it must be replaced or supplemented before a distributed/serverless release. Trusted-proxy configuration is not enabled; proxy clients may share one IP budget. These limits and the two-hour expiry are project design defaults, not employer requirements.

## Active organization context

Tenant-owned product routes require `X-Organization-ID` after session authentication. The middleware accepts a single canonical UUID (case-insensitive), then queries PostgreSQL for that user's current active membership. It derives the organization, user ID, and role from the stored membership on each request. Missing selector returns `400 ORGANIZATION_REQUIRED`; malformed/ambiguous selector returns `400 INVALID_ORGANIZATION`; inactive, removed, foreign, and nonexistent memberships all return the same `404 NOT_FOUND` envelope.

Body/query role or organization fields never grant membership or replace the selector. Endpoint-specific body schemas must still reject forbidden properties. Users with memberships in multiple organizations can choose each valid selector with that organization's own current role. Removing membership or changing role takes effect on the next request with the same session.

`createActiveMembership` is used by the membership and ticket product routers and is also verified with test-only context-inspection routes. No context-inspection endpoint is exposed by the product app. Health and authentication routes do not require an organization selector; tenant-owned routers chain authentication and active membership before handling requests. Dashboard routes and complete ticket/customer isolation acceptance remain pending.

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

## Ticket detail

`GET /api/tickets/{ticketId}` requires an authenticated session and valid active `X-Organization-ID`. ADMIN/AGENT memberships can read tickets in their selected organization. A CUSTOMER can read only tickets whose requester is that active customer. Missing, foreign-organization, and same-organization other-customer tickets return the same 404 `NOT_FOUND` envelope; the identifier and inaccessible record details are not returned. The path must be a UUID or the request returns 422 `VALIDATION_ERROR`.

The response contains the ticket's id, organizationId, ticketNumber, requesterUserId, assigneeUserId, title, description, status, priority, dueAt, version, createdAt, and updatedAt. It contains no credentials or activity/comments. Authenticated responses set `Cache-Control: no-store`. `npm run test:api -- tests/tickets/detail.test.ts` covers both roles, customer ownership, foreign and absent records, both organizations, and malformed identifiers.

## Ticket activity history

`GET /api/tickets/{ticketId}/activity` requires an authenticated session and valid active `X-Organization-ID`. It uses the same visibility rule as ticket detail: ADMIN/AGENT can read history within the selected organization, while CUSTOMER can read only their own tickets. Missing, foreign-organization, and other-customer tickets return the same generic 404. The route is read-only; event update/delete endpoints are not exposed. Authenticated responses set `Cache-Control: no-store`.

| Query | Accepted value | Behavior |
|---|---|---|
| `page` | Integer 1–1000, default 1 | One-based page number. |
| `pageSize` | Integer 1–100, default 25 | Maximum results on this page. |

Unknown, repeated, or out-of-range query parameters return 422. The response is `{ items, total, page, pageSize }`; items are ordered by `createdAt ASC, id ASC` and contain only `id`, `organizationId`, `ticketId`, `actorUserId`, `type`, `previousValue`, `newValue`, `reason`, and `createdAt`. Ticket visibility, event count, and event page are read in one repeatable-read transaction; event queries include both the authorized organization and ticket IDs. The bounded offset API reaches at most 100,000 events for a ticket. `npm run test:api -- tests/activity/atomicity.test.ts` covers chronology, tenant and customer ownership, query validation, absence of mutation routes, and a PostgreSQL fault-injection rollback for ticket update plus event insert.

## Ticket comments and conversation

`GET /api/tickets/{ticketId}/comments` and `POST /api/tickets/{ticketId}/comments` require an authenticated session and valid active `X-Organization-ID`. ADMIN/AGENT can read and comment on tickets in the selected organization. CUSTOMER can read and comment only on their own tickets. Inaccessible or absent tickets return the same generic 404. Conversation history remains readable for CLOSED tickets; attempting to add a comment to a visible CLOSED ticket returns 409 `TICKET_CLOSED`.

The GET endpoint accepts only `page` (1–1000, default 1) and `pageSize` (1–100, default 25); unknown, repeated, or out-of-range query fields return 422. It returns `{ items, total, page, pageSize }`, with comments ordered by `createdAt ASC, id ASC`. Each item contains only `id`, `organizationId`, `ticketId`, `authorUserId`, `body`, and `createdAt`.

POST accepts only `{ "body": "..." }`; the body is trimmed and must contain 1–10,000 characters. Unknown properties and empty/oversized text return 422. The response is 201 with the created comment DTO. The service reloads current membership after taking the organization lock, checks ticket visibility and lifecycle, then inserts the comment and a `COMMENT_ADDED` event in one PostgreSQL transaction. The event stores the new comment ID, not a duplicate copy of the comment body. `npm run test:api -- tests/tickets/comments.test.ts` exercises role access, ownership, foreign-tenant denial, closed-ticket behavior, ordering, validation, and rollback on a PostgreSQL event-insert failure.

## Ticket updates

`PATCH /api/tickets/{ticketId}` requires an authenticated session, exact approved `Origin`, session-bound `X-CSRF-Token`, and current active organization. ADMIN/AGENT may submit a strict object with one or more of `title`, `description`, `status`, and `priority`. CUSTOMER may submit only `title` and/or `description`, and only for their own OPEN ticket. Body fields including organization, requester, assignee, due date, version, and ticket number are server-controlled and rejected. Empty/no-op updates do not create events or increment the ticket version.

Allowed status transitions are `OPEN → IN_PROGRESS`, `OPEN → RESOLVED`, `IN_PROGRESS → RESOLVED`, `RESOLVED → IN_PROGRESS`, and `RESOLVED → CLOSED`; CLOSED is final. `RESOLVED → IN_PROGRESS` requires a trimmed `reopenReason` (1–500 characters), recorded on its status event. Invalid transitions return 409 `INVALID_STATUS_TRANSITION`; missing/invalid reasons return 422 `VALIDATION_ERROR`. Each changed field creates an activity event in the same PostgreSQL transaction as the ticket update; the version increments once per meaningful PATCH. Optimistic expected-version conflicts are TK-20 work. `npm run test:api -- tests/tickets/update.test.ts` covers roles, field allowlists, transition rules, reopen reason, events, versioning, and scoped negative requests.

## Ticket assignment

`PATCH /api/tickets/{ticketId}/assignment` requires an authenticated ADMIN/AGENT membership, exact approved `Origin`, session-bound `X-CSRF-Token`, and current active organization. Its strict JSON body is `{ "assigneeUserId": "<uuid>" }` for assignment or `{ "assigneeUserId": null }` to unassign. The target must be an active AGENT in that same organization. Customer actors, customer/inactive/cross-org targets, and inaccessible tickets are rejected; unavailable targets and tickets use the generic 404 response. The service stores both same-organization assignee keys, increments ticket version on a change, and records `ASSIGNMENT_CHANGED` in the same transaction. Repeating the current assignment is a no-op without event/version change. `npm run test:api -- tests/tickets/assignment.test.ts` covers both staff roles, valid assignment/unassignment, customer denial, target eligibility, and cross-organization IDs.

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

Unknown/repeated/nested parameters, non-integer/out-of-range page values, invalid enums/IDs, blank or oversized search, and body-controlled organization/requester fields are not accepted; invalid query fields return 422. Query matching and the result count use one repeatable-read snapshot. Results use deterministic `createdAt DESC, id DESC` ordering before applying the bounded page offset. Result items omit descriptions and credentials; `{ items, total, page, pageSize }` counts only rows visible through the same SQL scope. Because `page` is capped at 1,000 and `pageSize` at 100, this offset API can retrieve at most the first 100,000 matching rows; `total` can exceed that limit. Cursor pagination is the scale path if an organization grows beyond that range. Search is a case-insensitive literal substring (including literal `%` and `_` characters), not full text/ranking.

`npm run test:api -- tests/tickets/list.test.ts` uses real PostgreSQL and HTTP fixtures for two tenants, all three role scopes, combined filters, unassigned tickets, case-insensitive title/description search, Beta-only search matches and strict query validation.

## Central authorization policies

`api/src/lib/policy.ts` consumes the server-derived membership context. Membership administration requires ADMIN; dashboard and staff ticket management require ADMIN or AGENT. Ticket visibility always requires the active organization, and CUSTOMER additionally requires its own requester ID. Inaccessible/missing tickets return the same 404 before action-specific restrictions disclose state. Customers may edit their own title/description only while OPEN; staff may edit visible ticket content. New comments require a visible non-closed ticket, with 409 `TICKET_CLOSED` on an otherwise visible closed ticket. A closed ticket's conversation/history remains readable within the same visibility policy, as clarified in ADR 0003.

`ticketScope` combines mandatory organization/customer ownership constraints with additional criteria using AND, so criteria cannot overwrite the boundary. It rejects incomplete contexts and unknown roles. Services must use scoped queries or a locked transactional authorization path; checking a fetched object and then issuing an unconditional write is insufficient. Ticket, comment, membership, and activity product-route behavior has scoped PostgreSQL/HTTP integration coverage, but the full tenant-escape acceptance suite and browser journeys remain pending. These policy functions do not implement status transitions, assignee eligibility, last-admin protection, or product endpoints by themselves.

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
| 409 | `TICKET_CLOSED` | A visible closed ticket does not accept new comments. |
| 409 | `INVALID_STATUS_TRANSITION` | The current ticket status cannot transition to the requested status. |
| 409 | `TICKET_VERSION_LIMIT` | The ticket's version reached the PostgreSQL integer ceiling. |
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
