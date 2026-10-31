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

Run #91 tests the repository tree at `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1`; app source files remain at `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Its CI success does not turn the API quota status into an app build result or close Preview/security gates.

## Security and acceptance work not run

- The external Cloudflare run-6 report records 6/6 Node built-in tests of the extracted login-throttle helper: 5/6 account attempts, 20/21 IP attempts, 15-minute expiry, a 4,096-entry map bound, forwarding-header non-influence on the supplied `req.ip`, and independent helper instances. It does **not** exercise the Express route/order, PostgreSQL, cross-process sharing, Vercel runtime, or deployed behavior. Its full report/output are outside this repo at `C:\Users\sivaa\security-audit-skill\customer-support-platform\run-6`.
- No new full security audit ran here. The compliant sandbox has a local Docker engine and Node 24 image, but the available Linux audit image has no preinstalled Vitest, Supertest, Playwright, or Prisma runner. The WSL Ubuntu/Kali environments also have no Node/npm test toolchain. Host `node_modules` is Windows-built and not a compatible preinstalled Linux test toolchain. Per the audit skill, no dependency was installed/fetched and target tests were not run in an unsuitable environment.
- Preview agent/customer journeys, cross-tenant and same-tenant-other-customer denials, and before/after ticket/comment/activity checks remain **BLOCKED / NOT_RUN**. They require Neon owner-confirmed compute readiness, safe synthetic role credentials, and a verified second-tenant fixture.
- SQL migration reversal is **NOT_RUN**. Existing code rollback/schema-compatibility evidence must not be described as an actual down-migration test.
- Any documentation-only descendant has separate exact-SHA status checks; do not inherit CI or Vercel outcomes from `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1`.

No Production request, Preview request, database write, or deployed throttle probe is part of the evidence above.
