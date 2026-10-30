# Preview deployment recheck — 2026-10-30

## Later exact-candidate replay (same date)

- Rechecked Vercel Web deployment ID `4f7oDdsW5tgiHNDWathUBfi2RvbP` and API deployment ID `5w5uvudahGv8HZnNo9YhysRgXj7B`: both are **Ready** for exact source SHA `ffe7a2a8ab72a92561daded62ca25d8774eaf4d3` on `codex/preview-mobile-roster-ux`.
- Signed into the Web branch alias with the documented synthetic Preview administrator. Queue and member roster loaded; the roster showed one admin, one agent, and two customers. No agent/customer password was present in the repository or matching local setup artifacts, so those role logins were not attempted.
- On the existing labeled `[PREVIEW E2E]` synthetic ticket, changed priority High → Medium → High and verified both saves; assignment was removed then restored to its original agent; added comment `[PREVIEW CHECK 2026-10-30] Admin lifecycle verification comment. Synthetic test record; no customer data.`
- Opened a second stale detail view before the priority update. Its title update was rejected with `Ticket version is stale. Reload the ticket and retry.`; the stale title was not applied. The ticket finished with its original High priority and original assignment, Resolved status, and original title/description. The Preview test comment and audit events remain as synthetic evidence.
- Selected `In Progress` on that resolved ticket and submitted without a reopen reason. The API rejected it with `A reason is required to reopen a resolved ticket.` and made no change. The detail form does not provide a reopen-reason field, so the successful reopen/resolve lifecycle cannot be exercised through this UI. Track as a UX/product finding; do not count as a lifecycle pass.
- Read-only scope-denial check: navigating to `/api/tickets?organizationId=<non-member UUID>` without the required organization header returned `ORGANIZATION_REQUIRED` / `Select an active organization.` This confirms the URL query does not select a tenant; it is not evidence of a foreign-ticket ID denial with a forged organization header.
- No ticket was created: the admin create form requires a customer membership ID, which the roster UI does not expose. No agent/customer login, role-specific mutation, or actual foreign-organization object denial was run. A random/nonexistent object would not prove cross-tenant isolation, so it was not counted.
- This replay changed only the labeled synthetic Preview ticket and did not touch Production. GitHub hosted CI remains unverified. Existing local evidence remains separately scoped.
- Git branch comparison was confirmed as 14 commits ahead of `origin/codex/assessment-mvp`; GitHub search returned no open PR. The separate local `main` ref is older and is not the comparison baseline for that 14-commit statement.

## Candidate and deployments

- Branch: `codex/preview-mobile-roster-ux`
- Latest branch commit: `ffe7a2a8ab72a92561daded62ca25d8774eaf4d3` (exact-candidate CI and Preview recheck).
- Web Preview branch alias: [customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app](https://customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app/)
- API Preview branch alias: [customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app](https://customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app/)
- Latest Web Preview deployment: ID `4f7oDdsW5tgiHNDWathUBfi2RvbP`, Ready; commit `ffe7a2a`; unique URL `https://customer-support-platform-161fa2yru.vercel.app`.
- Latest API Preview deployment: ID `5w5uvudahGv8HZnNo9YhysRgXj7B`, Ready; commit `ffe7a2a`; unique URL `https://customer-support-platform-r8q29fokg.vercel.app`.
- Both deployment details show Preview and Ready. The unique URLs are Vercel-protected; unauthenticated fetch returned an HTML auth page. Browser verification used the branch aliases above. Production was not changed.

## Configuration correction

The earlier sign-in failure was caused by stale Preview origins. API Preview general `APP_ORIGIN` was updated to the exact Web Preview alias above. Web Preview general `API_ORIGIN` was updated to the API Preview branch alias above. Production values were left unchanged. Both projects were redeployed to consume the corrected Preview values.

## Repeated health verification

Three browser rounds were run after the origin-fix redeploy (commit `e7c6e05`), four endpoint checks each, with all 12 checks returning the expected JSON. After the later documentation-only deploy (`14fcbd5`), direct health and readiness were rechecked through both branch aliases and returned `ok` / `ready`. The latest unique Vercel deployment URLs are access-protected, so unauthenticated Node fetches returned HTML and are not counted as endpoint failures.

| Round | Web proxy health | Web proxy readiness | API health | API readiness |
|---|---|---|---|---|
| 1 | `ok` | `ready` | `ok` | `ready` |
| 2 | `ok` | `ready` | `ok` | `ready` |
| 3 | `ok` | `ready` | `ok` | `ready` |

## Authenticated Preview UI check

Signed in with the synthetic Preview administrator documented in the root README; credentials are not duplicated in this evidence file. After the configuration fix, authentication succeeded and the following pages loaded in the same signed-in browser session:

- Ticket queue: three labeled synthetic tickets rendered. All three show status Resolved and priority High.
- Dashboard: three tickets total; zero overdue; all three Resolved; zero active assigned tickets. Agent roster metric rendered.
- Admin member roster: four active memberships rendered (two synthetic customers, one synthetic administrator, one synthetic agent).

The member roster showed four active memberships: two synthetic customers, the synthetic admin, and a synthetic agent. The credentials for the other three accounts are not available in the repo, so their sign-in journeys were not guessed. The roster UI does not expose the customer user ID required by the create form, so ticket creation remains unverified. On the exact-candidate branch alias, the admin updated synthetic ticket #3 priority High→Medium and received “Ticket updated.”, then restored Medium→High and verified the original status, priority, assignee, title, and description. Two priority-change audit events were added by this reversible check. This proves one successful authenticated update/restore on Preview, not an all-role lifecycle or foreign-ticket denial.

## Existing repeat test evidence

The local Playwright evidence in `rounds.json` records three fresh invocations, each with 23/23 tests passing; the focused responsive membership test passed 1/1 per round at widths 320, 375, 768, 900, 901, 1024, and 1440 CSS px. Responsive screenshots are stored in `round-1`, `round-2`, and `round-3`. These are local tests, not live-production tests.

## Parent reviewer disposition and remaining gates

The parent assessment reviewer remains `NOT_READY`; these Preview checks do not satisfy the complete assessment or production release gate. The synthetic Preview credential is intentional and is not a blocker. Still pending:

- Full authenticated Preview ticket lifecycle using test fixture identities (create, assign/update, comment, status transition) and customer/agent/admin role-specific flows.
- Cross-tenant and object-level authorization negative checks against the exact deployed candidate.
- Exact-SHA hosted CI is now PASS (run #18); clean exact-candidate Docker Compose build/start replay remains pending.
- Compatible rollback rehearsal and route-wide accessibility/responsive review.
- Independent final review on the exact candidate SHA.
- Google agent CLI review was not run; the installed Google CLI/auth configuration was unavailable in the prior check. Do not represent Google review as completed.

Use `evidence/reviews` and the parent reviewer kit for remaining gates. Production database, Vercel Production variables, and Production deployments were untouched by this recheck.


## Exact-candidate recheck — 2026-10-30 20:52 Asia/Calcutta

- GitHub Actions run [#18](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41052408691), job `verify`, was read through the connected GitHub reviewer tool. The log checks out and reports `git log -1` as `ffe7a2a8ab72a92561daded62ca25d8774eaf4d3`; the job conclusion is `success`. It completed disposable PostgreSQL setup, migrations and seed, lint, typecheck, API/web tests, 23/23 Playwright tests, and builds. This verifies A34 and current CI.
- Vercel deployment pages show Web `4f7oDdsW5tgiHNDWathUBfi2RvbP` and API `5w5uvudahGv8HZnNo9YhysRgXj7B` Ready on `ffe7a2a`. Branch aliases `git-f28eab` (web) and `git-e22907` (API) resolve the candidate. Web proxy `/api/health/ready` returned `{"status":"ready"}`.
- Existing synthetic admin session on the branch alias successfully opened the 3-ticket queue and 4-member roster. A reversible High→Medium→High update on ticket #3 returned success both times and the final ticket state matched its original values. The two resulting priority audit events remain in Preview.
- A fresh sign-in attempt on the immutable Web deployment URL failed CSRF origin validation; the canonical branch alias worked with the existing session. Do not treat the immutable URL failure as an app-wide sign-in failure; document/use the canonical branch alias and investigate immutable-origin policy separately.
- Agent/customer accounts are active membership rows, but no passwords are available in repository files; no guessing. Customer user IDs are not exposed in the roster/create form. No new ticket, agent/customer login, or true foreign-ticket denial was performed.
- Local security replay initially failed because `.env` targets localhost:5433 while the running Compose database publishes 15544. After verifying the configured URL points to loopback `support_test`/role `support_test`, a process-local port-only override was applied; `db:verify-test` passed and the five real-PostgreSQL API suites passed 73/73. No `.env` edit or hosted DB write occurred. The 73rd test remains an uncommitted test-only assignment rollback regression.
- Current release remains `NOT_READY`: exact-candidate Docker is API-unhealthy/web-container-created, full Preview roles/object denial/create flow and migration rollback are incomplete, and final independent review is pending.


## Latest candidate after verification commit — `eb4f285`

- Exact head `eb4f2855207b9b743227a52e7e569d9e9a4737d4` passed GitHub Actions run [#19](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41080629706), job `verify`: checkout SHA and `git log -1` match; 392 API tests, 12 web tests, 23 Playwright tests, lint/typecheck and builds passed.
- Vercel deployment pages show Web `D5JbsLzUsjZS1HXN2RwjX363111c` and API `12d6P7FjjJ4aJ31rSAdpUTN3S3Gp` Ready on this SHA. The branch alias readiness endpoint returned `{"status":"ready"}`; the synthetic admin signed in and queue showed three tickets.
- The assignment rollback test and reconciled ledger are committed. Existing high-to-medium-to-high Preview ticket mutation evidence is from prior `ffe7a2a`, same application code; the test/evidence commit changed no production application code.
- A35 remains blocked on agent/customer sign-in, ticket creation, real foreign-ticket denial, and valid reopen UX; A36 rollback compatibility, exact-candidate Docker, accessibility audit, and independent final review remain outstanding.
