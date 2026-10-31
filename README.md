# Multi-Tenant Customer Support Platform


## Release reconciliation — 2026-10-31

**Assessed documentation candidate:** `85ae41ebf76fea8e1a919f309de8c1a6a1195518` on branch `codex/clean-candidate-b2fd369`. GitHub Actions [run #90](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41220472826) completed `success` on this exact SHA; the `verify` job passed. Exact-SHA Vercel Web and API checks are both `failure` with the provider message “Deployment rate limited — retry in 24 hours” ([Web/API commit checks](https://github.com/arunkumar0398/customer-support-platform/commit/85ae41ebf76fea8e1a919f309de8c1a6a1195518/checks)). These are Vercel build-quota statuses, not application build/test failures. Do not spend or upgrade the plan to satisfy this assessment: deployment is explicitly optional.

**Application source:** `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; Actions [run #74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) passed (`verify`), with Web/API deployment checks successful on that source SHA as recorded below. Documentation-only commits do not change that application-source identity; their statuses do not add application test coverage. Docs snapshot `87fc082059f2cd3c2c0bdedb4ac2b58cce125b75` also has Actions #87 success and its own successful Web/API checks. Earlier exact-SHA history remains in the sections below.

**Security evidence scope:** External Cloudflare run-6 executed six isolated Node built-in tests against the extracted throttle helper at source `3e613c0…`: account threshold (5 allowed, next denied with 429 / 900-second retry), IP threshold (20/21), 15-minute expiry, 4,096-key cap, forwarded-for not replacing the supplied `req.ip` key, and independent limiter instances. It passed 6/6 as a helper-only test. It did not exercise the Express route, middleware ordering, proxy-derived IP, a real datastore, multi-instance sharing, or deployed Vercel behavior; run-6 is external to this repository. The full Cloudflare audit remains **BLOCKED / NOT_RUN**; no packages were fetched and no deployed endpoints were probed.

**Preview and release gates:** Agent/customer Preview journeys and foreign-ticket read/write no-side-effect checks remain **BLOCKED / NOT_RUN** until the Neon Preview owner confirms compute readiness and safe synthetic role credentials plus a verified second-tenant ticket are available. No Preview request or write is claimed here. Independent G7 remains **BLOCKED** pending Preview acceptance and the compliant full audit. Keep merge/submission on hold. The local `b2fd3691fe01f81a1652f29ab7ef67d615c0051f` checkout remains a separate dirty worktree, including ten modified TK-29 screenshots; Actions #90 on remote `85ae41e…` does not validate that local checkout.

See [assessment deliverables inventory](evidence/checkpoints/DELIVERABLES_INVENTORY.md), [acceptance ledger](evidence/checkpoints/acceptance-status.md), and [current handoff](evidence/checkpoints/CURRENT_HANDOFF.md). This reconciliation is authored from the remote `85ae41e…` candidate; the resulting documentation commit is docs-only and its own Actions/Vercel statuses must be checked against its resulting SHA separately.

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
