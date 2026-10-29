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
const ids = { admin: randomUUID(), agent: randomUUID(), customer: randomUUID(), foreign: randomUUID() };
type Account = keyof typeof ids;
const userIds = Object.values(ids);
const email = (account: Account) => `security-attack-${ids[account]}@example.test`;
const password = 'synthetic-security-attack-fixture-password';
const origin = 'http://localhost:5173';
const alphaTicketId = randomUUID();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 4, application_name: `security-attack-${alphaId}` }) });
const appOptions = {
  getClient: () => db,
  appOrigin: origin,
  production: false,
  sessionSecret: 'synthetic-security-attack-csrf-secret-at-least-32-characters',
};
interface Identity { cookie: string; csrf: string }
const identities = new Map<Account, Identity>();
let app = createApp(appOptions);
let verified = false;

async function signIn(account: Account): Promise<Identity> {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: email(account), password });
  expect(response.status).toBe(200);
  const identity = {
    cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    csrf: response.body.csrfToken as string,
  };
  identities.set(account, identity);
  return identity;
}

type Mutation = {
  name: string;
  method: 'post' | 'patch';
  path: string;
  account: Account;
  organizationId?: string;
  ticketVersion?: string;
  body?: object;
};

const mutations: Mutation[] = [
  { name: 'logout', method: 'post', path: '/api/auth/logout', account: 'admin' },
  { name: 'ticket creation', method: 'post', path: '/api/tickets', account: 'customer', organizationId: alphaId, body: { title: 'CSRF attempt', description: 'Must not be created.' } },
  { name: 'ticket update', method: 'patch', path: `/api/tickets/${alphaTicketId}`, account: 'agent', organizationId: alphaId, ticketVersion: '1', body: { title: 'Forged ticket title' } },
  { name: 'ticket assignment', method: 'patch', path: `/api/tickets/${alphaTicketId}/assignment`, account: 'agent', organizationId: alphaId, ticketVersion: '1', body: { assigneeUserId: ids.agent } },
  { name: 'ticket comment', method: 'post', path: `/api/tickets/${alphaTicketId}/comments`, account: 'customer', organizationId: alphaId, body: { body: 'Must not be added.' } },
  { name: 'membership creation', method: 'post', path: '/api/memberships', account: 'admin', organizationId: alphaId, body: { email: email('foreign'), role: 'AGENT' } },
  { name: 'membership update', method: 'patch', path: `/api/memberships/${ids.agent}`, account: 'admin', organizationId: alphaId, body: { role: 'CUSTOMER' } },
];

function mutationRequest(mutation: Mutation, attack: 'missing-csrf' | 'hostile-origin') {
  const identity = identities.get(mutation.account)!;
  let attempt = mutation.method === 'post'
    ? request(app).post(mutation.path)
    : request(app).patch(mutation.path);
  attempt = attempt.set('Cookie', identity.cookie)
    .set('Origin', attack === 'hostile-origin' ? 'https://attacker.example.test' : origin);
  if (attack === 'hostile-origin') attempt = attempt.set('X-CSRF-Token', identity.csrf);
  if (mutation.organizationId) attempt = attempt.set('X-Organization-ID', mutation.organizationId);
  if (mutation.ticketVersion) attempt = attempt.set('X-Ticket-Version', mutation.ticketVersion);
  if (mutation.body) attempt = attempt.send(mutation.body);
  return attempt;
}

async function snapshot() {
  const [tickets, comments, events, memberships] = await Promise.all([
    db.ticket.findMany({ where: { organizationId: { in: [alphaId, betaId] } }, orderBy: [{ organizationId: 'asc' }, { id: 'asc' }], select: { id: true, organizationId: true, requesterUserId: true, assigneeUserId: true, title: true, version: true } }),
    db.comment.findMany({ where: { organizationId: { in: [alphaId, betaId] } }, orderBy: { id: 'asc' }, select: { id: true, organizationId: true, ticketId: true, authorUserId: true, body: true } }),
    db.activityEvent.findMany({ where: { organizationId: { in: [alphaId, betaId] } }, orderBy: { id: 'asc' }, select: { id: true, organizationId: true, ticketId: true, actorUserId: true, type: true } }),
    db.membership.findMany({ where: { organizationId: { in: [alphaId, betaId] } }, orderBy: [{ organizationId: 'asc' }, { userId: 'asc' }], select: { organizationId: true, userId: true, role: true, isActive: true } }),
  ]);
  return { tickets, comments, events, memberships };
}

describe('cross-route security attack suite', () => {
  beforeEach(() => { app = createApp(appOptions); });

  it.each(mutations.flatMap((mutation) => [
    { mutation, attack: 'missing-csrf' as const },
    { mutation, attack: 'hostile-origin' as const },
  ]))('rejects $mutation.name with $attack before any write', async ({ mutation, attack }) => {
    const before = await snapshot();
    const response = await mutationRequest(mutation, attack);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REJECTED');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a non-admin self-promotion attempt without changing membership', async () => {
    const before = await snapshot();
    const identity = identities.get('agent')!;
    const response = await request(app).patch(`/api/memberships/${ids.agent}`).set('Cookie', identity.cookie)
      .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', alphaId)
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await snapshot()).toEqual(before);
  });

  it('rejects comment actor, tenant, and prototype-pollution properties without writes', async () => {
    const before = await snapshot();
    const identity = identities.get('customer')!;
    const body = JSON.stringify({
      body: 'Attempt to forge comment ownership.',
      authorUserId: ids.admin,
      createdBy: ids.admin,
      organizationId: betaId,
      ['__proto__']: { isAdmin: true },
      constructor: { prototype: { isAdmin: true } },
    });
    const response = await request(app).post(`/api/tickets/${alphaTicketId}/comments`).set('Cookie', identity.cookie)
      .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', alphaId)
      .set('Content-Type', 'application/json').send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await snapshot()).toEqual(before);
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'isAdmin')).toBe(false);
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for security attack integration tests').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;

  await db.organization.createMany({ data: [
    { id: alphaId, slug: `security-alpha-${alphaId}`, name: 'Security Alpha fixture' },
    { id: betaId, slug: `security-beta-${betaId}`, name: 'Security Beta fixture' },
  ] });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ id: ids[account], email: email(account), passwordHash })) });
  await db.membership.createMany({ data: [
    { organizationId: alphaId, userId: ids.admin, role: 'ADMIN' },
    { organizationId: alphaId, userId: ids.agent, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.customer, role: 'CUSTOMER' },
    { organizationId: betaId, userId: ids.foreign, role: 'ADMIN' },
  ] });
  await db.ticket.create({
    data: { id: alphaTicketId, organizationId: alphaId, ticketNumber: 1, requesterUserId: ids.customer, title: 'Security fixture ticket', description: 'Synthetic security test record.' },
  });
  app = createApp(appOptions);
  for (const account of ['admin', 'agent', 'customer'] as const) await signIn(account);
});

afterAll(async () => {
  if (verified) {
    await db.comment.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.activityEvent.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.ticket.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
