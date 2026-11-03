# ADR 0005: Evaluate Supabase through an isolated Preview migration

- **Status:** Accepted for repository-only preparation; no hosted action approved
- **Date:** 2026-11-03
- **Decision owner:** repository owner

## Context

Neon compute autosuspend idles compute after inactivity and automatically wakes it when a client connects. Supabase Free can pause a low-activity project after seven days. The reported Neon behavior has not been shown to be a project-level outage, and a move to Supabase Free would not guarantee continuous availability.

The application already uses generic PostgreSQL through Prisma 7 and the `pg` adapter. Its checked-in schema is in `public` and uses ordinary PostgreSQL enums, UUID, `timestamptz`, JSONB, constraints, and indexes. No provider-specific extensions, triggers, sequences, or functions are defined in the migrations. The app uses its own Express auth/session implementation.

## Decision

Keep Production on Neon. Do not migrate solely to address compute autosuspend. First clarify whether the requirement is to reduce cold-start latency or to keep compute continuously active. Neon offers a low-change cold-start setting; disabling scale-to-zero requires a paid plan. Supabase Pro is a candidate for avoiding inactivity pauses but starts at $25/month plus possible usage. No paid plan has been selected or purchased.

Prepare an isolated Supabase Preview migration design and repository portability changes only. A Free project may be used for compatibility tests if separately approved, but it cannot be represented as a continuous-availability fix. Keep Supabase, Neon Preview, and Production projects, credentials, URLs, fixtures, and run IDs separate.

## Consequences

- Runtime continues to use `DATABASE_URL`; Prisma migrations use separate `DATABASE_URL_UNPOOLED`.
- The API client remains module-scoped and begins with a one-connection pool on Vercel, ten locally. Do not increase the Vercel value without Preview concurrency and pooler metrics.
- A Supabase Preview candidate uses Singapore (`ap-southeast-1`), the existing private Express API, and `public` schema. Supabase Auth and browser-side database access remain out of scope.
- Preview must test the locked Prisma/`pg` versions against Supavisor, role grants, restore, migration history, schema, aggregate counts, and synthetic authorization journeys before any Production proposal.
- Hosted source data and row counts remain uninspected. A protected backup and owner-approved source/target identities are prerequisites to a data migration rehearsal.
- Production migration, Vercel settings, provider project creation, paid plan changes, deployments, and Production cutover require separate explicit approval.

## References

- [Supabase Preview migration rehearsal](../supabase-preview-migration.md)
- [Full availability and migration design](../superpowers/specs/2026-11-03-neon-supabase-availability-and-preview.md)
- [Neon compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle)
- [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase pricing](https://supabase.com/pricing)
