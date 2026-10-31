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

The CI workflow `.github/workflows/ci.yml` creates fresh synthetic credentials, starts disposable PostgreSQL, installs the lockfile with `npm ci`, applies migrations and seed, then runs the sanitizer regression test, lint, typecheck, API tests, web tests, installs Chromium in CI, executes Playwright, and builds API/web. The passing runs below are exact-SHA evidence; docs-only runs do not create a new application-source SHA.

| Run | Exact SHA | Result and scope |
|---|---|---|
| [Actions #74](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41202806223) | `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` application source | `verify` passed. This is the source SHA with recorded successful Vercel Web/API checks. |
| [Actions #90](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41220472826) | `85ae41ebf76fea8e1a919f309de8c1a6a1195518` docs-only | `verify` passed. Vercel Web/API statuses on that SHA were both provider quota failures. |
| [Actions #91](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41222046884) | `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1` docs-only | `verify` passed. Vercel Web succeeded; API status was a 24-hour provider build-rate-limit failure. |
| [Actions #92](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41223260270) | `baa72999f558c6b2f97f4990c8bacc21e4d0bf83` docs-only | `verify` passed. Vercel Web succeeded; API status was a 24-hour provider build-rate-limit failure. |
| [Actions #93](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41223604705) | `73182951dcc15b22096e6c52088c392626b6c9c8` docs-only | `verify` passed. Both Vercel Web/API statuses were provider build-rate-limit failures. |
| [Actions #94](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41223707522) | `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` docs-only | `verify` passed. Both exact-SHA Vercel Web/API statuses were provider build-rate-limit failures. |

The reviewed application implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; #90–#94 are later documentation snapshots and their results do not change that source lineage. #94 succeeded on the exact docs candidate. The two Vercel quota contexts on #93 and #94 are provider statuses, not application build failures.

## Local acceptance evidence (2026-10-31)

Source implementation SHA: `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; the candidate adds a test-only assignment rollback regression case. Environment: Windows, Node 24.22.1/npm 11.19.1, Vitest 5.0.5, Playwright 1.64.1, disposable PostgreSQL 18.6 bound to loopback port 5544. `npm run db:verify-test` exit 0 confirmed identity `support_test / support_test`.

- Focused auth/tenant/ticket/dashboard API suites: `npm run test:api -- tests/auth/auth.test.ts tests/auth/policy.test.ts tests/tickets/detail.test.ts tests/tickets/assignment.test.ts tests/tickets/comments.test.ts tests/tickets/update.test.ts tests/tickets/create.test.ts tests/tickets/list.test.ts tests/dashboard/dashboard.test.ts` — exit 0; 9 files, 221/221 tests.
- Full local browser suite: `npm run test:e2e` — exit 0; 23/23 tests.
- Full source worktree check: `npm run check` — exit 0; API 391/391, Web 12/12, Playwright discovery 23, lint/typecheck/build passed.
- Candidate assignment rollback test: `npm run test:api -- tests/tickets/assignment.test.ts` — exit 0; 14/14. A disposable PostgreSQL trigger rejected the fixture `ASSIGNMENT_CHANGED` insert; the API response was sanitized, ticket assignee/version and event count did not change, and after trigger removal an assignment succeeded. Full check with the regression test passed: API 392/392, Web 12/12, Playwright discovery 23, lint/typecheck/build passed.

These are local disposable-DB/browser results, not GitHub Actions results; no Preview or Production database was used. They do not complete the full responsive/state matrix or seeded demo-account login flow.

## Security and acceptance work not run

- The external Cloudflare run-6 report records 6/6 Node built-in tests of the extracted login-throttle helper: 5/6 account attempts, 20/21 IP attempts, 15-minute expiry, a 4,096-entry map bound, forwarding-header non-influence on the supplied `req.ip`, and independent helper instances. It does **not** exercise the Express route/order, PostgreSQL, cross-process sharing, Vercel runtime, or deployed behavior. Its full report/output are outside this repo at `C:\Users\sivaa\security-audit-skill\customer-support-platform\run-6`.
- No new full security audit ran here. The compliant sandbox has a local Docker engine and Node 24 image, but the available Linux audit image has no preinstalled Vitest, Supertest, Playwright, or Prisma runner. The WSL Ubuntu/Kali environments also have no Node/npm test toolchain. Host `node_modules` is Windows-built and not a compatible preinstalled Linux test toolchain. Per the audit skill, no dependency was installed/fetched and target tests were not run in an unsuitable environment.
- Preview agent/customer journeys, cross-tenant and same-tenant-other-customer denials, and before/after ticket/comment/activity checks remain **BLOCKED / NOT_RUN**. They require Neon owner-confirmed compute readiness, safe synthetic role credentials, and a verified second-tenant fixture.
- SQL migration reversal is **NOT_RUN**. Existing code rollback/schema-compatibility evidence must not be described as an actual down-migration test.
- At task start, the latest checked docs candidate was `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` with Actions #94 success and both Vercel projects provider-rate-limited. Any later descendant needs separate exact-SHA statuses; do not inherit #94.

No Production or Preview requests/writes, or deployed throttle probes, are part of the evidence above. Database writes occurred only in the verified disposable loopback test database.
