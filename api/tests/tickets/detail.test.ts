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
const email = (account: Account) => `ticket-detail-${ids[account]}@example.test`;
const password = 'synthetic-ticket-detail-fixture-password';
const origin = 'http://localhost:5173';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 4, application_name: `ticket-detail-${alphaId}` }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-detail-csrf-key-at-least-32-characters' };
let app = createApp(options);
interface Identity { cookie: string }
const identities = new Map<Account, Identity>();
let verified = false;
const alphaTicketId = randomUUID();
const otherCustomerTicketId = randomUUID();
const betaTicketId = randomUUID();
const missingTicketId = randomUUID();

async function signIn(account: Account): Promise<Identity> {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: email(account), password });
  expect(response.status).toBe(200);
  const identity = { cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0] };
  identities.set(account, identity);
  return identity;
}

function detail(account: Account, ticketId: string, organizationId = alphaId) {
  return request(app).get(`/api/tickets/${ticketId}`).set('Cookie', identities.get(account)!.cookie)
    .set('X-Organization-ID', organizationId);
}

describe('tenant/customer-scoped ticket detail', () => {
  it.each(['admin', 'agent'] as const)('allows %s to read the complete ticket in the selected organization', async (account) => {
    const response = await detail(account, alphaTicketId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: alphaTicketId, organizationId: alphaId, ticketNumber: 1, requesterUserId: ids.customer,
      title: 'Alpha customer printer', description: 'Synthetic alpha ticket details', status: 'OPEN', priority: 'MEDIUM',
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('lets a customer read their own ticket detail', async () => {
    const response = await detail('customer', alphaTicketId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: alphaTicketId, requesterUserId: ids.customer, title: 'Alpha customer printer' });
    expect(response.body.description).toBe('Synthetic alpha ticket details');
  });

  it('does not disclose another same-org customer ticket or distinguish it from an absent ticket', async () => {
    const forbiddenOwner = await detail('customer', otherCustomerTicketId);
    const absent = await detail('customer', missingTicketId);
    expect(forbiddenOwner.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(forbiddenOwner.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
    expect(absent.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
    expect(forbiddenOwner.text).not.toContain(otherCustomerTicketId);
    expect(absent.text).not.toContain(missingTicketId);
  });

  it('does not disclose a foreign-organization ticket to an alpha member', async () => {
    const foreign = await detail('admin', betaTicketId);
    const absent = await detail('admin', missingTicketId);
    expect(foreign.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(foreign.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
    expect(absent.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
    expect(foreign.text).not.toContain('Beta confidential title');
  });

  it('allows a member to read a ticket inside their own second organization', async () => {
    const response = await detail('foreign', betaTicketId, betaId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: betaTicketId, organizationId: betaId, title: 'Beta confidential title' });
  });

  it('rejects malformed ticket IDs without exposing query details', async () => {
    const response = await detail('admin', 'not-a-uuid');
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
    { id: alphaId, slug: `detail-${alphaId}`, name: 'Detail Alpha' },
    { id: betaId, slug: `detail-${betaId}`, name: 'Detail Beta' },
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
    { id: alphaTicketId, organizationId: alphaId, ticketNumber: 1, requesterUserId: ids.customer, title: 'Alpha customer printer', description: 'Synthetic alpha ticket details', status: 'OPEN', priority: 'MEDIUM' },
    { id: otherCustomerTicketId, organizationId: alphaId, ticketNumber: 2, requesterUserId: ids.other, title: 'Other customer private ticket', description: 'Private same-org fixture', status: 'OPEN', priority: 'HIGH' },
    { id: betaTicketId, organizationId: betaId, ticketNumber: 1, requesterUserId: ids.foreign, title: 'Beta confidential title', description: 'Private foreign-org fixture', status: 'OPEN', priority: 'URGENT' },
  ] });
  app = createApp(options);
  for (const account of Object.keys(ids) as Account[]) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.ticket.deleteMany({ where: { id: { in: [alphaTicketId, otherCustomerTicketId, betaTicketId] } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
