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
const email = (account: Account) => `ticket-list-${ids[account]}@example.test`;
const password = 'synthetic-ticket-list-fixture-password';
const origin = 'http://localhost:5173';
const appName = `ticket-list-${alphaId}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 4, application_name: appName }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-list-csrf-key-at-least-32-characters' };
let app = createApp(options);
interface Identity { cookie: string; csrf: string }
const identities = new Map<Account, Identity>();
let verified = false;
const ticketIds: string[] = Array.from({ length: 8 }, () => randomUUID());

async function signIn(account: Account): Promise<Identity> {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: email(account), password });
  expect(response.status).toBe(200);
  const identity = { cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0], csrf: response.body.csrfToken };
  identities.set(account, identity);
  return identity;
}
function list(account: Account = 'admin', organizationId = alphaId) {
  const identity = identities.get(account)!;
  return request(app).get('/api/tickets').set('Cookie', identity.cookie).set('Origin', origin)
    .set('X-Organization-ID', organizationId);
}
const rows = [
  { index: 0, org: 'alpha', requester: 'customer', assignee: 'agent', title: 'Printer outage', description: 'Cannot print invoices', status: 'OPEN', priority: 'URGENT' },
  { index: 1, org: 'alpha', requester: 'other', assignee: 'agent', title: 'Invoice mismatch', description: 'Duplicate billing reference', status: 'IN_PROGRESS', priority: 'HIGH' },
  { index: 2, org: 'alpha', requester: 'customer', assignee: null, title: 'Account access', description: 'Locked customer account', status: 'RESOLVED', priority: 'LOW' },
  { index: 3, org: 'alpha', requester: 'other', assignee: null, title: 'Printer setup', description: 'New device onboarding', status: 'OPEN', priority: 'MEDIUM' },
  { index: 4, org: 'alpha', requester: 'customer', assignee: 'admin', title: 'Alpha archival needle', description: 'Alpha record must stay scoped', status: 'CLOSED', priority: 'HIGH' },
  { index: 5, org: 'beta', requester: 'foreign', assignee: null, title: 'Beta only secret needle', description: 'Separate tenant record', status: 'OPEN', priority: 'URGENT' },
  { index: 6, org: 'beta', requester: 'foreign', assignee: 'foreign', title: 'Beta lockout', description: 'Login supportAcrew trouble', status: 'IN_PROGRESS', priority: 'MEDIUM' },
  { index: 7, org: 'alpha', requester: 'customer', assignee: 'agent', title: 'Reset credentials', description: "Can't sign in; contact support_crew at 100% uptime", status: 'IN_PROGRESS', priority: 'URGENT' },
] as const;

describe('tenant-scoped ticket list, filters and search', () => {
  it('lists only active organization tickets and returns an equally scoped total', async () => {
    const response = await list();
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(6);
    expect(response.body.items).toHaveLength(6);
    expect(response.body.items.every((item: { organizationId: string }) => item.organizationId === alphaId)).toBe(true);
    expect(response.text).not.toContain('Beta only secret needle');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.items[0]).not.toHaveProperty('description');
    expect(response.body.items[0]).not.toHaveProperty('passwordHash');
  });

  it('lets the other tenant list only its own rows', async () => {
    const response = await list('foreign', betaId);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { organizationId: string }) => item.organizationId)).toEqual([betaId, betaId]);
    expect(response.body.items.some((item: { title: string }) => item.title === 'Printer outage')).toBe(false);
  });

  it('limits customer results to their own tickets before applying filters and totals', async () => {
    const response = await list('customer');
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(4);
    expect(response.body.items.every((item: { requesterUserId: string }) => item.requesterUserId === ids.customer)).toBe(true);
    expect(response.text).not.toContain('Invoice mismatch');
  });

  it('limits a different customer to only their own organization tickets', async () => {
    const response = await list('other');
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.items.every((item: { requesterUserId: string }) => item.requesterUserId === ids.other)).toBe(true);
  });

  it.each(['admin', 'agent'] as const)('allows %s to view all tickets inside its organization', async (account) => {
    const response = await list(account);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(6);
  });

  it.each([
    [{ status: 'OPEN' }, [0, 3]],
    [{ priority: 'URGENT' }, [0, 7]],
    [{ assigneeId: ids.agent }, [0, 1, 7]],
    [{ assigneeId: 'unassigned' }, [2, 3]],
    [{ customerId: ids.customer }, [0, 2, 4, 7]],
    [{ status: 'OPEN', priority: 'MEDIUM' }, [3]],
    [{ status: 'IN_PROGRESS', assigneeId: ids.agent, customerId: ids.customer }, [7]],
    [{ status: 'OPEN', assigneeId: 'unassigned', customerId: ids.other }, [3]],
  ])('applies validated filter combinations in the active tenant: %j', async (query, expectedIndexes) => {
    const response = await list().query(query);
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => ticketIds.indexOf(item.id)).sort()).toEqual(expectedIndexes);
    expect(response.body.total).toBe(expectedIndexes.length);
  });

  it('combines customer ownership with a forged customer filter rather than replacing ownership', async () => {
    const response = await list('customer').query({ customerId: ids.other });
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it.each([
    ['title', 'PRINTER', [0, 3]],
    ['description', 'billing', [1]],
    ['title', 'archival', [4]],
    ['description', 'INVOICES', [0]],
  ])('searches case-insensitively in %s within tenant scope', async (_field, search, expectedIndexes) => {
    const response = await list().query({ search });
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => ticketIds.indexOf(item.id)).sort()).toEqual(expectedIndexes);
  });

  it('does not return a Beta-only search match from Alpha', async () => {
    const response = await list().query({ search: 'Beta only secret needle' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0 });
  });

  it('returns a Beta-only match from Beta and no Alpha rows', async () => {
    const response = await list('foreign', betaId).query({ search: 'Beta only secret needle' });
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ organizationId: betaId, title: 'Beta only secret needle' });
  });

  it('searches percent as a literal character rather than a SQL LIKE wildcard', async () => {
    const response = await list().query({ search: '100%' });
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => ticketIds.indexOf(item.id))).toEqual([7]);
  });

  it('searches underscore as a literal character rather than a SQL LIKE wildcard', async () => {
    const response = await list('foreign', betaId).query({ search: '_crew' });
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => ticketIds.indexOf(item.id))).toEqual([]);
  });

  it('returns empty result and zero scoped total when filters do not match', async () => {
    const response = await list().query({ priority: 'LOW', status: 'CLOSED' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0 });
  });

  it('requires a valid authenticated session and current organization membership', async () => {
    expect((await request(app).get('/api/tickets').set('X-Organization-ID', alphaId)).status).toBe(401);
    expect((await list('customer', betaId)).status).toBe(404);
  });

  it.each([
    { status: 'waiting' }, { priority: 'ASAP' }, { assigneeId: 'not-a-uuid' },
    { customerId: 'not-a-uuid' }, { search: '  ' }, { search: 'x'.repeat(101) },
    { organizationId: betaId }, { requesterUserId: ids.other }, { page: 0 },
  ])('rejects malformed or unapproved query fields: %j', async (query) => {
    const response = await list().query(query);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('hides inactive membership and checks CSRF for list mutation methods', async () => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.customer } }, data: { isActive: false } });
    expect((await list('customer')).status).toBe(404);
    const identity = identities.get('admin')!;
    const response = await request(app).post('/api/tickets').set('Cookie', identity.cookie).set('Origin', origin).set('X-Organization-ID', alphaId).send({ title: 'x', description: 'y' });
    expect(response.status).toBe(403);
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
    { id: alphaId, slug: `list-${alphaId}`, name: 'List Alpha' }, { id: betaId, slug: `list-${betaId}`, name: 'List Beta' },
  ] });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ id: ids[account], email: email(account), passwordHash })) });
  await db.membership.createMany({ data: [
    { organizationId: alphaId, userId: ids.admin, role: 'ADMIN' }, { organizationId: alphaId, userId: ids.agent, role: 'AGENT' },
    { organizationId: alphaId, userId: ids.customer, role: 'CUSTOMER' }, { organizationId: alphaId, userId: ids.other, role: 'CUSTOMER' },
    { organizationId: betaId, userId: ids.foreign, role: 'ADMIN' },
  ] });
  for (const item of rows) {
    await db.ticket.create({ data: {
      id: ticketIds[item.index], organizationId: item.org === 'alpha' ? alphaId : betaId,
      ticketNumber: item.org === 'alpha' ? item.index + 1 : item.index - 4,
      requesterUserId: ids[item.requester], assigneeOrganizationId: item.assignee ? (item.org === 'alpha' ? alphaId : betaId) : null,
      assigneeUserId: item.assignee ? ids[item.assignee] : null,
      title: item.title, description: item.description, status: item.status, priority: item.priority,
      createdAt: new Date(`2026-01-${String(item.index + 1).padStart(2, '0')}T00:00:00Z`),
    } });
  }
  for (const account of Object.keys(ids) as Account[]) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await db.activityEvent.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
