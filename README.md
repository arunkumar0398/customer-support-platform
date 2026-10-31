# Multi-Tenant Customer Support Platform

**Status (2026-10-31):** code candidate 7c2fdba6efb7c39dbf723f100644a5c53928fd84 passed exact-SHA GitHub Actions [run #25](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41177630515). Local combined Playwright passed 25/25 and npm run check passed (395 API, 12 Web, 25 E2E discovered, lint/typecheck/build). The production throttle remains 20 attempts/IP and 5/account; the guarded E2E server alone uses IP cap 100. Exact 7c Vercel Web/API Preview deployments are Ready; API readiness and Web proxy liveness pass. Preview synthetic-admin ticket #6 create/update/comment passed; reasoned reopen showed a stale warning despite its persisted event and needs request/response capture. Isolated Compose startup/migration/seed and API/Web health smoke passed; see the Docker smoke evidence. Agent/customer journeys, foreign-tenant denial, rollback compatibility, broad accessibility, Cloudflare isolated audit, and whole-project final review remain open. Historical run #22 on 9a5cce3 remains 23/24 without evidence that 429 caused it. Ten modified TK-29 screenshots remain preserved and unstaged.

The parent-kit review confirmed the sign-in focus and screenshot-safety fixes, then returned READY_FOR_REVIEW for the scoped docs/UI follow-up on the earlier documentation revision; it noted one stale status phrase, corrected in the current candidate documentation. A fresh read-only review of this reconciliation is pending, and the whole-project release review remains open. See [acceptance status](evidence/checkpoints/acceptance-status.md), [handoff](evidence/checkpoints/CURRENT_HANDOFF.md), and [Preview validation](evidence/reviews/preview-validation-2026-10-31.md).

The employer assessment PDF is the product contract in [`reference/assessment.pdf`](reference/assessment.pdf). The approved design, task plan, acceptance matrix, security contract, and assumptions are under `docs/` and `harness/`.

## Current checkpoint

- C0 workspace and local database foundation are in place.
- TK-03–TK-22 design/schema/seed/auth/tenant/policy, membership, ticket, dashboard, health, and readiness APIs have scoped evidence. TK-23–TK-29 deliver sign-in, ticket list/create/detail, dashboard, and admin membership screens with scoped browser evidence. The 2026-10-31 create/reopen UX follow-up adds staff customer selection and reasoned reopen UI; see `evidence/checkpoints/TK-25-2026-10-31.md`.
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

### Vercel Preview test account

This synthetic administrator exists only in the Neon Preview database; the local seed does not create it. Use it only with the Vercel Preview application. Do not reuse it for Production or any real account.

- Email: `preview-admin-20261030-9693f9@example.test`
- Password: `PreviewOnly-E2E-2026-10-30!`

The recorded 2026-10-30 Preview check used Ready candidate `eb4f285`. The 2026-10-31 Preview follow-up on `a44a96d` verified the updated customer picker and reopen-reason flow using this synthetic administrator. It created ticket #4 for the active synthetic customer `preview-customer1-20261030-9693f9@example.test`; that labeled ticket remains in Preview for repeatable testing. Ticket #3 was reopened with a validation reason and restored to Resolved; the corresponding immutable status events remain. Agent/customer passwords are still unavailable in repo evidence, so those logins and true foreign-tenant object denials remain unverified. These credentials and records are Preview-only; Production was not changed.

## Checks

```powershell
npm run check
py -3 scripts/check-doc-contract.py
```

`npm run check` runs lint, typecheck, API and web tests, Playwright test listing, and API/web builds. The listing is discovery only; run `npm run test:e2e` to execute browser journeys against the guarded local test database.

## Deployment

The approved target is Vercel (Vite frontend and Express Node Function) with Neon PostgreSQL. Deployment is a separate checkpoint and requires new explicit approval after the secure Docker-local MVP is complete. See `harness/VERCEL_NEON_DEPLOYMENT.md` for the deployment contract.
