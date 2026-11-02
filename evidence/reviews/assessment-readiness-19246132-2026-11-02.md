# Assessment readiness recheck — `19246132f22bd0e37b6a6a0b9286bb1621d3bad1`

Date: 2026-11-02.

The live GitHub default is `codex/assessment-mvp` at this SHA. Verification used a new detached worktree at this commit. Separate dirty worktrees were not edited.

This report distinguishes provider results, local runtime checks, and acceptance work that remains unrun.

## Repository and hosted status

- `git ls-remote --symref origin HEAD refs/heads/codex/assessment-mvp` resolved the default to `codex/assessment-mvp` at `19246132f22bd0e37b6a6a0b9286bb1621d3bad1`. GitHub metadata confirms the default branch and private visibility.
- GitHub Actions [run #130](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826), job `verify`, passed on this SHA, including database setup and required CI gates.
- Exact-SHA Vercel contexts reported provider `success`: [Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/13GN1Fnt1uJTHtZhwNWHuwoE4tr7) and [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/GTQMVHec23XJrspom3oxHeRyAX21). Provider success is not Docker Compose or authenticated-flow evidence.
- Read-only Production API requests both exited 0:
  - `/api/health` returned `{"status":"ok"}`.
  - `/api/health/ready` returned `{"status":"ready"}`.

  The stable API alias does not prove which immutable deployment served the requests. No login, user workflow, or Production write was performed. No dedicated Web health endpoint was checked.
- The repository is private. The evaluator identity and read permission were not provided or verified. The owner must confirm access for the named evaluator. No invitation or visibility change was made.

## Clean local setup and Compose retry

Environment: Windows host, Node `v24.22.1`, npm `11.19.1`, Docker Desktop Engine `29.9.2` (`linux/amd64`), Compose `v5.6.1`.

The new detached worktree started clean at the exact SHA. `npm ping --registry=https://registry.npmjs.org/` returned `PONG` (exit 0).

The ignored `.env` used unique random local-only values. The isolated Compose project was `csp-assess-current-1924613`, with PostgreSQL loopback-bound on port 55431. No hosted database was used.

Before the retry, read-only Buildx history showed API and Web both failing at `RUN npm ci` after 156.1 seconds with `ECONNRESET`. Docker Desktop reported a Linux/amd64 engine; the BuildKit worker used its configured host network. Host npm ping and a fresh `node:24-alpine` container npm ping both succeeded. No persistent proxy/DNS misconfiguration was identified, and no network, TLS, proxy, or sandbox settings were changed.

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

The separately cited local rehearsal file `assessment-rehearsal-19246132-2026-11-02.md` and its output files could not be located in this PR branch or the available project worktrees. The path also returned 404 from GitHub at this SHA.

The previous summary of local `npm run check`, Playwright 47/47, or `support_test` migration is not claimed as inspectable local evidence. Instead, exact-SHA Actions [#130](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826) ran the API, Web, and Playwright commands. Job logs recorded API 431/431, Web 17/17, and Playwright 47 passes, alongside lint, typecheck, database, migration, seed, and build gates.

The sanitized output summary and artifact hash are in the [exact-SHA CI evidence record](assessment-ci-evidence-19246132-2026-11-02.md). The fresh `support_dev` migration and seed above are separate local Compose setup evidence.

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

### Section 8 deliverables

1. **Source repository — PARTIAL.** The private GitHub repository and source SHA are confirmed. The owner must confirm evaluator read access or prepare an approved private handoff.
2. **README setup/run — PASS.** `README.md` and `docs/operations.md` document setup. In this clean exact-SHA rehearsal, install, database startup, migrations, seed, API/Web image builds, and both Compose health checks passed on one retry. API readiness and Web root returned HTTP 200. The first transient BuildKit `ECONNRESET` is recorded above.
3. **Architecture diagram — PASS.** `docs/architecture.md` describes components, request flow, storage, and hosted topology.
4. **Data model and key indexes — PASS.** `docs/data-model.md` describes entities, tenant relationships, constraints, and indexes.
5. **API documentation/examples — PASS.** `docs/api.md` documents routes, authentication, and request/response examples.
6. **Sample credentials or seed instructions — PASS.** `docs/demo-accounts.md` and the guarded local seed instructions provide synthetic, local-only setup.
7. **Test instructions/results — PASS.** `docs/testing.md`, Actions #130, and the [inspectable CI summary](assessment-ci-evidence-19246132-2026-11-02.md) identify commands, SHA, environment, and results. The unavailable local rehearsal is not claimed. This report records the local Compose commands and the initial failure plus successful retry.
8. **Tradeoffs/limitations/next steps — PASS.** `docs/limitations.md` records product constraints and future work.

The local Docker setup/build/startup criterion is **PASS** at this SHA. The container smoke was limited to health/readiness and the Web root; authenticated ticket workflows through the containers were not newly exercised. API/Web/Playwright counts and database/migration/seed gates above are from exact-SHA Actions #130, not from the missing local rehearsal. CI and hosted deployment are optional Section 8 work; Actions and Vercel statuses above are reported separately.

## Separate internal acceptance gates

- **A35 Preview:** **BLOCKED / NOT_RUN**. The linked Preview package is **NOT APPROVED** and authorizes no hosted writes, authenticated role requests, or deployments. This PR contains no separate approved execution record; the earlier claim of approved customer/agent/admin journeys and mutations is withdrawn.
- **Security audit:** incomplete. Run 23 remains scoped, with native-Linux runner proof outstanding.
- **UI and accessibility:** A22/A23/A37 remain partial; manual screen-reader review is unrun.
- **Assessment rehearsal:** evaluator access and the A28 human engineering rehearsal remain open.

Local and CI results do not close these gates.
