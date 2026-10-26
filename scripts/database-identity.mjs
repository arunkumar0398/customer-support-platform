const TEST_DATABASE = 'support_test';
const TEST_USER = 'support_test';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertSafeTestDatabaseUrl(connectionString) {
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('Refusing test database access: expected a PostgreSQL URL.');
  }

  for (const key of target.searchParams.keys()) {
    if (key !== 'schema') {
      throw new Error(`Refusing test database access: unsupported connection option "${key}".`);
    }
  }

  const database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(target.username);
  if (database !== TEST_DATABASE || username !== TEST_USER) {
    throw new Error(`Refusing test database access: expected ${TEST_USER}@${TEST_DATABASE}.`);
  }

  if (!LOCAL_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error('Refusing test database access: only a loopback database host is allowed.');
  }

  return { database, username, host: target.hostname };
}

export function assertActualTestDatabase(row, expected) {
  if (row?.database !== expected.database || row?.username !== expected.username) {
    throw new Error('Refusing test database access: connected database identity does not match the configured test target.');
  }
}
