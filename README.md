# Multi-Tenant Customer Support Platform

**Status (2026-10-26):** implementation is in progress. The repository has TypeScript workspaces, local PostgreSQL, Prisma domain schema, a synthetic two-organization seed, safe API errors, password/session authentication, tenant-scoped membership administration, role-scoped ticket creation with transactional history, and tenant-scoped ticket listing/search/filtering. Ticket editing and user-facing workflows are still pending. No hosted deployment is configured or claimed.

The employer assessment PDF is the product contract in [`reference/assessment.pdf`](reference/assessment.pdf). The approved design, task plan, acceptance matrix, security contract, and assumptions are under `docs/` and `harness/`.

## Current checkpoint

- C0 workspace and local database foundation are in place.
- TK-03–TK-12 design/schema/seed/auth/tenant/policy, membership APIs, and ticket creation are closed. TK-13–TK-15 add tenant-scoped ticket listing/search/filtering/pagination and detail authorization; G3 remains incomplete until update, comments, audit, dashboard, and the complete API journey are verified.
- `api/src/app.ts` exposes health, authentication, membership, ticket creation, and ticket list endpoints documented in [`docs/api.md`](docs/api.md); `web/src/App.tsx` is still a shell. There is no login screen or local app launch command yet.
- A03 has passed its API role-check scope. Other complete acceptance IDs remain `NOT_RUN`; `npm run check` verifies the current unit/database tests, build, and Playwright discovery but does not execute browser journeys or complete release acceptance.

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
