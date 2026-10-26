import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testUrl = process.env.TEST_DATABASE_URL;
const client = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
let connected = false;

async function withRollback<T>(operation: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    return await operation();
  } finally {
    await client.query('ROLLBACK');
  }
}

describe('organization, user, and membership relational integrity', () => {
  it('stores an organization, normalized user, and role membership', async () => {
    await withRollback(async () => {
      const organizationId = randomUUID();
      const userId = randomUUID();
      const suffix = randomUUID();

      await client.query(
        'INSERT INTO "Organization" ("id", "slug", "name") VALUES ($1, $2, $3)',
        [organizationId, `org-${suffix}`, 'Review Fixture'],
      );
      await client.query(
        'INSERT INTO "User" ("id", "email", "passwordHash") VALUES ($1, $2, $3)',
        [userId, `user-${suffix}@example.test`, 'not-a-real-password-hash'],
      );
      await client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", "role") VALUES ($1, $2, $3)',
        [organizationId, userId, 'AGENT'],
      );

      const result = await client.query(
        'SELECT "role", "isActive" FROM "Membership" WHERE "organizationId" = $1 AND "userId" = $2',
        [organizationId, userId],
      );
      expect(result.rows).toEqual([{ role: 'AGENT', isActive: true }]);
    });
  });

  it('rejects a duplicate organization/user membership pair', async () => {
    await withRollback(async () => {
      const organizationId = randomUUID();
      const userId = randomUUID();
      const suffix = randomUUID();

      await client.query(
        'INSERT INTO "Organization" ("id", "slug", "name") VALUES ($1, $2, $3)',
        [organizationId, `org-${suffix}`, 'Review Fixture'],
      );
      await client.query(
        'INSERT INTO "User" ("id", "email", "passwordHash") VALUES ($1, $2, $3)',
        [userId, `user-${suffix}@example.test`, 'not-a-real-password-hash'],
      );
      await client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", "role") VALUES ($1, $2, $3)',
        [organizationId, userId, 'AGENT'],
      );

      await expect(client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", "role") VALUES ($1, $2, $3)',
        [organizationId, userId, 'ADMIN'],
      )).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('rejects a membership with a missing organization', async () => {
    await withRollback(async () => {
      const userId = randomUUID();
      const suffix = randomUUID();
      await client.query(
        'INSERT INTO "User" ("id", "email", "passwordHash") VALUES ($1, $2, $3)',
        [userId, `user-${suffix}@example.test`, 'not-a-real-password-hash'],
      );

      await expect(client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", "role") VALUES ($1, $2, $3)',
        [randomUUID(), userId, 'AGENT'],
      )).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects a membership with a missing user', async () => {
    await withRollback(async () => {
      const organizationId = randomUUID();
      const suffix = randomUUID();
      await client.query(
        'INSERT INTO "Organization" ("id", "slug", "name") VALUES ($1, $2, $3)',
        [organizationId, `org-${suffix}`, 'Review Fixture'],
      );

      await expect(client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", "role") VALUES ($1, $2, $3)',
        [organizationId, randomUUID(), 'AGENT'],
      )).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects mixed-case email storage so uniqueness uses normalized addresses', async () => {
    await withRollback(async () => {
      await expect(client.query(
        'INSERT INTO "User" ("id", "email", "passwordHash") VALUES ($1, $2, $3)',
        [randomUUID(), `Mixed-${randomUUID()}@example.test`, 'not-a-real-password-hash'],
      )).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('has the user-first membership index for active organization lookup', async () => {
    await withRollback(async () => {
      const result = await client.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'Membership'`,
      );
      const membershipIndex = result.rows.find((row: { indexname: string }) => row.indexname === 'Membership_userId_isActive_organizationId_idx');

      expect(membershipIndex).toBeDefined();
      expect(membershipIndex!.indexdef).toContain('("userId", "isActive", "organizationId")');
    });
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL must be set; refusing to run schema integration tests').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await client.connect();
  connected = true;
  const result = await client.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(result.rows[0], expected);
});

afterAll(async () => {
  if (connected) await client.end();
});
