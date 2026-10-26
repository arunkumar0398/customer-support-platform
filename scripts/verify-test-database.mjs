import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from './database-identity.mjs';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required; refusing to use an unspecified database for test setup.');
}

const expected = assertSafeTestDatabaseUrl(connectionString);
const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });

try {
  await client.connect();
  const result = await client.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(result.rows[0], expected);
  console.log('Verified disposable database identity: support_test / support_test.');
} finally {
  await client.end().catch(() => undefined);
}
