# Multi-Tenant Customer Support Platform

**Status (2026-10-26):** implementation is in progress. The repository has TypeScript workspaces, local PostgreSQL, Prisma domain schema, a synthetic two-organization seed, safe API errors, and password/session authentication endpoints. Ticket APIs and user-facing workflows are still pending. No hosted deployment is configured or claimed.

The employer assessment PDF is the product contract in [`reference/assessment.pdf`](reference/assessment.pdf). The approved design, task plan, acceptance matrix, security contract, and assumptions are under `docs/` and `harness/`.

## Current checkpoint

- C0 workspace and local database foundation are in place.
- TK-03–TK-07 design/schema/seed/HTTP foundation tasks are closed. TK-08 adds PostgreSQL-backed login/session/logout with origin/CSRF defense and local login limits; G2 remains partial until membership and authorization work is complete.
- `api/src/app.ts` exposes health and authentication endpoints documented in [`docs/api.md`](docs/api.md); `web/src/App.tsx` is a shell. There is no login screen or local app launch command yet.
- Acceptance IDs A01–A40 remain `NOT_RUN`. `npm run check` verifies the current scaffold, unit/database checks, builds, and Playwright test discovery; it does not complete all assessment acceptance journeys or execute the listed browser test.

## Local database setup

Use Node 24, npm 11, Git, and Docker Desktop with Compose. On PowerShell, copy `.env.example` to `.env` if needed and replace its local placeholder values with random local-only values. Do not commit `.env`.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
docker compose up -d database
npm run db:wait
npm run db:migrate
npm run db:seed
```

The seed command verifies a loopback `support_dev` connection before writing. It creates synthetic records only. Database integration tests use the separate disposable `support_test` identity; run `npm run db:migrate:test` and `npm run db:verify-test` to check that target.

## Demo accounts

The eight Alpha/Beta synthetic accounts cover admin, agent, and customer roles. Their shared demo password and fixtures are documented in [`docs/demo-accounts.md`](docs/demo-accounts.md). The authentication HTTP tests use isolated fixtures in the verified disposable database. The seeded accounts' hashes are verified separately; browser sign-in and the complete local launch path come later. A25 remains `NOT_RUN` until that setup/sign-in journey is implemented and verified.

## Checks

```powershell
npm run check
py -3 scripts/check-doc-contract.py
```

`npm run check` runs lint, typecheck, API and web tests, Playwright test listing, and API/web builds. The Playwright listing is discovery only; browser journeys must be run explicitly when implemented.

## Deployment

The approved target is Vercel (Vite frontend and Express Node Function) with Neon PostgreSQL. Deployment is a separate checkpoint and requires new explicit approval after the secure Docker-local MVP is complete. See `harness/VERCEL_NEON_DEPLOYMENT.md` for the deployment contract.
