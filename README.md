# Multi-Tenant Customer Support Platform

**Current release evidence (2026-10-31):** Application source candidate `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`: Actions [run #74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) passed with the `verify` job successful. Vercel checks on that exact SHA: Web `success` [deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/6AuPqU7gLSB1Rp51jjoUDaSHQDie); API `success` [deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/DCA5qzWusqeP2stcicpkdpQ2VL5y). Prior docs-only snapshot `d65a105ae93739330d6686fed44cdb5ea99d7636`: Actions [run #78](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41205052559) passed with the `verify` job successful. Vercel checks: Web `success` [deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/vihdC9VrQCgcPLEGF7TCwr4Shch6); API `success` [deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/2y1ZEHt5fxyEKrYpbNvLcXtgRexT). Current verified docs/reconciliation candidate `bc4ba4580f3f03e6a6b330c7677d08b386fbc852`: Actions [run #80](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41217088051) completed with conclusion `success` on that exact commit; relevant job `verify` concluded `success`. Vercel checks on that exact commit: Web `success` [deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/CQgHB1cYia68pjQPRustn8VGXWfy); API `success` [deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/Htmnsrm2zfFRnxkCwPx3j3y776G7). The comparison confirms revisions from `3e613c0` through `bc4ba45` changed documentation only; application source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Earlier docs-only runs #75–#77 are historical at their recorded SHAs. Audit remains incomplete. The only bounded offline execution recorded is the sanitizer test (2/2) in a no-network, read-only container; no fresh audit lanes were run in this update. Auth/session/CSRF/throttle, tenant/object authorization, membership mutation, transaction/rollback, query-bound, and dashboard/membership UI coverage remain unexecuted or deferred. The five deferred areas—session/CSRF, membership mutations, child-resource/dashboard authorization, Vercel proxy, and CI/container supply chain—remain open. Throttle behavior is unresolved; no SQL migration reversal test was performed. No packages were installed/fetched and no deployed endpoints were probed. Preview role journeys and foreign-ticket read/write no-side-effect checks remain **BLOCKED / NOT_RUN** pending owner-confirmed Neon compute readiness, safe synthetic agent/customer credentials, and a verified second-tenant fixture. Do not repeat fixture discovery until readiness or fixture state changes. No Preview requests or data mutations were made. G7 remains **BLOCKED**; keep merge/submission on hold. The separate local worktree `b2fd3691fe01f81a1652f29ab7ef67d615c0051f` is separate and remains dirty; all existing edits, including ten TK-29 screenshots, were preserved and excluded from this GitHub update. See [acceptance status](evidence/checkpoints/acceptance-status.md) and [current handoff](evidence/checkpoints/CURRENT_HANDOFF.md).

**Historical implementation snapshot (2026-10-28; superseded by the current acceptance ledger and deployment evidence below):** implementation was in progress. The repository has TypeScript workspaces, local PostgreSQL, a Prisma domain schema, a synthetic two-organization seed, safe API errors, password/session authentication, tenant-scoped membership administration, ticket creation/list/detail/update/assignment/comment/history APIs, and tenant-scoped dashboard metrics. The React sign-in, ticket queue/search/filter/pagination, ticket create/detail, dashboard, and admin membership screens are implemented with browser journeys. Full acceptance coverage remains in progress. At that snapshot, TK-33 Docker work and scoped static/runtime reviews were recorded; later checkpoint and deployment evidence supersede its pending statements.

The employer assessment PDF is the product contract in [`reference/assessment.pdf`](reference/assessment.pdf). The approved design, task plan, acceptance matrix, security contract, and assumptions are under `docs/` and `harness/`.

## Historical implementation checkpoint (2026-10-28; superseded by the validation snapshot above)

- C0 workspace and local database foundation are in place.
- TK-03–TK-22 design/schema/seed/auth/tenant/policy, membership, ticket, dashboard, health, and readiness APIs are closed with scoped evidence. TK-23 adds the sign-in flow and authenticated React shell. TK-24 adds the ticket list, search, filters, paging, and UI states; create/detail/dashboard/admin screens remain pending.
- `api/src/app.ts` exposes health/readiness, authentication, membership, ticket, activity, comment, and dashboard endpoints documented in [`docs/api.md`](docs/api.md). The browser uses a same-origin `/api` proxy in development; authentication stays in the server session cookie.
- A03, A04, A09, A13, A18–A21, and A29 have passed only their recorded API/database scopes. A22/A23 and other complete acceptance IDs remain `NOT_RUN` until their full journeys are tested. `npm run check` runs unit/database tests, lint, typecheck, test discovery, and builds; `npm run test:e2e` executes the browser suite.

## Local database setup

Use Node 24, npm 11, Git, and Docker Desktop with Compose. On PowerShell, copy `.env.example` to `.env` if needed and generate separate 32-byte random values encoded as hex for `POSTGRES_SUPERUSER_PASSWORD`, `APP_DB_PASSWORD`, `TEST_DB_PASSWORD`, and `SESSION_SECRET`. Hex values avoid URL-reserved characters in database passwords. Keep `APP_DB_PASSWORD` identical in `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and keep `TEST_DB_PASSWORD` identical to the password in `TEST_DATABASE_URL`. Repeated placeholders in the template represent shared values. Do not commit `.env`.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
docker compose up -d --wait database
npm run db:migrate
npm run db:seed
```

The seed command verifies a loopback `support_dev` connection before writing. It creates synthetic records only. Database integration tests use the separate disposable `support_test` identity; run `npm run db:migrate:test` and `npm run db:verify-test` to check that target.

## Docker-local app run

For the production-built local API and web containers, follow [`docs/operations.md`](docs/operations.md). The flow starts the database, runs the guarded host migration and synthetic seed, then builds and launches API and web containers. The frontend is available at `http://localhost:8080` by default.

## Demo accounts

The eight Alpha/Beta synthetic accounts cover admin, agent, and customer roles. Their shared demo password and fixtures are documented in [`docs/demo-accounts.md`](docs/demo-accounts.md). Browser authentication tests create and clean up an isolated fixture in the verified disposable `support_test` database; they do not use the seeded demo accounts or developer database. A25 remains `NOT_RUN` until the documented local setup and seeded-account sign-in journey is verified.

## Checks

```powershell
npm run check
py -3 scripts/check-doc-contract.py
```

`npm run check` runs lint, typecheck, API and web tests, Playwright test listing, and API/web builds. The listing is discovery only; run `npm run test:e2e` to execute browser journeys against the guarded local test database.

## Deployment

The approved target is Vercel (Vite frontend and Express Node Function) with Neon PostgreSQL. Deployment is a separate checkpoint and requires new explicit approval after the secure Docker-local MVP is complete. See `harness/VERCEL_NEON_DEPLOYMENT.md` for the deployment contract.
