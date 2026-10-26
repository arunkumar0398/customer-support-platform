# Implementation Task Ledger — Superpowers `writing-plans` Input

These are planning **task cards**, not proof of implemented files. The working agent must refine each card to 2–5-minute executable microsteps with exact code and expected RED failure before beginning. All test file paths are proposed, not verified existing paths.

| Task | Depends | Owned files (proposed) | RED acceptance first | Gate |
|---|---|---|---|---|
| TK-01 Repo workspace/bootstrap | None | `package.json`, `package-lock.json`, `api/package.json`, `web/package.json` | Clean workspace install/start scripts absent | G0 |
| TK-02 Local postgres | 01 | `docker-compose.yml`, `.env.example`, `scripts/` | DB ready probe fails before compose | G1 |
| TK-03 Initial spec + ADRs | PDF | `docs/superpowers/specs/*`, `docs/assumptions.md`, `docs/adr/*` | requirements completeness review | G0 |
| TK-04 Prisma organizations/users/memberships | 02,03 | `api/prisma/schema.prisma`, `api/prisma/migrations/*` | FK and membership uniqueness tests fail | G1 |
| TK-05 Ticket/comment/event/session schema | 04 | `api/prisma/*`, `api/tests/db/*` | tenant and audit relation tests fail | G1 |
| TK-06 Deterministic seed | 05 | `api/prisma/seed.ts`, `api/tests/seed.test.ts` | 2-org repeatability fixture test fails | G1 |
| TK-07 Error/validation middleware | 01 | `api/src/middleware/*`, `api/tests/errors.test.ts` | schema error response tests fail | G2 |
| TK-08 Session login/logout | 05,07 | `api/src/modules/auth/*`, `api/tests/auth.test.ts` | login/expiry/logout tests fail | G2 |
| TK-09 Active-org membership context | 08 | `api/src/middleware/auth*`, `api/tests/tenant.test.ts` | spoofed tenant tests fail | G2 |
| TK-10 RBAC/ownership policy | 09 | `api/src/lib/policy*`, `api/tests/permissions.test.ts` | cross-org and same-org owner checks fail | G2 |
| TK-11 Admin membership API | 10 | `api/src/modules/memberships/*`, `api/tests/memberships.test.ts` | last-admin and cross-org tests fail | G2 |
| TK-12 Ticket create | 10 | `api/src/modules/tickets/*`, `api/tests/tickets-create.test.ts` | create, validation, ownership tests fail | G3 |
| TK-13 Ticket list/filter/search | 12 | `api/src/modules/tickets/*`, `api/tests/tickets-list.test.ts` | filters + isolation tests fail | G3 |
| TK-14 Stable pagination/sorting | 13 | ticket repo + list tests | duplicate/tie-break assertions fail | G3 |
| TK-15 Ticket details | 12 | ticket detail handler + tests | foreign/other-owner detail tests fail | G3 |
| TK-16 Update/state/priority | 15 | ticket update handler + tests | invalid transition/permission tests fail | G3 |
| TK-17 Assignment | 16 | ticket assignment handler + tests | cross-tenant/non-agent assignment tests fail | G3 |
| TK-18 Atomic event audit | 16 | transaction helper, `api/tests/audit.test.ts` | forced-failure rollback tests fail | G3 |
| TK-19 Comments/history | 15,18 | `api/src/modules/comments/*`, event read API | access and timeline tests fail | G3 |
| TK-20 Optimistic concurrency | 16,18 | ticket update + concurrency tests | stale version 409 race test fails | G3 |
| TK-21 Dashboard metrics | 13 | `api/src/modules/dashboard/*`, tests | overdue and workload fixture tests fail | G3 |
| TK-22 API docs and health | 07-21 | `docs/api.md`, `api/src/health.ts` | schema/example sanity and readiness probe | G3 |
| TK-23 React router, API client, login | 08,22 | `web/src/app/*`, `web/src/features/auth/*` | Playwright login test fails | G4 |
| TK-24 Ticket list/filters | 13,23 | `web/src/features/tickets/list/*` | browser filters/empty/loading tests fail | G4 |
| TK-25 New ticket form | 12,23 | `web/src/features/tickets/create/*` | form submit & errors fail | G4 |
| TK-26 Ticket detail/actions/history | 16-20,23 | `web/src/features/tickets/detail/*` | agent and customer flows fail | G4 |
| TK-27 Dashboard | 21,23 | `web/src/features/dashboard/*` | metrics after mutation test fails | G4 |
| TK-28 Admin member controls | 11,23 | `web/src/features/memberships/*` | admin only / last admin tests fail | G4 |
| TK-29 States, keyboard, responsive | 23-28 | relevant UI files, `web/tests/e2e/*` | 403/error/mobile/focus tests fail | G4 |
| TK-30 Security attack suite | 11-29 | `api/tests/security/*` | role, mass-assignment, CSRF, rate-limit adversarial cases | G5 |
| TK-31 Reliability/performance | 13-30 | `api/tests/concurrency*`, `docs/performance.md` | duplicate/million-row query plan assumptions assessed | G5 |
| TK-32 CI/clean checkout | 29-31 | `.github/workflows/ci.yml`, root scripts | isolated CI install+migrate+tests fails | G5 |
| TK-33 Local Docker/production build | 32 | `Dockerfile`, `api/src/local-server.ts`, Vite output | Docker images and production builds fail | G5 |
| TK-34 Vercel + Neon deployment config | 33 | `web/vercel.json`, `api/index.ts`, `docs/operations.md` | Vercel preview build, Neon pooled/direct DB, rewrite and migration dry-run fail | G6 |
| TK-35 Approved Vercel + Neon preview/deployment | 34 | Vercel dashboard, Neon preview/prod, `evidence/releases/*` | remote HTTPS, migration and A/B isolation smoke fail | G6 |
| TK-36 Independent review/remediation | 32-35 | `evidence/reviews/*`, narrow fixes | fresh reviewer replays acceptance | G7 |
| TK-37 Submission/demo/AI disclosure | 36 | `README.md`, `docs/*`, `AI_USAGE.md`, `evidence/releases/release-evidence.md` | final documentation/gate trace audit | G7 |

## Contract freeze boundaries

- Freeze C1 data model and shared API types before parallel frontend/backend work.
- Only one agent edits `api/prisma/schema.prisma`, `api/src/middleware/auth*`, `package-lock.json` or root scripts at a time.
- After phase C3, use stable API mock/fixtures for frontend while backend security and API checks continue independently.
- At release candidate, stop feature work; only fix verified defects with regression tests, rerun all gates, and update SHA.

## Demo dependencies

- Admin account in Organization Alpha, agent Alpha, customer Alpha-1, customer Alpha-2, admin Beta, customer Beta.
- Seed cases: open, in progress, resolved, closed, overdue, unassigned, high-priority, same-org different-owner, other org with known ID.
- Known all-route negative-case checks: list, details, mutation, comment, history, assignment, dashboard, membership.
