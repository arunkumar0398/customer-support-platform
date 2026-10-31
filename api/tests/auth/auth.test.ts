import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 2 }) });
const userId = randomUUID();
const organizationId = randomUUID();
const email = `auth-${userId}@example.test`;
const password = 'synthetic-auth-fixture-password';
const origin = 'http://localhost:5173';
const sessionSecret = 'synthetic-test-only-csrf-secret-with-at-least-32-characters';
let now = new Date();
let app = createApp();
let verified = false;

function login(target = app, body: Record<string, unknown> = { email, password }) {
  return request(target).post('/api/auth/login')
    .set('Origin', origin).set('X-CSRF-Protection', '1').send(body);
}

afterEach(() => vi.restoreAllMocks());

function cookieOf(response: Response): string {
  expect(response.status, 'a session cookie requires a successful login').toBe(200);
  expect(response.headers['set-cookie']).toBeDefined();
  return (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

function hashCookie(cookie: string): string {
  return createHash('sha256').update(cookie.split('=')[1]).digest('hex');
}

beforeEach(async () => {
  if (!verified) throw new Error('Disposable database identity was not verified.');
  await db.session.deleteMany({ where: { userId } });
  await db.membership.updateMany({ where: { userId }, data: { isActive: true } });
  now = new Date();
  app = createApp({ getClient: () => db, appOrigin: origin, sessionSecret, production: false, now: () => now });
});

describe('password authentication', () => {
  it('logs in with a stored password hash and returns the current authorized membership', async () => {
    const response = await login();

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: userId, email });
    expect(response.body.memberships).toEqual([
      { organizationId, role: 'ADMIN', organization: { name: 'Auth fixture', slug: `auth-${organizationId}` } },
    ]);
    expect(response.body.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(response.body).sort()).toEqual(['csrfToken', 'memberships', 'user']);
    expect(JSON.stringify(response.body)).not.toContain(password);
    expect(response.headers['set-cookie']).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain(cookieOf(response).split('=')[1]);
  });

  it('rejects the wrong password with the same public error as an unknown account', async () => {
    for (const body of [{ email, password: 'incorrect' }, { email: 'unknown@example.test', password }]) {
      const response = await request(app).post('/api/auth/login')
        .set('Origin', origin).set('X-CSRF-Protection', '1').send(body);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });

  it('stores only a hash of a fresh opaque token and returns an HttpOnly development cookie', async () => {
    const response = await login();
    const cookie = cookieOf(response);
    const headers = response.headers['set-cookie'] as unknown as string[];
    const session = await db.session.findFirstOrThrow({ where: { userId } });

    expect(cookie).toMatch(/^support_session=[0-9a-f]{64}$/);
    expect(session.tokenHash).toBe(hashCookie(cookie));
    expect(session.tokenHash).not.toBe(cookie.split('=')[1]);
    expect(session.expiresAt.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
    expect(headers[0]).toContain('HttpOnly');
    expect(headers[0]).toContain('SameSite=Lax');
    expect(headers[0]).toContain('Path=/api');
    expect(headers[0]).not.toContain('Secure');
    expect(response.body.csrfToken).not.toBe(cookie.split('=')[1]);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('sets Secure on production cookies', async () => {
    const production = createApp({ getClient: () => db, appOrigin: 'https://support.example.test', sessionSecret, production: true });
    const response = await request(production).post('/api/auth/login')
      .set('Origin', 'https://support.example.test').set('X-CSRF-Protection', '1').send({ email, password });
    expect(response.status).toBe(200);
    expect((response.headers['set-cookie'] as unknown as string[])[0]).toContain('Secure');
  });

  it.each([
    { sessionSecret: 'short', production: false, appOrigin: origin },
    { sessionSecret: 'REPLACE_IN_LOCAL_ENV_WITH_RANDOM_VALUE', production: false, appOrigin: origin },
    { sessionSecret, production: true, appOrigin: origin },
  ])('fails closed before persisting a session for invalid configuration: %j', async (configuration) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalid = createApp({ getClient: () => db, ...configuration });
    const response = await login(invalid);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });

  it('reloads the session and current active memberships from PostgreSQL', async () => {
    const signedIn = await login();
    const cookie = cookieOf(signedIn);
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(signedIn.body);
    expect(response.headers['cache-control']).toBe('no-store');

    await db.membership.update({ where: { organizationId_userId: { organizationId, userId } }, data: { isActive: false } });
    const revokedMembership = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(revokedMembership.status).toBe(200);
    expect(revokedMembership.body.memberships).toEqual([]);
  });

  it('rotates a supplied session at login and revokes the old persisted token', async () => {
    const first = await login();
    const firstCookie = cookieOf(first);
    const second = await login().set('Cookie', firstCookie);
    const secondCookie = cookieOf(second);
    expect(secondCookie).not.toBe(firstCookie);
    expect((await request(app).get('/api/auth/me').set('Cookie', firstCookie)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', secondCookie)).status).toBe(200);
    expect((await db.session.findUniqueOrThrow({ where: { tokenHash: hashCookie(firstCookie) } })).revokedAt).not.toBeNull();
  });

  it.each(['expired', 'revoked'] as const)('rejects a %s persisted session', async (state) => {
    const signedIn = await login();
    const cookie = cookieOf(signedIn);
    await db.session.update({
      where: { tokenHash: hashCookie(cookie) },
      data: state === 'expired' ? { expiresAt: new Date(now.getTime() - 1) } : { revokedAt: now },
    });
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(['', 'support_session=invalid', `support_session=${'a'.repeat(64)}`])('rejects absent, malformed, or unknown cookies: %s', async (cookie) => {
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects ambiguous duplicate session cookies', async () => {
    const signedIn = await login();
    const cookie = cookieOf(signedIn);
    expect((await request(app).get('/api/auth/me').set('Cookie', `${cookie}; ${cookie}`)).status).toBe(401);
  });

  it('revokes logout in PostgreSQL, expires the browser cookie, and rejects replay', async () => {
    const signedIn = await login();
    const cookie = cookieOf(signedIn);
    const response = await request(app).post('/api/auth/logout').set('Cookie', cookie)
      .set('Origin', origin).set('X-CSRF-Token', signedIn.body.csrfToken);
    expect(response.status).toBe(204);
    expect((response.headers['set-cookie'] as unknown as string[])[0]).toContain('Expires=Thu, 01 Jan 1970');
    expect((await db.session.findUniqueOrThrow({ where: { tokenHash: hashCookie(cookie) } })).revokedAt).not.toBeNull();
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('origin and CSRF protection', () => {
  it.each(['', 'null', 'https://attacker.example.test', `${origin}.attacker.example.test`])('rejects login from an absent or unapproved origin: %s', async (value) => {
    let attempt = request(app).post('/api/auth/login').set('X-CSRF-Protection', '1');
    if (value) attempt = attempt.set('Origin', value);
    const response = await attempt.send({ email, password });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REJECTED');
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });

  it('requires the custom login header in addition to the approved origin', async () => {
    const response = await request(app).post('/api/auth/login').set('Origin', origin).send({ email, password });
    expect(response.status).toBe(403);
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });

  it.each(['', 'incorrect-token'])('rejects logout with absent or invalid CSRF proof: %s', async (proof) => {
    const signedIn = await login();
    const cookie = cookieOf(signedIn);
    let attempt = request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', origin);
    if (proof) attempt = attempt.set('X-CSRF-Token', proof);
    const response = await attempt;
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REJECTED');
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('rejects valid CSRF proof sent from an unapproved origin', async () => {
    const signedIn = await login();
    const cookie = cookieOf(signedIn);
    const response = await request(app).post('/api/auth/logout').set('Cookie', cookie)
      .set('Origin', 'https://attacker.example.test').set('X-CSRF-Token', signedIn.body.csrfToken);
    expect(response.status).toBe(403);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('binds CSRF proof to its session instead of another session for the same user', async () => {
    const first = await login();
    const second = await login();
    const response = await request(app).post('/api/auth/logout').set('Cookie', cookieOf(second))
      .set('Origin', origin).set('X-CSRF-Token', first.body.csrfToken);
    expect(response.status).toBe(403);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieOf(second))).status).toBe(200);
  });

  it('rejects forbidden login properties before creating a session', async () => {
    const response = await login(app, { email, password, role: 'ADMIN', organizationId });
    expect(response.status).toBe(422);
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });

  it.each([
    { email: 'invalid-email', password },
    { email, password: '' },
    { email, password: 'x'.repeat(257) },
    { email, password: 42 },
  ])('rejects malformed credentials without creating a session: %j', async (body) => {
    const response = await login(app, body);
    expect(response.status).toBe(422);
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });
});

describe('login throttling', () => {
  it('uses an explicit per-IP attempt limit when configured', async () => {
    const limitedApp = createApp({
      getClient: () => db,
      appOrigin: origin,
      sessionSecret,
      production: false,
      loginIpAttemptLimit: 2,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await login(limitedApp, { email: `ip-limit-${attempt}@example.test`, password: 'wrong' });
      expect(response.status).toBe(401);
    }

    const blocked = await login(limitedApp, { email: 'ip-limit-final@example.test', password: 'wrong' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits attempts for a normalized account and recovers after its window', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await login(app, { email: `  ${email.toUpperCase()}  `, password: 'wrong' });
      expect(response.status).toBe(401);
    }
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(await db.session.count({ where: { userId } })).toBe(0);

    now = new Date(now.getTime() + 15 * 60 * 1000 + 1);
    expect((await login()).status).toBe(200);
  });

  it('limits IP attempts across accounts and ignores spoofed forwarding headers', async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await login(app, { email: `unknown-${attempt}@example.test`, password: 'wrong' })
        .set('X-Forwarded-For', `203.0.113.${attempt}`);
      expect(response.status).toBe(401);
    }
    const response = await login().set('X-Forwarded-For', '203.0.113.200');
    expect(response.status).toBe(429);
    expect(await db.session.count({ where: { userId } })).toBe(0);
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for auth integration tests').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;

  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.organization.create({ data: { id: organizationId, slug: `auth-${organizationId}`, name: 'Auth fixture' } });
  await db.user.create({ data: {
    id: userId, email, passwordHash,
    memberships: { create: { organizationId, role: 'ADMIN' } },
  } });
});

afterAll(async () => {
  if (verified) {
    await db.session.deleteMany({ where: { userId } });
    await db.membership.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
  await verifier.end();
});
