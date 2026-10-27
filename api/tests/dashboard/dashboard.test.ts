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
  admin: randomUUID(), agentOne: randomUUID(), agentTwo: randomUUID(), idleAgent: randomUUID(),
  customer: randomUUID(), betaAdmin: randomUUID(), betaAgent: randomUUID(),
};
const userIds = Object.values(ids);
type Account = keyof typeof ids;
const email = (account: Account) => `dashboard-${ids[account]}@example.test`;
const password = 'synthetic-dashboard-fixture-password';
const origin = 'http://localhost:5173';
const evaluationTime = new Date('2026-10-27T12:00:00.000Z');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 5, application_name: `dashboard-${alphaId}` }) });
const options = {
  getClient: () => db, appOrigin: origin, production: false,
  sessionSecret: 'synthetic-dashboard-csrf-key-at-least-32-characters', now: () => new Date(evaluationTime),
};
let app = createApp(options);
interface Identity { cookie: string }
const identities = new Map<Account, Identity>();
let verified = false;
const ticketIds: string[] = [];
const nextNumbers = { alpha: 1, beta: 1 };

async function signIn(account: Account): Promise<Identity> {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: email(account), password });
  expect(response.status).toBe(200);
  const identity = { cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0] };
  identities.set(account, identity);
  return identity;
}

function dashboard(account: Account, organizationId = alphaId) {
  return request(app).get('/api/dashboard').set('Cookie', identities.get(account)!.cookie)
    .set('Origin', origin).set('X-Organization-ID', organizationId);
}

async function createTicket(input: {
  org?: 'alpha' | 'beta'; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; dueAt?: Date | null; assignee?: 'agentOne' | 'agentTwo' | 'betaAgent' | null;
}) {
  const id = randomUUID();
  ticketIds.push(id);
  const org = input.org ?? 'alpha';
  const organizationId = org === 'alpha' ? alphaId : betaId;
  const assigneeId = input.assignee ? ids[input.assignee] : null;
  const row = await db.ticket.create({ data: {
    id, organizationId, ticketNumber: nextNumbers[org]++, requesterUserId: org === 'alpha' ? ids.customer : ids.betaAdmin,
    ...(assigneeId ? { assigneeOrganizationId: organizationId, assigneeUserId: assigneeId } : {}),
    title: `Dashboard fixture ${id}`, description: 'Synthetic dashboard ticket', status: input.status,
    priority: input.priority, dueAt: input.dueAt ?? null,
  } });
  return row;
}

describe('tenant-scoped dashboard metrics', () => {
  it('returns exact scoped status, priority, overdue, and active-agent workload formulas', async () => {
    const response = await dashboard('admin');
    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      evaluationTime: evaluationTime.toISOString(),
      totalTickets: 6,
      statusCounts: { OPEN: 3, IN_PROGRESS: 1, RESOLVED: 1, CLOSED: 1 },
      priorityCounts: { LOW: 2, MEDIUM: 2, HIGH: 1, URGENT: 1 },
      overdueCount: 2,
      agentWorkloads: [
        { userId: ids.agentOne, email: email('agentOne'), openCount: 1, inProgressCount: 1, activeCount: 2 },
        { userId: ids.agentTwo, email: email('agentTwo'), openCount: 1, inProgressCount: 0, activeCount: 1 },
        { userId: ids.idleAgent, email: email('idleAgent'), openCount: 0, inProgressCount: 0, activeCount: 0 },
      ].sort((left, right) => left.email.localeCompare(right.email)),
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain(email('betaAgent'));
  });

  it('uses the same single captured UTC evaluation time for the overdue boundary', async () => {
    const response = await dashboard('agentOne');
    expect(response.status).toBe(200);
    expect(response.body.evaluationTime).toBe(evaluationTime.toISOString());
    expect(response.body.overdueCount).toBe(2);
  });

  it('does not include Beta tickets or workload in Alpha results and scopes Beta independently', async () => {
    const alpha = await dashboard('admin', alphaId);
    const beta = await dashboard('betaAdmin', betaId);
    expect(alpha.status).toBe(200);
    expect(alpha.body.totalTickets).toBe(6);
    expect(alpha.body.overdueCount).toBe(2);
    expect(alpha.text).not.toContain(email('betaAgent'));
    expect(beta.status).toBe(200);
    expect(beta.body).toMatchObject({
      totalTickets: 1,
      statusCounts: { OPEN: 1, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 },
      priorityCounts: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 1 },
      overdueCount: 1,
      agentWorkloads: [{ userId: ids.betaAgent, email: email('betaAgent'), openCount: 1, inProgressCount: 0, activeCount: 1 }],
    });
    expect(beta.body.agentWorkloads.map((item: { userId: string }) => item.userId)).toEqual([ids.betaAgent]);
  });

  it('allows agents but denies customers and unauthenticated requests', async () => {
    expect((await dashboard('agentOne')).status).toBe(200);
    const customer = await dashboard('customer');
    expect(customer.status).toBe(403);
    expect(customer.body.error.code).toBe('FORBIDDEN');
    const unauthenticated = await request(app).get('/api/dashboard').set('X-Organization-ID', alphaId);
    expect(unauthenticated.status).toBe(401);
  });

  it('rejects an organization selector without active membership', async () => {
    const response = await dashboard('admin', betaId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects query parameters instead of silently ignoring dashboard filters', async () => {
    for (const query of [{ page: '1' }, { organizationId: betaId }]) {
      const response = await dashboard('admin').query(query);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
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
    { id: alphaId, slug: `dashboard-${alphaId}`, name: 'Dashboard Alpha' },
    { id: betaId, slug: `dashboard-${betaId}`, name: 'Dashboard Beta' },
  ] });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ id: ids[account], email: email(account), passwordHash })) });
  await db.membership.createMany({ data: [
    { organizationId: alphaId, userId: ids.admin, role: 'ADMIN' },
    { organizationId: alphaId, userId: ids.agentOne, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.agentTwo, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.idleAgent, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.customer, role: 'CUSTOMER' },
    { organizationId: betaId, userId: ids.betaAdmin, role: 'ADMIN' },
    { organizationId: betaId, userId: ids.betaAgent, role: 'AGENT' },
  ] });
  const past = new Date(evaluationTime.getTime() - 1);
  const future = new Date(evaluationTime.getTime() + 1);
  await createTicket({ status: 'OPEN', priority: 'URGENT', dueAt: past, assignee: 'agentOne' });
  await createTicket({ status: 'IN_PROGRESS', priority: 'HIGH', dueAt: past, assignee: 'agentOne' });
  await createTicket({ status: 'RESOLVED', priority: 'LOW', dueAt: past, assignee: 'agentOne' });
  await createTicket({ status: 'CLOSED', priority: 'MEDIUM', dueAt: past, assignee: 'agentOne' });
  await createTicket({ status: 'OPEN', priority: 'MEDIUM', dueAt: future, assignee: 'agentTwo' });
  await createTicket({ status: 'OPEN', priority: 'LOW', dueAt: evaluationTime });
  await createTicket({ org: 'beta', status: 'OPEN', priority: 'URGENT', dueAt: past, assignee: 'betaAgent' });
  app = createApp(options);
  for (const account of Object.keys(ids) as Account[]) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
