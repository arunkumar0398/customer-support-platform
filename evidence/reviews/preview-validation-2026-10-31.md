# Preview validation — create and reopen UX candidate

## Latest exact-candidate verification — 2026-10-31, `40bcce8`

- Branch/commit: `codex/preview-mobile-roster-ux` / `40bcce88e35df94893f8680c2fa9e10192ec4bd7`.
- Vercel dashboard lists the matching Web deployment `customer-support-platform-8smcp541w.vercel.app` and API deployment `customer-support-platform-2m1kz1496.vercel.app` as Ready on `40bcce8`. The web branch alias used below was `https://customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app`.
- API readiness returned `{"status":"ready"}` and Web `/api/health` returned `{"status":"ok"}` through the same-origin proxy.
- Sign-in on the immutable Web URL `https://customer-support-platform-8smcp541w.vercel.app/sign-in` returned the application error “Request origin or CSRF proof is invalid.” The branch alias restored the documented synthetic admin session. This indicates the immutable URL's Origin does not match the configured Preview origin or its proxy protection header was not accepted; the exact cause is not established because the protected environment value and request headers were not revealed. No Vercel environment settings were changed.
- Admin roster showed four active same-org accounts: the documented synthetic admin, one agent, and two customers. No agent/customer password was found in checked repository evidence, and none was guessed.
- Created synthetic Preview ticket #5, ID `ef909eb7-d5dc-4869-9ac4-25b4d56e480b`, for the active customer. Changed priority Medium→High and added a labeled comment. Both succeeded and are visible in activity/conversation history.
- Opened the same ticket in two authenticated tabs, loaded the same version, saved the High-priority update in one tab, and submitted a stale subject update in the other. The stale update was rejected with “Ticket version is stale. Reload the ticket and retry.” The saved ticket's priority remained High, subject remained unchanged, and no extra activity event was added for the denied stale update.
- Synthetic ticket #5 and its comment/activity remain in Preview for repeatable testing. Existing user data and Production were not touched.
- Immutable candidate sign-in and branch-alias sign-in are distinct observations. The branch alias resolved to the latest branch preview around this check; the deployment list independently identified `40bcce8` as the latest Ready Web/API candidate. Agent/customer journeys, second-tenant foreign-object denial, and assignment rollback remain unverified.

## Historical create/reopen verification — `a44a96d`

- Date: 2026-10-31 (Asia/Calcutta)
- Git branch/commit: `codex/preview-mobile-roster-ux` / `a44a96d50cda832b824716484b5c7a8cffd9b7df`
- Vercel Web deployment: `Ardpg9PT1iqaMnoS8yEKmk7ux6D6`, Ready, unique URL `https://customer-support-platform-ft41s71jw.vercel.app`; configured branch alias `https://customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app`.
- Vercel API deployment: `DXnr4ZkaCJZMVcUxRpTKxYmfYr8i`, Ready, unique URL `https://customer-support-platform-lj0egzg99.vercel.app`; configured branch alias `https://customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app`.
- Anonymous Node HTTP probes to unique deployment routes redirected to Vercel SSO (302). Authenticated Codex browser could access them; this is expected project protection and not an application response.
- No Production deployment, data, or environment variables were changed.

## Checks performed in the authenticated Preview browser

| Check | Result | Observation |
|---|---|---|
| API readiness | PASS | Exact candidate API `/api/health/ready` returned `{"status":"ready"}`. |
| Web proxy liveness | PASS | Exact candidate Web `/api/health` returned `{"status":"ok"}`. |
| Synthetic admin sign-in | PASS | Documented Preview-only admin signed in on the branch alias; UI identified the Assessment Preview Alpha organization and admin role. |
| Staff customer lookup | PASS | Create form loaded two active same-organization synthetic customer options. |
| Staff ticket create | PASS | Created synthetic ticket #4, ID `5b10d1a8-5e54-4aa2-aea1-0d17928de575`, for `preview-customer1-20261030-9693f9@example.test`, subject “TK25 Preview requester picker verification 2026-10-31”. It remains in the Preview database for repeatable testing. |
| Blank reopen reason | PASS | On resolved ticket #3, selecting In Progress exposed the reason field; whitespace-only reason was rejected and the inline message “Enter a reason for reopening this ticket.” appeared. No status mutation occurred for the blank attempt. |
| Reasoned reopen | PASS | A labeled validation reason was accepted; ticket #3 changed to In Progress and the activity history showed the reason with the status event. |
| Fixture restoration | PASS | Ticket #3 was returned to Resolved. The immutable reopen and restore events remain in Preview history. |

## Acceptance limits

- **A35 remains BLOCKED.** This run authenticated only the admin. Agent and customer Preview credentials were not available in repository evidence and were not guessed. The observed Preview organization did not provide a verified second-tenant/foreign-ticket fixture, so a true foreign-object denial was not run.
- This report does not claim customer or agent journeys, stale-version behavior, assignment atomicity, deployment migration rollback, or a full accessibility audit.
- Anonymous API probes cannot be treated as health failures because Vercel Authentication intercepted them. The authenticated browser result is the evidence for the health responses above.
