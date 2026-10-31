import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../scripts/database-identity.mjs';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
let startupPhase = 'test database configuration';

async function start() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required for browser tests.');
  const expected = assertSafeTestDatabaseUrl(testUrl);
  const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
  try {
    startupPhase = 'test database connection';
    await verifier.connect();
    startupPhase = 'test database identity query';
    const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
    startupPhase = 'test database identity assertion';
    assertActualTestDatabase(identity.rows[0], expected);
  } finally {
    await verifier.end().catch(() => undefined);
  }

  // This process is a Playwright-only server. Force its Prisma client onto the
  // guarded disposable database even if DATABASE_URL names the developer DB.
  process.env.DATABASE_URL = testUrl;
  process.env.APP_ORIGIN = 'http://127.0.0.1:5173';
  process.env.SESSION_SECRET = 'playwright-only-secret-32-characters-minimum';
  process.env.NODE_ENV = 'test';

  startupPhase = 'API module loading';
  const [{ createApp }, { closePrismaClient }] = await Promise.all([
    import('../src/app.js'),
    import('../src/db/client.js'),
  ]);
  const app = createApp({ loginIpAttemptLimit: 100 });
  startupPhase = 'API listener startup';
  const server = app.listen(3101, '127.0.0.1');
  const stop = () => server.close(() => {
    void closePrismaClient().finally(() => process.exit(0));
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

start().catch(() => {
  console.error(`The guarded Playwright API server failed during ${startupPhase}.`);
  process.exitCode = 1;
});
