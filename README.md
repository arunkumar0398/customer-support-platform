# Multi-Tenant Customer Support Platform

**Status (2026-10-26):** implementation is in progress. The repository now has the TypeScript workspaces, local PostgreSQL setup, Prisma organization/ticket/session schema, and synthetic two-organization seed. Authentication, ticket APIs, and user-facing workflows are not implemented yet. No hosted deployment is configured or claimed.

The employer assessment PDF is the product contract in [`reference/assessment.pdf`](reference/assessment.pdf). The approved design, task plan, acceptance matrix, security contract, and assumptions are under `docs/` and `harness/`.

## Current checkpoint

- C0 workspace and local database foundation are in place.
- TK-03 design/requirements artifacts and TK-04–TK-06 schema/seed work are progressing through G1.
- `api/src/app.ts` currently exposes only `/api/health`; `web/src/App.tsx` is only a shell. There is no login screen or local app launch command yet.
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

The eight Alpha/Beta synthetic accounts cover admin, agent, and customer roles. Their shared demo password, seed details, and intended ticket fixtures are documented in [`docs/demo-accounts.md`](docs/demo-accounts.md). They cannot sign in yet because authentication is scheduled for TK-08 and the UI flow comes later. A25 remains `NOT_RUN` until the actual sign-in path is implemented and verified.

## Checks

```powershell
npm run check
py -3 scripts/check-doc-contract.py
```

`npm run check` runs lint, typecheck, API and web tests, Playwright test listing, and API/web builds. The Playwright listing is discovery only; browser journeys must be run explicitly when implemented.

## Deployment

The approved target is Vercel (Vite frontend and Express Node Function) with Neon PostgreSQL. Deployment is a separate checkpoint and requires new explicit approval after the secure Docker-local MVP is complete. See `harness/VERCEL_NEON_DEPLOYMENT.md` for the deployment contract.
