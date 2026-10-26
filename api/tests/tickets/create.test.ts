import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const alphaId = randomUUID();
const betaId = randomUUID();
const applicationName = `ticket-create-${alphaId}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 4, application_name: applicationName }) });
const ids = { admin: randomUUID(), agent: randomUUID(), customer: randomUUID(), other: randomUUID(), foreign: randomUUID() };
const userIds = Object.values(ids);
type Account = keyof typeof ids;
const email = (account: Account) => `ticket-create-${ids[account]}@example.test`;
const password = 'synthetic-ticket-create-fixture-password';
const origin = 'http://localhost:5173';
const options = { getClient: () => db, appOrigin: origin, production: false, sessionSecret: 'synthetic-ticket-create-csrf-key-at-least-32-characters' };
let app = createApp(options);
interface Identity { cookie: string; csrf: string }
let customer: Identity;
let verified = false;
const body = { title: ' Printer outage ', description: ' Cannot print the synthetic invoice. ' };

async function signIn(account: Account): Promise<Identity> {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: email(account), password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0], csrf: response.body.csrfToken };
}
function create(identity = customer, organizationId = alphaId) {
  return request(app).post('/api/tickets').set('Cookie', identity.cookie).set('Origin', origin)
    .set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', organizationId);
}
async function snapshot() {
  return {
    tickets: await db.ticket.findMany({ where: { organizationId: { in: [alphaId, betaId] } }, orderBy: { id: 'asc' } }),
    events: await db.activityEvent.findMany({ where: { organizationId: { in: [alphaId, betaId] } }, orderBy: { id: 'asc' } }),
  };
}

describe('ticket creation transaction and tenant authority', () => {
  it('creates an own OPEN ticket and one immutable creation event with server defaults', async () => {
    const response = await create().send(body);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String), organizationId: alphaId, ticketNumber: 1, requesterUserId: ids.customer,
      assigneeUserId: null, title: 'Printer outage', description: 'Cannot print the synthetic invoice.',
      status: 'OPEN', priority: 'MEDIUM', dueAt: null, version: 1,
      createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    const persisted = await db.ticket.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(persisted).toMatchObject({ organizationId: alphaId, requesterUserId: ids.customer, ticketNumber: 1, version: 1, status: 'OPEN', priority: 'MEDIUM', assigneeUserId: null, assigneeOrganizationId: null, dueAt: null });
    const events = await db.activityEvent.findMany({ where: { organizationId: alphaId, ticketId: persisted.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorUserId: ids.customer, type: 'TICKET_CREATED', previousValue: null, newValue: { title: 'Printer outage', status: 'OPEN', priority: 'MEDIUM', requesterUserId: ids.customer } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain('passwordHash');
  });

  it.each(['admin', 'agent'] as const)('lets %s create for an active same-org customer with explicit priority', async (account) => {
    const identity = await signIn(account);
    const response = await create(identity).send({ ...body, requesterUserId: ids.other, priority: 'HIGH' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ requesterUserId: ids.other, priority: 'HIGH', organizationId: alphaId, status: 'OPEN' });
    expect(await db.activityEvent.findMany({ where: { organizationId: alphaId, ticketId: response.body.id } }))
      .toMatchObject([{ actorUserId: ids[account], type: 'TICKET_CREATED', newValue: { priority: 'HIGH', requesterUserId: ids.other } }]);
  });

  it('allows a Beta customer to create only its own Beta ticket', async () => {
    const identity = await signIn('foreign');
    const response = await create(identity, betaId).send(body);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ organizationId: betaId, requesterUserId: ids.foreign, ticketNumber: 1 });
    expect(await db.ticket.count({ where: { organizationId: alphaId } })).toBe(0);
  });

  it('allocates distinct organization-local numbers for concurrent creates', async () => {
    const results = await Promise.all([create().send(body), create().send(body), create().send(body)]);
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    expect(results.map((result) => result.body.ticketNumber).sort()).toEqual([1, 2, 3]);
    expect(new Set(results.map((result) => result.body.id)).size).toBe(3);
    expect(await db.activityEvent.count({ where: { organizationId: alphaId } })).toBe(3);
  });

  it('uses a separate number sequence for each organization', async () => {
    const foreign = await signIn('foreign');
    const a = await create().send(body);
    const b = await create(foreign, betaId).send(body);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.ticketNumber, b.body.ticketNumber]).toEqual([1, 1]);
  });

  it('continues after the current maximum ticket number rather than counting rows', async () => {
    const first = await create().send(body);
    expect(first.status).toBe(201);
    await db.ticket.update({ where: { id: first.body.id }, data: { ticketNumber: 7 } });
    const next = await create().send(body);
    expect(next.status).toBe(201);
    expect(next.body.ticketNumber).toBe(8);
  });

  it('returns a conflict instead of overflowing the organization ticket number', async () => {
    await db.ticket.create({ data: { organizationId: alphaId, requesterUserId: ids.customer, ticketNumber: 2147483647, title: 'At numeric limit', description: 'Synthetic boundary row.' } });
    const response = await create().send(body);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TICKET_NUMBER_LIMIT');
    expect(await db.ticket.count({ where: { organizationId: alphaId } })).toBe(1);
    expect(await db.activityEvent.count({ where: { organizationId: alphaId } })).toBe(0);
  });

  it.each(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])('accepts documented staff priority %s', async (priority) => {
    const identity = await signIn('agent');
    const response = await create(identity).send({ ...body, requesterUserId: ids.other.toUpperCase(), priority });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ priority, requesterUserId: ids.other, dueAt: null });
  });

  it('defaults staff priority and rejects a nonexistent requester without writes', async () => {
    const identity = await signIn('agent');
    const denied = await create(identity).send({ ...body, requesterUserId: randomUUID() });
    expect(denied.status).toBe(404);
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
    const allowed = await create(identity).send({ ...body, requesterUserId: ids.other });
    expect(allowed.status).toBe(201);
    expect(allowed.body.priority).toBe('MEDIUM');
  });

  it('rechecks role after waiting for the organization lock before parsing staff fields', async () => {
    const identity = await signIn('agent');
    let held = false;
    let pending: Promise<Response> | undefined;
    try {
      await verifier.query('BEGIN');
      held = true;
      await verifier.query('SELECT "id" FROM "Organization" WHERE "id" = $1::uuid FOR UPDATE', [alphaId]);
      pending = create(identity).send({ ...body, requesterUserId: ids.other }).then((response) => response);
      await vi.waitFor(async () => {
        const rows = await db.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE application_name = ${applicationName} AND state = 'active' AND wait_event_type = 'Lock'
        `;
        expect(rows[0].waiting).toBe(1);
      }, { timeout: 3000, interval: 20 });
      await verifier.query('UPDATE "Membership" SET "role" = $1::"MembershipRole" WHERE "organizationId" = $2::uuid AND "userId" = $3::uuid', ['CUSTOMER', alphaId, ids.agent]);
      await verifier.query('COMMIT');
      held = false;
      const denied = await pending;
      expect(denied.status).toBe(422); // Now CUSTOMER: explicit requester is forbidden.
      expect(await snapshot()).toEqual({ tickets: [], events: [] });
    } finally {
      if (held) await verifier.query('ROLLBACK');
      if (pending) await pending;
      await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.agent } }, data: { role: 'AGENT' } });
    }
  });

  it('does not carry an admin role to an organization where the same user is a customer', async () => {
    await db.membership.create({ data: { organizationId: betaId, userId: ids.admin, role: 'CUSTOMER' } });
    try {
      const identity = await signIn('admin');
      const denied = await create(identity, betaId).send({ ...body, requesterUserId: ids.foreign, priority: 'URGENT' });
      expect(denied.status).toBe(422);
      const allowed = await create(identity, betaId).send(body);
      expect(allowed.status).toBe(201);
      expect(allowed.body).toMatchObject({ organizationId: betaId, requesterUserId: ids.admin, priority: 'MEDIUM' });
    } finally {
      // Ticket retains its requester FK until the standard fixture cleanup.
      await db.activityEvent.deleteMany({ where: { organizationId: betaId } });
      await db.ticket.deleteMany({ where: { organizationId: betaId } });
      await db.membership.delete({ where: { organizationId_userId: { organizationId: betaId, userId: ids.admin } } });
    }
  });

  it('documents repeated create as distinct tickets rather than claiming idempotency', async () => {
    const first = await create().send(body);
    const second = await create().send(body);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.ticketNumber).toBe(2);
  });

  it('rolls back the ticket when the actual database rejects its creation event', async () => {
    // Disposable DB only, unique trigger name and fixture-org condition. No production fault hook.
    const name = `tk12_${randomUUID().replaceAll('-', '')}`;
    const before = await snapshot();
    try {
      await verifier.query(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic event insert rejection'; END $$`);
      await verifier.query(`CREATE TRIGGER "${name}" BEFORE INSERT ON "ActivityEvent" FOR EACH ROW WHEN (NEW."organizationId" = '${alphaId}'::uuid) EXECUTE FUNCTION "${name}"()`);
      const response = await create().send(body);
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.text).not.toContain('synthetic event insert rejection');
      expect(await snapshot()).toEqual(before);
    } finally {
      await verifier.query(`DROP TRIGGER IF EXISTS "${name}" ON "ActivityEvent"`);
      await verifier.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    }
    const recovery = await create().send(body);
    expect(recovery.status).toBe(201);
    expect(recovery.body.ticketNumber).toBe(1);
    expect(await db.activityEvent.count({ where: { organizationId: alphaId } })).toBe(1);
  });

  it.each(['foreign', 'admin', 'agent'] as const)('rejects a staff-selected %s requester without writes', async (target) => {
    const identity = await signIn('admin');
    const before = await snapshot();
    const response = await create(identity).send({ ...body, requesterUserId: ids[target] });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await snapshot()).toEqual(before);
  });

  it('rejects an inactive customer requester', async () => {
    const identity = await signIn('agent');
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.other } }, data: { isActive: false } });
    const response = await create(identity).send({ ...body, requesterUserId: ids.other });
    expect(response.status).toBe(404);
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });

  it('hides foreign organization selection and writes nothing', async () => {
    const response = await create(customer, betaId).send(body);
    expect(response.status).toBe(404);
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });

  it('rejects an actor whose membership has been deactivated', async () => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.customer } }, data: { isActive: false } });
    expect((await create().send(body)).status).toBe(404);
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });
});

describe('strict ticket creation boundaries', () => {
  it.each([
    {}, { title: 'only title' }, { description: 'only description' },
    { ...body, title: '   ' }, { ...body, description: '  ' },
    { ...body, title: 'x'.repeat(201) }, { ...body, description: 'x'.repeat(10001) },
    { ...body, title: 123 }, { ...body, description: null },
    { ...body, organizationId: betaId }, { ...body, requesterUserId: ids.other },
    { ...body, requesterUserId: ids.customer }, { ...body, priority: 'URGENT' },
    { ...body, status: 'CLOSED' }, { ...body, assigneeUserId: ids.agent },
    { ...body, version: 100 }, { ...body, ticketNumber: 9 }, { ...body, dueAt: '2026-10-27T00:00:00Z' },
    { ...body, activityEvents: { create: { type: 'TICKET_CREATED' } } },
  ])('rejects invalid or forbidden customer payload %# without writes', async (input) => {
    const response = await create().send(input);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });

  it.each([{ ...body }, { ...body, requesterUserId: 'bad-id' }, { ...body, requesterUserId: ids.other, priority: 'EXTREME' }, { ...body, requesterUserId: ids.other, organizationId: betaId }])('rejects invalid staff payload %#', async (input) => {
    const identity = await signIn('agent');
    const response = await create(identity).send(input);
    expect(response.status).toBe(422);
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });

  it('accepts documented field length boundaries', async () => {
    const response = await create().send({ title: 'x'.repeat(200), description: 'x'.repeat(10000) });
    expect(response.status).toBe(201);
    expect(response.body.title).toHaveLength(200);
    expect(response.body.description).toHaveLength(10000);
  });

  it('requires authentication and CSRF on the actual mutation endpoint', async () => {
    expect((await request(app).post('/api/tickets').send(body)).status).toBe(401);
    expect((await request(app).post('/api/tickets').set('Cookie', customer.cookie).set('Origin', origin).set('X-Organization-ID', alphaId).send(body)).status).toBe(403);
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });

  it.each(['expired', 'revoked'] as const)('rejects a %s session on ticket creation', async (state) => {
    await db.session.updateMany({ where: { userId: ids.customer }, data: state === 'expired' ? { expiresAt: new Date(0) } : { revokedAt: new Date() } });
    expect((await create().send(body)).status).toBe(401);
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });

  it('requires an organization selector instead of accepting a payload tenant', async () => {
    const response = await request(app).post('/api/tickets').set('Cookie', customer.cookie).set('Origin', origin)
      .set('X-CSRF-Token', customer.csrf).send({ ...body, organizationId: alphaId });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORGANIZATION_REQUIRED');
    expect(await snapshot()).toEqual({ tickets: [], events: [] });
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const result = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(result.rows[0], expected);
  verified = true;
  await db.organization.createMany({ data: [
    { id: alphaId, slug: `create-${alphaId}`, name: 'Create Alpha' },
    { id: betaId, slug: `create-${betaId}`, name: 'Create Beta' },
  ] });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ id: ids[account], email: email(account), passwordHash })) });
  await db.membership.createMany({ data: (Object.keys(ids) as Account[]).map((account) => ({ organizationId: account === 'foreign' ? betaId : alphaId, userId: ids[account], role: account === 'admin' ? 'ADMIN' : account === 'agent' ? 'AGENT' : 'CUSTOMER' })) });
});

beforeEach(async () => {
  if (!verified) throw new Error('Disposable DB identity was not verified.');
  await db.activityEvent.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
  await db.ticket.deleteMany({ where: { organizationId: { in: [alphaId, betaId] } } });
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.membership.updateMany({ where: { organizationId: { in: [alphaId, betaId] } }, data: { isActive: true } });
  app = createApp(options);
  customer = await signIn('customer');
});

afterAll(async () => {
  if (verified) {
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
