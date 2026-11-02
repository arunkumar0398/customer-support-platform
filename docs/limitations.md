# Tradeoffs, limitations, and next steps

## Current implementation tradeoffs

- **Login throttle:** the login router uses an in-process `Map`, with 5 attempts per normalized account and 20 per `req.ip` in a 15-minute window, capped at 4,096 keys. On exact local source `080d883029e6e68619c34e8dc4d055d03b4dcbb7`, all five tests in `api/tests/security/login-throttle-capacity.test.ts` passed in the 425-test API lane. A real middleware route fixture confirmed an existing key can proceed at capacity, a new key gets 429 with `Retry-After: 900`, the downstream login handler is not entered and no session cookie is set, then expiry restores admission. A fresh independent focused review confirmed this local behavior; the capacity policy alone is not a confirmed vulnerability. The limiter resets on process restart and is not shared across Vercel instances. Actual Vercel routing, client-IP cardinality, and multi-instance behavior remain unknown; no deployed throttle request was made. Express proxy trust is disabled, so caller-supplied forwarding headers are not treated as trusted client IPs.
- **Pagination:** list endpoints use deterministic capped offset pagination (up to 1,000 pages, 100 rows each). Deep offsets cost more; keyset pagination over `(createdAt, id)` is the growth path if measured query plans or volume require it.
- **Account recovery:** public signup and password reset are not implemented. Accounts are created by an administrator/controlled seed or bootstrap procedure.
- **Create retries:** no idempotency-key contract exists. A client timeout after successful ticket creation can lead to a duplicate if the client retries; clients should not automatically retry ambiguous creates.
- **Operations:** there is no full monitoring/alerting platform, outbound notification worker, attachment storage, realtime channel, or advanced analytics. SQL migration reversal was not tested; code rollback compatibility is a different claim.

## Open release checks

- Preview agent/customer journeys, foreign-ticket and same-tenant-other-customer denials, and no-write after-state assertions: **BLOCKED / NOT_RUN** pending owner-ready Neon compute, synthetic credentials, and a verified second-tenant fixture.
- Full offline security audit: **BLOCKED / NOT_RUN** pending a compliant OS-enforced sandbox with compatible preinstalled Linux runners. Do not install/fetch packages or probe deployed endpoints for that audit.
- Fresh G7 approval: **BLOCKED** until Preview/audit evidence and document review close.
- Evaluator access to the private GitHub repo: **UNVERIFIED**. Owner must grant access to the evaluator or provide an approved private source handoff. Do not change repository visibility without authorization.
- Vercel deployment is optional in the employer assessment. Results must stay tied to their SHA: source `3e613c0…` has recorded Web/API success; `cd0b04f…` / Actions #101 had provider “Deployment has completed” statuses; `24f1d95…` / Actions #102 has Web/API state `success` with “Canceled by Ignored Build Step” descriptions. The latter are build cancellations, not deployment checks or app failures. No plan upgrade or docs-only Vercel retry is required.
- Local A36 evidence now covers a disposable PostgreSQL backup/restore and forward migration verification, plus 28/28 API tests from pre-fix application snapshot `39b9ae3` against the migrated schema. There is no SQL down migration, and Neon PITR/hosted restore remains unverified.

## Next steps

1. Ask the Neon Preview owner to confirm compute is ready and identify synthetic agent/customer credentials plus a verified second-tenant fixture; do not repeat fixture discovery before readiness.
2. Complete Preview journeys and denied-write before/after checks using synthetic data only.
3. Provide a compatible preinstalled Linux runner inside the isolated environment, then complete the bounded audit without fetching dependencies or touching deployed services.
4. Confirm evaluator access to the private repository.
5. Request a fresh independent G7 review against the resulting exact candidate. Keep merge/submission on hold until it clears.
