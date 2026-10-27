import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testUrl, max: 2, application_name: 'health-readiness-test' }),
});
const baseOptions = { appOrigin: 'http://localhost:5173', production: false, sessionSecret: 'health-check-csrf-key-at-least-32-characters' };
let verified = false;

describe('health and readiness', () => {
  it('serves liveness without constructing or querying the database client', async () => {
    const getClient = vi.fn(() => { throw new Error('database client must not be used for liveness'); });
    const app = createApp({ ...baseOptions, getClient: getClient as unknown as () => PrismaClient });
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(getClient).not.toHaveBeenCalled();
  });

  it('reports readiness only after a real PostgreSQL query succeeds', async () => {
    const app = createApp({ ...baseOptions, getClient: () => db });
    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain('support_test');
    expect(response.text).not.toContain('postgres');
  });

  it('returns a sanitized 503 when the database readiness query fails', async () => {
    const failedClient = { $queryRaw: vi.fn().mockRejectedValue(new Error('database password and host must not leak')) };
    const app = createApp({ ...baseOptions, getClient: () => failedClient as unknown as PrismaClient });
    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
    expect(response.text).not.toContain('password');
    expect(response.text).not.toContain('host');
    expect(response.text).not.toContain('must not leak');
  });
});

beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
});

afterAll(async () => {
  if (verified) await db.$disconnect();
  await verifier.end();
});
