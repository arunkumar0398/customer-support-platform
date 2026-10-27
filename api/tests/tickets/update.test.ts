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
const email = (account: Account) => `ticket-update-${ids[account]}@example.test`;
const password = 'synthetic-ticket-update-fixture-password';
const origin = 'http://localhost:5173';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 5, application_name: `ticket-update-${alphaId}` }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-update-csrf-key-at-least-32-characters' };
let app = createApp(options);
interface Identity { cookie: string; csrf: string }
const identities = new Map<Account, Identity>();
let verified = false;
const createdTicketIds: string[] = [];
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

function update(account: Account, ticketId: string, body: object, organizationId = alphaId) {
  const identity = identities.get(account)!;
  return request(app).patch(`/api/tickets/${ticketId}`).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', organizationId).send(body);
}

async function createTicket({
  organizationId = alphaId,
  requesterUserId = ids.customer,
  status = 'OPEN',
}: { organizationId?: string; requesterUserId?: string; status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' } = {}) {
  const id = randomUUID();
  createdTicketIds.push(id);
  const row = await db.ticket.create({ data: {
    id, organizationId, ticketNumber: nextTicketNumber++, requesterUserId: organizationId === betaId ? ids.foreign : requesterUserId,
    title: `Original title ${id}`, description: `Original description ${id}`, status, priority: 'MEDIUM',
  } });
  return row;
}

async function assertRejectedWithoutWrite(ticketId: string, response: { status: number }, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus);
  const ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  expect(ticket.version).toBe(1);
  expect(ticket.title).toBe(`Original title ${ticketId}`);
  expect(ticket.description).toBe(`Original description ${ticketId}`);
  expect(await db.activityEvent.count({ where: { ticketId } })).toBe(0);
}

describe('ticket update authorization, lifecycle and audit events', () => {
  it.each(['admin', 'agent'] as const)('allows %s to edit content and priority with meaningful events', async (account) => {
    const ticket = await createTicket();
    const response = await update(account, ticket.id, { title: '  Updated title  ', description: 'Updated details', priority: 'HIGH' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: ticket.id, title: 'Updated title', description: 'Updated details', priority: 'HIGH', version: 2 });
    const events = await db.activityEvent.findMany({ where: { ticketId: ticket.id }, orderBy: { type: 'asc' } });
    expect(events.map((event) => event.type).sort()).toEqual(['DESCRIPTION_CHANGED', 'PRIORITY_CHANGED', 'TITLE_CHANGED']);
    expect(events.find((event) => event.type === 'TITLE_CHANGED')?.previousValue).toEqual(ticket.title);
    expect(events.find((event) => event.type === 'TITLE_CHANGED')?.newValue).toEqual('Updated title');
    expect(events.every((event) => event.actorUserId === ids[account])).toBe(true);
  });

  it('allows a customer to edit only their own OPEN ticket title and description', async () => {
    const ticket = await createTicket();
    const response = await update('customer', ticket.id, { title: 'Customer correction', description: 'More context' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ title: 'Customer correction', description: 'More context', version: 2 });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(2);
  });

  it('does not create a version or event for a no-op update', async () => {
    const ticket = await createTicket();
    const response = await update('admin', ticket.id, { title: ticket.title, priority: ticket.priority });
    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it.each([
    { status: 'RESOLVED' }, { priority: 'URGENT' }, { requesterUserId: ids.other },
    { organizationId: betaId }, { assigneeUserId: ids.agent }, { dueAt: '2026-12-01T00:00:00.000Z' },
    { version: 99 }, { ticketNumber: 9000 }, { passwordHash: 'forged' }, { reopenReason: 'not allowed' },
  ])('rejects customer role and mass-assignment fields: %j', async (body) => {
    const ticket = await createTicket();
    const response = await update('customer', ticket.id, body);
    await assertRejectedWithoutWrite(ticket.id, response, 422);
  });

  it('rejects unknown staff properties and empty updates', async () => {
    const ticket = await createTicket();
    const forged = await update('admin', ticket.id, { organizationId: betaId, title: 'Forged' });
    await assertRejectedWithoutWrite(ticket.id, forged, 422);
    const empty = await update('admin', ticket.id, {});
    expect(empty.status).toBe(422);
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it('does not allow a customer to edit a non-OPEN ticket', async () => {
    const ticket = await createTicket({ status: 'RESOLVED' });
    const response = await update('customer', ticket.id, { title: 'Late edit' });
    await assertRejectedWithoutWrite(ticket.id, response, 403);
  });

  it('does not allow a customer to edit a different customer ticket', async () => {
    const ticket = await createTicket({ requesterUserId: ids.other });
    const response = await update('customer', ticket.id, { title: 'Private edit' });
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, title: ticket.title });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it('does not allow an alpha member to update a beta ticket by ID', async () => {
    const ticket = await createTicket({ organizationId: betaId });
    const response = await update('admin', ticket.id, { title: 'Cross-tenant edit' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, title: ticket.title });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it.each([
    ['OPEN', 'IN_PROGRESS'], ['OPEN', 'RESOLVED'], ['IN_PROGRESS', 'RESOLVED'],
    ['RESOLVED', 'IN_PROGRESS'], ['RESOLVED', 'CLOSED'],
  ] as const)('permits lifecycle transition %s -> %s', async (from, to) => {
    const ticket = await createTicket({ status: from });
    const body = from === 'RESOLVED' && to === 'IN_PROGRESS' ? { status: to, reopenReason: 'Customer supplied missing evidence' } : { status: to };
    const response = await update('agent', ticket.id, body);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: to, version: 2 });
    const event = await db.activityEvent.findFirstOrThrow({ where: { ticketId: ticket.id, type: 'STATUS_CHANGED' } });
    expect(event.previousValue).toEqual(from);
    expect(event.newValue).toEqual(to);
    if (from === 'RESOLVED' && to === 'IN_PROGRESS') expect(event.reason).toBe('Customer supplied missing evidence');
  });

  it.each([
    ['OPEN', 'CLOSED'], ['IN_PROGRESS', 'OPEN'], ['CLOSED', 'RESOLVED'], ['CLOSED', 'IN_PROGRESS'],
  ] as const)('rejects lifecycle transition %s -> %s', async (from, to) => {
    const ticket = await createTicket({ status: from });
    const response = await update('admin', ticket.id, { status: to });
    await assertRejectedWithoutWrite(ticket.id, response, 409);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('requires a non-empty reason to reopen a resolved ticket', async () => {
    const ticket = await createTicket({ status: 'RESOLVED' });
    const missing = await update('agent', ticket.id, { status: 'IN_PROGRESS' });
    expect(missing.status).toBe(422);
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
    const blank = await update('agent', ticket.id, { status: 'IN_PROGRESS', reopenReason: '  ' });
    expect(blank.status).toBe(422);
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ status: 'RESOLVED', version: 1 });
  });

  it('rejects a reopen reason when not reopening', async () => {
    const ticket = await createTicket();
    const response = await update('agent', ticket.id, { status: 'IN_PROGRESS', reopenReason: 'not a reopen' });
    await assertRejectedWithoutWrite(ticket.id, response, 422);
  });

  it('rejects malformed ticket IDs and malformed title/description values', async () => {
    const malformedId = await update('admin', 'not-a-uuid', { title: 'x' });
    expect(malformedId.status).toBe(422);
    const ticket = await createTicket();
    for (const body of [{ title: '' }, { title: 'x'.repeat(201) }, { description: ' ' }, { description: 'x'.repeat(10001) }]) {
      const response = await update('admin', ticket.id, body);
      expect(response.status).toBe(422);
    }
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, title: ticket.title });
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
    { id: alphaId, slug: `update-${alphaId}`, name: 'Update Alpha' },
    { id: betaId, slug: `update-${betaId}`, name: 'Update Beta' },
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
  app = createApp(options);
  for (const account of Object.keys(ids) as Account[]) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await db.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
