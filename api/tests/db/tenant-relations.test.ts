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

type Actor = { organizationId: string; userId: string };

async function withRollback(operation: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await operation();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function createActor(role: 'ADMIN' | 'AGENT' | 'CUSTOMER', label: string): Promise<Actor> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const suffix = randomUUID();

  await client.query(
    'INSERT INTO "Organization" ("id", "slug", "name") VALUES ($1, $2, $3)',
    [organizationId, `${label}-${suffix}`, label],
  );
  await client.query(
    'INSERT INTO "User" ("id", "email", "passwordHash") VALUES ($1, $2, $3)',
    [userId, `user-${suffix}@example.test`, 'not-a-real-password-hash'],
  );
  await client.query(
    'INSERT INTO "Membership" ("organizationId", "userId", "role") VALUES ($1, $2, $3)',
    [organizationId, userId, role],
  );

  return { organizationId, userId };
}

async function insertTicket(
  organizationId: string,
  requesterUserId: string,
  number: number,
  assigneeUserId?: string,
  assigneeOrganizationId?: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO "Ticket"
       ("id", "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", "title", "description")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, organizationId, number, requesterUserId, assigneeUserId ? assigneeOrganizationId ?? organizationId : null,
      assigneeUserId ?? null, 'Printer stopped', 'The device is offline.'],
  );
  return id;
}

describe('tenant-scoped ticket, comment, event, and session relations', () => {
  it('uses organization-scoped ticket numbers and initializes lifecycle fields', async () => {
    await withRollback(async () => {
      const alphaRequester = await createActor('CUSTOMER', 'alpha');
      const betaRequester = await createActor('CUSTOMER', 'beta');

      const alphaTicketId = await insertTicket(alphaRequester.organizationId, alphaRequester.userId, 1);
      const betaTicketId = await insertTicket(betaRequester.organizationId, betaRequester.userId, 1);
      const result = await client.query(
        `SELECT "organizationId", "ticketNumber", "status", "priority", "version"
         FROM "Ticket" WHERE "id" = ANY($1::uuid[]) ORDER BY "organizationId"`,
        [[alphaTicketId, betaTicketId]],
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows.map((row: { ticketNumber: number }) => Number(row.ticketNumber))).toEqual([1, 1]);
      expect(result.rows.map((row: { status: string }) => row.status)).toEqual(['OPEN', 'OPEN']);
      expect(result.rows.map((row: { priority: string }) => row.priority)).toEqual(['MEDIUM', 'MEDIUM']);
      expect(result.rows.map((row: { version: number }) => row.version)).toEqual([1, 1]);
    });
  });

  it('rejects a ticket requester who has membership only in another organization', async () => {
    await withRollback(async () => {
      const ticketOrgRequester = await createActor('CUSTOMER', 'requester-org');
      const foreignRequester = await createActor('CUSTOMER', 'foreign-requester');

      await expect(insertTicket(ticketOrgRequester.organizationId, foreignRequester.userId, 1))
        .rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects an assignee who has membership only in another organization', async () => {
    await withRollback(async () => {
      const requester = await createActor('CUSTOMER', 'requester');
      const foreignAgent = await createActor('AGENT', 'foreign-agent');

      await expect(insertTicket(requester.organizationId, requester.userId, 1, foreignAgent.userId))
        .rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects an assignee scope that differs from the ticket organization', async () => {
    await withRollback(async () => {
      const requester = await createActor('CUSTOMER', 'scope-requester');
      const foreignAgent = await createActor('AGENT', 'scope-foreign-agent');

      await expect(insertTicket(
        requester.organizationId,
        requester.userId,
        1,
        foreignAgent.userId,
        foreignAgent.organizationId,
      )).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('rejects an assignee user when the assignee organization scope is null', async () => {
    await withRollback(async () => {
      const requester = await createActor('CUSTOMER', 'null-assignee-scope-requester');
      const foreignAgent = await createActor('AGENT', 'null-assignee-scope-agent');

      await expect(client.query(
        `INSERT INTO "Ticket"
           ("id", "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", "title", "description")
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)`,
        [randomUUID(), requester.organizationId, 1, requester.userId, foreignAgent.userId,
          'Unscoped assignee', 'The assignee scope must not be nullable.'],
      )).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('rejects a comment author who has membership only in another organization', async () => {
    await withRollback(async () => {
      const ticketOwner = await createActor('CUSTOMER', 'ticket-owner');
      const foreignAuthor = await createActor('AGENT', 'foreign-author');
      const ticketId = await insertTicket(ticketOwner.organizationId, ticketOwner.userId, 1);

      await expect(client.query(
        `INSERT INTO "Comment" ("id", "organizationId", "ticketId", "authorUserId", "body")
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), ticketOwner.organizationId, ticketId, foreignAuthor.userId, 'I can see this?'],
      )).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects a comment that references a ticket in another organization', async () => {
    await withRollback(async () => {
      const alphaCustomer = await createActor('CUSTOMER', 'comment-alpha');
      const betaCustomer = await createActor('CUSTOMER', 'comment-beta');
      const betaTicketId = await insertTicket(betaCustomer.organizationId, betaCustomer.userId, 1);

      await expect(client.query(
        `INSERT INTO "Comment" ("id", "organizationId", "ticketId", "authorUserId", "body")
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), alphaCustomer.organizationId, betaTicketId, alphaCustomer.userId, 'Wrong tenant ticket'],
      )).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects an activity actor who has membership only in another organization', async () => {
    await withRollback(async () => {
      const ticketOwner = await createActor('CUSTOMER', 'event-owner');
      const foreignActor = await createActor('AGENT', 'foreign-actor');
      const ticketId = await insertTicket(ticketOwner.organizationId, ticketOwner.userId, 1);

      await expect(client.query(
        `INSERT INTO "ActivityEvent" ("id", "organizationId", "ticketId", "actorUserId", "type")
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), ticketOwner.organizationId, ticketId, foreignActor.userId, 'TICKET_CREATED'],
      )).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects an activity event that references a ticket in another organization', async () => {
    await withRollback(async () => {
      const alphaAgent = await createActor('AGENT', 'event-alpha');
      const betaCustomer = await createActor('CUSTOMER', 'event-beta');
      const betaTicketId = await insertTicket(betaCustomer.organizationId, betaCustomer.userId, 1);

      await expect(client.query(
        `INSERT INTO "ActivityEvent" ("id", "organizationId", "ticketId", "actorUserId", "type")
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), alphaAgent.organizationId, betaTicketId, alphaAgent.userId, 'TICKET_CREATED'],
      )).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects duplicate ticket numbers within the same organization', async () => {
    await withRollback(async () => {
      const requester = await createActor('CUSTOMER', 'number-owner');
      await insertTicket(requester.organizationId, requester.userId, 1);

      await expect(insertTicket(requester.organizationId, requester.userId, 1))
        .rejects.toMatchObject({ code: '23505' });
    });
  });

  it('rejects nonpositive organization-scoped ticket numbers', async () => {
    await withRollback(async () => {
      const requester = await createActor('CUSTOMER', 'nonpositive-number');

      await expect(insertTicket(requester.organizationId, requester.userId, 0))
        .rejects.toMatchObject({ code: '23514' });
    });
  });

  it('rejects a nonpositive ticket version', async () => {
    await withRollback(async () => {
      const requester = await createActor('CUSTOMER', 'nonpositive-version');
      const ticketId = await insertTicket(requester.organizationId, requester.userId, 1);

      await expect(client.query(
        'UPDATE "Ticket" SET "version" = 0 WHERE "id" = $1',
        [ticketId],
      )).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('stores a unique session token hash', async () => {
    await withRollback(async () => {
      const user = await createActor('CUSTOMER', 'session-user');
      const tokenHash = randomUUID().replaceAll('-', '').padEnd(64, 'a');
      const expiresAt = new Date(Date.now() + 60_000);
      await client.query(
        'INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4)',
        [randomUUID(), user.userId, tokenHash, expiresAt],
      );

      await expect(client.query(
        'INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4)',
        [randomUUID(), user.userId, tokenHash, expiresAt],
      )).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('rejects a session for a missing user', async () => {
    await withRollback(async () => {
      await expect(client.query(
        'INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4)',
        [randomUUID(), randomUUID(), randomUUID().replaceAll('-', '').padEnd(64, 'b'), new Date(Date.now() + 60_000)],
      )).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('has tenant-first indexes for ticket, comment, and activity history queries', async () => {
    await withRollback(async () => {
      const result = await client.query(
        `SELECT index_relation.relname AS index_name,
                string_agg(attribute.attname::text, ',' ORDER BY key.ordinality) AS columns
         FROM pg_index AS definition
         JOIN pg_class AS table_relation ON table_relation.oid = definition.indrelid
         JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
         JOIN pg_class AS index_relation ON index_relation.oid = definition.indexrelid
         CROSS JOIN LATERAL unnest(definition.indkey) WITH ORDINALITY AS key(attnum, ordinality)
         JOIN pg_attribute AS attribute
           ON attribute.attrelid = table_relation.oid AND attribute.attnum = key.attnum
         WHERE table_namespace.nspname = current_schema()
           AND index_relation.relname = ANY($1::text[])
           AND key.ordinality <= definition.indnkeyatts
         GROUP BY index_relation.relname`,
        [[
          'Ticket_org_created_id_idx',
          'Ticket_org_status_created_id_idx',
          'Comment_org_ticket_created_id_idx',
          'ActivityEvent_org_ticket_created_id_idx',
        ]],
      );
      const columnsByIndex = new Map(result.rows.map((row: { index_name: string; columns: string }) => [row.index_name, row.columns]));

      expect(columnsByIndex.get('Ticket_org_created_id_idx')).toBe('organizationId,createdAt,id');
      expect(columnsByIndex.get('Ticket_org_status_created_id_idx')).toBe('organizationId,status,createdAt,id');
      expect(columnsByIndex.get('Comment_org_ticket_created_id_idx')).toBe('organizationId,ticketId,createdAt,id');
      expect(columnsByIndex.get('ActivityEvent_org_ticket_created_id_idx')).toBe('organizationId,ticketId,createdAt,id');
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
