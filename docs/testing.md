# Testing guide

This page contains reproducible local commands and the latest verified
results. Earlier SHA-specific notes are in the
[history archive](../evidence/history/2026-11-02/README.md).

## Run locally

Use Node.js 24, npm 11, Git, and Docker Compose v2. Configure .env from
.env.example as described in [Local operations](operations.md). Keep secrets
out of Git and use only the guarded local seed.

### Start the local stack

    npm ci
    docker compose up -d --wait database
    npm run db:migrate
    npm run db:seed
    docker compose up -d --build --wait api web

### Run checks

    npm run db:migrate:test
    npm run db:verify-test
    npm run check
    npm run test:e2e
    py -3 scripts/check-doc-contract.py

npm run check includes lint, type checking, API and web tests, Playwright test
discovery, and builds. Discovery does not execute browser tests. API database
tests use the separate disposable support_test identity; see
[Local operations](operations.md) before running test migrations.

## Latest verified results

### Default application source

- **SHA:** 19246132f22bd0e37b6a6a0b9286bb1621d3bad1 on codex/assessment-mvp.
- **GitHub Actions:** [run #130](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826),
  job verify, passed on the exact SHA.
- **Counts:** API 431/431; Web 17/17; Playwright 47 passed. Lint, type
  checking, database verification/migrations/seed, and builds passed. See the
  [inspectable CI evidence](../evidence/reviews/assessment-ci-evidence-19246132-2026-11-02.md).
- **Local Compose:** this SHA applied three migrations and the synthetic seed,
  built API/Web, and verified both containers healthy. The first BuildKit
  attempt failed with ECONNRESET; one retry succeeded. Commands are in the
  [readiness report](../evidence/reviews/assessment-readiness-19246132-2026-11-02.md).

Vercel Web/API statuses are provider results, not application tests. Read-only
health checks and the local container smoke are separately documented. No
authenticated Production user flow is claimed.

### Documentation PR checks

PR #2 branch codex/assessment-readiness-1924613 was at SHA
ff4a673a076f237bab047ce3fe5cdae994208ec8. Actions
[#136](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41489915301)
passed on that exact documentation candidate. This result does not validate a
later commit from this restructure.

## Separate acceptance gates

Preview A35, the incomplete security audit, the full A22/A23/A37 matrix,
manual screen-reader review, evaluator access, and A28 remain separate gates.
Current dispositions and evidence links are in the
[acceptance ledger](../evidence/checkpoints/acceptance-status.md).
