# Assessment readiness recheck — `19246132f22bd0e37b6a6a0b9286bb1621d3bad1`

Date: 2026-11-02. The live GitHub default is `codex/assessment-mvp` at this SHA. Verification used a new detached worktree at this commit; the separate dirty worktrees were not edited. This report records the exact current-candidate checks and preserves the distinction between provider results, local runtime checks, and unrun acceptance.

## Repository and hosted status

- `git ls-remote --symref origin HEAD refs/heads/codex/assessment-mvp` resolved the default to `codex/assessment-mvp` at `19246132f22bd0e37b6a6a0b9286bb1621d3bad1`. GitHub repository metadata confirms the default branch and private visibility.
- GitHub Actions [run #130](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826), job `verify`, completed successfully on this exact SHA. Its database setup and required CI gates passed.
- Exact-SHA Vercel status contexts are provider `success`: [Web deployment record](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/13GN1Fnt1uJTHtZhwNWHuwoE4tr7) and [API deployment record](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/GTQMVHec23XJrspom3oxHeRyAX21). Provider success is not a Docker Compose test or an authenticated application journey.
- Read-only production API requests returned `{"status":"ok"}` for `curl.exe --fail --silent --show-error https://customer-support-platform-api.vercel.app/api/health` and `{"status":"ready"}` for `curl.exe --fail --silent --show-error https://customer-support-platform-api.vercel.app/api/health/ready`; both exited 0. No login, user workflow, or production write was performed. The stable API alias response does not itself prove which immutable deployment served it. No dedicated Web health endpoint was checked.
- The repository is private. Evaluator identity and read permission were not provided or verified; the repository owner must confirm access for the named evaluator. No invitation or visibility change was made.

## Clean local setup and Compose retry

Environment: Windows host, Node `v24.22.1`, npm `11.19.1`, Docker Desktop Engine `29.9.2` (`linux/amd64`), Compose `v5.6.1`. New detached worktree started clean at the exact SHA. `npm ping --registry=https://registry.npmjs.org/` returned `PONG` (exit 0).

The ignored `.env` used unique random local-only values and the isolated Compose project `csp-assess-current-1924613`; PostgreSQL was loopback-bound on port 55431. No hosted database was used. Prior to retrying, read-only Docker Buildx history showed both API and Web failed at the same `RUN npm ci` step after 156.1 seconds with `ECONNRESET`. Docker Desktop reported a Linux/amd64 engine; the BuildKit worker used its configured host network. Host npm ping and a fresh `node:24-alpine` container npm ping both succeeded, and no persistent proxy/DNS misconfiguration was identified. I made no network, TLS, proxy, or sandbox changes.

| Command | Result |
|---|---|
| `npm ci` | Exit 0; 459 packages added. npm reported 10 moderate audit entries. |
| `docker compose -p csp-assess-current-1924613 up -d --wait database` | Exit 0; the disposable PostgreSQL container became healthy. |
| `npm run db:migrate` | Exit 0; all three checked-in migrations applied to local `support_dev`. |
| `npm run db:seed` | Exit 0; synthetic local `support_dev` fixtures applied. |
| `docker compose -p csp-assess-current-1924613 up -d --build --wait api web` (first attempt) | Exit 1 at Dockerfile `RUN npm ci`; both target builds logged `ECONNRESET`/`npm error network aborted` after 156.1 seconds. |
| `docker compose -p csp-assess-current-1924613 up -d --build --wait api web` (one retry, unchanged SHA) | Exit 0. Both API and Web images built and Compose reported both app containers `healthy`; database also remained healthy. BuildKit installed 459 packages. |
| `docker compose -p csp-assess-current-1924613 exec -T api node -e require('http').get('http://127.0.0.1:3101/api/health/ready',function(r){console.log(r.statusCode);process.exit(r.statusCode===200?0:1)})` | Exit 0; API readiness returned HTTP 200 inside the API container. |
| `curl.exe --fail --silent --show-error --output NUL --write-out %{http_code} http://127.0.0.1:58080/` | Exit 0; Web root returned HTTP 200 on loopback. |

Before retry, the only started service was the healthy database. The successful retry then built both images and `docker compose -p csp-assess-current-1924613 ps` reported API, Web, and database healthy. The configured API readiness health check and Web HTTP health check both passed; direct loopback requests additionally returned HTTP 200 for API readiness and Web root. This closes the clean local Docker startup check at the stated SHA. BuildKit network access showed a transient failure followed by success; no specific persistent network misconfiguration was established. Cleanup used `docker compose -p csp-assess-current-1924613 down -v --rmi local`; the disposable containers, network, volume, and uniquely named images were removed. The ignored `.env` was deleted. No other Compose project was touched.

The separately cited local rehearsal file `assessment-rehearsal-19246132-2026-11-02.md` and its local output files could not be located in this PR branch or the available project worktrees; the path also returned 404 from GitHub at this SHA. Do not treat the previous summary of local `npm run check`, Playwright 47/47, or `support_test` migration as inspectable local evidence. Instead, exact-SHA Actions [#130](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826) ran the API, Web, and Playwright commands and its job logs recorded 431/431 API, 17/17 Web, and 47 Playwright passes, alongside lint, typecheck, database, migration, seed, and build gates. The sanitized output summary and artifact hash are in [the exact-SHA CI evidence record](assessment-ci-evidence-19246132-2026-11-02.md). The fresh `support_dev` migration/seed above is separate local Compose setup evidence.

## npm advisory review

`npm audit --json --package-lock-only` on the exact lockfile reported 10 moderate entries, with no low/high/critical findings. Lockfile package metadata marks each affected installation as `dev: true`. `npm audit --omit=dev --json --package-lock-only` reported zero production vulnerabilities. `npm ls minimatch --all` showed the shared `minimatch@10.2.6` under the ESLint and `typescript-eslint` development toolchain. The ten npm entries are the underlying `minimatch` advisory plus audit propagation through dependent lint packages; they are not ten confirmed vulnerabilities in application code.

| Audit entry | Locked version | Lockfile path | Relevance |
|---|---:|---|---|
| `minimatch` | 10.2.6 | `node_modules/minimatch` | Dev-only; underlying GHSA-identified package. |
| `eslint` | 10.13.0 | `node_modules/eslint` | Direct dev dependency; affected transitively through minimatch. |
| `@eslint/config-array` | 0.23.5 | `node_modules/@eslint/config-array` | Dev-only dependent entry. |
| `@eslint-community/eslint-utils` | 4.10.1 | `node_modules/@eslint-community/eslint-utils` | Dev-only dependent entry. |
| `typescript-eslint` | 8.72.0 | `node_modules/typescript-eslint` | Direct dev dependency; affected through its lint chain. |
| `@typescript-eslint/eslint-plugin` | 8.72.0 | `node_modules/@typescript-eslint/eslint-plugin` | Dev-only dependent entry. |
| `@typescript-eslint/parser` | 8.72.0 | `node_modules/@typescript-eslint/parser` | Dev-only dependent entry. |
| `@typescript-eslint/type-utils` | 8.72.0 | `node_modules/@typescript-eslint/type-utils` | Dev-only dependent entry. |
| `@typescript-eslint/typescript-estree` | 8.72.0 | `node_modules/@typescript-eslint/typescript-estree` | Dev-only dependent entry. |
| `@typescript-eslint/utils` | 8.72.0 | `node_modules/@typescript-eslint/utils` | Dev-only dependent entry. |

The current advisory covers `minimatch <11.0.1`; the advisory lists `11.0.1` as patched. The described denial-of-service requires attacker-controlled glob patterns reaching the affected preprocessing path; this review did not establish such an application path. npm's `fixAvailable` metadata proposes changes to the parent lint-toolchain versions, but those suggestions were not validated as compatible and were not applied. Concrete follow-up: in a separate dependency review, determine whether a compatible parent-toolchain release or a tested root override can select patched minimatch, then validate lint/typecheck and the full suite before changing the lockfile. No `npm audit fix`, package change, or lockfile change was made here. [GitHub Advisory: GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Section 8 and separate internal gates

| Section 8 item | Status | Evidence / owner action |
|---|---|---|
| 1. Source repository | **PARTIAL** | Private GitHub repo and source SHA are confirmed. Owner must confirm read access for the named evaluator or prepare an approved private handoff. |
| 2. README setup/run | **PASS** | `README.md` and `docs/operations.md` document setup. At this clean exact-SHA rehearsal, install, database startup, migrations, seed, API/Web image builds, both Compose health checks, API readiness HTTP 200, and Web root HTTP 200 succeeded on the single retry. The first transient BuildKit `ECONNRESET` is retained above. |
| 3. Architecture diagram | **PASS** | `docs/architecture.md` describes components, request flow, storage, and hosted topology. |
| 4. Data model and key indexes | **PASS** | `docs/data-model.md` describes entities, tenant relationships, constraints, and indexes. |
| 5. API documentation/examples | **PASS** | `docs/api.md` documents routes, auth, and request/response examples. |
| 6. Sample credentials or seed instructions | **PASS** | `docs/demo-accounts.md` and the guarded local seed instructions provide synthetic local-only setup. |
| 7. Test instructions/results | **PASS** | `docs/testing.md`, exact-SHA Actions #130, and the [inspectable CI evidence summary](assessment-ci-evidence-19246132-2026-11-02.md) identify commands, SHA, environment, and gate results. The unavailable local rehearsal is not claimed. This report records the local Compose commands, initial transient Docker failure, and successful same-SHA retry. |
| 8. Tradeoffs/limitations/next steps | **PASS** | `docs/limitations.md` records product constraints and future work. |

The local Docker setup/build/startup criterion is **PASS** at this SHA. The container smoke was limited to health/readiness and the Web root; authenticated ticket workflows through the containers were not newly exercised. API/Web/Playwright counts and database/migration/seed gates above are from exact-SHA Actions #130, not from the missing local rehearsal. CI and hosted deployment are optional Section 8 work; Actions and Vercel statuses above are reported separately.

Separate internal acceptance remains open: A35 Preview denial/no-write evidence and fixture cleanup; formal security audit completion (Run 23 remains scoped/incomplete, with native-Linux runner proof outstanding); A22/A23/A37 matrix and manual screen-reader review; evaluator access; and A28 human engineering rehearsal. The linked Preview package is explicitly **NOT APPROVED** and says it authorized no hosted writes, authenticated role requests, or deployments. No separate approved execution record is present in this PR; the earlier ledger sentence claiming approved customer/agent/admin journeys and mutations is withdrawn. A35 is **BLOCKED / NOT_RUN** on the evidence available here. These gates are not upgraded by local or CI results.
