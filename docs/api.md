# API contract — implemented foundation

Implemented endpoints are health and authentication. Membership administration, tickets, and dashboard endpoints are planned in subsequent tasks. The local listener/launch command and browser sign-in are also later tasks.

## Health

`GET /api/health` returns HTTP 200 with `{ "status": "ok" }`. This is application liveness, not a database readiness probe.

## Authentication

Configure an exact `APP_ORIGIN` without a trailing slash, a securely generated `SESSION_SECRET` of at least 32 characters, and `DATABASE_URL` before using the auth endpoints. Production requires an HTTPS origin and sets Secure cookies. Missing configuration, placeholder/too-short secrets, and invalid origins fail closed with a sanitized 500 before a session is created. Secret length is checked; operators remain responsible for generating unpredictable values. No signup or password-reset endpoint is implemented.

| Endpoint | Request | Result |
|---|---|---|
| `POST /api/auth/login` | Exact approved `Origin`, `X-CSRF-Protection: 1`, JSON `{ "email": "...", "password": "..." }` | 200 with user, current active memberships, and `csrfToken`; sets the opaque session cookie. Invalid credentials return the same 401 for unknown accounts and wrong passwords. |
| `GET /api/auth/me` | Session cookie | 200 with the current user, active memberships, and session-bound `csrfToken`; absent, unknown, expired, or revoked sessions return 401. |
| `POST /api/auth/logout` | Session cookie, exact approved `Origin`, `X-CSRF-Token` from login/me | 204 after persisted revocation and browser cookie expiry; replay is rejected. |

Successful login/me JSON has only `user: { id, email }`, `memberships: [{ organizationId, role, organization: { name, slug } }]`, and `csrfToken`. A user with no active memberships has an empty list and gains no organization authority. Membership context is resolved separately; object permission enforcement remains TK-10 and later product-route work. All auth responses use `Cache-Control: no-store`.

Email is trimmed/lowercased and limited to 320 characters; password must be a string of 1–256 characters. Unknown login properties are rejected. Password verification uses the fixed salted scrypt format of the seed (`N=32768`, `r=8`, `p=1`) and performs a dummy derivation for unknown accounts. The password is never returned or logged.

Each successful login generates 32 random bytes, stores only its SHA-256 token hash in PostgreSQL, and sets a host-only `support_session` cookie with `HttpOnly; SameSite=Lax; Path=/api` and a two-hour absolute lifetime. Production adds `Secure`. Re-login with an existing cookie revokes that token and creates its replacement in one transaction. Every authenticated request checks persisted expiry/revocation; duplicate cookies fail closed. Revoked/expired rows are retained for now; periodic cleanup and idle-timeout policy are operational follow-ups.

Login requires both the exact origin and a custom non-simple header, mitigating login CSRF without an anonymous session. Other authenticated unsafe methods require the exact origin plus a per-session HMAC token in `X-CSRF-Token`, compared in constant time. Login/me expose that token to the app, while the HttpOnly session cookie value is never returned in JSON. No cross-origin CORS access is configured. Future protected routes must use `createAuthenticate`, which applies these checks to unsafe methods. These decisions follow [OWASP's CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) and [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); actual browser/proxy behavior remains a later gate.

The local login limiter allows five attempts per normalized account and twenty per socket IP per fifteen-minute window, counting successful and failed attempts. It returns 429 plus `Retry-After`, ignores untrusted forwarding headers, and bounds its in-memory key table. This process-local state resets on restart and is not shared across replicas; it must be replaced or supplemented before a distributed/serverless release. Trusted-proxy configuration is not enabled; proxy clients may share one IP budget. These limits and the two-hour expiry are project design defaults, not employer requirements.

## Active organization context

Tenant-owned product routes will require `X-Organization-ID` after session authentication. The middleware accepts a single canonical UUID (case-insensitive), then queries PostgreSQL for that user's current active membership. It derives the organization, user ID, and role from the stored membership on each request. Missing selector returns `400 ORGANIZATION_REQUIRED`; malformed/ambiguous selector returns `400 INVALID_ORGANIZATION`; inactive, removed, foreign, and nonexistent memberships all return the same `404 NOT_FOUND` envelope.

Body/query role or organization fields never grant membership or replace the selector. Endpoint-specific body schemas must still reject forbidden properties. Users with memberships in multiple organizations can choose each valid selector with that organization's own current role. Removing membership or changing role takes effect on the next request with the same session.

`createActiveMembership` is a server middleware foundation, verified with real PostgreSQL and test-only context-inspection routes. No context-inspection endpoint is exposed by the product app. Health and authentication routes do not require an organization selector; future tenant-owned routers must chain authentication, active membership, and object/role policy before their handler. Ticket/customer isolation acceptance remains pending until those routes and policies exist.

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
| 413 | `PAYLOAD_TOO_LARGE` | JSON exceeds the 32 KiB request body limit. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Unsupported JSON charset or compressed body encoding. Send uncompressed JSON. |
| 422 | `VALIDATION_ERROR` | The body fails the endpoint's schema or includes fields outside its allowlist. |
| 500 | `INTERNAL_ERROR` | Unexpected server failure; no internal error message or stack is returned. |

`validateBody` enforces a strict top-level Zod object schema even when the supplied schema would otherwise strip unknown keys. It passes parsed/normalized values to the handler, rejects unknown properties, and never returns raw input or Zod internals. Nested objects must use strict nested schemas. Product routes will define their own required fields and ranges; middleware coverage alone does not verify ticket acceptance A11.

Authentication adds `401 INVALID_CREDENTIALS` / `UNAUTHENTICATED`, `403 CSRF_REJECTED`, and `429 RATE_LIMITED`. Future authorization and conflict modules will use the same envelope for 403/404 and 409 responses; ticket conflicts are not implemented yet.

## Safe error logging

Unexpected failures log only `event`, `code`, `status`, and the server-generated `requestId`. Request bodies, query strings, paths, headers, cookies, raw errors, stack traces, and database messages are excluded. Expected 4xx errors are not logged by the error handler. No credential-bearing access logger is installed. This is a minimal correlation log; richer operational diagnostics must preserve these redaction rules.

If a response has already started, its status and body cannot be replaced with an error envelope. The handler closes that connection and still logs only safe metadata; it does not pass the raw error to Express's default logger.

Run the actual HTTP contract checks with `npm run test:api -- tests/http/errors.test.ts`. These use Supertest with the production app and a test-only Express harness for validation and thrown-error routes; they do not claim PostgreSQL, authentication, browser, or deployment verification.
