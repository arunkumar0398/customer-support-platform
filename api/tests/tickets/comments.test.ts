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
const email = (account: Account) => `ticket-comment-${ids[account]}@example.test`;
const password = 'synthetic-ticket-comment-fixture-password';
const origin = 'http://localhost:5173';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 5, application_name: `ticket-comment-${alphaId}` }) });
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-comment-csrf-key-at-least-32-characters' };
let app = createApp(options);
interface Identity { cookie: string; csrf: string }
const identities = new Map<Account, Identity>();
let verified = false;
const alphaTicketId = randomUUID();
const otherTicketId = randomUUID();
const closedTicketId = randomUUID();
const betaTicketId = randomUUID();
const commentIds = [randomUUID(), randomUUID()].sort();
const commentTime = new Date('2026-10-01T12:00:00.000Z');

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

function listComments(account: Account, ticketId: string, organizationId = alphaId) {
  return request(app).get(`/api/tickets/${ticketId}/comments`).set('Cookie', identities.get(account)!.cookie)
    .set('X-Organization-ID', organizationId);
}

function addComment(account: Account, ticketId: string, body: object, organizationId = alphaId) {
  const identity = identities.get(account)!;
  return request(app).post(`/api/tickets/${ticketId}/comments`).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', organizationId).send(body);
}

describe('tenant-scoped ticket comments and conversation history', () => {
  it('returns comments in stable chronological order with bounded pagination', async () => {
    const response = await listComments('admin', alphaTicketId).query({ page: 1, pageSize: 1 });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(response.body.items.map((comment: { id: string }) => comment.id)).toEqual(commentIds.slice(0, 1));
    expect(response.body.items[0]).toMatchObject({
      organizationId: alphaId, ticketId: alphaTicketId, authorUserId: ids.admin, body: 'First chronological comment',
    });
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('allows all three authorized roles to add a comment and writes its activity event atomically', async () => {
    for (const account of ['admin', 'agent', 'customer'] as const) {
      const body = `Comment by ${account}`;
      const response = await addComment(account, alphaTicketId, { body });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        organizationId: alphaId, ticketId: alphaTicketId, authorUserId: ids[account], body,
      });
      const event = await db.activityEvent.findFirstOrThrow({ where: { ticketId: alphaTicketId, type: 'COMMENT_ADDED', actorUserId: ids[account] } });
      expect(event.newValue).toEqual({ commentId: response.body.id });
    }
  });

  it('allows customers to read their own comments but does not reveal another customer conversation', async () => {
    const own = await listComments('customer', alphaTicketId);
    const other = await listComments('customer', otherTicketId);
    expect(own.status).toBe(200);
    expect(own.body.total).toBeGreaterThanOrEqual(2);
    expect(other.status).toBe(404);
    expect(other.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
  });

  it('does not disclose foreign-organization comments', async () => {
    const foreign = await listComments('admin', betaTicketId);
    const ownTenant = await listComments('foreign', betaTicketId, betaId);
    expect(foreign.status).toBe(404);
    expect(ownTenant.status).toBe(200);
    expect(ownTenant.body.total).toBe(0);
  });

  it('allows authorized history reads for closed tickets but rejects new comments', async () => {
    const history = await listComments('customer', closedTicketId);
    expect(history.status).toBe(200);
    expect(history.body.total).toBe(0);
    const rejected = await addComment('customer', closedTicketId, { body: 'Should not persist' });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('TICKET_CLOSED');
    expect(await db.comment.count({ where: { ticketId: closedTicketId } })).toBe(0);
    expect(await db.activityEvent.count({ where: { ticketId: closedTicketId } })).toBe(0);
  });

  it('rejects invalid comment payloads without creating comments or events', async () => {
    const beforeComments = await db.comment.count({ where: { ticketId: alphaTicketId } });
    const beforeEvents = await db.activityEvent.count({ where: { ticketId: alphaTicketId } });
    for (const body of [{ body: '' }, { body: '   ' }, { body: 'x'.repeat(10001) }, { body: 'valid', organizationId: betaId }, { text: 'wrong field' }]) {
      const response = await addComment('admin', alphaTicketId, body);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await db.comment.count({ where: { ticketId: alphaTicketId } })).toBe(beforeComments);
    expect(await db.activityEvent.count({ where: { ticketId: alphaTicketId } })).toBe(beforeEvents);
  });

  it('does not allow a customer to comment on another same-org customer ticket', async () => {
    const response = await addComment('customer', otherTicketId, { body: 'Private ticket attempt' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await db.comment.count({ where: { ticketId: otherTicketId } })).toBe(0);
  });

  it('does not allow a member to comment on a foreign-org ticket by ID', async () => {
    const response = await addComment('admin', betaTicketId, { body: 'Foreign ticket attempt' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await db.comment.count({ where: { ticketId: betaTicketId } })).toBe(0);
    expect(await db.activityEvent.count({ where: { ticketId: betaTicketId } })).toBe(0);
  });

  it('rejects invalid pagination and malformed ticket IDs', async () => {
    const identity = identities.get('admin')!;
    const invalidQuery = await listComments('admin', alphaTicketId).query({ page: 0, unexpected: 'ignored' });
    const invalidPath = await request(app).get('/api/tickets/not-a-uuid/comments').set('Cookie', identity.cookie).set('X-Organization-ID', alphaId);
    expect(invalidQuery.status).toBe(422);
    expect(invalidPath.status).toBe(422);
  });

  it('requires authentication for conversation reads and writes', async () => {
    const read = await request(app).get(`/api/tickets/${alphaTicketId}/comments`).set('X-Organization-ID', alphaId);
    const write = await request(app).post(`/api/tickets/${alphaTicketId}/comments`).set('Origin', origin)
      .set('X-CSRF-Protection', '1').set('X-Organization-ID', alphaId).send({ body: 'Unauthenticated' });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it('rolls back a comment if PostgreSQL rejects its activity event', async () => {
    const name = `tk19_${randomUUID().replaceAll('-', '')}`;
    const beforeComments = await db.comment.count({ where: { ticketId: alphaTicketId } });
    const beforeEvents = await db.activityEvent.count({ where: { ticketId: alphaTicketId } });
    try {
      await verifier.query(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic comment event rejection'; END $$`);
      await verifier.query(`CREATE TRIGGER "${name}" BEFORE INSERT ON "ActivityEvent" FOR EACH ROW WHEN (NEW."organizationId" = '${alphaId}'::uuid) EXECUTE FUNCTION "${name}"()`);
      const response = await addComment('admin', alphaTicketId, { body: 'Must roll back with event' });
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.text).not.toContain('synthetic comment event rejection');
      expect(await db.comment.count({ where: { ticketId: alphaTicketId } })).toBe(beforeComments);
      expect(await db.activityEvent.count({ where: { ticketId: alphaTicketId } })).toBe(beforeEvents);
    } finally {
      await verifier.query(`DROP TRIGGER IF EXISTS "${name}" ON "ActivityEvent"`);
      await verifier.query(`DROP FUNCTION IF EXISTS "${name}"()`);
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
    { id: alphaId, slug: `comment-${alphaId}`, name: 'Comment Alpha' },
    { id: betaId, slug: `comment-${betaId}`, name: 'Comment Beta' },
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
    { id: alphaTicketId, organizationId: alphaId, ticketNumber: 1, requesterUserId: ids.customer, title: 'Alpha comment fixture', description: 'Synthetic conversation fixture' },
    { id: otherTicketId, organizationId: alphaId, ticketNumber: 2, requesterUserId: ids.other, title: 'Other customer comments', description: 'Private conversation fixture' },
    { id: closedTicketId, organizationId: alphaId, ticketNumber: 3, requesterUserId: ids.customer, title: 'Closed comment fixture', description: 'Closed synthetic conversation', status: 'CLOSED' },
    { id: betaTicketId, organizationId: betaId, ticketNumber: 1, requesterUserId: ids.foreign, title: 'Beta comment fixture', description: 'Foreign conversation fixture' },
  ] });
  await db.comment.createMany({ data: commentIds.map((id, index) => ({
    id, organizationId: alphaId, ticketId: alphaTicketId, authorUserId: ids.admin,
    body: index === 0 ? 'First chronological comment' : 'Second chronological comment', createdAt: commentTime,
  })) });
  app = createApp(options);
  for (const account of Object.keys(ids) as Account[]) await signIn(account);
});

beforeEach(() => { app = createApp(options); });

afterAll(async () => {
  if (verified) {
    await db.comment.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.activityEvent.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
    await db.ticket.deleteMany({ where: { id: { in: [alphaTicketId, otherTicketId, closedTicketId, betaTicketId] } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
