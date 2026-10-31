# Security and Preview follow-up — 2026-10-31

## Scope and provenance

- Repository: `customer-support-platform`
- Local branch: `codex/vercel-api-route-preview`
- Tracked source HEAD reviewed: `b2fd3691fe01f81a1652f29ab7ef67d615c0051f`
- Worktree was already dirty before this note was added. Existing README, operations guide, TK-35, acceptance ledger, screenshots, and untracked evidence were preserved.
- Three independent, read-only source-review tasks covered session/CSRF and membership mutations (`/root/audit_sessions_memberships`); ticket child-resource/dashboard authorization (`/root/audit_child_scope`); and the Vercel proxy plus CI/container configuration (`/root/audit_proxy_supplychain`). Their written findings were returned in this Codex conversation; no separate reviewer report files were created. Reviewers did not execute target code/tests, contact hosted services, read environment files, or change source.
- This is a dirty local candidate. No GitHub Actions result was verified for this exact HEAD, and historical CI results at other SHAs do not establish current G0.

## Preview acceptance

**Status: BLOCKED / NOT_RUN.** The available Preview browser tab was signed out at the sign-in page. No safe synthetic agent/customer credentials or verified second-tenant ticket fixture were available in this session. No login attempt, Preview API probe, database access, or hosted-data mutation was made.

Required when prerequisites are available: run the agent and customer journeys against the current Preview alias; attempt reads and writes against a verified foreign-tenant ticket; capture request/response and UI outcomes; compare relevant ticket/comment/activity state before and after rejected writes. Do not infer these results from source review or prior unrelated Preview observations.

## Cloudflare audit target execution

**Status: NOT_RUN / BLOCKED by compatible preinstalled toolchain.** The security-audit skill's isolation requirements were reviewed. Available offline Docker images were checked with networking disabled, read-only root filesystems, dropped capabilities, no-new-privileges, bounded CPU/memory/processes, and an empty allowlisted environment. The installed application images did not contain the required Vitest/Supertest test runner; the available Node base image had no project dependencies. No dependency was installed or fetched, and no target code or tests were executed.

Recheck on 2026-10-31: Docker Engine `29.9.2` (Linux) was available. Constrained package-resolution probes exited 0 for `csp-candidate-7c2fdba-api`, `customer-support-platform-api`, `csp-tk25-clean-api`, `csp-tk33-clean2-4d01e3c-api`, and `node:24-alpine`; each reported both `vitest` and `supertest` as missing. These were image inventory probes only, not target tests.

This is an environment inventory, not a completed target audit. The previous audit run's provenance remains attached to its original source reference and is not changed by this follow-up.

## Candidate and acceptance recheck

On 2026-10-31 the local branch remained `codex/vercel-api-route-preview` at `b2fd3691fe01f81a1652f29ab7ef67d615c0051f`, with pre-existing tracked and untracked changes. The candidate is not clean/ready for exact-head CI, so no workflow was dispatched and no older Actions result was reused. Preview remains signed out with no verified role credentials or second-tenant fixture available; no Preview request was sent.

## Deferred audit areas — source-only review

| Area | Source review result | Still required |
|---|---|---|
| Session lifecycle and CSRF | Covered by read-only inspection of session hashing/expiry/revocation, origin checks, session-bound HMAC proof, cookie policy, and auth tests present at the reviewed source. | Execute the auth and active-membership suites in the compliant isolated environment; deployed behavior remains outside the audit. |
| Membership mutations | Covered by read-only inspection of admin/active-membership middleware, strict schemas, transaction-time authority checks, organization locking, and last-admin protections/tests. | Execute membership and active-membership suites in the compliant isolated environment. |
| Child resources and dashboard | Covered by read-only inspection of ticket scoping, requester ownership, comment/activity parent scoping, write transactions, and staff-only tenant-scoped dashboard aggregates. | Execute foreign-tenant and same-tenant other-customer denial cases; verify rejected writes do not alter rows/events. The concurrent membership-revocation/read race also remains untested. |
| Vercel proxy | Covered by read-only inspection of HTTPS origin validation, `/api/` path restriction, header/cookie allowlists, Preview-only OIDC forwarding, fail-closed behavior, and mocked deployment tests. | Execute tests in the compliant environment; actual trusted-source configuration, deployed cookies, and Vercel function behavior remain unverified. |
| CI/container supply chain | Covered by read-only inspection of workflow permissions/action pins, lockfile-based installs, digest-pinned app images, non-root API, and Compose PostgreSQL tag. | Run exact-source CI/container checks in an appropriate environment; verify artifact provenance/SBOM/image identities. Compose PostgreSQL remains a mutable tag. |

These five rows are **source-reviewed only**. They do not close the security-audit execution requirement and must not be represented as target-test PASS.

## Release decision and next evidence

Keep merge/submission on hold. G7 remains blocked until compliant audit execution and Preview role/tenant acceptance evidence are available, reviewed against the exact candidate, and reflected in the ledger. Request a focused G7 follow-up after those prerequisites are complete.

No application source, hosted deployment, Preview/Production database, or hosted data was changed by this follow-up.

## Recheck — 2026-10-31

- Git reports branch `codex/vercel-api-route-preview`, HEAD `b2fd3691fe01f81a1652f29ab7ef67d615c0051f`, and a dirty worktree. The pre-existing ten TK-29 screenshot modifications remain present. No cleanup, checkout, commit, push, or workflow dispatch was performed.
- GitHub combined status for exact HEAD reports Vercel API and Web checks as `success`. The GitHub Actions workflow-run lookup returned no runs, but that connector lookup is limited to PR-triggered runs; therefore an exact-head Actions result is still **unverified**, not a claimed absence of all runs.
- Under the constrained offline Docker inventory (`--network none`, read-only root, dropped capabilities, `no-new-privileges`, bounded CPU/memory/processes, scratch `/tmp`, and a small explicit environment), checked `codex-offline-pin-check:node`, `node:24-alpine`, and the locally available application API images. None provided `vitest`, `supertest`, or Playwright test packages. No target code/tests ran and no dependencies were installed or fetched.
- The existing Preview tab remains at the sign-in form. Safe agent/customer credentials and a verified second-tenant ticket fixture remain unavailable. No authentication attempt, API probe, or database mutation was performed.
- The local candidate is not clean, so exact-head CI was not started. Exact-head Actions result remains unverified; do not infer it from prior runs.
- These fresh observations keep Preview and audit execution **BLOCKED / NOT_RUN** and do not clear G7.
