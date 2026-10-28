# Independent Review — checkpoint-review — 2026-10-28 — 9c89fb3

## Review identity

- Repo: `D:/__superset/cactro-tests/_react-node-apps/customer-support-platform/customer-support-platform`
- Branch / HEAD / base SHA: `codex/assessment-mvp` / `9c89fb3d5528262733127d0fcd3a93e835c33dce` / `5ac11d2f6ac5c8c27d39264ca7e3ebde7e4c5408`
- OS/runtime: Windows PowerShell host; Node/npm available through the workspace runtime. Vercel CLI not installed.
- Git status: only ten user-modified TK-29 screenshots remain unstaged and untouched; no staged files.
- Scope: TK-34 Vercel + Neon Preview configuration and its deployment-facing acceptance checks.
- Reviewer independence: Same Codex session, read-only pass using the parent-folder `100xdevs_assessment_review_agent_skill` playbook and deployment lens. This is not an independent second agent review.
- Verdict: **BLOCKED_BY_ENVIRONMENT** for hosted Preview readiness; local configuration checks passed.

## Evidence ledger

| AID | Requirement | Code and test files | Command / observation | Evidence level | Result | Notes |
|---|---|---|---|---|---|---|
| A32 | Production cookies and CSRF/origin behavior | `web/src/server/api-proxy.ts`, `web/api/proxy/[...path].ts`, `web/tests/deployment.test.ts` | `npm run check`, exit 0; six web tests passed | L2 | NOT_RUN | Unit tests cover forwarded headers/cookie but not a live browser through Vercel. |
| A34 | CI gates on exact candidate SHA | `.github/workflows/ci.yml` | Existing green run is for `5ac11d2`; no CI run for `9c89fb3` at review time | L0 | NOT_RUN | Candidate had not yet been pushed. |
| A35 | HTTPS deployment, 3-role smoke, cross-org denial, health | `api/vercel.json`, `web/vercel.json`, proxy route | Before candidate push: web root 200, web `/api/health` 404, API `/api/health` 200, API `/api/health/ready` 503 | L5 observation, prior deployment only | BLOCKED | These URLs do not prove the reviewed commit is deployed; readiness shows the database query is failing. |
| A36 | Migration rollout and code rollback strategy | `docs/operations.md`, `api/prisma.config.ts` | Static review only; no migration run against Neon | L1 | NOT_RUN | Direct URL is kept out of the long-running API environment. No live rollback compatibility evidence exists. |

## Findings

No verified P0/P1 code defect found in the reviewed TK-34 diff. The following required deployment work is unproven and blocks the G6 release gate:

1. Candidate `9c89fb3` has not been built by Vercel. The Vercel CLI is unavailable locally, and no hosted deployment source SHA was confirmed through the connected Vercel account.
2. The user-provided API readiness route returned 503. The public health route intentionally reports process health only; readiness 503 means its PostgreSQL `SELECT 1` did not succeed. The endpoint response does not identify the cause.
3. The web deployment returned 404 for `/api/health`; the proxy/rewrite config in the reviewed commit had not yet been deployed at the time of observation.
4. Neon Preview migration, seed, session-cookie behavior, tenant negatives, and version-conflict smoke have not been run against the hosted candidate.

## Static review notes

- The web proxy pins its upstream origin from server-only `API_ORIGIN`, rejects non-HTTPS/non-Vercel hosts, and does not forward arbitrary headers such as `Host` or `x-forwarded-host`.
- The proxy explicitly forwards the app’s cookie, Origin, CSRF, content type, and organization selector headers; response `Set-Cookie` values are carried back to the browser.
- The browser stays on the web origin, consistent with the app’s exact-Origin and `/api` cookie-path checks.
- `api/vercel.json` and `web/vercel.json` both pin Function execution to `sin1`; `web/vercel.json` routes API paths to the proxy before SPA fallback.
- Runbook keeps the direct Neon URL out of the API Function environment and confines it to a one-off Preview migration command.
- Vercel project root directories must be `api` and `web`; root npm workspace files are outside those directories, so the Vercel setting to include files outside Root Directory must remain enabled.

## Reconciliation / unsupported claims

- `npm run check` was executed at the exact reviewed source SHA and exited 0: lint/typecheck, 386 API tests, 6 web tests, 23 Playwright test declarations, and API/Vite builds passed.
- The local build is not a Vercel packaging/build result.
- User-provided URL probes were safe GET requests and are not tied to the reviewed SHA.
- No live Neon project, database URL, Vercel environment variable, deployment mutation, or production endpoint was accessed or changed.

## Final decision and handoff

- P0 open: none found in this narrow diff review.
- P1 open: hosted G6 acceptance evidence remains outstanding as listed above.
- Required gate: **BLOCKED_BY_ENVIRONMENT** until exact candidate deployment, Preview DB readiness, migration, and smoke checks are observed.
- Next action: push the reviewed source commit to the existing feature branch, let the two Vercel Preview projects build it, then configure only Preview database/origin values and run the documented migration/smoke sequence.
