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

Current docs-status baseline `3fde220d2586cbd67935b75019e7347cf79a3a47`: Actions [run #98](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41264657349), job `verify`, completed successfully on the exact SHA. Exact-SHA Vercel Web and API statuses say “Deployment has completed” ([Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/Gvw7CGG6Fm4dSp8kPJ9tikr9pbfq), [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/Ec4ZqY2BD864kcvbTGm5fCDkj8rx)). These confirm provider deployment completion only; no application runtime, database, or role-flow smoke was run.

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

The reviewed application implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; #90–#97 are later docs/test snapshots and do not change that source lineage. #95 passed exact-SHA CI and Vercel checks. #96 passed exact-SHA CI; its Web/API statuses were provider quota failures. #97 passed exact-SHA CI, while its Web/API builds were skipped by the ignored-build step.

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

- The external Cloudflare run-6 report records 6/6 Node built-in tests of the extracted login-throttle helper: 5/6 account attempts, 20/21 IP attempts, 15-minute expiry, a 4,096-entry map bound, forwarding-header non-influence on the supplied `req.ip`, and independent helper instances. It does **not** exercise the Express route/order, PostgreSQL, cross-process sharing, Vercel runtime, or deployed behavior. Its full report/output are outside this repo at `C:\Users\sivaa\security-audit-skill\customer-support-platform\run-6`.
- No new full security audit ran here. The compliant sandbox has a local Docker engine and Node 24 image, but the available Linux audit image has no preinstalled Vitest, Supertest, Playwright, or Prisma runner. The WSL Ubuntu/Kali environments also have no Node/npm test toolchain. Host `node_modules` is Windows-built and not a compatible preinstalled Linux test toolchain. Per the audit skill, no dependency was installed/fetched and target tests were not run in an unsuitable environment.
- Preview agent/customer journeys, cross-tenant and same-tenant-other-customer denials, and before/after ticket/comment/activity checks remain **BLOCKED / NOT_RUN**. They require Neon owner-confirmed compute readiness, safe synthetic role credentials, and a verified second-tenant fixture.
- SQL migration reversal is **NOT_RUN**. Existing code rollback/schema-compatibility evidence must not be described as an actual down-migration test.
- Historical status records and their SHA-specific Actions/Vercel outcomes are retained above. The latest test-bearing candidate is e78b19c / Actions #97; docs-status baseline 3fde220 / Actions #98 also passed. Deployment remains optional; provider completion statuses on 3fde220 are not functional smoke evidence and no deployment retry is needed for the assessment.

No Production or Preview requests/writes, or deployed throttle probes, are part of the evidence above. Database writes occurred only in the verified disposable loopback test database.
