# Vercel + Neon PostgreSQL — Deployment and Release Contract

**Only execute this after C0–C5 and G0–G5 are genuinely green.** Live hosting is **optional in the PDF**, but is our agreed extra objective. Production release and cost-bearing actions require human approval. This is a reviewed plan, **not** evidence of a deployment.

## 1. Target topology

```text
Browser HTTPS (e.g. support.example.vercel.app)
  |  React/Vite static assets: Vercel project web/, Root Directory web
  |  /api/* rewrite to HTTPS API Vercel project (not public client secrets)
  v
Express API exported as default Node app from api/index.ts
  Vercel project api/, Root Directory api
  Node.js Functions (no long-lived listener in production)
  |  secure cookie sessions, membership/RBAC, Prisma client
  v
Neon PostgreSQL (pooled runtime URL; TLS)
  | separate migration workflow uses direct/unpooled Neon URL
  + preview database branch separated from production
```

One Git repository, **two** Vercel projects configured for monorepo root directories. Do not assume source files from one Vercel root directory are accessible in the other without correct workspace/build settings. The local `api` process uses a separate `local-server.ts` that calls `listen`, while the Vercel entrypoint exports the Express app as default. Vercel's Express docs list allowed entrypoints and say static `express.static()` serving is ignored; do **not** depend on Express serving Vite's dist in production.

### Design-time code shape (not implemented by this kit)

```text
api/index.ts            # import app factory/module; export default app (Vercel)
api/src/http/createApp.ts
api/src/local-server.ts # local app.listen(PORT), NOT a Vercel entrypoint
web/src/...
web/vercel.json          # AFTER frontend/api host mapping verified
```

Example candidate `web/vercel.json` structure **only**; replace `API_HOST_FROM_APPROVED_DEPLOYMENT` with a real verified host or use Vercel related-project resolution. A missing host must BLOCK deploy rather than ship a placeholder:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://API_HOST_FROM_APPROVED_DEPLOYMENT/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The deployment agent must validate Vercel's current rewrite behavior, SPA fallback ordering, and handling of preview hosts instead of copying this example unquestioned. Alternatively, implement a documented same-origin API proxy pattern that passes actual cookie and CSRF tests. Never insert a secret into a public `VITE_*` environment variable.

## 2. Neon database connection policy

| Environment/operation | DB | URL | Control |
|---|---|---|---|
| Local API+CI | Docker PostgreSQL disposable DB | Local `DATABASE_URL` | test db is isolated from development db and live DB |
| Neon Preview | Disposable branch/DB | `DATABASE_URL` pooled (`-pooler`) | never production; safe synthetic seed |
| Neon Preview migration | Same preview DB | `DATABASE_URL_UNPOOLED` direct | serialized migration job |
| Neon Production API | Production Neon DB | `DATABASE_URL` pooled | Vercel env secret only |
| Neon Production migration | Same prod DB | `DATABASE_URL_UNPOOLED` direct | explicit human approval + verified branch/DB identifier |

For Prisma ORM versions supporting `prisma.config.ts`, configure Prisma CLI migration datasource using direct/unpooled URL and runtime Prisma adapter/Client using the pooled URL. Pin and document a tested Prisma major version; **do not assume Prisma 6, 7 and 8 share identical config APIs**. At implementation time follow relevant official Neon + Prisma documentation and use the `@prisma/adapter-neon` approach when compatible. Never add Prisma Accelerate as a dependency to solve pooling without explicit justification; its hosted offering has a published December 2026 retirement notice.

## 3. Local → preview → production sequence

**A. Local candidate**
- Record Git branch+SHA, frozen assessment design, real passing local/CI results, no active P0/P1 issues.
- Prove Docker PostgreSQL from empty state, migrations, seed, API negative suite, React browser journeys, production builds.
- Verify Express can run in Vercel's function shape without losing auth/database behavior; do not rely on filesystem writes or background processes.

**B. Remote preview (separate approval)**
- Verify correct GitHub repo/project/account/team. Provision or select Vercel projects `web` and `api` with explicit root directories.
- Create or bind disposable **Neon preview branch** with synthetic test users; verify it isn't the production database using a nonsecret identity query before any write.
- In Vercel API project, configure `DATABASE_URL` (pooled), credentials/secrets and allowed origin values. In migration runner, supply direct URL; restrict its availability to trusted job execution.
- Apply `prisma migrate deploy` exactly once to preview using direct URL; seed **preview only**, with synthetic credentials and rate-limited access. No migration at function startup.
- Deploy API preview; verify `/api/healthz`, `/api/auth/me`, error envelopes, logs; deploy frontend preview; configure tested rewrite and SPA fallback.
- Run three role smoke tests; swap ticket IDs between Alpha/Beta; verify cookie session persists through rewrite; verify login/logout and CSRF guards, 409/version conflict and dashboard after mutation.
- Record deployment URLs, full SHA, build IDs, test results and sanitized logs in `evidence/releases/preview.md`.

**C. Production (distinct approval after passing preview)**
- Confirm production Neon DB ID/branch, migrations and their compatibility with previous code, backup/recovery plan, and no test-run destructive commands.
- Stage production build *without assigning production domain where available*, verify exactly what code is being staged, then run approved production-safe smoke suite; consider a dedicated isolated demo organization so tests don't mutate genuine data.
- Apply reviewed and backward-compatible production migration once with direct URL; coordinate order with application release. Explicitly confirm user approval before migration.
- Publish/promote the tested production artifact; verify deployed SHA, HTTPS, navigation refresh, API rewrite, authentication cookie, tenant negatives and live database writes using safe fixtures.
- Watch error logs and DB connection usage for a bounded verification window; capture evidence without secrets.
- Know code rollback command/process. **Code rollback cannot undo a database migration**; use forward-compatible schema changes, and document manual restore/roll-forward options.

## 4. Required environment review

- API hosting uses **Node.js** Functions, not Edge unless separately validated. No long-lived background queue, WebSockets, or filesystem storage required by MVP.
- Runtime/database region intentionally selected for low latency; pooled connections prevent connection exhaustion, but still enforce concurrency/timeouts and appropriate retry policy.
- Secure cookie design accounts for proxy/rewrite and domain/path; cookies only with `HttpOnly`, `Secure` under HTTPS, tested `SameSite`, explicit CSRF/origin validation.
- Prisma Client bundling/generated artifacts work in the Vercel build. Avoid dynamic runtime generation/migrations.
- Sane JSON error envelopes, no leaking stack traces/URLs/tokens, basic logs/request IDs and health endpoint.
- Secrets remain in Vercel/CI secret storage; **never dump or echo `.env` or integration URLs** into chat or artifact logs.
- Neon backup/PITR and Vercel project billing limits must be checked in the chosen plans; no assumed entitlement or cost.
- Preview deployments must NEVER automatically point to the production Neon database.

## 5. Rollback and stop conditions

- If auth cookie or rewrite fails: stop; do not relax auth or disable CSRF. Diagnose forwarded headers, hostname, cookie scope, origin and proxy settings.
- If functions cannot connect Neon: verify pooled URL, region, driver adapter, TLS and connection limit; never post actual URLs to issue comments.
- If production migration is incompatible/failed: stop promotion. Do not run `prisma migrate reset`, `db push --force-reset`, `DROP`, restore/rollback or re-seed against production.
- If P0/P1 security failure: block production. Fix, rerun all affected gates, review the exact new SHA.

## 6. Review talking points

Explain serverless vs persistent Express differences, why Vercel mono-repo uses two projects, how Neon transaction pooling works, why migrations use direct URL, isolation despite forwarded headers and user-controlled request fields, preview vs production database safety, and schema compatibility during code rollback. Provide an AWS conceptual alternative as requested in the PDF.

## References reviewed for the kit

- Express on Vercel: https://vercel.com/docs/frameworks/backend/express
- Vercel monorepo root directories: https://vercel.com/docs/monorepos
- Vercel Functions: https://vercel.com/docs/functions
- Prisma Neon guidance: https://www.prisma.io/docs/orm/v6/overview/databases/neon (check version-specific docs for pinned version)
- Neon official Prisma guide: https://neon.com/docs/guides/prisma
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
