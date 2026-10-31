# Multi-Tenant Customer Support Platform

**Status (2026-10-31):** exact candidate `15a59b36570bf5c2e6658d1a32acb06990e5c727` on `codex/preview-mobile-roster-ux` passed GitHub Actions [run #24](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41175405970): the Hallmark membership typography/focus changes, 395 API tests, 12 Web tests, combined Playwright 24/24, lint, typecheck and builds. Historical run #22 on `9a5cce3` remains a 23/24 browser-test failure; its logs did not establish a 429 cause. The test-only IP-budget override keeps production defaults (20 per IP and 5 per account) unchanged. Exact candidate Vercel Preview health/readiness passed; synthetic-admin ticket create/update/comment and stale-write denial were checked through the branch alias. The ten modified TK-29 screenshots remain preserved and unstaged. A35 role/foreign-tenant Preview checks, A36 rollback compatibility, A37 broad accessibility, exact-candidate Docker, Cloudflare sandbox audit and final independent review remain open. See [acceptance status](evidence/checkpoints/acceptance-status.md) and [handoff](evidence/checkpoints/CURRENT_HANDOFF.md).

The current follow-up worktree based on `15a59b3` addresses two findings from the independent review: sign-in input focus visibility and E2E screenshot overwrites. Its RED/GREEN regression test is local; exact-SHA CI for that follow-up is pending. Fresh local evidence and limitations are in [the Hallmark follow-up](evidence/reviews/hallmark-2026-10-31/REVIEW.md).

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
