import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import express from 'express';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { createActiveMembership } from '../../src/middleware/active-membership.js';
import { createAuthenticate } from '../../src/middleware/authenticate.js';
import { errorHandler } from '../../src/middleware/errors.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 2 }) });
const userId = randomUUID();
const alphaId = randomUUID();
const betaId = randomUUID();
const email = `membership-${userId}@example.test`;
const password = 'synthetic-membership-fixture-password';
const origin = 'http://localhost:5173';
const options = {
  getClient: () => db, appOrigin: origin, production: false,
  sessionSecret: 'synthetic-test-only-membership-csrf-secret-at-least-32-characters',
};
let cookie = '';
let verified = false;

// Only the test harness exposes these context-inspection routes. Product routers
// will consume the same authenticate -> active-membership chain in later tasks.
const app = express();
app.use(requestIdMiddleware);
app.use(express.json());
app.get('/context', createAuthenticate(options), createActiveMembership(options), (_req, res) => {
  res.json(res.locals.membership ?? {});
});
app.get('/missing-auth', createActiveMembership(options), (_req, res) => res.json({}));
app.use(errorHandler);

function scopedGet(selector?: string) {
  let attempt = request(app).get('/context').set('Cookie', cookie);
  if (selector !== undefined) attempt = attempt.set('X-Organization-ID', selector);
  return attempt;
}

describe('current active organization membership', () => {
  it('derives organization, identity, and role from the authenticated current membership', async () => {
    const response = await scopedGet(alphaId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ organizationId: alphaId, userId, role: 'ADMIN' });
  });

  it('requires authentication before resolving any organization', async () => {
    const response = await request(app).get('/context').set('X-Organization-ID', alphaId);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('fails closed if the membership middleware is mounted without authentication', async () => {
    const response = await request(app).get('/missing-auth').set('X-Organization-ID', alphaId);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('requires an explicit selector and never falls back to a body organization ID', async () => {
    const response = await scopedGet().send({ organizationId: alphaId });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORGANIZATION_REQUIRED');
  });

  it.each(['not-a-uuid', `${alphaId}, ${betaId}`, ''])('rejects a malformed or ambiguous selector: %s', async (selector) => {
    const response = await scopedGet(selector);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(selector ? 'INVALID_ORGANIZATION' : 'ORGANIZATION_REQUIRED');
  });

  it('does not disclose whether an inaccessible organization exists', async () => {
    for (const selector of [betaId, randomUUID()]) {
      const response = await scopedGet(selector);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: {
        code: 'NOT_FOUND', message: 'Resource not found.', requestId: response.headers['x-request-id'],
      } });
      expect(response.text).not.toContain(selector);
    }
  });

  it('rejects revoked membership on the next request with the same valid session', async () => {
    expect((await scopedGet(alphaId)).status).toBe(200);
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId } }, data: { isActive: false } });
    const response = await scopedGet(alphaId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('reloads a changed role instead of trusting login-time membership data or forged role fields', async () => {
    expect((await scopedGet(alphaId)).body.role).toBe('ADMIN');
    await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId } }, data: { role: 'CUSTOMER' } });
    const response = await scopedGet(alphaId).set('X-Role', 'ADMIN')
      .send({ role: 'ADMIN', organizationId: betaId, userId: randomUUID() });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ organizationId: alphaId, userId, role: 'CUSTOMER' });
  });

  it('permits a second organization only after current membership exists and uses its own role', async () => {
    expect((await scopedGet(betaId)).status).toBe(404);
    await db.membership.create({ data: { organizationId: betaId, userId, role: 'AGENT' } });
    expect((await scopedGet(betaId)).body).toEqual({ organizationId: betaId, userId, role: 'AGENT' });
    expect((await scopedGet(alphaId)).body).toEqual({ organizationId: alphaId, userId, role: 'ADMIN' });
    await db.membership.delete({ where: { organizationId_userId: { organizationId: betaId, userId } } });
    expect((await scopedGet(betaId)).status).toBe(404);
  });

  it('normalizes a canonical UUID selector while returning the database-owned organization ID', async () => {
    const response = await scopedGet(alphaId.toUpperCase());
    expect(response.status).toBe(200);
    expect(response.body.organizationId).toBe(alphaId);
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for membership integration tests').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  await db.organization.createMany({ data: [
    { id: alphaId, slug: `context-${alphaId}`, name: 'Membership Alpha fixture' },
    { id: betaId, slug: `context-${betaId}`, name: 'Membership Beta fixture' },
  ] });
  await db.user.create({ data: { id: userId, email,
    passwordHash: `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`,
    memberships: { create: { organizationId: alphaId, role: 'ADMIN' } },
  } });
});

beforeEach(async () => {
  if (!verified) throw new Error('Disposable database identity was not verified.');
  await db.session.deleteMany({ where: { userId } });
  await db.membership.deleteMany({ where: { userId, organizationId: betaId } });
  await db.membership.update({ where: { organizationId_userId: { organizationId: alphaId, userId } }, data: { isActive: true, role: 'ADMIN' } });
  const signedIn = await request(createApp(options)).post('/api/auth/login')
    .set('Origin', origin).set('X-CSRF-Protection', '1').send({ email, password });
  expect(signedIn.status).toBe(200);
  cookie = (signedIn.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
});

afterAll(async () => {
  if (verified) {
    await db.session.deleteMany({ where: { userId } });
    await db.membership.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.organization.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});
