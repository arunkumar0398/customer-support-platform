# Preview role and isolated audit blockers — 2026-10-31

## Preview role journeys and foreign-object denial

- An earlier per-deployment alias, https://customer-support-platform-2tzahnjil.vercel.app/, rejected the documented synthetic admin sign-in with “Request origin or CSRF proof is invalid.”
- Vercel deployment details identify the current branch Web alias as https://customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app/, built from docs head a5673cb with app source 2bcf65f. Admin sign-in succeeded there, and the Members page roster loaded. The roster shows the synthetic Preview Alpha organization with four active same-organization memberships: one admin, one agent, and two customers. This proves the admin sign-in and roster read only.
- Agent/customer passwords are not documented or verified. No agent/customer login was attempted. No new accounts, tickets, or other records were created, and no account or ticket writes were attempted.
- Local .env contains only the loopback support_dev and support_test database configurations; no Neon Preview connection is configured. No verified second organization/ticket fixture is available in local evidence, and no Neon Preview DB connection is configured locally.
- Result: agent/customer role journeys, setup of Preview-only agent/customer users, and true foreign-tenant object denial are BLOCKED. No credentials were guessed and no Preview/Production database was modified.
- Safe continuation: use the exact Vercel Preview origin configured in API APP_ORIGIN and a Neon Preview-only DB connection; establish an admin session; create labeled synthetic agent/customer memberships and a second-tenant foreign ticket; record IDs and verify the foreign object denial without changing Production.

## Cloudflare audit and deployed throttle

- Result: NOT_RUN. No Cloudflare audit skill is installed in the discovered user/agent/plugin skill directories, and no OS-enforced isolated audit sandbox is available in this session.
- No deployed login-throttle probing was performed. Do not run audit traffic against Preview or Production until the required sandbox and Cloudflare audit procedure are available.
- Required continuation: provision the mandated isolated environment, then follow its audit procedure against the isolated target only. Include normal login, threshold boundary, lockout/recovery, distributed/serverless behavior observation, and confirm no throttle weakening; record environment identity, exact commands, response codes, and evidence.
