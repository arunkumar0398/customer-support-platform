import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const alphaId = randomUUID();
const betaId = randomUUID();
const ids = {
  admin: randomUUID(), agent: randomUUID(), otherAgent: randomUUID(), inactiveAgent: randomUUID(),
  customer: randomUUID(), foreignAdmin: randomUUID(), foreignAgent: randomUUID(), foreignCustomer: randomUUID(),
};
const userIds = Object.values(ids);
type Account = keyof typeof ids;
const email = (account: Account) => `ticket-assign-${ids[account]}@example.test`;
const password = 'synthetic-ticket-assignment-fixture-password';
const origin = 'http://localhost:5173';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 5, application_name: `ticket-assign-${alphaId}` }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-assignment-csrf-key-at-least-32-characters' };
let app = createApp(options);
interface Identity { cookie: string; csrf: string }
const identities = new Map<Account, Identity>();
let verified = false;
const ticketIds: string[] = [];
let nextTicketNumber = 1;

async function signIn(account: Account): Promise<Identity> {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: email(account), password });
  expect(response.status).toBe(200);
  const identity = {
    cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    csrf: response.body.csrfToken,
  };
  identities.set(account, identity);
  return identity;
}

function assign(account: Account, ticketId: string, assigneeUserId: string | null, organizationId = alphaId) {
  const identity = identities.get(account)!;
  return request(app).patch(`/api/tickets/${ticketId}/assignment`).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', organizationId).set('X-Ticket-Version', '1')
    .send({ assigneeUserId });
}

async function createTicket(organizationId = alphaId) {
  const id = randomUUID();
  ticketIds.push(id);
  const row = await db.ticket.create({ data: {
    id, organizationId, ticketNumber: nextTicketNumber++, requesterUserId: organizationId === betaId ? ids.foreignCustomer : ids.customer,
    title: `Assignment fixture ${id}`, description: 'Synthetic assignment record', status: 'OPEN', priority: 'MEDIUM',
  } });
  return row;
}

describe('tenant-safe ticket assignment', () => {
  it.each(['admin', 'agent'] as const)('allows %s to assign a ticket to an active same-org agent', async (account) => {
    const ticket = await createTicket();
    const response = await assign(account, ticket.id, ids.otherAgent);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: ticket.id, organizationId: alphaId, assigneeUserId: ids.otherAgent, version: 2 });
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ assigneeOrganizationId: alphaId, assigneeUserId: ids.otherAgent });
    const event = await db.activityEvent.findFirstOrThrow({ where: { ticketId: ticket.id, type: 'ASSIGNMENT_CHANGED' } });
    expect(event.actorUserId).toBe(ids[account]);
    expect(event.previousValue).toBeNull();
    expect(event.newValue).toBe(ids.otherAgent);
  });

  it('allows staff to clear an assignment', async () => {
    const ticket = await createTicket();
    await db.ticket.update({ where: { id: ticket.id }, data: { assigneeOrganizationId: alphaId, assigneeUserId: ids.agent } });
    const response = await assign('admin', ticket.id, null);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ assigneeUserId: null, version: 2 });
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ assigneeOrganizationId: null, assigneeUserId: null });
    const event = await db.activityEvent.findFirstOrThrow({ where: { ticketId: ticket.id, type: 'ASSIGNMENT_CHANGED' } });
    expect(event.previousValue).toBe(ids.agent);
    expect(event.newValue).toBeNull();
  });

  it.each(['admin', 'agent'] as const)('rejects a cross-org agent target for %s without writes', async (account) => {
    const ticket = await createTicket();
    const response = await assign(account, ticket.id, ids.foreignAgent);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, assigneeUserId: null });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it.each([ids.customer, ids.inactiveAgent])('rejects an ineligible customer or inactive agent target: %s', async (targetId) => {
    const ticket = await createTicket();
    const response = await assign('admin', ticket.id, targetId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, assigneeUserId: null });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it('denies assignment attempts by customers', async () => {
    const ticket = await createTicket();
    const response = await assign('customer', ticket.id, ids.agent);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, assigneeUserId: null });
  });

  it('does not allow an alpha actor to assign a beta ticket by ID', async () => {
    const ticket = await createTicket(betaId);
    const response = await assign('admin', ticket.id, ids.agent);
    expect(response.status).toBe(404);
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, assigneeUserId: null });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it('enforces the composite organization-assignee foreign key in PostgreSQL', async () => {
    const ticket = await createTicket();
    await expect(db.ticket.update({
      where: { id: ticket.id }, data: { assigneeOrganizationId: alphaId, assigneeUserId: ids.foreignAgent },
    })).rejects.toThrow();
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ assigneeOrganizationId: null, assigneeUserId: null });
  });

  it('does not create an event or version increment for the current assignment', async () => {
    const ticket = await createTicket();
    const response = await assign('admin', ticket.id, null);
    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it('rolls back the assignment and version if PostgreSQL rejects its activity event', async () => {
    const ticket = await createTicket();
    const name = `tk17_${randomUUID().replaceAll('-', '')}`;
    try {
      await verifier.query(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic assignment event rejection'; END $$`);
      await verifier.query(`CREATE TRIGGER "${name}" BEFORE INSERT ON "ActivityEvent" FOR EACH ROW WHEN (NEW."organizationId" = '${alphaId}'::uuid) EXECUTE FUNCTION "${name}"()`);

      const rejected = await assign('admin', ticket.id, ids.agent);
      expect(rejected.status).toBe(500);
      expect(rejected.body.error.code).toBe('INTERNAL_ERROR');
      expect(rejected.text).not.toContain('synthetic assignment event rejection');
      expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({
        version: 1, assigneeOrganizationId: null, assigneeUserId: null,
      });
      expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
    } finally {
      await verifier.query(`DROP TRIGGER IF EXISTS "${name}" ON "ActivityEvent"`);
      await verifier.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    }

    const recovered = await assign('admin', ticket.id, ids.agent);
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ version: 2, assigneeUserId: ids.agent });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id, type: 'ASSIGNMENT_CHANGED' } })).toBe(1);
  });

  it('rejects malformed target IDs and forbidden fields', async () => {
    const ticket = await createTicket();
    for (const body of [{ assigneeUserId: 'not-a-uuid' }, { assigneeUserId: ids.agent, organizationId: betaId }, { assigneeUserId: undefined }]) {
      const identity = identities.get('admin')!;
      const response = await request(app).patch(`/api/tickets/${ticket.id}/assignment`).set('Cookie', identity.cookie)
        .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', alphaId).set('X-Ticket-Version', '1').send(body);
      expect(response.status).toBe(422);
    }
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, assigneeUserId: null });
  });

  it('requires a valid ticket UUID', async () => {
    const identity = identities.get('admin')!;
    const response = await request(app).patch('/api/tickets/not-a-uuid/assignment').set('Cookie', identity.cookie)
      .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', alphaId).set('X-Ticket-Version', '1').send({ assigneeUserId: ids.agent });
    expect(response.status).toBe(422);
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
  await db.organization.createMany({ data: [
    { id: alphaId, slug: `assign-${alphaId}`, name: 'Assign Alpha' },
    { id: betaId, slug: `assign-${betaId}`, name: 'Assign Beta' },
  ] });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ id: ids[account], email: email(account), passwordHash })) });
  await db.membership.createMany({ data: [
    { organizationId: alphaId, userId: ids.admin, role: 'ADMIN' },
    { organizationId: alphaId, userId: ids.agent, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.otherAgent, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.inactiveAgent, role: 'AGENT', isActive: false },
    { organizationId: alphaId, userId: ids.customer, role: 'CUSTOMER' },
    { organizationId: betaId, userId: ids.foreignAdmin, role: 'ADMIN' },
    { organizationId: betaId, userId: ids.foreignAgent, role: 'AGENT' },
    { organizationId: betaId, userId: ids.foreignCustomer, role: 'CUSTOMER' },
  ] });
  app = createApp(options);
  for (const account of ['admin', 'agent', 'customer', 'foreignAdmin'] as const) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
