# Preview role and isolated audit blockers — 2026-10-31

## Preview role journeys and foreign-object denial

- Target tried: https://customer-support-platform-2tzahnjil.vercel.app/ (Preview deployment). The sign-in page loaded, but the documented synthetic Preview administrator login returned the visible error “Request origin or CSRF proof is invalid.” No session was established; no account or ticket writes were attempted.
- Local .env contains only the loopback support_dev and support_test database configurations; no Neon Preview connection is configured. No verified second organization/ticket fixture is available in local evidence.
- Result: agent/customer role journeys, setup of Preview-only agent/customer users, and true foreign-tenant object denial are BLOCKED. No credentials were guessed and no Preview/Production database was modified.
- Safe continuation: use the exact Vercel Preview origin configured in API APP_ORIGIN and a Neon Preview-only DB connection; establish an admin session; create labeled synthetic agent/customer memberships and a second-tenant foreign ticket; record IDs and verify the foreign object denial without changing Production.

## Cloudflare audit and deployed throttle

- Result: NOT_RUN. No Cloudflare audit skill is installed in the discovered user/agent/plugin skill directories, and no OS-enforced isolated audit sandbox is available in this session.
- No deployed login-throttle probing was performed. Do not run audit traffic against Preview or Production until the required sandbox and Cloudflare audit procedure are available.
- Required continuation: provision the mandated isolated environment, then follow its audit procedure against the isolated target only. Include normal login, threshold boundary, lockout/recovery, distributed/serverless behavior observation, and confirm no throttle weakening; record environment identity, exact commands, response codes, and evidence.
