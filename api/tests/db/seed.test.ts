import { scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testUrl = process.env.TEST_DATABASE_URL;
const client = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
let connected = false;

function deriveScrypt(password: string, salt: Buffer, keyLength: number, cost: number, blockSize: number, parallelism: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelism, maxmem: 128 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

describe('deterministic two-organization demo seed', () => {
  it('provisions the Alpha and Beta organizations', async () => {
    const result = await client.query(
      `SELECT "slug", "name"
       FROM "Organization"
       WHERE "slug" = ANY($1::text[])
       ORDER BY "slug"`,
      [['alpha-support', 'beta-support']],
    );

    expect(result.rows).toEqual([
      { slug: 'alpha-support', name: 'Alpha Support' },
      { slug: 'beta-support', name: 'Beta Support' },
    ]);
  });

  it('creates one admin, one agent, and two customers in each organization', async () => {
    const result = await client.query(
      `SELECT organization."slug", member."email", membership."role", member."passwordHash"
       FROM "Membership" AS membership
       JOIN "Organization" AS organization ON organization."id" = membership."organizationId"
       JOIN "User" AS member ON member."id" = membership."userId"
       WHERE organization."slug" = ANY($1::text[])
       ORDER BY organization."slug", member."email"`,
      [['alpha-support', 'beta-support']],
    );
    const accountRoles = result.rows.map(({ slug, email, role }) => ({ slug, email, role }));

    expect(accountRoles).toEqual([
      { slug: 'alpha-support', email: 'admin.alpha@example.test', role: 'ADMIN' },
      { slug: 'alpha-support', email: 'agent.alpha@example.test', role: 'AGENT' },
      { slug: 'alpha-support', email: 'customer.alpha.one@example.test', role: 'CUSTOMER' },
      { slug: 'alpha-support', email: 'customer.alpha.two@example.test', role: 'CUSTOMER' },
      { slug: 'beta-support', email: 'admin.beta@example.test', role: 'ADMIN' },
      { slug: 'beta-support', email: 'agent.beta@example.test', role: 'AGENT' },
      { slug: 'beta-support', email: 'customer.beta.one@example.test', role: 'CUSTOMER' },
      { slug: 'beta-support', email: 'customer.beta.two@example.test', role: 'CUSTOMER' },
    ]);
    for (const row of result.rows) {
      expect(row.passwordHash).toMatch(/^\$scrypt\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    }
  });

  it('hashes the documented demo password with a unique per-account scrypt salt', async () => {
    const documentation = readFileSync(new URL('../../../docs/demo-accounts.md', import.meta.url), 'utf8');
    const documentedPassword = documentation.match(/All accounts use the synthetic password `([^`]+)`/)?.[1];
    expect(documentedPassword, 'demo password must be documented for local walkthroughs').toBeTruthy();

    const result = await client.query(
      `SELECT "email", "passwordHash" FROM "User" WHERE "id"::text LIKE '20000000-%' ORDER BY "email"`,
    );
    const salts = new Set<string>();
    for (const row of result.rows) {
      const [, algorithm, cost, blockSize, parallelism, saltHex, digestHex] = row.passwordHash.split('$');
      expect(algorithm).toBe('scrypt');
      expect([cost, blockSize, parallelism]).toEqual(['32768', '8', '1']);
      expect(saltHex).toBeTruthy();
      salts.add(saltHex);
      const expectedDigest = Buffer.from(digestHex, 'hex');
      const actualDigest = await deriveScrypt(
        documentedPassword!,
        Buffer.from(saltHex, 'hex'),
        expectedDigest.length,
        Number(cost),
        Number(blockSize),
        Number(parallelism),
      );
      expect(timingSafeEqual(actualDigest, expectedDigest), row.email).toBe(true);
    }
    expect(salts.size).toBe(8);
  });

  it('includes same-org customer, foreign-org, lifecycle, priority, and overdue ticket fixtures', async () => {
    const result = await client.query(
      `SELECT organization."slug", ticket."ticketNumber", requester."email" AS requester_email,
              assignee."email" AS assignee_email, ticket."status", ticket."priority",
              ticket."dueAt" < TIMESTAMPTZ '2026-10-26 00:00:00+00'
                AND ticket."status" IN ('OPEN', 'IN_PROGRESS') AS overdue
       FROM "Ticket" AS ticket
       JOIN "Organization" AS organization ON organization."id" = ticket."organizationId"
       JOIN "User" AS requester ON requester."id" = ticket."requesterUserId"
       LEFT JOIN "User" AS assignee ON assignee."id" = ticket."assigneeUserId"
       WHERE organization."slug" = ANY($1::text[])
       ORDER BY organization."slug", ticket."ticketNumber"`,
      [['alpha-support', 'beta-support']],
    );

    expect(result.rows).toHaveLength(8);
    for (const slug of ['alpha-support', 'beta-support']) {
      const organizationTickets = result.rows.filter((row) => row.slug === slug);
      expect(organizationTickets.map((row) => row.ticketNumber)).toEqual([1, 2, 3, 4]);
      expect(new Set(organizationTickets.map((row) => row.status))).toEqual(
        new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
      );
      expect(new Set(organizationTickets.map((row) => row.priority))).toEqual(
        new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
      );
      expect(organizationTickets.some((row) => row.overdue)).toBe(true);
      expect(organizationTickets.some((row) => row.requester_email.includes('.one@'))).toBe(true);
      expect(organizationTickets.some((row) => row.requester_email.includes('.two@'))).toBe(true);
    }
    expect(result.rows.find((row) => row.slug === 'alpha-support' && row.ticketNumber === 1)?.requester_email)
      .not.toBe(result.rows.find((row) => row.slug === 'alpha-support' && row.ticketNumber === 2)?.requester_email);
    expect(result.rows.some((row) => row.slug === 'beta-support')).toBe(true);
  });

  it('is idempotent across repeated runs without changing seeded identities or hashes', async () => {
    const readSnapshot = async () => {
      const organizations = await client.query(
        `SELECT "id", "slug", "name" FROM "Organization"
         WHERE "slug" = ANY($1::text[]) ORDER BY "slug"`,
        [['alpha-support', 'beta-support']],
      );
      const users = await client.query(
        `SELECT "id", "email", "passwordHash" FROM "User"
         WHERE "id"::text LIKE '20000000-%' ORDER BY "email"`,
      );
      const memberships = await client.query(
        `SELECT membership."organizationId", membership."userId", membership."role", membership."isActive"
         FROM "Membership" AS membership JOIN "Organization" AS organization
           ON organization."id" = membership."organizationId"
         WHERE organization."slug" = ANY($1::text[])
         ORDER BY membership."organizationId", membership."userId"`,
        [['alpha-support', 'beta-support']],
      );
      const tickets = await client.query(
        `SELECT "id", "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId",
                "assigneeUserId", "title", "description", "status", "priority", "dueAt", "createdAt", "updatedAt"
         FROM "Ticket" WHERE "title" LIKE 'Demo:%' ORDER BY "organizationId", "ticketNumber"`,
      );
      return { organizations: organizations.rows, users: users.rows, memberships: memberships.rows, tickets: tickets.rows };
    };

    const before = await readSnapshot();
    await seedDatabase(client);
    await seedDatabase(client);
    expect(await readSnapshot()).toEqual(before);
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL must be set; refusing to run seed integration tests').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await client.connect();
  connected = true;
  const result = await client.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(result.rows[0], expected);
  await seedDatabase(client);
});

afterAll(async () => {
  if (connected) await client.end();
});
