# Multi-Tenant Customer Support Platform


## Release and validation status — 2026-11-01

**Prior docs-status candidate:** `33fdf49a30aee3b67dfac852ba7850f0549d9518`; Actions [run #104](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41271376080) passed `verify` on that exact SHA. Vercel Web/API provider descriptions were “Deployment has completed,” which is provider completion only, not runtime/database/role evidence. G7 on this exact candidate returned **BLOCKED_BY_ENVIRONMENT**; see [report](evidence/reviews/g7-33fdf49-2026-11-01.md). The next docs candidate reconciles that verdict and report.

**Reviewed docs-status candidate:** `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` on `codex/clean-candidate-b2fd369`; GitHub Actions [run #102](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41266004499), job `verify`, completed successfully on that exact SHA. The exact-SHA Vercel Web and API status markers are `success`, but both provider descriptions say “Canceled by Ignored Build Step” ([Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/12cGveiUEoWfMTcJpG1vJgCuQhxv), [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/D9s39ckLkPfCwF8zpbSfRHPqgVS3)); neither is a deployment or runtime check. The independent G7 review of this exact SHA returned **BLOCKED_BY_ENVIRONMENT**; see [the sanitized report](evidence/reviews/g7-24f1d95-2026-11-01.md).

**Latest test-bearing candidate:** `e78b19c6d6aa2e02876e8444aa42413fa4159428`; Actions [run #97](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41264291754), job `verify`, passed on that exact SHA. Its Vercel Web/API contexts said “Canceled by Ignored Build Step,” not deployment validation. Application implementation remains source `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` / Actions #74. Run #96 is historical on `224771c…`, with provider build-quota failures.

Historical prior candidate `acf01641263275507f4b781bc980cf9e810c9e49`; Actions #95 `verify` and exact-SHA Vercel Web/API checks succeeded. It contains documentation plus a test-only assignment-rollback regression; implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Baseline `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` / #94 had Vercel provider quota statuses.

**Historical validated candidate:** `acf01641263275507f4b781bc980cf9e810c9e49` on `codex/clean-candidate-b2fd369`. GitHub Actions [run #95](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41226730675) completed successfully on that exact SHA; job `verify` passed, including disposable PostgreSQL setup, migrations/seed, required gates, and builds. Exact-SHA Vercel Web/API checks succeeded. Run #95 validates the docs and assignment-rollback regression at that SHA; application implementation remains the distinct source SHA below. Later exact-SHA results are listed in [testing evidence](docs/testing.md).

**Application source:** `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; Actions [run #74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) passed on that exact source SHA, and its Vercel Web/API checks succeeded. The intervening documentation snapshots `85ae41e` / #90, `6d8f19b` / #91, `baa7299` / #92, and `7318295` / #93 are historical, SHA-specific records; none changes application source. See [testing evidence](docs/testing.md) for each run and its provider status.

**Assessment deliverables:** The eight required items and evidence paths are in [assessment deliverables inventory](evidence/checkpoints/DELIVERABLES_INVENTORY.md); the detailed review is [here](evidence/checkpoints/ASSESSMENT_DELIVERY_REVIEW_2026-10-31.md). The private GitHub repository exists, but evaluator access is unverified; the owner must grant the evaluator access or provide an approved private handoff. Do not make the repository public without authorization. Architecture, data-model, API, testing, and limitations documents were checked against the implementation and evidence.

**Open gates:** Preview role journeys and same-tenant-other-customer/foreign-tenant denials remain **BLOCKED / NOT_RUN** pending owner-confirmed Neon Preview compute, synthetic role credentials, and verified same/foreign-tenant fixtures. The Cloudflare security audit remains incomplete; run-6 covers only the extracted throttle helper and the current sandbox does not provide a compatible preinstalled Linux application-test toolchain. Evaluator access to the private repository is unverified. A22/A23 route-role-viewport-state coverage, full A37 accessibility, and A28 human rehearsal remain open. A36 now has local restore/recovery and previous-code compatibility evidence, but no SQL down migration or hosted PITR test. G7 on exact SHA `24f1d95…` returned **BLOCKED_BY_ENVIRONMENT**. Keep merge/submission on hold. Deployment URL is optional under the assessment; no plan upgrade is needed.

The separate implementation worktree `b2fd3691fe01f81a1652f29ab7ef67d615c0051f` on `codex/vercel-api-route-preview` remains dirty, including ten modified TK-29 screenshots. Remote CI evidence does not validate that checkout; the screenshot edits were preserved and not staged.

The docs-status candidate `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` passed Actions #102. This documentation update is a descendant and its own Actions result must be checked separately; no Vercel build retry is needed for docs-only changes.

**Historical implementation snapshot (2026-10-28; superseded by the current acceptance ledger and deployment evidence below):** implementation was in progress. The repository has TypeScript workspaces, local PostgreSQL, a Prisma domain schema, a synthetic two-organization seed, safe API errors, password/session authentication, tenant-scoped membership administration, ticket creation/list/detail/update/assignment/comment/history APIs, and tenant-scoped dashboard metrics. The React sign-in, ticket queue/search/filter/pagination, ticket create/detail, dashboard, and admin membership screens are implemented with browser journeys. Full acceptance coverage remains in progress. At that snapshot, TK-33 Docker work and scoped static/runtime reviews were recorded; later checkpoint and deployment evidence supersede its pending statements.

The employer assessment PDF is the product contract in [`reference/assessment.pdf`](reference/assessment.pdf). The approved design, task plan, acceptance matrix, security contract, and assumptions are under `docs/` and `harness/`.

## Historical implementation checkpoint (2026-10-28; superseded by the validation snapshot above)

- C0 workspace and local database foundation are in place.
- TK-03–TK-22 design/schema/seed/auth/tenant/policy, membership, ticket, dashboard, health, and readiness APIs are closed with scoped evidence. TK-23 adds the sign-in flow and authenticated React shell. TK-24 adds the ticket list, search, filters, paging, and UI states; create/detail/dashboard/admin screens remain pending.
- `api/src/app.ts` exposes health/readiness, authentication, membership, ticket, activity, comment, and dashboard endpoints documented in [`docs/api.md`](docs/api.md). The browser uses a same-origin `/api` proxy in development; authentication stays in the server session cookie.
- A03, A04, A09, A13, A18–A21, and A29 have passed only their recorded API/database scopes. A22/A23 remain `NOT_RUN` as full route × role × viewport × state matrices; see the [local UI matrix](evidence/checkpoints/UI_A22_A23_MATRIX_2026-11-01.md). The full browser suite passed 23/23 on the reviewed source state; the focused keyboard Tab/focus assertion passed, while a route-wide accessibility audit remains open. `npm run check` runs unit/database tests, lint, typecheck, test discovery, and builds; `npm run test:e2e` executes the browser suite.

## Preview readiness — 2026-11-01

Neon Preview compute recovery and one read-only fixture discovery are reported PASS: branch production, endpoint ep-shy-surf-b36pzssx, 15 active synthetic memberships and 15 tickets. Preview Web/API health checks passed on app source a5673cbcee3c6b30178404c80c1eb1bf56f963a4; exact API-to-Neon branch alignment is unverified. A35 preconditions are ready, but authenticated A35 remains BLOCKED / NOT_RUN because safe Preview passwords are unavailable. No migrations/seeding or Production checks were run. [Details](evidence/checkpoints/PREVIEW-READINESS-2026-11-01.md).

A36 passes the scoped local restore/forward-recovery and previous-code criterion; SQL down-migration and hosted PITR remain untested. A22/A23/A37 are partial, not full passes.

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

The eight Alpha/Beta synthetic accounts cover admin, agent, and customer roles. Their shared demo password and fixtures are documented in [`docs/demo-accounts.md`](docs/demo-accounts.md). The browser suite verifies the `support_test` identity before seeding its disposable database, then signs in with the synthetic Alpha admin and checks session persistence/sign-out. This proves the local seed/sign-in path only; it does not cover Preview/Production accounts or the full A22/A23 route, state, and responsive matrix.

## Checks

```powershell
npm run check
py -3 scripts/check-doc-contract.py
```

`npm run check` runs lint, typecheck, API and web tests, Playwright test listing, and API/web builds. The listing is discovery only; run `npm run test:e2e` to execute browser journeys against the guarded local test database.

## Deployment status

A deployment URL is optional under the employer assessment. The chosen hosted topology is Vercel for the web and Express API, with Neon PostgreSQL; see [the deployment contract](harness/VERCEL_NEON_DEPLOYMENT.md). Results are SHA-specific: source `3e613c0…` has recorded Web/API success; docs candidate `cd0b04f…` / #101 had provider “Deployment has completed” statuses; docs candidate `24f1d95…` / #102 has Web/API statuses marked success with “Canceled by Ignored Build Step” descriptions. These are not application failures or runtime evidence. Do not upgrade a plan or retry Vercel builds solely for this optional assessment item.
