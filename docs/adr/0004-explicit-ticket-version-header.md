# ADR 0004: Use an explicit ticket-version request header

- Status: Accepted for the current implementation; deploy validation pending
- Date: 2026-10-29

## Context

Production ticket and assignment PATCH requests were observed returning HTTP 412 in the Web and API Vercel request logs, even when application state appeared to have committed. The API contract and local integration tests expect 409 for stale writes and 200 for successful writes. The repository used the standard HTTP If-Match request header for optimistic version checks.

The logs establish the 412 response but do not establish which layer generated it. A Vercel/platform conditional-request interaction is a plausible cause, not a confirmed root cause.

## Decision

Send the optimistic concurrency token in X-Ticket-Version as a positive decimal integer. Keep the strong ETag response for representation/version visibility, but do not use If-Match as the application write precondition. The API validates the custom header, performs the existing transactional compare-and-update, returns 409 for stale versions, and returns 200 with the committed version for successful writes. The Web proxy explicitly allowlists the custom header.

## Consequences

- Application concurrency semantics no longer depend on a standard HTTP conditional request header.
- API, Web client, proxy, tests, and API documentation must use the same header/value format.
- Existing clients using only If-Match receive 428 and must migrate.
- Production remains unverified until the change is deployed to Preview and an authenticated synthetic mutation proves success returns 200, then a stale retry returns 409 without an additional write/event. Do not use Production writes to reproduce this issue.
