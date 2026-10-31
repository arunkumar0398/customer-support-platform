**Current release evidence (2026-10-31):** Application source candidate: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. GitHub Actions run [#74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) passed `verify` on that exact SHA. Exact-SHA Vercel checks: Web `success` ([deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/6AuPqU7gLSB1Rp51jjoUDaSHQDie)); API `success` ([deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/DCA5qzWusqeP2stcicpkdpQ2VL5y)). Latest validated docs-only snapshot: `d65a105ae93739330d6686fed44cdb5ea99d7636`. Actions run [#78](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41205052559) passed `verify` on that exact SHA; Vercel checks succeeded: Web ([deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/vihdC9VrQCgcPLEGF7TCwr4Shch6)); API ([deployment](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/2y1ZEHt5fxyEKrYpbNvLcXtgRexT)). Comparing `3e613c0` to `d65a105` shows documentation-only changes; application source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Earlier documentation-only runs #75–#77 remain historical at their recorded SHAs. Audit scope: a bounded offline sanitizer test ran against the exact `d65a105` source snapshot in a constrained no-network, read-only container; Node’s built-in test runner reported 2/2 passing. This is limited evidence, not completion of the Cloudflare audit. Auth/throttle, tenant/object authorization, membership/session, transaction/rollback, query-bound, and broader UI suites remain unexecuted; five deferred coverage areas remain open. No dependencies were installed or fetched, and no deployed endpoint was probed. Preview role journeys and foreign-ticket read/write no-side-effect checks remain **BLOCKED / NOT_RUN**. Neon Preview compute readiness has not been confirmed, and safe synthetic agent/customer credentials plus a verified second-tenant ticket fixture are unavailable. Per the stop rule, do not repeat read-only fixture discovery until the owner confirms compute is ready. No Preview login/request or hosted-data mutation was made. Focused independent G7 review remains **BLOCKED** pending Preview acceptance and compliant bounded audit completion. Keep merge/submission on hold. The separate local worktree at `b2fd369` remains dirty; its edits and ten TK-29 screenshot changes were not published to this branch. See [acceptance status](evidence/checkpoints/acceptance-status.md) and [current handoff](evidence/checkpoints/CURRENT_HANDOFF.md).# Multi-Tenant Customer Support Platform

**Current release evidence (2026-10-31):** The validated application source candidate is `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; GitHub Actions run [#74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) passed `verify` on that exact SHA, and Vercel Web/API checks succeeded ([Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/6AuPqU7gLSB1Rp51jjoUDaSHQDie), [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/DCA5qzWusqeP2stcicpkdpQ2VL5y)). Documentation-only snapshots `7d82dfc035e11adad9577c5812ad6ebdd695c328` and `a2cb3c89c4ca2a71e8af7d319fbb4e6cebd9c2f1` also passed Actions runs [#75](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41203862108) and [#76](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41204296955), with successful Vercel Web/API checks ([#75 Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/4dL8Dd9bp2fyi7Dc6tnLPZsCzZty), [#75 API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/vJjDKcPk6mRC8oZDD9eaTL1YAZJP), [#76 Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/HVFKYjJHwZF5SDrh1MBejgdtY6Uw), [#76 API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/2Vfe7KcJZgJPK7Se2GQ7YLZpJbmT)). The next docs-only snapshot `60f9ce22a49a6f1625759b7fee793da56ffef156` passed Actions run [#77](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41204647792), with successful Vercel checks ([Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/9CYdjAdmQVoLGbeNdLLiV9s14YBq), [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/5V7JAwWD4ukeJ1PDrPLYReZ7rtfd)). Application source remains unchanged from `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Older source/security reviews remain historical at their recorded SHAs; the security follow-up report is scoped to `b2fd369` and is not current Preview acceptance evidence. Preview role/foreign-ticket acceptance and the bounded offline audit remain BLOCKED/NOT_RUN. G7 is BLOCKED; hold merge/submission. See [acceptance status](evidence/checkpoints/acceptance-status.md) and [current handoff](evidence/checkpoints/CURRENT_HANDOFF.md).

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
