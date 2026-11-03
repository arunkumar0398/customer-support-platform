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

## Vercel + Neon Preview setup

This is a manual Preview setup guide. It does not authorize or perform a production release. The application uses two Vercel projects from this npm-workspaces repository and a Neon PostgreSQL Preview database. Both Vercel Function projects are pinned to Singapore (`sin1`) to stay close to the Neon Singapore region; static web files still use Vercel's CDN.

The existing Neon Preview procedure remains the current documented provider path. A separate Supabase Preview migration is only proposed; it has not been executed. See [the Supabase Preview migration runbook](supabase-preview-migration.md) and [the availability decision](adr/0005-neon-supabase-availability.md). Do not treat it as evidence of a migrated or available deployment.

### Create the Neon Preview database

1. In Neon, create a project named `customer-support-platform-preview`.
2. Select **AWS Asia Pacific 1 (Singapore)**. Neon fixes the region when the project is created; the repository's Vercel Function configuration uses `sin1`.
3. Enable **Postgres database** only. The app has no Neon Object Storage, Functions, AI Gateway, Realtime, or Neon Better Auth dependency.
4. Use this project only for Preview and synthetic assessment data. Production must use a separately reviewed database/project after production approval.
5. Use the new project's default branch and database as Preview. From the Neon Connect panel, select that branch/database and copy the pooled and direct connection strings. Treat both as secrets. The pooled host contains `-pooler`.

### Create two Vercel Preview projects

Import the same GitHub repository twice using **Import single project**. Do not import the Docker `app` container as a Vercel project.

| Vercel project | Root Directory | Framework | Required config |
|---|---|---|---|
| `customer-support-platform-api` | `api` | Express | Node.js 24; Function region Singapore (`sin1`) |
| `customer-support-platform-web` | `web` | Vite | Node.js 24; Function region Singapore (`sin1`) |

For each project, keep automatic framework build/install detection initially and keep the existing npm workspace lockfile. In Root Directory settings, enable **Include source files outside of the Root Directory** so Vercel can read the root npm workspace manifest and lockfile. Confirm the settings show the expected root before the first deploy. Keep `main` as the Production Branch; use `codex/assessment-mvp` deployments as Preview only. `api/vercel.json` and `web/vercel.json` set the Functions region, and `web/vercel.json` also defines the same-origin API proxy and SPA fallback.

### Set environment variables

Add variables in each Vercel project's **Preview** scope. Recreate the settings for Production only during the later, separately approved production release.

| Project | Variable | Value |
|---|---|---|
| API | `DATABASE_URL` | Neon pooled connection string for the Preview database (`-pooler` host) |
| API | `APP_ORIGIN` | Exact HTTPS origin of the web Preview, with no path or trailing slash |
| API | `SESSION_SECRET` | New secret generated from at least 32 random bytes; do not reuse a local or production secret |
| Web | `API_ORIGIN` | Exact HTTPS origin of the API Preview, with no path or trailing slash |

Do **not** add `DATABASE_URL_UNPOOLED` to the long-running API environment. Supply the Neon direct connection string only to a trusted, one-off migration command after confirming it targets the Preview branch. From a PowerShell window at the repository root:

```powershell
try {
  $env:DATABASE_URL_UNPOOLED = "<Neon direct Preview connection string>"
  npm run db:migrate
} finally {
  Remove-Item Env:DATABASE_URL_UNPOOLED -ErrorAction SilentlyContinue
}
```

Never run the migration command against production during this Preview setup. Do not paste database URLs, passwords, or `SESSION_SECRET` into chat, screenshots, GitHub issues, or committed files. The local `.env.example` remains for Docker development and is not a template for hosted credentials.

Vercel Preview hostnames include the branch/deployment. After the first Preview deployments exist, set `APP_ORIGIN` to the actual web Preview origin and `API_ORIGIN` to the API Preview origin; redeploy so both projects receive the updated values. Keep the same-origin `/api/*` proxy: the browser should use the web host, which forwards session cookies, Origin, CSRF token, and request body to the API.

### Preview verification and stop conditions

1. Wait for both project builds to complete on `codex/assessment-mvp`. The `app` Docker container is not part of this topology.
2. Confirm `https://<api-preview>/api/health` and `/api/health/ready` return healthy responses.
3. Open the web Preview and verify login, logout, role journeys, cookie persistence, a ticket mutation, comments/history, dashboard refresh, and a stale edit returning `409`.
4. Use synthetic records to verify cross-organization access is denied. Do not run destructive, replay, or race probes on a production database.
5. If preview API calls fail, stop and inspect Vercel function logs and the Preview origin settings. Do not relax the session, Origin, or CSRF checks to make deployment pass.
6. Record the deployment URLs, source SHA, sanitized smoke results, and migration result in `evidence/releases/preview.md` after actual verification. Until that evidence exists, deployment acceptance remains `NOT_RUN`.

Production database creation, production variables, production migrations, and promotion require separate explicit approval after Preview verification.
