# API contract — implemented foundation

The only product endpoint currently implemented is `GET /api/health`, which returns HTTP 200 with `{ "status": "ok" }`. Authentication, memberships, tickets, and dashboard endpoints are planned in subsequent tasks. This document will grow with those endpoints.

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

Future authentication, authorization, conflict, and throttling modules will use the same envelope for 401, 403/404, 409, and 429 responses. Those behaviors are not implemented by this task.

## Safe error logging

Unexpected failures log only `event`, `code`, `status`, and the server-generated `requestId`. Request bodies, query strings, paths, headers, cookies, raw errors, stack traces, and database messages are excluded. Expected 4xx errors are not logged by the error handler. No credential-bearing access logger is installed. This is a minimal correlation log; richer operational diagnostics must preserve these redaction rules.

If a response has already started, its status and body cannot be replaced with an error envelope. The handler closes that connection and still logs only safe metadata; it does not pass the raw error to Express's default logger.

Run the actual HTTP contract checks with `npm run test:api -- tests/http/errors.test.ts`. These use Supertest with the production app and a test-only Express harness for validation and thrown-error routes; they do not claim PostgreSQL, authentication, browser, or deployment verification.
