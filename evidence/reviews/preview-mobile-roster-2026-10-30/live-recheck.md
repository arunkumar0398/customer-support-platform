# Preview deployment recheck — 2026-10-30

## Candidate and deployments

- Branch: `codex/preview-mobile-roster-ux`
- Source commit: `e7c6e052e85cfbae94f7701c85e7c34d065f6259` (documentation refresh; includes UI commit `51a8d08`).
- Web Preview branch alias: [customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app](https://customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app/)
- API Preview branch alias: [customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app](https://customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app/)
- Web redeployment of `e7c6e05`: ID `GXvRrb8ZtZTbqV4SDkYrKozGiBQF`, Ready, Preview; unique URL `https://customer-support-platform-phpc45cdb.vercel.app`.
- API redeployment of `e7c6e05`: ID `APND8WXfRBM3pjX4qbBdCpqhZEHG`, Ready, Preview; unique URL `https://customer-support-platform-rdpjmn5h1.vercel.app`.
- Both deployments source `e7c6e05`; Production was not changed.

## Configuration correction

The earlier sign-in failure was caused by stale Preview origins. API Preview general `APP_ORIGIN` was updated to the exact Web Preview alias above. Web Preview general `API_ORIGIN` was updated to the API Preview branch alias above. Production values were left unchanged. Both projects were redeployed to consume the corrected Preview values.

## Repeated health verification

Three rounds were run after redeploy, with four checks per round. Every result matched the expected JSON status (12/12):

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

The initial `Request origin or CSRF proof is invalid.` result was observed before correcting both Preview origin variables. It did not recur after the redeploy. No ticket or membership mutation was performed in this recheck. The browser-visible roster does not expose membership IDs required by the ticket creation form, so this run does not claim a create/update/comment lifecycle or cross-role negative proof.

## Existing repeat test evidence

The preceding local Playwright evidence in `rounds.json` records three fresh invocations, each with 23/23 tests passing; the focused responsive membership test passed 1/1 per round at widths 320, 375, 768, 900, 901, 1024, and 1440 CSS px. Responsive screenshots are stored in `round-1`, `round-2`, and `round-3`. These are local tests, not live-production tests.

## Parent reviewer disposition and remaining gates

The parent assessment reviewer remains `NOT_READY`; these Preview checks do not satisfy the complete assessment or production release gate. Still pending:

- Full authenticated Preview ticket lifecycle using test fixture identities (create, assign/update, comment, status transition) and customer/agent/admin role-specific flows.
- Cross-tenant and object-level authorization negative checks against the exact deployed candidate.
- Exact-SHA hosted CI proof and clean Docker Compose build/start replay; earlier container-to-npm registry access failed with `ECONNRESET`.
- Compatible rollback rehearsal and route-wide accessibility/responsive review.
- Independent final review on the exact candidate SHA.
- Google agent CLI review was not run; the installed Google CLI/auth configuration was unavailable in the prior check. Do not represent Google review as completed.

Use `evidence/reviews` and the parent reviewer kit for remaining gates. Production database, Vercel Production variables, and Production deployments were untouched by this recheck.
