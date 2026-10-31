# Migration and code rollback compatibility — 2026-10-31

- Current application source: `7c2fdba6efb7c39dbf723f100644a5c53928fd84`; evidence head: `770bfaac575b9d4b3aaf2abdabec294d7273e1b6`.
- Test target: fresh ephemeral Docker PostgreSQL 18.6 container `csp-a36-20261031`, loopback-bound dynamic port, no persistent volume. It was created solely for this check. Roles/databases `support_dev` and `support_test` were separate, and the test identity helper verified `support_test/support_test`.
- Migration command: `npm run db:migrate:test` on previous application commit `40bcce88e35df94893f8680c2fa9e10192ec4bd7`; all three checked-in migrations applied successfully to the disposable database. `npm run db:verify-test` confirmed the expected test database identity.
- Compatibility comparison: `git diff --name-status 40bcce8 7c2fdba -- api/prisma/schema.prisma api/prisma/migrations` was empty; the schema and migration history are identical between the previous code and current source.
- Code rollback exercise: with the current migrated disposable schema retained, previous-code API suite `npm run test:api` passed **395/395 tests across 24 files**. This exercises the previous application against the newer schema.

## Result and limits

A36 is **PASS** for forward migration plus previous-code compatibility on an isolated PostgreSQL database. The rollback strategy remains code rollback only: schema changes are forward-compatible and database migrations are not reversed. No `migrate reset`, schema drop, reverse migration, or hosted database action was used. This is not a test of restoring a database backup or reversing SQL migrations.
