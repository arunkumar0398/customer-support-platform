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
const ids = { admin: randomUUID(), agent: randomUUID(), customer: randomUUID(), other: randomUUID(), foreign: randomUUID() };
const userIds = Object.values(ids);
type Account = keyof typeof ids;
const email = (account: Account) => `activity-${ids[account]}@example.test`;
const password = 'synthetic-activity-fixture-password';
const origin = 'http://localhost:5173';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 5, application_name: `activity-${alphaId}` }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-activity-csrf-key-at-least-32-characters' };
let app = createApp(options);
interface Identity { cookie: string; csrf: string }
const identities = new Map<Account, Identity>();
let verified = false;
const alphaTicketId = randomUUID();
const otherTicketId = randomUUID();
const betaTicketId = randomUUID();
const eventIds = [randomUUID(), randomUUID(), randomUUID()];
const eventTime = new Date('2026-10-01T12:00:00.000Z');

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

function activity(account: Account, ticketId: string, organizationId = alphaId) {
  return request(app).get(`/api/tickets/${ticketId}/activity`).set('Cookie', identities.get(account)!.cookie)
    .set('X-Organization-ID', organizationId);
}

function update(account: Account, ticketId: string, body: object, organizationId = alphaId) {
  const identity = identities.get(account)!;
  return request(app).patch(`/api/tickets/${ticketId}`).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', organizationId).send(body);
}

describe('tenant-scoped immutable activity history and transaction atomicity', () => {
  it('returns activity in stable chronological order with a bounded page envelope', async () => {
    const response = await activity('admin', alphaTicketId).query({ page: 1, pageSize: 2 });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    const expected = [...eventIds].sort();
    expect(response.body.items.map((event: { id: string }) => event.id)).toEqual(expected.slice(0, 2));
    expect(response.body.items.every((event: { ticketId: string }) => event.ticketId === alphaTicketId)).toBe(true);
    expect(response.text).not.toContain('passwordHash');
  });

  it('allows a customer to read their own history but not another customer history', async () => {
    const own = await activity('customer', alphaTicketId);
    const other = await activity('customer', otherTicketId);
    expect(own.status).toBe(200);
    expect(own.body.total).toBe(3);
    expect(other.status).toBe(404);
    expect(other.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
  });

  it('does not disclose foreign-organization events', async () => {
    const foreign = await activity('admin', betaTicketId);
    const ownTenant = await activity('foreign', betaTicketId, betaId);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('NOT_FOUND');
    expect(ownTenant.status).toBe(200);
    expect(ownTenant.body.total).toBe(0);
  });

  it.each([{ page: 0 }, { page: 1.2 }, { pageSize: 101 }, { page: ['1', '2'] }, { extra: 'x' }])
    ('rejects invalid activity pagination query: %j', async (query) => {
      const response = await activity('admin', alphaTicketId).query(query);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

  it('does not expose event update or delete endpoints', async () => {
    const identity = identities.get('admin')!;
    const eventId = eventIds[0];
    const before = await db.activityEvent.findUniqueOrThrow({ where: { id: eventId } });
    const url = `/api/tickets/${alphaTicketId}/activity/${eventId}`;
    const protectedWrite = (method: 'put' | 'patch' | 'delete') => request(app)[method](url)
      .set('Cookie', identity.cookie).set('Origin', origin).set('X-CSRF-Token', identity.csrf)
      .set('X-Organization-ID', alphaId);
    for (const response of [
      await protectedWrite('put').send({ newValue: 'forged' }),
      await protectedWrite('patch').send({ newValue: 'forged' }),
      await protectedWrite('delete'),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
    expect(await db.activityEvent.findUniqueOrThrow({ where: { id: eventId } })).toEqual(before);
  });

  it('rolls back the actual ticket update when PostgreSQL rejects its event insert', async () => {
    const name = `tk18_${randomUUID().replaceAll('-', '')}`;
    const beforeTicket = await db.ticket.findUniqueOrThrow({ where: { id: alphaTicketId } });
    const beforeEvents = await db.activityEvent.findMany({ where: { organizationId: alphaId }, orderBy: { id: 'asc' } });
    try {
      await verifier.query(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic activity insert rejection'; END $$`);
      await verifier.query(`CREATE TRIGGER "${name}" BEFORE INSERT ON "ActivityEvent" FOR EACH ROW WHEN (NEW."organizationId" = '${alphaId}'::uuid) EXECUTE FUNCTION "${name}"()`);
      const response = await update('admin', alphaTicketId, { title: 'Must roll back' });
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.text).not.toContain('synthetic activity insert rejection');
      expect(await db.ticket.findUniqueOrThrow({ where: { id: alphaTicketId } })).toEqual(beforeTicket);
      expect(await db.activityEvent.findMany({ where: { organizationId: alphaId }, orderBy: { id: 'asc' } })).toEqual(beforeEvents);
    } finally {
      await verifier.query(`DROP TRIGGER IF EXISTS "${name}" ON "ActivityEvent"`);
      await verifier.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    }
    const recovery = await update('admin', alphaTicketId, { title: 'Successful after trigger removal' });
    expect(recovery.status).toBe(200);
    expect(recovery.body.title).toBe('Successful after trigger removal');
    expect((await db.activityEvent.findMany({ where: { ticketId: alphaTicketId } })).length).toBe(4);
  });

  it('requires an authenticated organization member to read history', async () => {
    const response = await request(app).get(`/api/tickets/${alphaTicketId}/activity`).set('X-Organization-ID', alphaId);
    expect(response.status).toBe(401);
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
    { id: alphaId, slug: `activity-${alphaId}`, name: 'Activity Alpha' },
    { id: betaId, slug: `activity-${betaId}`, name: 'Activity Beta' },
  ] });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ id: ids[account], email: email(account), passwordHash })) });
  await db.membership.createMany({ data: [
    { organizationId: alphaId, userId: ids.admin, role: 'ADMIN' },
    { organizationId: alphaId, userId: ids.agent, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.customer, role: 'CUSTOMER' },
    { organizationId: alphaId, userId: ids.other, role: 'CUSTOMER' },
    { organizationId: betaId, userId: ids.foreign, role: 'ADMIN' },
  ] });
  await db.ticket.createMany({ data: [
    { id: alphaTicketId, organizationId: alphaId, ticketNumber: 1, requesterUserId: ids.customer, title: 'Alpha activity fixture', description: 'Synthetic history fixture' },
    { id: otherTicketId, organizationId: alphaId, ticketNumber: 2, requesterUserId: ids.other, title: 'Other customer activity', description: 'Private history fixture' },
    { id: betaTicketId, organizationId: betaId, ticketNumber: 1, requesterUserId: ids.foreign, title: 'Beta activity fixture', description: 'Foreign history fixture' },
  ] });
  await db.activityEvent.createMany({ data: eventIds.map((id, index) => ({
    id, organizationId: alphaId, ticketId: alphaTicketId, actorUserId: ids.admin,
    type: index === 0 ? 'TICKET_CREATED' : 'STATUS_CHANGED', previousValue: `${index}-old`, newValue: `${index}-new`, createdAt: eventTime,
  })) });
  app = createApp(options);
  for (const account of ['admin', 'agent', 'customer', 'foreign'] as const) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.ticket.deleteMany({ where: { id: { in: [alphaTicketId, otherTicketId, betaTicketId] } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
