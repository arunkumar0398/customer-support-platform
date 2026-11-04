# Neon and Supabase availability decision and Preview design

**Status:** Approved for repository-only preparation on 2026-11-03. This is not approval to create a hosted project, transfer hosted data, change Vercel or Neon settings, deploy, or cut over Production.

## Decision summary

Do not move Production from Neon as a response to compute autosuspend alone. First determine whether the actual requirement is to avoid a cold connection or to guarantee that the database project is continuously available. Neon compute idling preserves the database and activates on a connection; Supabase Free can pause the whole project after a week of low activity. Supabase Free therefore is not a reliable continuous-availability fix.

Keep Production on Neon while preparing a separate Supabase Preview rehearsal. The rehearsal is a compatibility and migration exercise, not an availability proof and not a Production cutover. Do not select a paid plan or incur charges as part of this work.

## Availability options

| Option | Availability behavior | Cost and scope | Assessment |
|---|---|---|---|
| Neon with the existing scale-to-zero behavior | An idle compute becomes Idle after the configured period and wakes on connection. The documented default is five minutes; a first request may have higher latency. | Lowest-change option; no provider migration. Disabling scale-to-zero requires a paid Neon plan. The owner must check whether the current plan permits a longer timeout before changing it. | Preferred first response if the issue is a cold start. It does not promise always-active compute. |
| Supabase Free | A project with insufficient database activity over a seven-day period may be paused. Routine activity is not guaranteed to prevent pausing. | $0; limited compute/storage/features and no inactivity-availability guarantee. | Does not meet a continuous-availability requirement. Suitable only for disposable Preview compatibility testing. |
| Supabase Pro | Paid projects are not automatically paused for inactivity. This avoids the specific Free-plan pause behavior, but does not itself establish an uptime SLA or eliminate provider outages. | Current public list price starts at $25/month. Compute credits cover one Micro instance in the pricing example; additional usage, projects, storage, egress, add-ons, and taxes can change the bill. No purchase is authorized. | Candidate only if the owner approves recurring cost and the app requirement is continuous service without inactivity pause. |

Neon compute autosuspend is not the same as suspending or pausing the database project: storage remains available and the compute resumes on a connection. If the reported event was a provider/account suspension rather than an idle compute, changing providers is not justified until its cause is established.

## Current repository facts

- The app is React/Vite, an Express API, Prisma 7, `@prisma/adapter-pg` 7.10.1, and `pg` 8.23.1. Prisma's schema provider is generic `postgresql`.
- Runtime connection is `DATABASE_URL`; Prisma CLI migrations use `DATABASE_URL_UNPOOLED`.
- At base SHA `70a30e413e286748bd8b298ec96a99ee5c46d0c8`, `api/src/db/client.ts` created one module-scoped client with `max: 10`. This branch changes only the pool maximum by runtime marker; it retains the module-scoped client.
- Checked-in migrations use `public`, PostgreSQL enums, UUID, `timestamptz`, JSONB, foreign keys, checks, and indexes. The migrations contain no extension, trigger, sequence, or stored-function creation.
- The app owns authentication and server-side sessions. Supabase Auth and browser-side database access are out of scope.
- This repository review did not query hosted database contents or row counts. Whether hosted data must be preserved remains unknown and is a hard prerequisite to a restore rehearsal.
- Existing Vercel function configuration pins `sin1`. Supabase currently lists Singapore as `ap-southeast-1`; actual project placement and latency remain to be checked in the approved Preview project.

## Supabase Preview design

1. Use a new, isolated Preview/staging Supabase project in Singapore (`ap-southeast-1`) if the owner approves project creation and applicable charges. Keep its database in `public` unless the rehearsal identifies a concrete incompatibility.
2. Continue routing browser requests through the existing same-origin Web proxy to the private Express API. The browser must not receive a database URL, Supabase secret key, or direct database access.
3. Disable the Data API in the Preview project if the owner confirms no other approved service depends on it. The current app uses only its Express API; this setting has not been changed.
4. Use separate login roles. The API runtime role receives only `CONNECT`, `USAGE` on `public`, required enum `USAGE`, and DML grants on the application tables/sequences. It must not own schemas or objects and must not create/alter schema objects or administer roles. The one-off migration role may create objects in `public` and own the app objects it creates; it must not be superuser, `CREATEROLE`, or able to modify unrelated schemas. Owner-reviewed grants and default privileges must be rehearsed before use.
5. For Vercel runtime, evaluate Supavisor transaction pooling (port 6543) and begin with one client-pool connection per warm function instance. Keep the Prisma client at module scope. For migrations, use a direct connection where the runner has IPv6 connectivity; otherwise evaluate the Supabase session pooler. Never run migrations through transaction mode.
6. Supabase's connection guide lists `pgbouncer=true` for Prisma transaction-pooler use. This application uses Prisma's `@prisma/adapter-pg`, not the Prisma query engine; the pinned adapter only supplies a query name when `statementNameGenerator` is configured, and this app does not configure one. Do not assume the Prisma URL flag controls this adapter or that unnamed statements alone prove compatibility. Exercise the exact locked versions, interactive transactions, retries, concurrency, and reconnect behavior against Preview before acceptance.
7. Keep TLS required. Do not place connection strings in source, CLI arguments, screenshots, build output, or reports. Keep `DATABASE_URL` and `DATABASE_URL_UNPOOLED` distinct and environment-scoped.

## Migration rehearsal and exit criteria

No hosted source or destination has been approved or connected for this migration. A rehearsal may begin only after the owner supplies an isolated Preview source, a new Supabase Preview destination, private credentials, a backup owner, and a run-specific approval.

The runbook must take a protected backup, restore to an empty target without `--clean`, preserve `public` application tables and `_prisma_migrations`, and exclude owner/privilege metadata and provider-managed schemas. It must compare the Prisma migration history, schema/constraints/indexes, and sanitized counts for organizations, users, memberships, tickets, comments, activity events, and sessions. It must then run `prisma migrate deploy` against the target and verify authentication, persistence, tenant denials, concurrency, and no-write behavior using synthetic data only.

A Preview run passes only when exact Web/API deployment identities, API target identity, Supabase project/region, schema/migration checks, user journeys, denials, before/after persistent state, connection behavior, and restore evidence all agree. Provider build status or health response alone is insufficient.

## Production remains out of scope

Production remains on Neon. A future cutover requires a separate approval and runbook with source/target identities, backup and recovery owners, downtime window, data-preservation plan, deployment SHA, secret custody, communication plan, and rollback policy. No dual-write is planned. If Supabase accepts writes, switching `DATABASE_URL` back to Neon would lose those writes unless they are reconciled. Keep Neon intact through the agreed verification window.

## Source references checked 2026-11-03

- [Neon compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle)
- [Neon compute management](https://neon.com/docs/manage/computes)
- [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase database connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Prisma ORM 7 connection pools](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [Prisma ORM 7 pooler configuration](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer)
- [Prisma prepared-statement behavior by driver](https://www.prisma.io/postgres/prepared-statement-already-exists)
