# Testing and CI evidence

## Reproducible local commands

Use Node 24, npm 11, Docker Compose, and Chromium for browser tests. The following commands are instructions for a fresh local test environment, not evidence that they ran in this documentation update:

```powershell
npm ci
docker compose up -d --wait database
npm run db:migrate
npm run db:seed
npm run db:verify-test
npm run db:migrate:test
npm run check
npm run test:e2e
```

`npm run check` runs lint, typecheck, API tests, web tests, Playwright test discovery (`--list`), and builds. It does not execute Playwright journeys. `npm run test:e2e` executes those journeys. Database tests must use the verified, disposable loopback `support_test` identity; demo seed writes only to local `support_dev`.

## Exact recorded CI evidence

Latest docs-status candidate `158ddaeffd7d3e61dbc49ea79e43d7300ee10ace`: Actions [run #103](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41271082015), job `verify`, passed on this exact SHA. Exact-SHA Vercel Web/API status markers are `success` but descriptions say “Canceled by Ignored Build Step” ([Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/2NZyS4P8vduobBhykz9XS6znFc1n), [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/FYiiK13ySmjZAxSFeVk1yQ9bandM)); no deployment or runtime smoke is represented. Application implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` / #74. Exact-candidate G7 returned **BLOCKED_BY_ENVIRONMENT** ([report](../evidence/reviews/g7-158ddae-2026-11-01.md)); it predates this documentation reconciliation.

Reviewed docs-status candidate `24f1d953ef487a42928ccc21923bf0dc3cca1dd7`: Actions [run #102](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41266004499), job `verify`, completed successfully on exact SHA. Its exact-SHA Vercel Web/API contexts have state `success`, but both say “Canceled by Ignored Build Step” ([Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/12cGveiUEoWfMTcJpG1vJgCuQhxv), [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/D9s39ckLkPfCwF8zpbSfRHPqgVS3)); neither indicates a deploy or runtime smoke. Previous docs candidate `cd0b04ff830a187d45fd3370db97a22c2adba476` / #101 reported provider deployment completion only. The independent exact-head G7 review of 24f1d95 returned **BLOCKED_BY_ENVIRONMENT**; see [review report](../evidence/reviews/g7-24f1d95-2026-11-01.md).

Latest test-bearing candidate `e78b19c6d6aa2e02876e8444aa42413fa4159428`: Actions [run #97](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41264291754), `verify`, completed successfully on that exact SHA. Its Vercel Web/API statuses say success but “Canceled by Ignored Build Step,” not deployment validation. Application implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; #96 on `224771c…` had provider build-quota failures.

Historical candidate `acf01641263275507f4b781bc980cf9e810c9e49`, Actions [run #95](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41226730675), job `verify` passed. Exact-SHA Vercel Web and API statuses both succeeded ([checks](https://github.com/arunkumar0398/customer-support-platform/commit/acf01641263275507f4b781bc980cf9e810c9e49/checks)). Runs #90–#95 remain historical SHA-specific records.

The CI workflow `.github/workflows/ci.yml` creates fresh synthetic credentials, starts disposable PostgreSQL, installs the lockfile with `npm ci`, applies migrations and seed, then runs the sanitizer regression test, lint, typecheck, API tests, web tests, installs Chromium in CI, executes Playwright, and builds API/web. The passing runs below are exact-SHA evidence; docs-only runs do not create a new application-source SHA.

| Run | Exact SHA | Result and scope |
|---|---|---|
| [Actions #74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) | `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` application source | `verify` passed. This is the source SHA with recorded successful Vercel Web/API checks. |
| [Actions #90](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41220472826) | `85ae41ebf76fea8e1a919f309de8c1a6a1195518` docs-only | `verify` passed. Vercel Web/API statuses on that SHA were both provider quota failures. |
| [Actions #91](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41222046884) | `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1` docs-only | `verify` passed. Vercel Web succeeded; API status was a 24-hour provider build-rate-limit failure. |
| [Actions #92](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41223260270) | `baa72999f558c6b2f97f4990c8bacc21e4d0bf83` docs-only | `verify` passed. Vercel Web succeeded; API status was a 24-hour provider build-rate-limit failure. |
| [Actions #93](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41223604705) | `73182951dcc15b22096e6c52088c392626b6c9c8` docs-only | `verify` passed. Both Vercel Web/API statuses were provider build-rate-limit failures. |
| [Actions #94](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41223707522) | `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` docs-only baseline | `verify` passed. Both exact-SHA Vercel Web/API statuses were provider build-rate-limit failures. |
| [Actions #95](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41226730675) | `acf01641263275507f4b781bc980cf9e810c9e49` docs + test-only assignment regression | `verify` passed on the exact candidate. Exact-SHA Vercel Web and API checks both report success. |
| [Actions #96](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41227346950) | `224771c1515c8f39a425e5ef060eb39e0d534a04` docs/test evidence update | `verify` passed. Exact-SHA Vercel Web/API statuses were provider build-quota failures, not application failures. |
| [Actions #97](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41264291754) | `e78b19c6d6aa2e02876e8444aa42413fa4159428` seeded-account E2E and status reconciliation | `verify` passed. Vercel Web/API statuses report success but state “Canceled by Ignored Build Step”; neither app was rebuilt/deployed. |
| [Actions #98](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41264657349) | `3fde220d2586cbd67935b75019e7347cf79a3a47` docs-only status reconciliation | `verify` passed on exact SHA. Vercel Web/API statuses both say “Deployment has completed”; no runtime/database/role smoke was run. |
| [Actions #99](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41265049008) | `d30a24b771dc32a3b80ceffa14a15b60ea15ca69` docs-only reconciliation and G7 status | `verify` passed on exact SHA. Vercel Web/API statuses both say “Deployment has completed”; no runtime/database/role smoke was run. |
| [Actions #100](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41265310841) | `7ec417024dbaaf4884c0f8eaba4758deafdcc01f` docs-only status reconciliation | `verify` passed on exact SHA. Vercel Web/API statuses both say “Deployment has completed”; no runtime/database/role smoke was run. |
| [Actions #101](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41265666286) | `cd0b04ff830a187d45fd3370db97a22c2adba476` docs-only status reconciliation | `verify` passed on exact SHA. Vercel Web/API statuses both say “Deployment has completed”; no runtime/database/role smoke was run. |
| [Actions #102](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41266004499) | `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` docs-only reconciliation and independent G7 status | `verify` passed on exact SHA. Vercel Web/API status markers are `success` with “Canceled by Ignored Build Step” descriptions; neither is a deployment. |
| [Actions #103](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41271082015) | `158ddaeffd7d3e61dbc49ea79e43d7300ee10ace` docs-only Preview readiness and release-evidence reconciliation | `verify` passed on exact SHA. Vercel Web/API status markers are `success` with “Canceled by Ignored Build Step” descriptions; neither is a deployment or runtime test. |

The reviewed application implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; subsequent docs/test snapshots do not change that source lineage. #95 passed exact-SHA CI and Vercel checks. #96 passed exact-SHA CI; its Web/API statuses were provider quota failures. #97 and #102 passed exact-SHA CI, while their Web/API builds were skipped by the ignored-build step. #101 was the latest prior candidate with provider deployment-completed statuses, without runtime smoke.

## Local acceptance evidence (2026-10-31)

Source implementation SHA: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; the candidate adds a test-only assignment rollback regression case. Environment: Windows, Node 24.22.1/npm 11.19.1, Vitest 5.0.5, Playwright 1.64.1, disposable PostgreSQL 18.6 bound to loopback port 5544. `npm run db:verify-test` exit 0 confirmed identity `support_test / support_test`.

- Focused auth/tenant/ticket/dashboard API suites: `npm run test:api -- tests/auth/auth.test.ts tests/auth/policy.test.ts tests/tickets/detail.test.ts tests/tickets/assignment.test.ts tests/tickets/comments.test.ts tests/tickets/update.test.ts tests/tickets/create.test.ts tests/tickets/list.test.ts tests/dashboard/dashboard.test.ts` — exit 0; 9 files, 221/221 tests.
- Full local browser suite: `npm run test:e2e` — exit 0; 23/23 tests.
- Full source worktree check: `npm run check` — exit 0; API 391/391, Web 12/12, Playwright discovery 23, lint/typecheck/build passed.
- Candidate assignment rollback test: `npm run test:api -- tests/tickets/assignment.test.ts` — exit 0; 14/14. A disposable PostgreSQL trigger rejected the fixture `ASSIGNMENT_CHANGED` insert; the API response was sanitized, ticket assignee/version and event count did not change, and after trigger removal an assignment succeeded. Full check with the regression test passed: API 392/392, Web 12/12, Playwright discovery 23, lint/typecheck/build passed.

These are local disposable-DB/browser results, not GitHub Actions results; no Preview or Production database was used. They do not complete the full responsive/state matrix. The separate seeded-account sign-in result below closes the local A25 criterion.

### Seeded demo-account sign-in (A25)

At exact candidate `e78b19c6d6aa2e02876e8444aa42413fa4159428`, `npm run test:e2e` exited 0 with 23/23 browser tests passed. The auth fixture first verified `current_database() = support_test` and `current_user = support_test`, then ran the repository's synthetic seed helper against that disposable database. The existing server-session journey signed in as `admin.alpha@example.test` using the documented synthetic demo password, reloaded with the session intact, and signed out. The run used the local Compose test database on loopback port 5546; no hosted data was accessed. This closes the local A25 seed/sign-in criterion, not Preview account acceptance or the broader A22/A23 route/viewport matrix. Hosted Actions #97 on the same SHA also passed its full verify job.

## Security and acceptance work not run

### Preview readiness (2026-11-01)

Neon Preview compute recovery and one read-only discovery query are reported PASS: branch production, endpoint ep-shy-surf-b36pzssx, SELECT 1 returned 1, and the query returned 15 active synthetic memberships plus 15 synthetic tickets across two organizations. Observation was 2026-11-01 09:11 IST / 03:41 UTC. Vercel Web/API Preview deployments on app source a5673cbcee3c6b30178404c80c1eb1bf56f963a were Ready; API health/readiness and Web-proxied API health returned healthy JSON. The API runtime's exact Neon branch alignment is not verified.

A35 preconditions are READY, but authenticated Preview role/tenant acceptance remains BLOCKED / NOT_RUN because safe short-lived synthetic passwords are unavailable. No local shared seed password was tried in Preview. No migrations, seeding, Production checks, or role mutations were performed. See [sanitized readiness record](../evidence/checkpoints/PREVIEW-READINESS-2026-11-01.md).

- The external Cloudflare run-6 report records 6/6 Node built-in tests of the extracted login-throttle helper: 5/6 account attempts, 20/21 IP attempts, 15-minute expiry, a 4,096-entry map bound, forwarding-header non-influence on the supplied `req.ip`, and independent helper instances. It does **not** exercise the Express route/order, PostgreSQL, cross-process sharing, Vercel runtime, or deployed behavior. Its full report/output are outside this repo at `C:\Users\sivaa\security-audit-skill\customer-support-platform\run-6`.
- No full Cloudflare audit ran in this update. The dedicated audit image is Node 24 only; the available Vitest/Supertest/Playwright/Prisma dependencies are host Windows-built modules and are not a compatible preinstalled Linux test toolchain. Per the audit skill, no dependency was installed/fetched and no deployed endpoint was probed. Run-6 remains helper-only evidence.
- Follow-up toolchain probe used read-only, no-network Docker invocations: `csp-audit-run4-sanitizer:local` has Node v24.22.1 but no `/target/node_modules`; `csp-candidate-7c2fdba-api:latest` reports no top-level Vitest/Supertest/Playwright/axe packages; `csp-candidate-7c2fdba-web:latest` contains no Node runtime. These checks identify no compatible preinstalled Linux target-test environment; the audit remains blocked and no package was installed or fetched.
- Preview agent/customer journeys, cross-tenant and same-tenant-other-customer denials, and before/after ticket/comment/activity checks remain **BLOCKED / NOT_RUN** because safe synthetic role credentials are unavailable. Neon compute recovery and read-only fixture discovery are reported PASS; Preview health requests ran, but no authenticated role requests or data mutations occurred.
- A22/A23 full route × role × viewport × state matrix and full A37 accessibility review remain **NOT_RUN**; scoped UI evidence and its limits are recorded in [the UI matrix](../evidence/checkpoints/UI_A22_A23_MATRIX_2026-11-01.md). The full browser suite and focused Tab/focus test passed locally on docs worktree HEAD `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` against disposable `support_test`: `npm run test:e2e` exit 0, 23/23; focused `npm run test:e2e -- --grep=requires` exit 0, 1/1.
- A36 local recovery rehearsal and pre-fix code compatibility passed; see [A36 evidence](../evidence/checkpoints/A36-migration-recovery-2026-11-01.md). This is backup restore/forward verification, not a SQL down migration or hosted PITR test.
- Historical status records and their SHA-specific Actions/Vercel outcomes are retained above. Deployment remains optional; neither ignored-build cancellations nor provider completion statuses are functional smoke evidence, and no deployment retry is needed for the assessment.

No Production requests/writes or deployed throttle probes are part of the evidence above. Preview checks were read-only health/readiness and fixture discovery; database writes occurred only in the verified disposable loopback test database.
