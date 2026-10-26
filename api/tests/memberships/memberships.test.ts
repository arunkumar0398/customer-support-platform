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
import { updateMembership } from '../../src/modules/memberships/service.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const alphaId = randomUUID();
const betaId = randomUUID();
const ids = { admin: randomUUID(), agent: randomUUID(), customer: randomUUID(), foreign: randomUUID() };
const userIds = Object.values(ids);
const emails = {
  admin: `membership-admin-${ids.admin}@example.test`,
  agent: `membership-agent-${ids.agent}@example.test`,
  customer: `membership-customer-${ids.customer}@example.test`,
  foreign: `membership-foreign-${ids.foreign}@example.test`,
};
const applicationName = `memberships-${alphaId}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 4, application_name: applicationName }) });
const password = 'synthetic-membership-api-fixture-password';
const origin = 'http://localhost:5173';
const options = {
  getClient: () => db, appOrigin: origin, production: false,
  sessionSecret: 'synthetic-membership-api-csrf-key-with-at-least-32-characters',
};
interface Identity { cookie: string; csrfToken: string }
let app = createApp(options);
let admin: Identity;
let verified = false;

async function signIn(account: keyof typeof ids): Promise<Identity> {
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: emails[account], password });
  expect(response.status).toBe(200);
  return {
    cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    csrfToken: response.body.csrfToken,
  };
}

function membershipRequest(method: 'get' | 'post' | 'patch', path = '/api/memberships', identity = admin, organizationId = alphaId) {
  return request(app)[method](path).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrfToken).set('X-Organization-ID', organizationId);
}

async function snapshot() {
  return db.membership.findMany({
    where: { organizationId: { in: [alphaId, betaId] } },
    orderBy: [{ organizationId: 'asc' }, { userId: 'asc' }],
    select: { organizationId: true, userId: true, role: true, isActive: true, createdAt: true, updatedAt: true },
  });
}

describe('tenant-scoped membership administration', () => {
  it('lists only the active organization roster with public fields and stable bounded pages', async () => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.customer } }, data: { isActive: false } });
    const first = await membershipRequest('get').query({ page: 1, pageSize: 2 });
    const second = await membershipRequest('get').query({ page: 2, pageSize: 2 });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      items: [
        { organizationId: alphaId, userId: ids.admin, email: emails.admin, role: 'ADMIN', isActive: true },
        { organizationId: alphaId, userId: ids.agent, email: emails.agent, role: 'AGENT', isActive: true },
      ], total: 3, page: 1, pageSize: 2,
    });
    expect(second.status).toBe(200);
    expect(second.body.items).toEqual([
      { organizationId: alphaId, userId: ids.customer, email: emails.customer, role: 'CUSTOMER', isActive: false },
    ]);
    expect(second.body.total).toBe(3);
    const defaultPage = await membershipRequest('get');
    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body).toMatchObject({ page: 1, pageSize: 25, total: 3 });
    expect(defaultPage.body.items).toHaveLength(3);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.text).not.toContain(emails.foreign);
  });

  it('adds a known account to its own organization without changing that account or another membership', async () => {
    const originalUser = await db.user.findUniqueOrThrow({ where: { id: ids.foreign } });
    const originalForeignMembership = await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: betaId, userId: ids.foreign } } });
    const response = await membershipRequest('post').send({ email: `  ${emails.foreign.toUpperCase()}  `, role: 'AGENT' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ organizationId: alphaId, userId: ids.foreign, email: emails.foreign, role: 'AGENT', isActive: true });
    expect(await db.user.findUniqueOrThrow({ where: { id: ids.foreign } })).toEqual(originalUser);
    expect(await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: betaId, userId: ids.foreign } } })).toEqual(originalForeignMembership);
    expect(await db.membership.count({ where: { organizationId: alphaId, userId: ids.foreign } })).toBe(1);
    expect(await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.foreign } } }))
      .toMatchObject({ role: 'AGENT', isActive: true });
    expect(response.text).not.toContain(originalUser.passwordHash);
    expect(response.text).not.toContain(password);
  });

  it('lets the other organization admin read its own roster without Alpha data', async () => {
    const betaAdmin = await signIn('foreign');
    const response = await membershipRequest('get', '/api/memberships', betaAdmin, betaId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ organizationId: betaId, userId: ids.foreign, email: emails.foreign, role: 'ADMIN', isActive: true }],
      total: 1, page: 1, pageSize: 25,
    });
    expect(response.text).not.toContain(emails.admin);
    expect(response.text).not.toContain(emails.agent);
  });

  it('rejects an existing membership rather than creating a duplicate or changing its role', async () => {
    const before = await snapshot();
    const response = await membershipRequest('post').send({ email: emails.agent, role: 'ADMIN' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MEMBERSHIP_EXISTS');
    expect(await snapshot()).toEqual(before);
  });

  it('serializes duplicate creates so exactly one membership is created', async () => {
    const results = await Promise.all([
      membershipRequest('post').send({ email: emails.foreign, role: 'AGENT' }),
      membershipRequest('post').send({ email: emails.foreign, role: 'AGENT' }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await db.membership.count({ where: { organizationId: alphaId, userId: ids.foreign } })).toBe(1);
  });

  it('does not reactivate or overwrite an inactive duplicate through creation', async () => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.agent } }, data: { isActive: false } });
    const before = await snapshot();
    const response = await membershipRequest('post').send({ email: emails.agent, role: 'ADMIN' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MEMBERSHIP_EXISTS');
    expect(await snapshot()).toEqual(before);
  });

  it('does not provision global accounts or write a membership for an unknown email', async () => {
    const before = await snapshot();
    const email = `unknown-${randomUUID()}@example.test`;
    const response = await membershipRequest('post').send({ email, role: 'AGENT' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await snapshot()).toEqual(before);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it('updates role/active status only on the selected organization membership', async () => {
    const foreignBefore = await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: betaId, userId: ids.foreign } } });
    const response = await membershipRequest('patch', `/api/memberships/${ids.agent}`).send({ role: 'CUSTOMER', isActive: false });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ organizationId: alphaId, userId: ids.agent, email: emails.agent, role: 'CUSTOMER', isActive: false });
    expect(await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.agent } } }))
      .toMatchObject({ role: 'CUSTOMER', isActive: false });
    expect(await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: betaId, userId: ids.foreign } } })).toEqual(foreignBefore);
  });

  it('reactivates an existing membership through the explicit update path', async () => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.customer } }, data: { isActive: false } });
    const response = await membershipRequest('patch', `/api/memberships/${ids.customer}`).send({ isActive: true });
    expect(response.status).toBe(200);
    expect(response.body.isActive).toBe(true);
    expect((await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.customer } } })).isActive).toBe(true);
  });

  it.each(['agent', 'customer'] as const)('denies roster reads and mutations to an authenticated %s', async (account) => {
    const identity = await signIn(account);
    const before = await snapshot();
    const attempts = [
      membershipRequest('get', '/api/memberships', identity),
      membershipRequest('post', '/api/memberships', identity).send({ email: emails.foreign, role: 'ADMIN' }),
      membershipRequest('patch', `/api/memberships/${ids.agent}`, identity).send({ role: 'ADMIN' }),
    ];
    for (const attempt of attempts) {
      const response = await attempt;
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('denies a foreign organization selector for reads and writes without mutation', async () => {
    const before = await snapshot();
    for (const attempt of [
      membershipRequest('get', '/api/memberships', admin, betaId),
      membershipRequest('post', '/api/memberships', admin, betaId).send({ email: emails.agent, role: 'ADMIN' }),
      membershipRequest('patch', `/api/memberships/${ids.foreign}`, admin, betaId).send({ role: 'CUSTOMER' }),
    ]) {
      const response = await attempt;
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('does not carry an admin role across organizations when the same user is only an agent there', async () => {
    await db.membership.create({ data: { organizationId: betaId, userId: ids.admin, role: 'AGENT' } });
    const before = await snapshot();
    for (const attempt of [
      membershipRequest('get', '/api/memberships', admin, betaId),
      membershipRequest('post', '/api/memberships', admin, betaId).send({ email: emails.agent, role: 'ADMIN' }),
      membershipRequest('patch', `/api/memberships/${ids.foreign}`, admin, betaId).send({ role: 'CUSTOMER' }),
    ]) {
      const response = await attempt;
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect((await membershipRequest('get')).status).toBe(200);
    expect(await snapshot()).toEqual(before);
  });

  it('hides foreign and nonexistent membership IDs within the valid active organization', async () => {
    const before = await snapshot();
    for (const userId of [ids.foreign, randomUUID()]) {
      const response = await membershipRequest('patch', `/api/memberships/${userId}`).send({ role: 'CUSTOMER' });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each([{ role: 'AGENT' }, { isActive: false }])('prevents demotion or removal of the last active admin: %j', async (body) => {
    const before = await snapshot();
    const response = await membershipRequest('patch', `/api/memberships/${ids.admin}`).send(body);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LAST_ADMIN_REQUIRED');
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { body: { role: 'AGENT' }, nextStatus: 403 },
    { body: { isActive: false }, nextStatus: 404 },
  ])('permits removing own admin authority when another admin remains: %j', async ({ body, nextStatus }) => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.agent } }, data: { role: 'ADMIN' } });
    const response = await membershipRequest('patch', `/api/memberships/${ids.admin}`).send(body);
    expect(response.status).toBe(200);
    expect((await membershipRequest('get')).status).toBe(nextStatus);
    expect(await db.membership.count({ where: { organizationId: alphaId, role: 'ADMIN', isActive: true } })).toBe(1);
  });

  it('serializes competing admin removals and preserves exactly one active admin', async () => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.agent } }, data: { role: 'ADMIN' } });
    const secondAdmin = await signIn('agent');
    const responses = await Promise.all([
      membershipRequest('patch', `/api/memberships/${ids.admin}`).send({ isActive: false }),
      membershipRequest('patch', `/api/memberships/${ids.agent}`, secondAdmin).send({ isActive: false }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await db.membership.count({ where: { organizationId: alphaId, role: 'ADMIN', isActive: true } })).toBe(1);
  });

  it.each([
    { data: { role: 'AGENT' as const }, status: 403, code: 'FORBIDDEN' },
    { data: { isActive: false }, status: 404, code: 'NOT_FOUND' },
  ])('re-checks stale actor authority inside the write service: $code', async ({ data, status, code }) => {
    // Simulate membership changing after request middleware resolved its context.
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.admin } }, data });
    const before = await snapshot();
    await expect(updateMembership(db, { organizationId: alphaId, userId: ids.admin, role: 'ADMIN' }, ids.agent, { role: 'CUSTOMER' }))
      .rejects.toMatchObject({ status, code });
    expect(await snapshot()).toEqual(before);
  });

  it('rechecks actor authority after waiting for the organization lock', async () => {
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.customer } }, data: { role: 'ADMIN' } });
    const targetBefore = await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.agent } } });
    let held = false;
    let pending: Promise<Response> | undefined;
    try {
      await verifier.query('BEGIN');
      held = true;
      await verifier.query('SELECT "id" FROM "Organization" WHERE "id" = $1::uuid FOR UPDATE', [alphaId]);
      pending = membershipRequest('patch', `/api/memberships/${ids.agent}`).send({ role: 'CUSTOMER' }).then((response) => response);
      // Observe the actual server transaction waiting; no timing-only race or code hook.
      await vi.waitFor(async () => {
        const rows = await db.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE application_name = ${applicationName} AND state = 'active' AND wait_event_type = 'Lock'
        `;
        expect(rows[0].waiting).toBe(1);
      }, { timeout: 3000, interval: 20 });
      await verifier.query(
        'UPDATE "Membership" SET "role" = $1::"MembershipRole", "updatedAt" = now() WHERE "organizationId" = $2::uuid AND "userId" = $3::uuid',
        ['AGENT', alphaId, ids.admin],
      );
      await verifier.query('COMMIT');
      held = false;
      const response = await pending;
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: alphaId, userId: ids.agent } } })).toEqual(targetBefore);
    } finally {
      if (held) await verifier.query('ROLLBACK');
      if (pending) await pending;
    }
  });
});

describe('membership request boundaries', () => {
  it('requires a valid authenticated session', async () => {
    const before = await snapshot();
    const response = await request(app).get('/api/memberships').set('X-Organization-ID', alphaId);
    expect(response.status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['expired', 'revoked'] as const)('denies the actual roster route with a %s session', async (state) => {
    await db.session.updateMany({ where: { userId: ids.admin }, data: state === 'expired'
      ? { expiresAt: new Date(0) } : { revokedAt: new Date() } });
    const before = await snapshot();
    const response = await membershipRequest('get');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(await snapshot()).toEqual(before);
  });

  it('rejects unsafe requests without session-bound CSRF proof', async () => {
    const before = await snapshot();
    const response = await request(app).post('/api/memberships').set('Cookie', admin.cookie)
      .set('Origin', origin).set('X-Organization-ID', alphaId).send({ email: emails.foreign, role: 'ADMIN' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REJECTED');
    expect(await snapshot()).toEqual(before);
  });

  it('requires the organization selector on the actual mutation route instead of trusting a body ID', async () => {
    const before = await snapshot();
    const response = await request(app).post('/api/memberships').set('Cookie', admin.cookie)
      .set('Origin', origin).set('X-CSRF-Token', admin.csrfToken)
      .send({ email: emails.foreign, role: 'AGENT', organizationId: alphaId });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORGANIZATION_REQUIRED');
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { email: emails.foreign, role: 'AGENT', organizationId: betaId },
    { email: emails.foreign, role: 'AGENT', userId: ids.admin },
    { email: emails.foreign, role: 'AGENT', password: 'forbidden-new-password' },
    { email: emails.foreign, role: 'OWNER' },
    { email: 'invalid', role: 'AGENT' },
  ])('rejects invalid or forbidden membership creation fields: %j', async (body) => {
    const before = await snapshot();
    const response = await membershipRequest('post').send(body);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    {}, { organizationId: betaId }, { userId: ids.foreign }, { email: emails.foreign },
    { passwordHash: 'forbidden' }, { role: 'OWNER' }, { isActive: 'false' },
  ])('rejects invalid or forbidden membership update fields: %j', async (body) => {
    const before = await snapshot();
    const response = await membershipRequest('patch', `/api/memberships/${ids.agent}`).send(body);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await snapshot()).toEqual(before);
  });

  it.each([{ page: 0 }, { page: 1001 }, { pageSize: 101 }, { page: 1.5 }, { organizationId: betaId }])('rejects unbounded or unapproved roster query fields: %j', async (query) => {
    const response = await membershipRequest('get').query(query);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns safe validation for a malformed membership path ID', async () => {
    const response = await membershipRequest('patch', '/api/memberships/not-a-uuid').send({ role: 'AGENT' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for membership API integration tests').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
  await db.organization.createMany({ data: [
    { id: alphaId, slug: `membership-api-${alphaId}`, name: 'Membership API Alpha fixture' },
    { id: betaId, slug: `membership-api-${betaId}`, name: 'Membership API Beta fixture' },
  ] });
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.user.createMany({ data: (Object.keys(ids) as (keyof typeof ids)[]).map((account) => ({ id: ids[account], email: emails[account], passwordHash })) });
});

beforeEach(async () => {
  if (!verified) throw new Error('Disposable test database identity was not verified.');
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.membership.deleteMany({ where: { userId: { in: userIds }, organizationId: { in: [alphaId, betaId] } } });
  await db.membership.createMany({ data: [
    { organizationId: alphaId, userId: ids.admin, role: 'ADMIN', createdAt: new Date('2026-01-01T00:00:00Z') },
    { organizationId: alphaId, userId: ids.agent, role: 'AGENT', createdAt: new Date('2026-01-02T00:00:00Z') },
    { organizationId: alphaId, userId: ids.customer, role: 'CUSTOMER', createdAt: new Date('2026-01-03T00:00:00Z') },
    { organizationId: betaId, userId: ids.foreign, role: 'ADMIN', createdAt: new Date('2026-01-01T00:00:00Z') },
  ] });
  app = createApp(options);
  admin = await signIn('admin');
});

afterAll(async () => {
  if (verified) {
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
