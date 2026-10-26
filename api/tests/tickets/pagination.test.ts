import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const email = (account: Account) => `ticket-page-${ids[account]}@example.test`;
const password = 'synthetic-ticket-page-fixture-password';
const origin = 'http://localhost:5173';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 4 }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-page-csrf-key-at-least-32-characters' };
let app = createApp(options);
let adminCookie = '';
let verified = false;
const ticketIds: string[] = Array.from({ length: 6 }, () => randomUUID());
const equalTime = new Date('2026-10-01T12:00:00Z');

async function signIn(account: Account) {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: email(account), password });
  expect(response.status).toBe(200);
  if (account === 'admin') adminCookie = (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

function getTickets(query: Record<string, unknown> = {}, account = 'admin', organizationId = alphaId) {
  const cookie = account === 'admin' ? adminCookie : '';
  return request(app).get('/api/tickets').set('Cookie', cookie).set('X-Organization-ID', organizationId).query(query);
}

describe('stable bounded ticket pagination', () => {
  it('uses page 1 and pageSize 25 by default and returns consistent metadata', async () => {
    const response = await getTickets();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 25, total: 6 });
    expect(response.body.items).toHaveLength(6);
  });

  it('sorts equal creation timestamps by ID descending deterministically', async () => {
    const first = await getTickets({ pageSize: 6 });
    const second = await getTickets({ pageSize: 6 });
    const expected = [...ticketIds].sort((a, b) => b.localeCompare(a));
    expect(first.status).toBe(200);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual(expected);
    expect(second.body.items.map((item: { id: string }) => item.id)).toEqual(expected);
  });

  it('returns non-overlapping pages that cover the stable result set exactly once', async () => {
    const first = await getTickets({ page: 1, pageSize: 2 });
    const second = await getTickets({ page: 2, pageSize: 2 });
    const third = await getTickets({ page: 3, pageSize: 2 });
    for (const page of [first, second, third]) {
      expect(page.status).toBe(200);
      expect(page.body.pageSize).toBe(2);
      expect(page.body.total).toBe(6);
    }
    const idsOnPages = [...first.body.items, ...second.body.items, ...third.body.items].map((item: { id: string }) => item.id);
    expect(idsOnPages).toEqual([...ticketIds].sort((a, b) => b.localeCompare(a)));
    expect(new Set(idsOnPages).size).toBe(6);
  });

  it('applies page offsets after tenant filters and preserves scoped totals', async () => {
    const first = await getTickets({ page: 1, pageSize: 1, status: 'OPEN' });
    const second = await getTickets({ page: 2, pageSize: 1, status: 'OPEN' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.total).toBe(3);
    expect(second.body.total).toBe(3);
    expect(first.body.items[0].id).not.toBe(second.body.items[0].id);
    expect(first.body.items.every((item: { organizationId: string }) => item.organizationId === alphaId)).toBe(true);
  });

  it.each([
    { page: 0 }, { page: -1 }, { page: 1001 }, { page: 1.5 }, { page: 'nope' },
    { pageSize: 0 }, { pageSize: -1 }, { pageSize: 101 }, { pageSize: 1.5 }, { pageSize: 'many' },
  ])('rejects negative, fractional, malformed, or unbounded page parameters: %j', async (query) => {
    const response = await getTickets(query);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts maximum page and size while returning only matching organization data', async () => {
    const response = await getTickets({ page: 1000, pageSize: 100 });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1000, pageSize: 100, total: 6, items: [] });
  });

  it('rejects unknown pagination fields instead of silently ignoring them', async () => {
    const response = await getTickets({ page: 1, pageSize: 2, organizationId: betaId });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects repeated pagination parameters', async () => {
    const response = await getTickets({ page: ['1', '2'] });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
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
    { id: alphaId, slug: `page-${alphaId}`, name: 'Page Alpha' }, { id: betaId, slug: `page-${betaId}`, name: 'Page Beta' },
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
  await db.ticket.createMany({ data: ticketIds.map((id, index) => ({
    id, organizationId: alphaId, ticketNumber: index + 1, requesterUserId: index % 2 ? ids.other : ids.customer,
    title: `Page fixture ${index + 1}`, description: 'Synthetic pagination fixture',
    status: index < 3 ? 'OPEN' : 'IN_PROGRESS', priority: 'MEDIUM', createdAt: equalTime,
  })) });
  app = createApp(options);
  await signIn('admin');
});

afterAll(async () => {
  if (verified) {
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
