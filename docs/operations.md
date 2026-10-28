# Local operations

This runbook builds and runs the production API and React frontend in local Docker containers. It uses the Compose `database` service and the synthetic `support_dev` seed. It does not deploy or configure a hosted provider.

## Prerequisites and local environment

- Node.js 24, npm 11, Git, and Docker Desktop with Compose v2.
- Copy `.env.example` to `.env`. Generate independent 32-byte random values encoded as hex for `POSTGRES_SUPERUSER_PASSWORD`, `APP_DB_PASSWORD`, `TEST_DB_PASSWORD`, and `SESSION_SECRET`. Hex avoids URL-reserved characters in passwords embedded in the PostgreSQL URLs. Keep `.env` out of Git.
- Reuse the exact `APP_DB_PASSWORD` value in both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (the `support_dev` role). Reuse the exact `TEST_DB_PASSWORD` value in `TEST_DATABASE_URL` (the `support_test` role). The template repeats placeholder text intentionally; do not generate a different password for each occurrence.
- The host migration and seed commands use `DATABASE_URL_UNPOOLED` / `DATABASE_URL` at loopback `localhost:5433`. The API container gets its own runtime URL to Compose DNS `database:5432`.
- Use `http://localhost:8080` in the browser. The web port is bound to loopback; set `WEB_PORT` in `.env` if port 8080 is occupied, then use that same port in the browser.

## Fresh start

Run these commands from the repository root in PowerShell:

```powershell
npm ci
docker compose up -d --wait database
npm run db:migrate
npm run db:seed
docker compose up -d --build --wait api web
Invoke-WebRequest http://localhost:8080/ -UseBasicParsing
Invoke-RestMethod http://localhost:8080/api/health
Invoke-RestMethod http://localhost:8080/api/health/ready
```

The migration and seed commands run on the host against the guarded development identity; they are deliberately separate from container startup. The API only becomes healthy after it can execute its PostgreSQL readiness query. Compose waits for that health before starting the web proxy.

## Confirm the runtime

```powershell
docker compose ps
docker compose logs --tail 100 api web
docker compose exec api id -u
docker compose exec web id -u
```

Both application containers run as non-root. The API health check calls `/api/health/ready`; the web health check requests its local root page. A browser path such as `/tickets` should return the React app through the Nginx SPA fallback, and `/api/*` stays same-origin through the reverse proxy.

## Local development and test database

For hot reload, start only PostgreSQL with `docker compose up -d --wait database`, then migrate/seed `support_dev` as above. In an API PowerShell terminal, set `$env:PORT = "3101"` and `$env:HOST = "127.0.0.1"`, then run `node --env-file=.env --import tsx api/src/local-server.ts`. In another terminal run `npm run dev --workspace web`; Vite proxies `/api` to port 3101. Run `npm run check` for lint, typecheck, database/API and web tests, browser discovery, and builds. Execute browser tests with `npm run test:e2e`; the guarded test suite uses the separate `support_test` database and may require Chromium installation.

Do not run test migrations or destructive fixtures against `support_dev`. Verify the test identity with `npm run db:verify-test` before test setup. Do not copy test credentials into Compose runtime settings.

## Stop and troubleshoot

- Stop services without deleting the local database volume: `docker compose down`.
- Inspect service state: `docker compose ps --all`.
- Inspect startup output: `docker compose logs --tail 100 database api web`.
- A missing required environment value stops Compose config/startup. Check `.env`; do not place secrets in issue reports or logs.
- If `api` is unhealthy, confirm migrations completed and the API container uses `database:5432`, not host loopback.
- If the login cookie is not retained, use the configured `http://localhost:<WEB_PORT>` origin and open the UI through the web proxy, not the API container.

The named PostgreSQL volume persists across `docker compose down`. Removing it destroys local databases and is outside the normal restart path.
