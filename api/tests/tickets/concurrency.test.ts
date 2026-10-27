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
const organizationId = randomUUID();
const ids = { admin: randomUUID(), agentOne: randomUUID(), agentTwo: randomUUID(), customer: randomUUID() };
const userIds = Object.values(ids);
type Account = keyof typeof ids;
const email = (account: Account) => `ticket-concurrency-${ids[account]}@example.test`;
const password = 'synthetic-ticket-concurrency-fixture-password';
const origin = 'http://localhost:5173';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 5, application_name: `ticket-concurrency-${organizationId}` }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-concurrency-csrf-key-32-chars' };
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

async function createTicket() {
  const id = randomUUID();
  ticketIds.push(id);
  return db.ticket.create({ data: {
    id, organizationId, ticketNumber: nextTicketNumber++, requesterUserId: ids.customer,
    title: `Concurrency fixture ${id}`, description: 'Synthetic concurrency test ticket',
  } });
}

function update(account: Account, ticketId: string, ifMatch: string | undefined, title: string) {
  const identity = identities.get(account)!;
  const call = request(app).patch(`/api/tickets/${ticketId}`).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', organizationId);
  if (ifMatch !== undefined) call.set('If-Match', ifMatch);
  return call.send({ title });
}

function assign(account: Account, ticketId: string, ifMatch: string | undefined, assigneeUserId: string) {
  const identity = identities.get(account)!;
  const call = request(app).patch(`/api/tickets/${ticketId}/assignment`).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', organizationId);
  if (ifMatch !== undefined) call.set('If-Match', ifMatch);
  return call.send({ assigneeUserId });
}

describe('optimistic ticket concurrency with If-Match', () => {
  it('allows exactly one of two concurrent writes based on the same version', async () => {
    const ticket = await createTicket();
    const [first, second] = await Promise.all([
      update('agentOne', ticket.id, '"1"', 'Concurrent first title'),
      update('agentTwo', ticket.id, '"1"', 'Concurrent second title'),
    ]);
    const responses = [first, second];
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    const conflict = responses.find((response) => response.status === 409)!;
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
    const saved = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(saved.version).toBe(2);
    expect(['Concurrent first title', 'Concurrent second title']).toContain(saved.title);
    const events = await db.activityEvent.findMany({ where: { ticketId: ticket.id, type: 'TITLE_CHANGED' } });
    expect(events).toHaveLength(1);
    expect(events[0].newValue).toBe(saved.title);
    expect(events[0].previousValue).toBe(ticket.title);
  });

  it('rejects a sequential stale version without creating a second event', async () => {
    const ticket = await createTicket();
    const current = await update('agentOne', ticket.id, '"1"', 'First committed title');
    const stale = await update('agentTwo', ticket.id, '"1"', 'Stale title must not win');
    const staleNoOp = await update('agentTwo', ticket.id, '"1"', 'First committed title');
    expect(current.status).toBe(200);
    expect(current.body.version).toBe(2);
    expect(current.headers.etag).toBe('"2"');
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(staleNoOp.status).toBe(409);
    expect(staleNoOp.body.error.code).toBe('VERSION_CONFLICT');
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ title: 'First committed title', version: 2 });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it('returns the current version as an ETag on ticket detail', async () => {
    const ticket = await createTicket();
    const identity = identities.get('admin')!;
    const response = await request(app).get(`/api/tickets/${ticket.id}`).set('Cookie', identity.cookie).set('X-Organization-ID', organizationId);
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"1"');
  });

  it('requires a valid version precondition before any write', async () => {
    const ticket = await createTicket();
    for (const ifMatch of [undefined, 'W/"1"', '"1", "2"', '"0"', '"2147483648"']) {
      const response = await update('admin', ticket.id, ifMatch, 'Must be rejected');
      expect(response.status).toBe(ifMatch === undefined ? 428 : 422);
    }
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ title: ticket.title, version: 1 });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it('allows only one concurrent assignment based on the same ticket version', async () => {
    const ticket = await createTicket();
    const [first, second] = await Promise.all([
      assign('agentOne', ticket.id, '"1"', ids.agentOne),
      assign('agentTwo', ticket.id, '"1"', ids.agentTwo),
    ]);
    const responses = [first, second];
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    const conflict = responses.find((response) => response.status === 409)!;
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
    const saved = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(saved.version).toBe(2);
    expect([ids.agentOne, ids.agentTwo]).toContain(saved.assigneeUserId);
    const events = await db.activityEvent.findMany({ where: { ticketId: ticket.id, type: 'ASSIGNMENT_CHANGED' } });
    expect(events).toHaveLength(1);
    expect(events[0].newValue).toBe(saved.assigneeUserId);
    const winner = responses.find((response) => response.status === 200)!;
    expect(winner.headers.etag).toBe('"2"');
  });

  it('requires a valid version precondition for assignment writes', async () => {
    const ticket = await createTicket();
    for (const ifMatch of [undefined, 'W/"1"', '"1", "2"', '"0"', '"2147483648"']) {
      const response = await assign('admin', ticket.id, ifMatch, ids.agentOne);
      expect(response.status).toBe(ifMatch === undefined ? 428 : 422);
    }
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 1, assigneeUserId: null });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it('rejects a stale assignment even when it matches the current assignee', async () => {
    const ticket = await createTicket();
    const first = await assign('admin', ticket.id, '"1"', ids.agentOne);
    const staleNoOp = await assign('agentTwo', ticket.id, '"1"', ids.agentOne);
    expect(first.status).toBe(200);
    expect(first.headers.etag).toBe('"2"');
    expect(staleNoOp.status).toBe(409);
    expect(staleNoOp.body.error.code).toBe('VERSION_CONFLICT');
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ version: 2, assigneeUserId: ids.agentOne });
    expect(await db.activityEvent.count({ where: { ticketId: ticket.id, type: 'ASSIGNMENT_CHANGED' } })).toBe(1);
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
  await db.organization.create({ data: { id: organizationId, slug: `concurrency-${organizationId}`, name: 'Concurrency Alpha' } });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ id: ids[account], email: email(account), passwordHash })) });
  await db.membership.createMany({ data: [
    { organizationId, userId: ids.admin, role: 'ADMIN' },
    { organizationId, userId: ids.agentOne, role: 'AGENT' },
    { organizationId, userId: ids.agentTwo, role: 'AGENT' },
    { organizationId, userId: ids.customer, role: 'CUSTOMER' },
  ] });
  app = createApp(options);
  for (const account of Object.keys(ids) as Account[]) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { organizationId } });
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
  await verifier.end();
});
