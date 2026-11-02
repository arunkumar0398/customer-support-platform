# Bounded audit continuation — Run 22

## Identity, method, and independence

- **Application/test source reviewed:** `080d883029e6e68619c34e8dc4d055d03b4dcbb7`, tree `75094b514a6d404765b45625de542aeb4d11a476`, branch `codex/provisioning-timeout-diagnostics-44042`.
- **Host:** Windows 10 build 22000.318, Node 24.22.1, npm 11.19.1. The configured default PowerShell exits with a CET compatibility fatal error. The verified fallback used here was `C:\Windows\System32\cmd.exe`, Git `C:\Program Files\Git\cmd\git.exe`, and Node `C:\nvm4w\nodejs\node.exe`.
- **Current worktree:** the source HEAD above is retained. The local follow-up changes only `audit/run/run-offline.sh`, `audit/host/launch-offline.test.mjs`, and this evidence/Preview package; no application source changes. Other checkouts, screenshots, and backups were preserved.
- **Pinned Cloudflare skill:** `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`.
- **Review lens:** project-specific 100xDevs-inspired reviewer kit, `checkpoint-review` mode. It is explicitly unofficial. This is a builder-side evidence critique, not an independent reviewer or G7 verdict.

## Run 22 retained results and integrity

Both local Docker lanes used the prepared Linux AMD64 image `sha256:e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3`, exact source `080d883…`, tree `75094b…`, `--network=none`, and the pinned source-bound launcher/promotion protocol. The target had no artifact mount, Docker socket, or promotion-input mount. Preflight and target exited 0; neither lane timed out, OOM-killed, nor truncated output.

| Lane | Run | Observed result | Retained file hashes (SHA-256) |
|---|---|---|---|
| `api-provisioning-file` | `audit-080d883029e6-1793560175794-fce29de1` | 1 file, **21/21 tests**, exit 0 | `lane.log` `249c0c3a67cafd2606ebeff86cdf2228e2be47bb3902c9931c44912b14e16f6c`; `lane-result.json` `a0fc15c75ff515aacae833fae22d1088e14d8e86e13c2e6ae6e6a1463f16410d` |
| `api` | `audit-080d883029e6-1793560219618-17c89193` | 28 files, **425/425 tests**, exit 0 | `lane.log` `2e0143323f68c0467dcde8cfabfcc7e0654d8b6534edd8b9e04819fb5ba77a1a`; `lane-result.json` `36acf9896ad99840fe658625420b25a3705cb59bbcd49b53cd2c18c306eabd7d` |

Independent `certutil -hashfile` recomputation matched both lanes’ `lane.log` and `lane-result.json` hashes. For the API lane, recomputed hashes also match `launch-record.json` (`86f8114a818cdab12c2e456b8f5f798f60cc77d8fc1fb931e7875a3a6b23eb57`), `source-tree-manifest.json` (`387161e5d671232e995fda94b41377fcbf9a446a9ad3996ed3b312e15cd1039b`), and `preflight.out` (`35808f57544d5a7426f312361a71ce767ecba305013c4d4b54855eb3195e5acd`). The launch record binds archive commit `080d883…`, tree identity, archive SHA-256 `19edb2c5c67614a9be7785730732f161e7b32e8211ec0d95d2462f2467211da0`, and toolchain digest above. These are local exact-source dynamic tests, not CI, Preview, or G7.

### Provisioning timeout root cause and correction scope

Earlier API cleanup tests timed out when two Vitest workers competed inside a one-CPU target. The one-worker provisioning file and full API lane above pass with the original **5-second per-test timeout**; recorded PostgreSQL diagnostics showed no blocking locks while CPU was saturated. The test cleanup asserts zero run-owned rows and removes the private output directory. This supports a harness/resource contention explanation, not an application lock defect.

The diagnostic follow-up changes only the audit `all` lane’s API worker cap from 2 to 1, matching the already-bounded dedicated API lane. It leaves the Web lane at 2 workers and does not alter application timeouts or production concurrency. Regression test `keeps API lane concurrency within the prepared one-CPU sandbox` checks API=1 and Web=2 for the affected lanes. The focused command `node --test --test-name-pattern=concurrency audit/host/launch-offline.test.mjs` passed 1/1 on the current working tree. The pinned Linux `all` lane has not yet been rerun; the full host test module is not claimed as passing on native Windows.

## Throttle disposition

The exact-`080d883` API lane includes five throttle-capacity tests. They establish these **local limiter behaviors**: the existing key proceeds at capacity; a new key is rejected when the map holds 4,096 live entries; response is 429 with `Retry-After: 900`; expiry/pruning recovers capacity; account and IP counters are distinct; a fresh limiter instance starts empty. The route-level fixture uses the real middleware before a sentinel handler and proves the rejected request does not enter the handler or set a session cookie. Source order places `createLoginThrottle` before `passwordLogin`/session persistence.

A fresh independent local verifier confirmed the capacity behavior on exact source `080d883…`. **Security finding disposition: REJECTED on current evidence**—intentional fail-closed map-capacity behavior alone does not establish a vulnerability. Remaining operational claim is **NEEDS_VALIDATION** only for hosted routing, real client-IP cardinality, and multi-instance sharing; no deployed throttle request was sent. The route harness does not spy on PostgreSQL/session calls in the production router, so direct database non-effects were not separately measured; code order and the unentered handler bound this test’s conclusion.

## Coverage mapping and evidence limits

| Area | Observed evidence | Disposition for this continuation |
|---|---|---|
| Session, CSRF, cookie and revocation | Run22 API suite includes `api/tests/auth/auth.test.ts`: real disposable-Postgres login, malformed/hostile origin and missing/invalid/session-bound CSRF denials, cookie attributes, expiry/revocation, login rotation, logout replay rejection, and session counts on failures. `api/tests/security/attack-suite.test.ts` snapshots tickets/comments/events/memberships around rejected writes. | **Covered at tested assertion scope (local integration);** not a full independent Cloudflare phase review. |
| Ticket/child-resource tenant and customer ownership | `api/tests/tickets/comments.test.ts` checks same-organization other-customer and foreign-organization reads/writes, and zero comment/event side effects on denied requests. `api/tests/activity/atomicity.test.ts` checks private histories, foreign organization denials and update/event rollback. Other ticket detail/list/update/assignment suites also ran in the 425-test lane. | **Covered at tested assertion scope (local integration);** no claim of exhaustive route/action matrix. |
| Membership changes and role controls | `api/tests/memberships/memberships.test.ts` and `api/tests/security/attack-suite.test.ts` ran; the latter proves agent self-promotion and several CSRF-blocked membership mutations leave snapshots unchanged. | **Partial:** full matrix for last-admin/deactivation/concurrent membership changes is not reconciled here to named assertions. |
| Atomicity, stale writes, assignments | `api/tests/activity/atomicity.test.ts`, `api/tests/tickets/assignment.test.ts`, and `api/tests/tickets/concurrency.test.ts` ran in the exact API lane; the activity test injects a PostgreSQL trigger failure and checks ticket/event rollback and recovery. | **Covered at specific local assertions;** not SQL migration reversal. |
| Dashboard authorization/aggregation | `api/tests/dashboard/dashboard.test.ts` compares synthetic Alpha/Beta metrics and denies customer/unauthenticated/unauthorized organization selection. | **Covered at tested API assertions;** UI route/accessibility states remain separate. |
| Proxy implementation | Earlier local Web result on `44042d4…`: 17/17 Web tests, including 14 local proxy assertions against stubs. This is reused source-scoped evidence; no Web source changes after Hallmark candidate `f55decb…` through `080d883…`. | **Local proxy implementation covered at prior exact source;** Vercel environment/trusted-source and deployed API destination are separate and not verified. |
| Query plans / recovery | Historical A38 query-plan and A36 local restore/forward-code compatibility evidence remain tied to their recorded source identities. | **Historical scoped carry-forward only.** SQL down-migration and hosted PITR were not run and are not inferred. |
| Supply chain / CI and full audit critique | Prior review and docs exist; no fresh bounded offline scanner or full Cloudflare six-phase workflow ran in Run22. | **Incomplete / open.** Validators from older ledgers do not make this continuation complete. |
| UI/accessibility | Prior 46/46 browser result is not rerun on `080d883`; Web implementation styling is unchanged from the Hallmark-tested source, but route/state acceptance is still partial. | **A22/A23/A37 partial;** manual screen-reader journey not run. |
| Preview A35 | No hosted fixture, role login, authenticated request, or mutation was run. | **Blocked / not run.** Current Vercel Preview configuration has an `API_ORIGIN` mismatch and API→Neon binding is unverified; see the refreshed approval package. |

The official coverage/findings validators are not represented by Run22’s lane artifacts. The prior Run20 validator result remains historical. Do not report validator success on these amended records until both pinned validators run against the final ledger/findings package.

## Hallmark, UI and manual accessibility

The rendered Hallmark report records contrast ratios 5.50:1, 5.68:1, 5.68:1, focus ring 7.30:1, and widths 320, 375, 1280, 1440, 1920. `web/src` is byte-identical between the Hallmark-committed source `f55decb8368f5ea3997020845577372a8eafb6a0` and API/provision candidate `080d883…`; those measured CSS results remain applicable. This does not close A22/A23/A37. The manual screen-reader procedure is in `evidence/checkpoints/SCREENREADER-MANUAL-2026-11-02.md`; the human run remains **NOT_RUN**.

## Preview deployment decision

Neon Preview compute is currently ACTIVE for project `sweet-sea-96169409`, branch `br-spring-mode-b30iyj2z` / `production`, endpoint `ep-shy-surf-b36pzssx`. No new `SELECT 1` or fixture query was sent. Vercel shows Ready API `DB8kjRru6d6EzY9tqV12kvrxRqiK` from `a6922fca…` and Ready Web `HCkQZraegPxMo1NPuNi3WbotiM2L` from `ddf3d69…`. The Web Preview `API_ORIGIN` setting points to the different `git-e22907…` API alias, not API `DB8…`’s `git-c3f219…` domain. A35 cannot use this pair as currently configured. The exact proposed Preview-only correction, deployment identity, run ID, private credential path, allowed mutations, and remaining approval are in `PREVIEW-EXECUTION-APPROVAL-2026-11-02.md`.

## Assessment/release disposition

Section 8’s eight required deliverables remain documented in the repository; source evaluator access is not verified. Deployment URL and CI are optional under Section 8. A28 human rehearsal remains unrun. Internal release gates remain: A35, full Cloudflare audit completion, full A22/A23/A37 disposition and manual accessibility, fresh independent G7. No push, deployment, merge, Production request, or hosted data write occurred.

**Overall audit status: INCOMPLETE.** Specific API, provisioning and throttle claims have local evidence; remaining Cloudflare phases, independent review of the full retained audit package, Vercel owner configuration, Preview authorization, and manual screen-reader work are not converted into passes here.
