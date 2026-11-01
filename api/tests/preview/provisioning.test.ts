import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type QueryResult } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';
import { cleanupFixtures, provisionFixtures } from '../../../scripts/preview/fixtures.js';
import { connectVerifiedTarget, parseAndValidateTargetUrl, type VerifiedTarget } from '../../../scripts/preview/target.js';
import { parseFlags, verifyTargetCommand } from '../../../scripts/preview/cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
let target: VerifiedTarget;
let client: Client;
let outputDirectory: string;
let verified = false;
let diagnosticApplicationName: string;
const createdRuns: Array<Awaited<ReturnType<typeof provisionFixtures>>> = [];
let collisionSentinelId: string | undefined;

function runId(): string { return `pv-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`; }

async function provision(id: string) {
  const result = await provisionFixtures({ client, target, runId: id, outputDirectory, repositoryRoot: repoRoot });
  createdRuns.push(result);
  return result;
}

beforeAll(async () => {
  expect(connectionString, 'TEST_DATABASE_URL must identify a disposable local support_test database').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(connectionString!);
  const connected = await connectVerifiedTarget({
    connectionString: connectionString!,
    mode: 'local-test',
    expected: { endpointId: 'local', branchId: 'local', database: expected.database, username: expected.username },
    writeIntent: true,
  });
  client = connected.client;
  target = connected.identity;
  diagnosticApplicationName = `pv-provision-${crypto.randomUUID()}`;
  await client.query("SELECT set_config('application_name', $1, false)", [diagnosticApplicationName]);
  expect((await client.query('SELECT current_setting($1) AS application_name', ['application_name'])).rows[0].application_name)
    .toBe(diagnosticApplicationName);
  const identity = await client.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
  outputDirectory = await mkdtemp(resolve(tmpdir(), 'preview-provisioner-'));
});

afterAll(async () => {
  if (verified) {
    for (const run of createdRuns) {
      try {
        await access(run.files.manifestPath);
        await cleanupFixtures({ client, target, runId: run.manifest.runId, manifestPath: run.files.manifestPath, repositoryRoot: repoRoot, confirm: true });
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      await rm(run.files.credentialsPath, { force: true });
      await rm(run.files.manifestPath, { force: true });
    }
    if (collisionSentinelId) {
      await client.query('DELETE FROM "Organization" WHERE id = $1', [collisionSentinelId]);
    }
    await client.end();
  }
  if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
});

describe('Preview fixture safety and lifecycle', () => {
  it('refuses a mismatched endpoint/database before opening a connection', () => {
    expect(() => parseAndValidateTargetUrl(
      'postgresql://support_test:unused@localhost:55439/support_test', 'preview',
      { endpointId: 'ep-unrelated-endpoint', branchId: 'br-unrelated', database: 'support_test', username: 'support_test' },
    )).toThrow(/exact expected direct Neon endpoint/);
    expect(() => parseAndValidateTargetUrl(
      'postgresql://support_test:unused@localhost:55439/other_database', 'local-test',
      { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' },
    )).toThrow(/does not match/);
    expect(() => parseAndValidateTargetUrl(
      'postgresql://support_dev:unused@localhost:55439/support_dev', 'local-test',
      { endpointId: 'local', branchId: 'local', database: 'support_dev', username: 'support_dev' },
    )).toThrow(/restricted to .*support_test\/support_test/);
  });

  it.each(['--expected-endpoint-id', '--expected-branch-id', '--expected-database', '--expected-user'])(
    'requires %s before reading a database URL or connecting', async (missing) => {
      const args = ['--mode', 'local-test', '--expected-endpoint-id', 'local', '--expected-branch-id', 'local', '--expected-database', 'support_test', '--expected-user', 'support_test'];
      const index = args.indexOf(missing);
      if (index >= 0) args.splice(index, 2);
      await expect(verifyTargetCommand(args)).rejects.toThrow(`Required argument missing: ${missing}.`);
    },
  );

  it('rejects malformed URLs, wrong database roles, target overrides, and remote local-test hosts', () => {
    expect(() => parseAndValidateTargetUrl('not a URL', 'local-test', { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' })).toThrow(/URL is invalid/);
    expect(() => parseAndValidateTargetUrl('postgresql://other:secret@localhost/support_test', 'local-test', { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' })).toThrow(/does not match/);
    expect(() => parseAndValidateTargetUrl('postgresql://support_test:secret@localhost/support_test?host=evil.example', 'local-test', { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' })).toThrow(/Unsupported database URL option/);
    expect(() => parseAndValidateTargetUrl('postgresql://support_test:secret@localhost/support_test?schema=private', 'local-test', { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' })).toThrow(/Only the public database schema/);
    expect(() => parseAndValidateTargetUrl('postgresql://support_test:secret@db.example.test/support_test', 'local-test', { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' })).toThrow(/loopback/);
  });

  it('accepts Prisma’s explicit public schema setting for local test URLs', () => {
    expect(() => parseAndValidateTargetUrl(
      'postgresql://support_test:unused@localhost:55439/support_test?schema=public', 'local-test',
      { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' },
    )).not.toThrow();
  });

  it('accepts a regional direct Neon hostname and rejects pooled endpoint hostnames', () => {
    expect(() => parseAndValidateTargetUrl(
      'postgresql://role:unused@ep-preview123.ap-southeast-1.aws.neon.tech/neondb', 'preview',
      { endpointId: 'ep-preview123', branchId: 'br-preview123', database: 'neondb', username: 'role' },
    )).not.toThrow();
    expect(() => parseAndValidateTargetUrl(
      'postgresql://role:unused@ep-preview123-pooler.ap-southeast-1.aws.neon.tech/neondb', 'preview',
      { endpointId: 'ep-preview123', branchId: 'br-preview123', database: 'neondb', username: 'role' },
    )).toThrow(/exact expected direct Neon endpoint/);
  });

  it('requires an explicit acknowledgement before any Preview write connection', async () => {
    await expect(connectVerifiedTarget({
      connectionString: 'postgresql://role:unused@ep-preview123.neon.tech/neondb',
      mode: 'preview',
      expected: { endpointId: 'ep-preview123', branchId: 'br-preview123', database: 'neondb', username: 'role' },
      writeIntent: true,
    })).rejects.toThrow(/explicit --confirm-preview-write/);
  });

  it('refuses to put credentials or manifests under the repository root', async () => {
    await expect(provisionFixtures({
      client, target, runId: runId(), outputDirectory: repoRoot, repositoryRoot: repoRoot,
    })).rejects.toThrow(/outside the repository/);
  });

  it('refuses a database client that bypassed the target verifier', async () => {
    const unverified = new Client({ connectionString: 'postgresql://support_test:unused@127.0.0.1:55439/support_test' });
    await expect(provisionFixtures({
      client: unverified, target, runId: runId(), outputDirectory, repositoryRoot: repoRoot,
    })).rejects.toThrow(/not created by the target verifier/);
    expect(await (await import('node:fs/promises')).readdir(outputDirectory)).toEqual([]);
  });

  it('refuses writes through a client verified only for read-only target inspection', async () => {
    const readOnly = await connectVerifiedTarget({
      connectionString: connectionString!,
      mode: 'local-test',
      expected: { endpointId: 'local', branchId: 'local', database: 'support_test', username: 'support_test' },
      writeIntent: false,
    });
    try {
      await expect(provisionFixtures({
        client: readOnly.client, target: readOnly.identity, runId: runId(), outputDirectory, repositoryRoot: repoRoot,
      })).rejects.toThrow(/read-only for this operation/);
      expect(await (await import('node:fs/promises')).readdir(outputDirectory)).toEqual([]);
    } finally { await readOnly.client.end(); }
  });

  it('validates the run ID before creating files or opening a write transaction', async () => {
    await expect(provisionFixtures({
      client, target, runId: '../unsafe', outputDirectory, repositoryRoot: repoRoot,
    })).rejects.toThrow(/Run ID/);
    expect(await (await import('node:fs/promises')).readdir(outputDirectory)).toEqual([]);
  });

  it('accepts only named, recognized CLI flags and rejects duplicates', () => {
    expect(parseFlags(['--mode', 'local-test', '--confirm-cleanup']).switches.has('--confirm-cleanup')).toBe(true);
    expect(() => parseFlags(['--database-url', 'postgresql://secret'])).toThrow(/Unknown argument/);
    expect(() => parseFlags(['--mode', 'local-test', '--mode', 'preview'])).toThrow(/duplicate value/i);
  });

  it('rolls back all rows and removes private outputs after an injected transaction failure', async () => {
    const id = runId();
    await expect(provisionFixtures({
      client, target, runId: id, outputDirectory, repositoryRoot: repoRoot,
      beforeCommit: async () => { throw new Error('deliberate test failure'); },
    })).rejects.toThrow('deliberate test failure');
    const rows = await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE slug LIKE $1', [`pv-${id}-%`]);
    expect(rows.rows[0].count).toBe(0);
    const names = await readdir(outputDirectory);
    expect(names.some((name) => name.includes(id))).toBe(false);
  });

  it('preserves recovery files when COMMIT succeeded but its response was lost', async () => {
    const id = runId();
    const originalQuery = client.query.bind(client);
    Object.defineProperty(client, 'query', {
      configurable: true,
      value: async (...args: Parameters<Client['query']>) => {
        const result = await originalQuery(...args) as unknown as QueryResult<Record<string, unknown>>;
        const statement = typeof args[0] === 'string' ? args[0].trim().toUpperCase() : '';
        if (statement === 'COMMIT') throw new Error('simulated lost COMMIT response');
        return result;
      },
    });
    const credentialsPath = resolve(outputDirectory, `preview-credentials-${id}.json`);
    const manifestPath = resolve(outputDirectory, `preview-fixtures-${id}.json`);
    try {
      await expect(provisionFixtures({ client, target, runId: id, outputDirectory, repositoryRoot: repoRoot }))
        .rejects.toThrow('simulated lost COMMIT response');
    } finally {
      Object.defineProperty(client, 'query', { configurable: true, value: originalQuery });
    }
    const orgs = await client.query('SELECT id FROM "Organization" WHERE slug LIKE $1', [`pv-${id}-%`]);
    expect(orgs.rows).toHaveLength(2);
    JSON.parse(await readFile(manifestPath, 'utf8'));
    const accounts = JSON.parse(await readFile(credentialsPath, 'utf8')).accounts;
    expect(accounts).toHaveLength(8);
    await cleanupFixtures({ client, target, runId: id, manifestPath, repositoryRoot: repoRoot, confirm: true });
    await rm(credentialsPath, { force: true });
    await rm(manifestPath, { force: true });
  });

  it('refuses an existing run marker without changing that object', async () => {
    const id = runId();
    const slug = `pv-${id}-alpha`;
    collisionSentinelId = crypto.randomUUID();
    await client.query('INSERT INTO "Organization" (id, slug, name) VALUES ($1, $2, $3)', [collisionSentinelId, slug, 'unrelated collision sentinel']);
    await expect(provision(id)).rejects.toThrow(/collision detected/);
    const row = await client.query('SELECT name FROM "Organization" WHERE slug = $1', [slug]);
    expect(row.rows).toEqual([{ name: 'unrelated collision sentinel' }]);
    await client.query('DELETE FROM "Organization" WHERE id = $1', [collisionSentinelId]);
    collisionSentinelId = undefined;
  });

  it('cleans only the selected run and keeps another run intact', async () => {
    const first = await provision(runId());
    const second = await provision(runId());
    const credentialsText = await readFile(first.files.credentialsPath, 'utf8');
    expect(credentialsText).not.toContain('$scrypt$');
    const manifestText = await readFile(first.files.manifestPath, 'utf8');
    expect(JSON.parse(manifestText)).not.toHaveProperty('accounts');
    expect(manifestText).not.toMatch(/password|scrypt|postgres(?:ql)?:\/\//i);
    await client.query(
      `INSERT INTO "Comment" (id, "organizationId", "ticketId", "authorUserId", body)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), first.manifest.tickets[0].organizationId, first.manifest.tickets[0].id,
        first.manifest.users.find((user) => user.id === first.manifest.tickets[0].requesterUserId)!.id, 'Synthetic cleanup test comment'],
    );
    await expect(cleanupFixtures({
      client, target, runId: first.manifest.runId, manifestPath: first.files.manifestPath,
      repositoryRoot: repoRoot, confirm: false,
    })).rejects.toThrow(/explicit --confirm-cleanup/);
    expect((await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE id = ANY($1::uuid[])',
      [first.manifest.organizations.map((row) => row.id)])).rows[0].count).toBe(2);
    await cleanupFixtures({
      client, target, runId: first.manifest.runId, manifestPath: first.files.manifestPath,
      repositoryRoot: repoRoot, confirm: true,
    });
    await cleanupFixtures({
      client, target, runId: first.manifest.runId, manifestPath: first.files.manifestPath,
      repositoryRoot: repoRoot, confirm: true,
    });
    await rm(first.files.credentialsPath, { force: true });
    await rm(first.files.manifestPath, { force: true });
    const firstOrganizations = await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE id = ANY($1::uuid[])', [first.manifest.organizations.map((row) => row.id)]);
    const secondOrganizations = await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE id = ANY($1::uuid[])', [second.manifest.organizations.map((row) => row.id)]);
    expect(firstOrganizations.rows[0].count).toBe(0);
    expect(secondOrganizations.rows[0].count).toBe(2);
    await cleanupFixtures({
      client, target, runId: second.manifest.runId, manifestPath: second.files.manifestPath,
      repositoryRoot: repoRoot, confirm: true,
    });
    await rm(second.files.credentialsPath, { force: true });
    await rm(second.files.manifestPath, { force: true });
  });

  it('refuses cleanup when a fixture organization has a foreign membership and changes no rows', async () => {
    const first = await provision(runId());
    const second = await provision(runId());
    const orgId = first.manifest.organizations[0].id;
    const foreignUserId = second.manifest.users[0].id;
    await client.query('INSERT INTO "Membership" ("organizationId", "userId", role, "isActive") VALUES ($1, $2, $3, TRUE)',
      [orgId, foreignUserId, 'AGENT']);
    const before = await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE id = ANY($1::uuid[])',
      [first.manifest.organizations.map((row) => row.id)]);
    await expect(cleanupFixtures({
      client, target, runId: first.manifest.runId, manifestPath: first.files.manifestPath, repositoryRoot: repoRoot, confirm: true,
    })).rejects.toThrow(/membership outside the exact fixture set/);
    const after = await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE id = ANY($1::uuid[])',
      [first.manifest.organizations.map((row) => row.id)]);
    expect(after.rows[0].count).toBe(before.rows[0].count);
    await client.query('DELETE FROM "Membership" WHERE "organizationId" = $1 AND "userId" = $2', [orgId, foreignUserId]);
    for (const run of [first, second]) {
      await cleanupFixtures({ client, target, runId: run.manifest.runId, manifestPath: run.files.manifestPath, repositoryRoot: repoRoot, confirm: true });
      await rm(run.files.credentialsPath, { force: true });
      await rm(run.files.manifestPath, { force: true });
    }
  });

  it('aborts cleanup before deletes if child-owner verification reports a foreign actor', async () => {
    const run = await provision(runId());
    const originalQuery = client.query.bind(client);
    Object.defineProperty(client, 'query', {
      configurable: true,
      value: async (...args: Parameters<Client['query']>) => {
        const result = await originalQuery(...args) as unknown as QueryResult<Record<string, unknown>>;
        const statement = typeof args[0] === 'string' ? args[0] : '';
        if (statement.includes('SELECT c.id, c."authorUserId" AS actor_id')) {
          return { ...result, rows: [...result.rows, { id: crypto.randomUUID(), actor_id: crypto.randomUUID() }] };
        }
        return result;
      },
    });
    try {
      await expect(cleanupFixtures({
        client, target, runId: run.manifest.runId, manifestPath: run.files.manifestPath, repositoryRoot: repoRoot, confirm: true,
      })).rejects.toThrow(/comment\/activity actor outside the exact fixture set/);
    } finally {
      Object.defineProperty(client, 'query', { configurable: true, value: originalQuery });
    }
    const rows = await client.query(
      'SELECT (SELECT count(*)::int FROM "Organization" WHERE id = ANY($1::uuid[])) AS organizations, (SELECT count(*)::int FROM "Ticket" WHERE id = ANY($2::uuid[])) AS tickets',
      [run.manifest.organizations.map((row) => row.id), run.manifest.tickets.map((row) => row.id)],
    );
    expect(rows.rows[0]).toEqual({ organizations: 2, tickets: 4 });
    await cleanupFixtures({ client, target, runId: run.manifest.runId, manifestPath: run.files.manifestPath, repositoryRoot: repoRoot, confirm: true });
    await rm(run.files.credentialsPath, { force: true });
    await rm(run.files.manifestPath, { force: true });
  });

  it('rejects duplicate or mismatched ownership data in a tampered manifest before database changes', async () => {
    const run = await provision(runId());
    const original = JSON.parse(await readFile(run.files.manifestPath, 'utf8'));
    original.users[0].organizationId = crypto.randomUUID();
    await import('node:fs/promises').then(({ writeFile }) => writeFile(run.files.manifestPath, JSON.stringify(original)));
    await expect(cleanupFixtures({
      client, target, runId: run.manifest.runId, manifestPath: run.files.manifestPath, repositoryRoot: repoRoot, confirm: true,
    })).rejects.toThrow(/user ownership data is invalid/);
    const rows = await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE id = ANY($1::uuid[])',
      [run.manifest.organizations.map((row) => row.id)]);
    expect(rows.rows[0].count).toBe(2);
    await import('node:fs/promises').then(({ writeFile }) => writeFile(run.files.manifestPath, JSON.stringify(run.manifest)));
    await cleanupFixtures({ client, target, runId: run.manifest.runId, manifestPath: run.files.manifestPath, repositoryRoot: repoRoot, confirm: true });
    await rm(run.files.credentialsPath, { force: true });
    await rm(run.files.manifestPath, { force: true });
  });
});
