# A36 local migration and recovery rehearsal — 2026-11-01

## Scope and isolation

- Application source under compatibility test: `39b9ae3` (`feat-add-tenant-ticket-session-schema`), immediately before migration `6c0a274` (`fix-ticket-assignee-tenant-scope`).
- Current schema/migration set: three checked-in Prisma migrations from application source `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`.
- All databases were created in dedicated local PostgreSQL 18.6 containers with loopback-only host ports 5547, 5548, and 5549 and synthetic rows. No hosted database, Preview, or Production was used.
- The first two temporary containers were setup probes; the recorded passing compatibility run used `csp-a36-compat-postgres-20261101` on `127.0.0.1:5549` with separate `support_dev` and `support_test` roles/databases.

## Forward migration, data, backup restore

1. In a fresh disposable database (`support_test / support_test`), `npm run db:migrate` exited 0 and applied all three migrations. The initial application tables had zero rows.
2. `A36-migration-recovery-fixture.sql` inserts synthetic data and asserts the migration count, four check constraints, and tenant lookup indexes. It exited 0 and reported: organizations 2, users 2, memberships 2, tickets 1, comments 1, activity events 1, sessions 1, applied migrations 3.
3. `pg_dump --format=custom --no-owner --no-acl` exited 0. `pg_restore` restored that snapshot into a separate empty disposable database, `support_test_recovery`.
4. `A36-migration-recovery-verify.sql` exited 0 on the restored copy. It confirmed the same row counts, three successful migration records, the four check constraints, and the named tenant-oriented indexes.
5. `npm run db:migrate` against the restored database exited 0 with “No pending migrations to apply.”

The SQL scripts are guarded by local database identity checks and use fixed synthetic values only.

## Previous-code compatibility

On the separate port-5549 disposable database, current migrations were applied first. Then the pre-fix application snapshot `39b9ae3` ran:

- `npm run db:verify-test` — exit 0; confirmed `support_test / support_test`.
- `npm run test:api` — exit 0; **4 files, 28/28 tests passed**, including database-role separation checks.

An earlier attempt against a temporary database lacking the expected separate development role failed two environment-identity assertions (`support_dev` database/permissions were missing); that was not counted as app compatibility evidence. After recreating the disposable environment with the intended separate roles, all 28 tests passed.

## A36 result and limits

**PASS for the documented local recovery strategy and previous-code compatibility criterion.** The tested recovery path is a logical backup restore to a separate database followed by forward migration verification; prior application code also passed its API suite against the migrated schema. This is not a SQL down migration and does not validate Neon PITR, provider backups, production recovery, or a destructive rollback. No `DROP`, reset, or migration reversal was run. A SQL down-migration remains unimplemented and untested; the project strategy is restore/forward-fix with backward-compatible application rollback.
