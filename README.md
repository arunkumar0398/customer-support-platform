# Multi-Tenant Customer Support Platform


## Release and validation status — 2026-10-31

**Latest verified documentation snapshot before this update:** `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1` on `codex/clean-candidate-b2fd369`. GitHub Actions [run #91](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41222046884) completed successfully on that exact SHA; the `verify` job passed. The workflow runs install, disposable PostgreSQL setup/migrations/seed, sanitizer check, lint, typecheck, API tests, web tests, Chromium Playwright tests, and builds. Exact-SHA Vercel Web status was success; API status was failure with “Deployment rate limited — retry in 24 hours” ([checks for 6d8f19b](https://github.com/arunkumar0398/customer-support-platform/commit/6d8f19bcca5d03c0ae9dc42ced379928bd818ac1/checks)). The API result is a provider build-quota status, not an application build failure.

**Application source:** `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; Actions [run #74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) passed on that exact source SHA, and its Vercel Web/API checks succeeded. The docs-only commits `85ae41ebf76fea8e1a919f309de8c1a6a1195518` / run #90 and `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1` / run #91 do not alter application source; statuses remain attached only to their actual SHAs. At `85ae41ebf76fea8e1a919f309de8c1a6a1195518`, Actions #90 passed and both Vercel contexts reported the same 24-hour build-rate limit. Docs snapshot `87fc082059f2cd3c2c0bdedb4ac2b58cce125b75` / Actions #87 also passed with successful Web/API statuses.

**Assessment deliverables:** The eight required items and evidence paths are in [assessment deliverables inventory](https://github.com/arunkumar0398/customer-support-platform/blob/codex/clean-candidate-b2fd369/evidence/checkpoints/DELIVERABLES_INVENTORY.md). The private GitHub repository exists, but evaluator access is unverified; the owner must grant the evaluator access or provide an approved private handoff. Do not make the repository public without authorization. Architecture, data-model, API, testing, and limitations documents have been reconciled to the implementation/evidence in this documentation update.

**Open gates:** Preview role journeys, same-tenant-other-customer and foreign-tenant denials with before/after state remain **BLOCKED / NOT_RUN** pending owner-confirmed Neon Preview compute readiness, synthetic role credentials, and a verified second-tenant ticket. The full bounded security audit remains **BLOCKED / NOT_RUN**: no compatible preinstalled Linux test toolchain is available in the compliant sandbox. Run-6 is only six isolated throttle-helper tests (scope/limits detailed in [testing document](https://github.com/arunkumar0398/customer-support-platform/blob/codex/clean-candidate-b2fd369/docs/testing.md)); it does not establish route, database, distributed, or deployed behavior. A fresh read-only G7 follow-up reviewed exact snapshot `6d8f19b…` while Actions #91 was running and returned **BLOCKED**. Actions #91 later passed, but Preview and full-audit gaps remain, so G7 remains **BLOCKED**. Keep merge/submission on hold. Deployment URL is optional under the assessment; no plan upgrade is needed.

The local worktree `b2fd3691fe01f81a1652f29ab7ef67d615c0051f` on `codex/vercel-api-route-preview` remains dirty and separate, including ten modified TK-29 screenshots. Remote CI evidence does not validate that dirty checkout.

This is a documentation-only descendant of `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1`; its Actions/Vercel statuses must be checked against its own resulting SHA and are not inherited from run #91.

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
