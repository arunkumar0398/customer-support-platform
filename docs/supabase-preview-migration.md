# Supabase Preview migration rehearsal

**Status: preparation only.** No Supabase project has been created, no hosted data has been copied, no Vercel variable has been changed, and no deployment or migration has run. Production remains on Neon. This runbook is for a separately approved Preview/staging rehearsal.

Related decision: [Neon and Supabase availability decision](adr/0005-neon-supabase-availability.md). Current status is documented in [operations](operations.md).

## Why and when to rehearse

Neon compute autosuspend idles compute after inactivity and resumes it when a connection arrives. Supabase Free may pause a low-activity project after a week. A Supabase Free project is therefore not an always-on availability solution. Use a Preview migration to test PostgreSQL compatibility and restore procedures only. Do not use it to imply Production availability.

Before planning Production, the owner must identify whether the pain is a cold start or an actual database/project suspension, define the required availability target, and approve any recurring cost. No paid plan is selected by this document.

## Current database shape

The checked-in Prisma migrations target `public` and define the app enums, organizations, users, memberships, tickets, comments, activity events, sessions, constraints, and indexes. They use PostgreSQL-native UUID, `timestamptz`, and JSONB. The checked-in migration SQL has no provider-specific extensions, triggers, sequences, or functions. The app uses its own Express authentication and session records. It does not need Supabase Auth, Storage, Realtime, Edge Functions, browser-side database access, or Supabase client libraries.

This source review did not inspect any hosted table contents or row counts. The amount and nature of data in Neon Preview and Production are unknown. Production rows must not be queried for this rehearsal.

## Target design

- Create a new, isolated Supabase Preview project only after owner approval. Prefer Singapore (`ap-southeast-1`) to align with the Vercel Function region, then verify the actual created region and latency.
- Keep app tables in `public`; enable only PostgreSQL capabilities needed by the checked-in migrations.
- Keep the existing same-origin Web `/api` proxy and private Express API. Do not expose database credentials or a Supabase secret key to the browser.
- Disable the Data API in this project if the owner confirms no other approved workload uses it. The current application does not depend on Data API endpoints.
- Configure a non-owner API login role with `CONNECT`, `USAGE` on `public`, `USAGE` on app enum types, and only required `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on app tables. Grant sequence privileges only if the target schema has sequences. It must not have `CREATE`, object ownership, `CREATEROLE`, `CREATEDB`, superuser, or `BYPASSRLS` privileges.
- Configure a separate one-off migration login role with only the privileges needed to create and alter the app schema. It must own the app objects it needs to alter; `USAGE` and `CREATE` on `public` alone do not grant alteration rights over objects owned by another role. It must not be a superuser, have `CREATEROLE`, or administer unrelated schemas. Review existing object ownership and default grants before running migrations; the runtime role must remain unable to create or alter schema objects.
- Record only role names and sanitized grant outcomes in evidence. Store passwords in the provider secret store; never put them in this file.

## Connection policy

| Use | Variable | Connection mode |
|---|---|---|
| Vercel API runtime | `DATABASE_URL` | Supavisor transaction pooler is the first candidate for serverless. Begin with client pool `max: 1` per warm Vercel instance. |
| Prisma migrations and controlled restore | `DATABASE_URL_UNPOOLED` | Prefer the direct endpoint from a migration runner with IPv6 connectivity. If that runner cannot reach the IPv6 direct endpoint, evaluate the session pooler; do not use transaction mode for migrations. |

Use connection details copied from the approved project’s provider console; do not construct or commit URLs. Require TLS. Supabase direct connections may require IPv6 or an IPv4 add-on; shared poolers support IPv4. Verify reachability from the actual Vercel and migration runner environments before selecting a mode.

Supabase documents transaction pooling for serverless and notes that transaction mode does not preserve session state. Its connection guide lists `pgbouncer=true` for Prisma; this API uses Prisma's `@prisma/adapter-pg` driver adapter instead of the Prisma query engine. In the pinned adapter source, a query name is supplied only when `statementNameGenerator` is configured, and this application leaves it unset. Do not assume the Prisma URL flag controls the driver adapter or that unnamed statements alone prove compatibility. The exact lockfile versions (`@prisma/adapter-pg` 7.10.1 and `pg` 8.23.1) must still be exercised against Supavisor. Test interactive transactions, concurrent requests, stale connection recovery, session/auth workflows, and query behavior against Preview.

The API constructs one cached Prisma client at module scope. The serverless pool now uses one connection per warm instance; local runtime retains ten. Do not raise the hosted value until measured Preview concurrency and pooler/database metrics show queueing and capacity is verified.

## Rehearsal procedure

1. **Approve and identify targets.** Record the Neon Preview project/branch and Supabase Preview project/region/branch/database identities, operator, backup owner, migration owner, recovery owner, exact source SHA, and unique run ID. Use separate credentials and URLs for each environment. Never reuse Production or Preview database URLs, credentials, fixtures, deployment IDs, or run IDs across environments.
2. **Review the source without reading customer rows.** For a Preview data migration, the owner first confirms the source is isolated and synthetic or approves preserving its data. Inspect only schema identity and sanitized aggregate counts. Stop if the target/source identity is ambiguous or unexpected rows are discovered.
3. **Back up privately.** Take an owner-approved protected backup of the Preview source and record its hash, size, timestamp, source identity, and private storage location in a sanitized manifest. Keep the backup and any recovery material outside the repository with restrictive access. Do not post it to CI or GitHub.
4. **Restore to a new, empty destination.** Use the current official Neon-to-Supabase migration guidance and PostgreSQL `pg_dump`/`pg_restore` tools. Prefer a custom-format dump of `public` with owner/ACL metadata excluded, then restore with `--no-owner --no-privileges --exit-on-error`. Do not use `--clean`, `--if-exists`, or restore over data that must be retained. Preserve the Prisma `_prisma_migrations` table. Exclude provider-managed schemas and extensions unless the inventory proves an app dependency.
5. **Apply the approved migration role and grants.** Confirm the API runtime login is separate and cannot create/alter schema objects. Compare ownership and grants against the target design before app traffic is enabled.
6. **Reconcile data and schema.** Compare schema definitions, enums, constraints, indexes, foreign keys, and migration-history rows. Compare only sanitized counts for organizations, users, memberships, tickets, comments, activity events, and sessions; do not print record values. Abort on unexplained differences.
7. **Run Prisma migrations safely.** Point `DATABASE_URL_UNPOOLED` at the approved destination’s direct/session connection through the private operator environment. Run `npm run db:migrate` (`prisma migrate deploy`), never `prisma migrate dev` against hosted databases. Confirm no unexpected migration is pending and verify Prisma migration history.
8. **Deploy Preview only after separate approval.** Set the API Preview `DATABASE_URL` to the approved transaction pooler. Set the Web Preview API destination only if needed, then create new deployments because Vercel environment changes do not affect existing deployments. Record exact Web/API deployment IDs and SHAs. Do not change Production variables.
9. **Validate with synthetic fixtures.** Verify runtime database identity through an approved read-only identity query and retrieve a unique synthetic fixture through the intended Web/API pair. Run sign-in/session persistence, ticket create/list/filter/detail/update, comments/activity, dashboard, concurrency/version-conflict, role denial, cross-tenant denial, and denied-write before/after state checks. Confirm no denied write mutated tickets, comments, memberships, or activity events.
10. **Check recovery.** Restore the protected backup into a separate fresh disposable project/database and verify schema, migration history, and sanitized counts. Record restore command, exact target identity, elapsed time, and result without including secrets. Keep the source Neon Preview branch intact through the agreed verification window.
11. **Close the run.** Record PASS/FAIL/BLOCKED for each gate against exact source, restored DB, and deployment SHAs. Clean only run-owned synthetic fixtures if the run plan says temporary. Preserve backups and recovery files until the owner confirms cleanup. Revoke temporary credentials only after reconciliation is confirmed.

## Stop and rollback rules

- Stop before writing on a target mismatch, unknown source data, failed backup, permission mismatch, unexpected migration, or uncertain transaction outcome.
- Never point Preview at Production, run seed/reset against hosted data, modify real customers, or copy Production data into Preview.
- Do not dual-write. Before the new Preview database accepts writes, rollback may point its app back to the old Preview database after confirmation. After Supabase accepts writes, switching back loses those writes unless reconciled; capture and reconcile them or keep the new target authoritative.
- Do not delete the original source or its backup during the Preview test.
- Production migration, Production Vercel variables/deployments, plan upgrades, and cutover each require separate explicit approval after the rehearsal and a reviewed cutover plan.

## Evidence checklist

The sanitized run report records:

- source SHA, tool versions, exact commands, exit codes, backup digest, and restore artifact identity;
- source and destination project/branch/region/database identities, role names, schema/table grant summaries, and Data API setting;
- before/after schema and migration history comparison plus aggregate count comparison;
- Vercel Preview deployment IDs/SHAs, target identity, readiness, runtime fixture lookup, and pool configuration;
- role journey outcomes, expected/observed HTTP statuses, and persistent-state comparisons after denied writes;
- connection count, pooler metrics, concurrency results, restore result, residual fixture status, and limitations.

Never include database URLs, passwords, API keys, cookies, tokens, hashes, raw customer records, or secret environment values.
