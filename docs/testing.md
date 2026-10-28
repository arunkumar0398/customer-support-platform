# Testing and CI

Use Node 24, npm 11, Docker Desktop with Compose, and a Chromium installation for the browser suite. `npm ci` installs the exact dependency tree from `package-lock.json`.

## Disposable database

The Compose database initializes separate `support_dev` and `support_test` databases and roles. Run `npm ci`, create a local `.env` from `.env.example` with unique local credentials, then start the database:

```powershell
docker compose up -d --wait database
npm run db:migrate
npm run db:seed
npm run db:verify-test
npm run db:migrate:test
```

The demo seed is guarded for loopback `support_dev`; the test migration helper and integration tests require the verified loopback `support_test` role and database. Never aim test setup at a shared or production database. The seed contains synthetic records only. See the README for the full local setup.

## Local gates

```powershell
npm run lint
npm run typecheck
npm run test:api
npm run test:web
npm exec -- playwright install chromium
npm run test:e2e
npm run build
```

Run the database setup before the database-backed API and browser suites. `npm run check` runs lint, typecheck, API tests, web tests, Playwright **discovery** (`--list`), and builds. It does **not** execute the browser suite; `npm run test:e2e` does. Playwright starts its own API and Vite servers and uses `support_test` fixtures. It must be able to bind ports 3101 and 5173.

## Hosted CI

`.github/workflows/ci.yml` runs on a clean Ubuntu checkout for pushes, pull requests, and manual dispatch. It creates temporary local credentials, starts the Compose PostgreSQL container, migrates and seeds `support_dev`, verifies and migrates `support_test`, then runs lint, typecheck, API tests, web tests, the real Chromium Playwright suite, and builds. Each required command stops the job on failure. The workflow masks generated credentials, redacts configured secrets, database URLs, bearer tokens, and authentication or cookie fields in line and structured logs, then uploads only sanitized gate logs for seven days. The sanitizer regression test runs in CI. GitHub Actions dependencies are pinned to immutable full commit SHAs. It does not need repository secrets.

The workflow covers the code and browser gates for A34. G5 and A24 also require a separate fresh Docker application startup from the README; the current Compose file starts the database only. A26 remains subject to the final document audit. Record actual CI run URL and source SHA before marking any acceptance result `PASS`.
