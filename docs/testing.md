# Testing and CI evidence

## Current default assessment recheck — 2026-11-02

Exact live default `codex/assessment-mvp` SHA: `19246132f22bd0e37b6a6a0b9286bb1621d3bad1`. Actions [#130](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826), job `verify`, passed on this SHA. Exact-SHA Vercel Web/API contexts reported provider success; they are not application tests. Read-only Production API GETs to `/api/health` and `/api/health/ready` returned `ok` and `ready`; no user flows or writes ran.

On a separate clean worktree, host and Linux-container `npm ping --registry=https://registry.npmjs.org/` succeeded. The first Compose build’s retained BuildKit logs show API and Web both reset during `RUN npm ci` after 156.1 seconds. With no persistent DNS/proxy fault found and registry pings succeeding on both paths, one retry was run on the unchanged SHA. `docker compose -p csp-assess-current-1924613 up -d --build --wait api web` exited 0; both images built, API and Web containers reported `healthy`, the API readiness endpoint returned HTTP 200 from inside the API container, and the Web root returned HTTP 200 on loopback. The local PostgreSQL container became healthy, `npm run db:migrate` applied all three migrations, and `npm run db:seed` applied synthetic fixtures before the app build. The unique project, volume, images, and local `.env` were removed after verification. See the [detailed recheck report](../evidence/reviews/assessment-readiness-19246132-2026-11-02.md).

The lockfile audit showed 10 moderate npm entries, all dev-only, with zero findings from `npm audit --omit=dev --json --package-lock-only`. The shared underlying package is `minimatch@10.2.6`; no dependencies were changed. The previous clean-checkout `npm run check` (API 431/431, Web 17/17, lint/typecheck/build), Playwright 47/47, and disposable test-database migration results are reused because the live default remains the same SHA. They were not rerun.

## Run 22 bounded offline continuation — 2026-11-02

Exact source `080d883029e6e68619c34e8dc4d055d03b4dcbb7`, tree `75094b514a6d404765b45625de542aeb4d11a476`: `api-provisioning-file` passed **21/21** and the API lane passed **425/425 across 28 files**, both exit 0 in the pinned no-network Linux image. Promoted logs, launch records, source binding, hashes, limitations, and the API assertion map are in [the continuation report](../evidence/reviews/audit-continuation-2026-11-02-080d883.md). This is local exact-source evidence, not GitHub CI and not a complete Cloudflare audit.

The five throttle tests in that API lane confirm local map-capacity/expiry behavior; an independent focused verifier found no vulnerability established by this fail-closed policy. Vercel multi-instance behavior remains unknown. The follow-up worker-cap edit changes only the offline runner (`all` API to one worker; Web remains two); its focused host regression passed 1/1, but the pinned Linux `all` lane has not been rerun after that edit. Current run-22 output does not validate the uncommitted runner edit.

Preview compute is currently active, but A35 was not run. The refreshed [Preview execution package](../evidence/checkpoints/PREVIEW-EXECUTION-APPROVAL-2026-11-02.md) records a Web `API_ORIGIN` destination mismatch and unverified API-to-Neon runtime binding. No fixture write or authenticated Preview request occurred.

## Current local UI follow-up — 2026-11-01

In the isolated UI worktree, `npm run check` exited 0: lint, API/Web type checks, API 392/392, Web 12/12, 45 E2E tests discovered, and API/Web builds passed. `npm run test:e2e` exited 0 with 45/45 passing (54.0 seconds). See [rendered Hallmark measurements and screenshots](../evidence/reviews/hallmark-followup-2026-11-01/REPORT.md). This is uncommitted local evidence layered on the prior candidate; it is not exact-SHA CI and does not supersede any previously recorded Actions run.

After the browser run, all 12 tracked `evidence/checkpoints/screenshots/TK-29/` images were restored from a pre-run copy. The final worktree check must confirm those paths are unchanged. Preview authorization and the Cloudflare audit were not run.

## Verified candidate evidence — 2026-11-01

- Candidate 070bf718e6a43a45d699e3b3c065b442c0db7c41 passed exact-SHA Actions [#114](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41287273871), job verify. Vercel API/Web contexts on that SHA are provider success only ([API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/D525b3nS1FtwDekEpjEg7H2Tdmd), [Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/DmgWseASV1CF62DJMg5qKM7Ze6Kk)).
- Source provenance is 24f51c05328fc764bf7089fce8f398adad475648 / #105; 3e613c0b7df5bec290553cfb7b5a9404bfaec1a1 / #74 is historical.
- Follow-up aac66e4da3b3a52b99b6f6021601245c4f405584 passed exact-SHA Actions [#115](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41289821533), job verify. Its local check and 36/36 Playwright results are distinct local evidence.
- The current local tree, with the agent membership-route denial test, passes npm run check (API 392/392, Web 12/12, typecheck/lint, 37 E2E discovered, builds) and npm run test:e2e 37/37. This local run includes changes beyond aac66e4 and is not covered by #115.
- The 12 tracked checkpoint PNGs were restored and compared byte-for-byte after browser runs.
- Hallmark rendered audit is report-only and limited to sign-in at five widths; see [report](../evidence/reviews/hallmark-2026-11-01.md). It does not close A22/A23/A37. A35 and full offline Cloudflare audit remain BLOCKED / NOT_RUN.

For the full command history and prior SHA-specific runs below, treat all named commits and CI as historical evidence at their stated scope. The candidate’s own Actions run must be recorded separately after commit; do not attribute #113 to it.


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

**Latest docs/evidence candidate:** `cd6e64cd9ed9e61e40f90306a3b4a40d86f9be67`, Actions [#111](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41278121491), job `verify`, passed on the exact SHA. Exact-SHA Vercel API/Web descriptions were “Deployment has completed” ([API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/FjVzSZ8M83TKnHQFCAB889HZhVdL), [Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/D7BPX7yTaxfpDKFFoGAjhYFqx33o)); these provider results do not prove runtime behavior. The tested browser changes are on c179180 / #107, and application implementation remains 24f51c0 / #105. G7 results must be read against their named SHA.

## Local narrow-create acceptance follow-up

On a local worktree based on `cd6e64c`, `npm run db:verify-test` verified `support_test / support_test`. The narrow viewport run (`npm run test:e2e -- --grep=narrow`) passed 4/4; the complete browser suite passed 30/30; and `npm run check` passed with API 392/392, Web 12/12, lint, typecheck, 30 browser tests discovered, and both builds. This adds staff/admin create-form evidence at 375px; it does not complete A22/A23/A37. The new test and evidence change are in the current local candidate and still need exact-SHA CI.

**Latest application-test candidate:** `c179180a56977cda6fe084786989ae6098afe995`, Actions [#107](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41274734553), `verify` passed on the exact SHA with the disposable database and required gates. It adds E2E assertions only; application implementation remains `24f51c05328fc764bf7089fce8f398adad475648` / #105. Exact-SHA Vercel API and Web status contexts returned `success` (API [check](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/7y7Rd9UXf1gX624wgzhhaMjq8d9S), Web [check](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/CBYdHnBPY2iYT2HcDCmRavTSVqPn)); these provider results are not authenticated runtime acceptance. The implementation baseline `3e613c0…` / #74 is historical.

Fresh independent G7 review of `c179180a56977cda6fe084786989ae6098afe995` returned `BLOCKED_BY_ENVIRONMENT`; see [the review report](../evidence/reviews/g7-c179180-2026-11-01.md). Do not infer release readiness from green CI or provider status contexts.

The focused G7 follow-up on docs/evidence head `4b404f77a65bc4bb0251f218a75832a12fae090d` also returned `BLOCKED_BY_ENVIRONMENT`; see [the exact-head report](../evidence/reviews/g7-4b404f7-2026-11-01.md). It identified stale docs-head provenance at review time; the follow-up edits now record #108 separately from #107 and #105.

**Historical docs candidate:** `c30917c021d9414f6b870419097b66d69faa4caa`, Actions #106 passed on exact SHA. Its Web/API records showed Ready and the branch-alias readiness GETs returned `{"status":"ready"}` at approximately 10:03 IST. This was a health smoke only; no authenticated role test or Neon-branch identity was established.

Neon Preview recovery was freshly confirmed at 10:08 IST / 04:38 UTC: project `customer-support-platform-preview`, branch `production`, database `neondb`, endpoint `ep-shy-surf-b36pzssx` showed ACTIVE. A read-only `SELECT 1` at 10:07 IST returned 1; the Tables view showed the application schema. The prior one-time, read-only fixture discovery at 09:11 IST returned 15 active synthetic memberships and 15 synthetic tickets across two organizations; it was not repeated. This confirms Preview DB availability and fixture presence only, not API runtime branch alignment.

On the c30917-based worktree, keyboard assertions were added to sign-in (Tab order Email → Password → Sign in and visible focus box-shadow), and customer dashboard denial now includes 375px/no-overflow. Targeted checks passed 3/3 and 10/10; the full `npm run test:e2e` passed 29/29 in 32.1s with screenshot output redirected to a temporary folder. `npm run check` exited 0: API 392/392, Web 12/12, lint/typecheck, 29 browser tests discovered, and API/Web builds. These assertions are committed in c179180 and validated by exact-SHA Actions #107. A22/A23/A37 remain partial. The bounded audit could not run because compatible preinstalled Linux runners are absent; see [audit environment note](../evidence/checkpoints/SECURITY-AUDIT-ENVIRONMENT-2026-11-01.md).

**Current application candidate:** `24f51c05328fc764bf7089fce8f398adad475648`, Actions [run #105](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41272626603), `verify` completed successfully on this exact SHA. Vercel Web and API deployment records are [Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/GZwzX4yme3DraJgf32HNFNtWYHyA) and [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/AEp2x3kR68FCA6rsdchApNx8WG8U); both show Preview/Ready on this same commit. Read-only GET `/api/health/ready` against both current Preview aliases returned `{"status":"ready"}` at approximately 09:52 IST. This is a readiness smoke only; the response does not identify the Neon branch, and no authenticated role flow was run. The earlier `3e613c0…` / #74 is a historical implementation baseline, not the latest application candidate.

Prior docs-status candidate `33fdf49a30aee3b67dfac852ba7850f0549d9518`: Actions [run #104](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41271376080), job `verify`, passed on that exact SHA. Vercel Web/API provider descriptions said “Deployment has completed”; this is provider completion only, not runtime, database, or role testing. G7 on that exact candidate returned **BLOCKED_BY_ENVIRONMENT** ([report](../evidence/reviews/g7-33fdf49-2026-11-01.md)); the next docs candidate records the verdict. Preview app source is `a5673cbcee3c6b30178404c80c1eb1bf56f963a4`; historic source-run `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` / #74 remains separate.

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
| [Actions #104](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41271376080) | `33fdf49a30aee3b67dfac852ba7850f0549d9518` docs-only G7 status and release record reconciliation | `verify` passed on exact SHA. Vercel Web/API provider statuses say “Deployment has completed”; no runtime/database/role smoke is represented. |

The earlier application baseline `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` / #74 is historical. Candidate `24f51c05328fc764bf7089fce8f398adad475648` / #105 now contains the later application UI and E2E-test changes. #95 passed exact-SHA CI and Vercel checks. #96 passed exact-SHA CI; its Web/API statuses were provider quota failures. #97 and #102 passed exact-SHA CI, while their Web/API builds were skipped by the ignored-build step. #101 had provider deployment-completed statuses without runtime smoke.

## Local acceptance evidence (2026-10-31)

Source implementation SHA: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; the candidate adds a test-only assignment rollback regression case. Environment: Windows, Node 24.22.1/npm 11.19.1, Vitest 5.0.5, Playwright 1.64.1, disposable PostgreSQL 18.6 bound to loopback port 5544. `npm run db:verify-test` exit 0 confirmed identity `support_test / support_test`.

- Focused auth/tenant/ticket/dashboard API suites: `npm run test:api -- tests/auth/auth.test.ts tests/auth/policy.test.ts tests/tickets/detail.test.ts tests/tickets/assignment.test.ts tests/tickets/comments.test.ts tests/tickets/update.test.ts tests/tickets/create.test.ts tests/tickets/list.test.ts tests/dashboard/dashboard.test.ts` — exit 0; 9 files, 221/221 tests.
- Full local browser suite: `npm run test:e2e` — exit 0; 23/23 tests.
- Full source worktree check: `npm run check` — exit 0; API 391/391, Web 12/12, Playwright discovery 23, lint/typecheck/build passed.
- Candidate assignment rollback test: `npm run test:api -- tests/tickets/assignment.test.ts` — exit 0; 14/14. A disposable PostgreSQL trigger rejected the fixture `ASSIGNMENT_CHANGED` insert; the API response was sanitized, ticket assignee/version and event count did not change, and after trigger removal an assignment succeeded. Full check with the regression test passed: API 392/392, Web 12/12, Playwright discovery 23, lint/typecheck/build passed.

These are local disposable-DB/browser results, not GitHub Actions results; no Preview or Production database was used. They do not complete the full responsive/state matrix. The separate seeded-account sign-in result below closes the local A25 criterion.

### Seeded demo-account sign-in (A25)

At exact candidate `e78b19c6d6aa2e02876e8444aa42413fa4159428`, `npm run test:e2e` exited 0 with 23/23 browser tests passed. The auth fixture first verified `current_database() = support_test` and `current_user = support_test`, then ran the repository's synthetic seed helper against that disposable database. The existing server-session journey signed in as `admin.alpha@example.test` using the documented synthetic demo password, reloaded with the session intact, and signed out. The run used the local Compose test database on loopback port 5546; no hosted data was accessed. This closes the local A25 seed/sign-in criterion, not Preview account acceptance or the broader A22/A23 route/viewport matrix. Hosted Actions #97 on the same SHA also passed its full verify job.

## Exact-candidate UI check — 2026-11-01

At exact candidate `24f51c05328fc764bf7089fce8f398adad475648`, local Windows/Node 24.22.1/npm 11.19.1/Playwright 1.64.1 + Chromium used a fresh disposable PostgreSQL 18.6 `support_test` database bound to loopback port 55432. `npm run check` exited 0 (lint, API/web typecheck, API 392/392, web 12/12, 29 E2E discovered, both builds). `npm run test:e2e` exited 0 with 29/29 passed in 33 seconds. `py -3 scripts/check-doc-contract.py` and `git diff --check` exited 0. Only this disposable database was migrated/seeded. These tests extend but do not complete A22/A23/A37; see [UI matrix](../evidence/checkpoints/UI_A22_A23_MATRIX_2026-11-01.md).

## Security and acceptance work not run

### Preview readiness (2026-11-01)

Neon Preview recovery and one read-only fixture discovery are reported PASS: branch `production`, endpoint `ep-shy-surf-b36pzssx`, `SELECT 1` returned 1, and the query returned 15 active synthetic memberships plus 15 synthetic tickets across two organizations. Observation was 2026-11-01 09:11 IST / 03:41 UTC. The initial Vercel checks on source `a5673cb` are historical; current Web/API Preview deployments are Ready on exact app/test candidate `24f51c0`, and separate read-only readiness GETs to both returned `{"status":"ready"}` around 09:52 IST. The API runtime's exact Neon branch alignment is not verified.

A35 preconditions are READY, but authenticated Preview role/tenant acceptance remains BLOCKED / NOT_RUN because safe short-lived synthetic passwords are unavailable. No local shared seed password was tried in Preview. No migrations, seeding, Production checks, or role mutations were performed. See [sanitized readiness record](../evidence/checkpoints/PREVIEW-READINESS-2026-11-01.md).

- The external Cloudflare run-6 report records 6/6 Node built-in tests of the extracted login-throttle helper: 5/6 account attempts, 20/21 IP attempts, 15-minute expiry, a 4,096-entry map bound, forwarding-header non-influence on the supplied `req.ip`, and independent helper instances. It does **not** exercise the Express route/order, PostgreSQL, cross-process sharing, Vercel runtime, or deployed behavior. Its full report/output are outside this repo at `C:\Users\sivaa\security-audit-skill\customer-support-platform\run-6`.
- No full Cloudflare audit ran in this update. The dedicated audit image is Node 24 only; the available Vitest/Supertest/Playwright/Prisma dependencies are host Windows-built modules and are not a compatible preinstalled Linux test toolchain. Per the audit skill, no dependency was installed/fetched and no deployed endpoint was probed. Run-6 remains helper-only evidence.
- Follow-up toolchain probe used read-only, no-network Docker invocations: `csp-audit-run4-sanitizer:local` has Node v24.22.1 but no `/target/node_modules`; `csp-candidate-7c2fdba-api:latest` reports no top-level Vitest/Supertest/Playwright/axe packages; `csp-candidate-7c2fdba-web:latest` contains no Node runtime. These checks identify no compatible preinstalled Linux target-test environment; the audit remains blocked and no package was installed or fetched.
- Preview agent/customer journeys, cross-tenant and same-tenant-other-customer denials, and before/after ticket/comment/activity checks remain **BLOCKED / NOT_RUN** because safe synthetic role credentials are unavailable. Neon compute recovery and read-only fixture discovery are reported PASS; Preview health requests ran, but no authenticated role requests or data mutations occurred.
- A22/A23 full route × role × viewport × state matrix and full A37 accessibility review remain **NOT_RUN**; scoped UI evidence and its limits are recorded in [the UI matrix](../evidence/checkpoints/UI_A22_A23_MATRIX_2026-11-01.md). The full browser suite and focused Tab/focus test passed locally on docs worktree HEAD `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` against disposable `support_test`: `npm run test:e2e` exit 0, 23/23; focused `npm run test:e2e -- --grep=requires` exit 0, 1/1.
- A36 local recovery rehearsal and pre-fix code compatibility passed; see [A36 evidence](../evidence/checkpoints/A36-migration-recovery-2026-11-01.md). This is backup restore/forward verification, not a SQL down migration or hosted PITR test.
- Historical status records and their SHA-specific Actions/Vercel outcomes are retained above. Deployment remains optional; neither ignored-build cancellations nor provider completion statuses are functional smoke evidence, and no deployment retry is needed for the assessment.

No Production requests/writes or deployed throttle probes are part of the evidence above. Preview checks were read-only health/readiness and fixture discovery; database writes occurred only in the verified disposable loopback test database.
