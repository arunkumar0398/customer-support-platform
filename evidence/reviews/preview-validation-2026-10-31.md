# Preview validation — create and reopen UX candidate

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
