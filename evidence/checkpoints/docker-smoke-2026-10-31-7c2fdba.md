# Docker candidate smoke — 2026-10-31

## Target and isolation

- Application source candidate: 7c2fdba6efb7c39dbf723f100644a5c53928fd84. Subsequent d135849 and f7584df commits changed evidence documentation only.
- Docker Engine server: 29.9.2.
- Used isolated Compose project csp-candidate-7c2fdba with its own PostgreSQL volume and host ports 15546 (database) and 18181 (Web). The user's existing Compose project on 15544/18180 was left running and unchanged.
- docker compose config -q passed with the isolated environment.

## Findings and remediation

- The checked-in Compose DB was healthy, but the ignored local .env host migration URLs had drifted: DATABASE_URL and DATABASE_URL_UNPOOLED pointed to 5433 and their embedded password did not match APP_DB_PASSWORD. This caused the first host migration attempt to fail (one first isolated attempt also collided with existing port 15544 before a separate env file was used). No migration ran during the failed attempts.
- Corrected only the local ignored .env URLs to use Compose PGPORT=15544 and the existing APP_DB_PASSWORD. A read-only Prisma migration status check on the existing local DB reported schema up to date; normal npm run db:migrate then exited 0 with No pending migrations to apply.
- No password was rotated, and no production or hosted settings changed.

## Isolated fresh-stack result

- npm run db:migrate on the isolated database exited 0 and applied all three checked-in migrations.
- npm run db:seed exited 0 and applied the documented synthetic local fixtures to support_dev.
- docker compose up -d --build --wait api web exited 0; database, API, and Web all reached healthy. Both API and Web images built from the current app source.
- HTTP smoke: Web / returned 200 and rendered the Support Desk sign-in page in the browser. Same-origin Web /api/health returned HTTP 200 and status=ok JSON.
- The isolated stack, its uniquely labeled volume, and temporary environment copies were removed after verification. The pre-existing local Compose services were not stopped or rebuilt.

## Result and limits

- Exact-candidate Docker build/startup and health smoke: PASS for the application tree at 7c2fdba.
- G5 overall remains PARTIAL: independent whole-project release review, expanded accessibility evidence, and the required Cloudflare audit in an OS-enforced isolated sandbox are still open.
- This smoke does not claim full Docker E2E role journeys or migration rollback compatibility.