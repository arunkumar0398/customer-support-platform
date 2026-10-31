# Multi-Tenant Customer Support Platform


## Release and validation status — 2026-10-31

Latest validated docs/test candidate before this status refresh: `acf01641263275507f4b781bc980cf9e810c9e49`; Actions #95 `verify` and exact-SHA Vercel Web/API checks succeeded. It contains documentation plus a test-only assignment-rollback regression; implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Baseline `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` / #94 had Vercel provider quota statuses.

**Current candidate:** `acf01641263275507f4b781bc980cf9e810c9e49` on `codex/clean-candidate-b2fd369`. GitHub Actions [run #95](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41226730675) completed successfully on that exact SHA; job `verify` passed, including disposable PostgreSQL setup, migrations/seed, required gates, and builds. Exact-SHA Vercel Web and API status checks both report success: [Web/API checks](https://github.com/arunkumar0398/customer-support-platform/commit/acf01641263275507f4b781bc980cf9e810c9e49/checks). Run #95 validates the documentation and test-only assignment-rollback regression in this candidate; application implementation remains the distinct source SHA below. The preceding docs snapshot `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` passed Actions #94, while both Vercel checks were provider quota statuses, not application failures. Earlier docs-only runs #90–#93 remain SHA-specific in [testing evidence](docs/testing.md).

**Application source:** `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; Actions [run #74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) passed on that exact source SHA, and its Vercel Web/API checks succeeded. The intervening documentation snapshots `85ae41e` / #90, `6d8f19b` / #91, `baa7299` / #92, and `7318295` / #93 are historical, SHA-specific records; none changes application source. See [testing evidence](docs/testing.md) for each run and its provider status.

**Assessment deliverables:** The eight required items and evidence paths are in [assessment deliverables inventory](evidence/checkpoints/DELIVERABLES_INVENTORY.md); the detailed review is [here](evidence/checkpoints/ASSESSMENT_DELIVERY_REVIEW_2026-10-31.md). The private GitHub repository exists, but evaluator access is unverified; the owner must grant the evaluator access or provide an approved private handoff. Do not make the repository public without authorization. Architecture, data-model, API, testing, and limitations documents were checked against the implementation and evidence.

**Open gates:** Preview role journeys, same-tenant-other-customer and foreign-tenant denials with before/after state remain **BLOCKED / NOT_RUN** pending owner-confirmed Neon Preview compute readiness, synthetic role credentials, and a verified second-tenant ticket. The full bounded security audit remains **BLOCKED / NOT_RUN**: no compatible preinstalled Linux test toolchain is available in the compliant sandbox. Run-6 is only six isolated throttle-helper tests; it does not establish route, database, distributed, or deployed behavior. Evaluator access to the private repository is unverified. A fresh G7 decision on the reconciled exact head is still required. Keep merge/submission on hold. Deployment URL is optional under the assessment; no plan upgrade is needed.

The local worktree `b2fd3691fe01f81a1652f29ab7ef67d615c0051f` on `codex/vercel-api-route-preview` remains dirty and separate, including ten modified TK-29 screenshots. Remote CI evidence does not validate that dirty checkout.

Candidate `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` / Actions #94 is the historical baseline used for this reconciliation; its Vercel checks were quota-limited. Current documentation/test candidate `acf01641263275507f4b781bc980cf9e810c9e49` has exact-SHA Actions #95 and Web/API status checks as stated above.

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

## Deployment status

A deployment URL is optional under the employer assessment. The chosen hosted topology is Vercel for the web and Express API, with Neon PostgreSQL; see [the deployment contract](harness/VERCEL_NEON_DEPLOYMENT.md). Vercel results are SHA-specific: application source `3e613c0…` has recorded Web/API success. Docs snapshot `6d8f19b…` had Web success and an API provider rate-limit status, not an application build failure. Do not upgrade a plan solely for this optional item. If an evaluator requires a live URL, coordinate with the owner after the build-quota window and document the exact deployed SHA.
