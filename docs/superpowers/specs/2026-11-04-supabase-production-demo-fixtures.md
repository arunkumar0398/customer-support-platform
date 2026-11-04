# Supabase Production Synthetic Demo Fixtures

**Status:** Owner-approved design for repository implementation. This approval does not authorize a Production account write.

## Purpose and scope

The assessment's Section 8 accepts either sample credentials or seed instructions. The existing local-only seed instructions already meet that item. Persistent Production demo accounts are optional owner-requested operational work, separate from the assessment deliverable.

This change adds a one-off, operator-run Supabase Production fixture command so the owner can use the Vercel Production app with synthetic users. It does not change the local seed, add a public endpoint, migrate Neon data, change Vercel configuration, deploy, or write to any hosted database. A reviewed PR and a separate exact-run approval must precede the first Production account write.

## Fixed Production target

The CLI owns this allowlist in code and does not accept target overrides:

- Provider: Supabase PostgreSQL.
- Project ref: `ityzntsmumvtktjjdacs`.
- Region: `ap-northeast-2` (Seoul), as recorded by the owner.
- Direct database host: `db.ityzntsmumvtktjjdacs.supabase.co`.
- Database: `postgres`.
- Login: `csp_prod_runtime`.
- Connection: direct host on port 5432 with TLS certificate validation.

The command accepts no URL, project, branch, host, role, or database flags. It reads `SUPABASE_PRODUCTION_DIRECT_DATABASE_URL` from the current operator process, parses it without logging it, verifies host/database/user/port, connects with certificate-validated TLS, then checks PostgreSQL's reported database and role. It also verifies required application tables, read/insert grants, and that the runtime login is not a superuser, cannot create roles/databases, cannot create objects in `public` or the database, and has no prohibited privileged-role memberships. An inability to prove these conditions stops the run before writing.

The URL is never placed in CLI arguments, files, output, or repository configuration. Production runtime Vercel configuration remains separate and is not read or changed by this tool.

## Synthetic dataset and lifecycle

One unique run creates exactly two independent organizations, Alpha and Beta, each with one ADMIN, one AGENT, and two CUSTOMER accounts. It creates two synthetic tickets per organization, one for each customer, assigned to that organization's agent. Each ticket receives one `TICKET_CREATED` activity event. There are no comments or sessions at creation.

All slugs, emails, titles, and descriptions carry a unique run marker; email addresses use `example.test`. The command generates a unique high-entropy password for each account and hashes it with the application's existing scrypt implementation. Passwords and hashes are never logged. A credential JSON file contains the one-time plaintext passwords; a separate sanitized private manifest contains account/object IDs and roles but no password or hash.

These are persistent evaluator demo accounts. There is no automatic expiry, password rotation, or cleanup command. Same-run reruns fail on existing run markers and never rotate credentials. The owner must retain custody of the private credential file, arrange private delivery, and assign a named access-review/rotation/retirement owner and cadence before provisioning. Retirement is an owner-led, separately reviewed operation; this CLI cannot delete records.

## Transaction, recovery, and private files

The operator supplies a new absolute output directory outside the repository and outside synced/shared folders. It must not already exist. The tool creates it with owner-only access (POSIX mode 0700; Windows DACL restricted to the current operator), verifies the effective access list, and creates files exclusively with owner-only access. If privacy cannot be established, it stops before DB writes.

All organization, user, membership, ticket, and activity inserts occur in one database transaction after run-marker collision checks. The command never updates existing rows. Before commit failures are rolled back; when rollback is confirmed, newly created private files are removed. Once COMMIT is attempted, any uncertain outcome preserves both private files and reports the run ID and recovery paths without printing passwords. The operator must reconcile only that run before any further action. There is no blind retry.

The manifest is not a cleanup authorization. No Production cleanup behavior is implemented in this feature.

## Validation and release boundary

Production-shaped URL refusals, CLI confirmation, file-path/permission controls, collision refusal, atomic rollback, generated credentials, password hashing, and exact two-tenant records are covered by tests. The full data path is exercised only against the disposable local `support_test` PostgreSQL database. Tests cannot target Supabase or Vercel Production.

After PR review and a separate exact-run approval, the operator may run the command once, then validate logins and permitted/denied journeys through the exact Vercel Production Web/API deployments using only the new synthetic records. Provider deployment status and health readiness are not role-journey or tenant-isolation evidence. Any rejected write must be paired with before/after synthetic-state comparison.

## Owner gates not covered by implementation approval

- Review and merge the implementation PR before a hosted account write.
- Approve the exact Production run ID and one-time write scope after reviewing the final CLI and record plan.
- Confirm the operator, private delivery channel, named account custodian, access-review cadence, rotation owner, and retirement owner.
- Confirm the current Vercel Production Web/API deployment identities and application/database binding before signing in.
