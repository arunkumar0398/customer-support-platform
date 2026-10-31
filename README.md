# Multi-Tenant Customer Support Platform

**Current validation update (2026-10-31; validated source candidate `c316e1c708d0d45d16264ba75104f1d0acaf9d8f` (run #72), with docs-only follow-up `de7b8d13fc430e4fbd87f96d692c394b7d428b62` (run #73); both based on `b2fd3691fe01f81a1652f29ab7ef67d615c0051f`):** This separate candidate contains only release-status documentation and its evidence note; the original dirty worktree and its ten TK-29 screenshot edits remain preserved. GitHub Actions runs [#72](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202224549) and [#73](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202475531) completed `verify` successfully on their respective exact SHAs; Vercel API/Web are also success on de7b8d1; Vercel API and Web checks also report success on the candidate. These CI/deployment checks do not close the bounded audit or Preview role/tenant acceptance. Preview role/foreign-tenant acceptance is BLOCKED because safe synthetic agent/customer credentials and a verified second-tenant fixture are unavailable. The bounded Cloudflare audit tests are NOT_RUN because no compatible preinstalled offline Linux test runner is available; no packages were installed or fetched. Five areas have source-only review. G7 remains BLOCKED; do not merge or submit. See [security and Preview follow-up](evidence/reviews/security-preview-followup-2026-10-31-b2fd369.md), [acceptance status](evidence/checkpoints/acceptance-status.md), and [current handoff](evidence/checkpoints/CURRENT_HANDOFF.md).

**Historical implementation snapshot (2026-10-28; superseded by the current acceptance ledger and deployment evidence below):** implementation was in progress. The repository has TypeScript workspaces, local PostgreSQL, a Prisma domain schema, a synthetic two-organization seed, safe API errors, password/session authentication, tenant-scoped membership administration, ticket creation/list/detail/update/assignment/comment/history APIs, and tenant-scoped dashboard metrics. The React sign-in, ticket queue/search/filter/pagination, ticket create/detail, dashboard, and admin membership screens are implemented with browser journeys. Full acceptance coverage remains in progress. At that snapshot, TK-33 Docker work and scoped static/runtime reviews were recorded; later checkpoint and deployment evidence supersede its pending statements.

The employer assessment PDF is the product contract in [`reference/assessment.pdf`](reference/assessment.pdf). The approved design, task plan, acceptance matrix, security contract, and assumptions are under `docs/` and `harness/`.

## Current checkpoint

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
