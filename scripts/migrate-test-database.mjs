import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from './database-identity.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const environmentFile = resolve(repositoryRoot, '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required; refusing to run test migrations.');
const expected = assertSafeTestDatabaseUrl(testUrl);
const client = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });

try {
  await client.connect();
  const identity = await client.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
} finally {
  await client.end().catch(() => undefined);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this helper with `npm run db:migrate:test` so npm can launch the API migration command.');

const result = spawnSync(
  process.execPath,
  [npmCli, 'run', 'db:migrate', '--workspace', 'api'],
  {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL_UNPOOLED: testUrl },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
