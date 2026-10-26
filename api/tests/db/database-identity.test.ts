import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testUrl = process.env.TEST_DATABASE_URL;
const developmentUrl = process.env.DATABASE_URL;
const client = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
let connected = false;

describe('disposable database identity', () => {
  it('rejects the development database URL before connecting', () => {
    expect(() => assertSafeTestDatabaseUrl(
      'postgresql://support_dev:example@localhost:5433/support_dev?schema=public',
    )).toThrow(/Refusing test database access/);
  });

  it('rejects non-loopback database hosts', () => {
    expect(() => assertSafeTestDatabaseUrl(
      'postgresql://support_test:example@database.example.com:5433/support_test',
    )).toThrow(/loopback/);
  });

  it('rejects URL query parameters that can override the local connection target', () => {
    expect(() => assertSafeTestDatabaseUrl(
      'postgresql://support_test:example@localhost:5433/support_test?host=database.example.com',
    )).toThrow(/unsupported connection option/);
  });

  it('connects only when PostgreSQL reports the disposable role and database', async () => {
    expect(testUrl, 'TEST_DATABASE_URL must be set to run database integration tests').toBeTruthy();
    const expected = assertSafeTestDatabaseUrl(testUrl!);
    await client.connect();
    connected = true;
    const result = await client.query('SELECT current_database() AS database, current_user AS username');

    expect(() => assertActualTestDatabase(result.rows[0], expected)).not.toThrow();
  });

  it('keeps the development database under its separate development role', async () => {
    expect(developmentUrl, 'DATABASE_URL must identify the local development database').toBeTruthy();
    const developmentClient = new Client({ connectionString: developmentUrl, connectionTimeoutMillis: 5000 });
    await developmentClient.connect();

    try {
      const result = await developmentClient.query('SELECT current_database() AS database, current_user AS username');
      expect(result.rows[0]).toEqual({ database: 'support_dev', username: 'support_dev' });
    } finally {
      await developmentClient.end();
    }
  });

  it('prevents the test role from connecting to the development database', async () => {
    const developmentTarget = new URL(testUrl!);
    developmentTarget.pathname = '/support_dev';
    const isolatedClient = new Client({ connectionString: developmentTarget.toString(), connectionTimeoutMillis: 5000 });

    await expect(isolatedClient.connect()).rejects.toMatchObject({ code: '42501' });
    await isolatedClient.end().catch(() => undefined);
  });
});

beforeAll(async () => {
  if (!testUrl) throw new Error('TEST_DATABASE_URL must be set; refusing to skip database identity integration coverage.');
});

afterAll(async () => {
  if (connected) await client.end();
});
