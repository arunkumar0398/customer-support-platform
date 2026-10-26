# Test/CI Gates — Evidence Before Claims

Each gate starts `NOT_RUN`. All commands below are **target interfaces**; Codex must create real scripts, then verify on an actual environment (no harmless echo/no-op tests). Tests that need PostgreSQL cannot be counted PASS from mocks only.

| Gate | Dependencies | Expected runnable evidence | Pass criteria |
|---|---|---|---|
| G0 Baseline | source + app scaffold | `npm ci`, lint, typecheck, project build | successful fresh install from committed lockfile, no missing script |
| G1 Schema/test DB | G0 | `docker compose up -d db`, migration, seed, DB tests | two orgs, referential constraints, repeated seed safe, no prod connection |
| G2 Auth/isolation | G1 | `npm run test:api` with negative tests | all auth, cross-org, same-org customer, membership/assignment policies pass |
| G3 Backend product | G2 | ticket/comment/audit/dashboard integration suite | filters, pagination, transitions, atomic audit, 409, metrics pass |
| G4 Browser | G3 | `npm run test:e2e`, viewport+accessibility checks | three roles can complete journeys, errors/empty/loading/denied observable |
| G5 Local release | G0–G4 | GitHub Actions Linux Docker job + local clean clone; security/build | no P0/P1 open; no secrets; app docker starts from README; CI SHA recorded |
| G6 Preview/live deployment | G5, **approval** | Vercel preview + Neon branch smoke / production publish if authorized | HTTPS, cookie/rewrite/health, 3 roles, cross-org denial, DB migrations at right target, SHA match |
| G7 Independent review | G5 and G6 if deployed | reviewer reports + replayed tests against exact SHA | zero unresolved P0/P1; documented P2/optional limitations; demo reproducible |

## Recommended script interfaces

`npm run check`, `npm run test:api`, `npm run test:web`, `npm run test:e2e`, `npm run db:migrate`, `npm run db:seed`, `npm run build`, `npm run release:verify` should be implemented by Codex according to real workspace scripts. Avoid pretending they exist before TK-01/TK-32.

## Reviewer isolation and evidence

1. Builder writes RED test and records expected failure, then minimal GREEN code, then refactors without changing behavior.
2. A spec reviewer checks contract completeness; a separate quality/security reviewer tries to break the code and suggests precise regression tests.
3. The integrator executes actual machine checks on the integrated state.
4. A release reviewer checks out **exact candidate SHA** cleanly, installs dependencies, uses disposable test database, reruns gates and records SHA/environment/command/exit code.
5. Hosted CI must execute Linux/PostgreSQL/browser checks. If Windows cannot run `bash` or Docker, mark the local constraint and prove the Linux check through CI rather than declaring a skip as PASS.

## Evidence location and status language

Use `evidence/checkpoints/TK-XX.md`, `evidence/checkpoints/acceptance-status.md`, `evidence/reviews/`, `evidence/releases/`. Store short sanitized excerpts/CI URLs, not secrets or unredacted customer data. Every A01–A40 gets `PASS / FAIL / BLOCKED / NOT_RUN / OPTIONAL_NOT_IMPLEMENTED` with proof and tested Git SHA. `PASS` means observed, not expected.

## Stop and remediate

If a gate fails: capture minimal reproducer, invoke `systematic-debugging`, isolate root cause, add regression test, implement narrow fix, rerun failed gate plus upstream impact tests. No arbitrary timeouts or disabling tests to force green. If resource access is blocked, mark BLOCKED and present next authorized human step.
