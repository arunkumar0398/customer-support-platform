import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';
import { assertProvisioningClient, authorizeProductionWrite, connectLocalTestTarget } from '../../../scripts/supabase-production-demo/target.js';
import { productionTarget } from '../../../scripts/supabase-production-demo/profile.js';
import { provisionProductionDemo, type ProductionDemoManifest } from '../../../scripts/supabase-production-demo/fixtures.js';
import { assertPrivateFileAccess, createPrivateRunFiles, discardPrivateRunFiles } from '../../../scripts/supabase-production-demo/private-files.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const envPath = resolve(repositoryRoot, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const databaseUrl = process.env.TEST_DATABASE_URL;
const temporaryRoot = join(tmpdir(), `csp-prod-demo-local-test-${process.pid}-${randomBytes(4).toString('hex')}`);
let client: Client;
let localTarget: Awaited<ReturnType<typeof connectLocalTestTarget>>['target'];
let connected = false;

function newRunId(): string {
  return `prod-demo-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}`;
}

async function countRunRows(runId: string) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM "Organization" WHERE slug LIKE $1) AS organizations,
      (SELECT count(*)::int FROM "User" WHERE email LIKE $2) AS users,
      (SELECT count(*)::int FROM "Ticket" WHERE title LIKE $3) AS tickets,
      (SELECT count(*)::int FROM "ActivityEvent" event
       JOIN "Ticket" ticket ON ticket.id = event."ticketId" WHERE ticket.title LIKE $3) AS events
  `, [`${runId}-%`, `${runId}+%@example.test`, `%${runId}%`]);
  return result.rows[0] as { organizations: number; users: number; tickets: number; events: number };
}

async function removeTestRun(manifest: ProductionDemoManifest): Promise<void> {
  const orgIds = manifest.organizations.map((row) => row.id);
  const userIds = manifest.users.map((row) => row.id);
  const ticketIds = manifest.tickets.map((row) => row.id);
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM "Session" WHERE "userId" = ANY($1::uuid[])', [userIds]);
    await client.query('DELETE FROM "Comment" WHERE "ticketId" = ANY($1::uuid[])', [ticketIds]);
    await client.query('DELETE FROM "ActivityEvent" WHERE "ticketId" = ANY($1::uuid[])', [ticketIds]);
    await client.query('DELETE FROM "Ticket" WHERE id = ANY($1::uuid[])', [ticketIds]);
    await client.query('DELETE FROM "Membership" WHERE "organizationId" = ANY($1::uuid[]) AND "userId" = ANY($2::uuid[])', [orgIds, userIds]);
    await client.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [userIds]);
    await client.query('DELETE FROM "Organization" WHERE id = ANY($1::uuid[])', [orgIds]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function outputDirectory(runId: string): Promise<string> {
  const path = join(temporaryRoot, runId);
  return path;
}

async function cleanupProvision(result: Awaited<ReturnType<typeof provisionProductionDemo>>): Promise<void> {
  await removeTestRun(result.manifest);
  await rm(result.files.directoryPath, { recursive: true, force: true });
}

describe('Supabase Production demo provisioning core on disposable local PostgreSQL', () => {
  beforeAll(async () => {
    expect(databaseUrl, 'TEST_DATABASE_URL must identify disposable support_test').toBeTruthy();
    const expected = assertSafeTestDatabaseUrl(databaseUrl!);
    const verified = await connectLocalTestTarget(databaseUrl!);
    client = verified.client;
    localTarget = verified.target;
    connected = true;
    await import('node:fs/promises').then(({ mkdir }) => mkdir(temporaryRoot, { recursive: true, mode: 0o700 }));
    const identity = await client.query('SELECT current_database() AS database, current_user AS username');
    assertActualTestDatabase(identity.rows[0], expected);
  });

  afterAll(async () => {
    if (connected) await client.end();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('creates exactly two isolated organizations, eight role accounts, four tickets and four events', async () => {
    const runId = newRunId();
    const outputDir = await outputDirectory(runId);
    let provisioned: Awaited<ReturnType<typeof provisionProductionDemo>> | undefined;
    try {
      provisioned = await provisionProductionDemo({
        client,
        target: localTarget,
        runId,
        outputDirectory: outputDir,
        repositoryRoot,
      });
      expect(await countRunRows(runId)).toEqual({ organizations: 2, users: 8, tickets: 4, events: 4 });
      expect(provisioned.manifest.organizations.map((row) => row.slug).sort()).toEqual([
        `${runId}-alpha`, `${runId}-beta`,
      ]);
      expect(provisioned.manifest.users).toHaveLength(8);
      expect(provisioned.manifest.tickets).toHaveLength(4);
      expect(provisioned.manifest.activityEvents).toHaveLength(4);

      const credentials = JSON.parse(await readFile(provisioned.files.credentialsPath, 'utf8')) as {
        accounts: Array<{ email: string; password: string; role: string; organization: string; organizationId: string; label: string }>;
      };
      expect(credentials.accounts).toHaveLength(8);
      expect(new Set(credentials.accounts.map((row) => row.password)).size).toBe(8);
      expect(credentials.accounts.every((row) => row.password.length >= 40)).toBe(true);
      expect(credentials.accounts.filter((row) => row.role === 'ADMIN')).toHaveLength(2);
      expect(credentials.accounts.filter((row) => row.role === 'AGENT')).toHaveLength(2);
      expect(credentials.accounts.filter((row) => row.role === 'CUSTOMER')).toHaveLength(4);
      expect(credentials.accounts.every((row) => row.email.endsWith('@example.test'))).toBe(true);
      expect(credentials.accounts.filter((row) => row.organization === 'alpha')).toHaveLength(4);
      expect(credentials.accounts.filter((row) => row.organization === 'beta')).toHaveLength(4);

      const hashes = await client.query(
        'SELECT email, "passwordHash" FROM "User" WHERE email LIKE $1 ORDER BY email',
        [`${runId}+%@example.test`],
      );
      expect(hashes.rows).toHaveLength(8);
      expect(hashes.rows.every((row) => typeof row.passwordHash === 'string'
        && /^\$scrypt\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(row.passwordHash))).toBe(true);
      const manifestText = await readFile(provisioned.files.manifestPath, 'utf8');
      expect(manifestText.toLowerCase()).not.toContain('password');
      expect(credentials.accounts.some((row) => manifestText.includes(row.password))).toBe(false);
      await assertPrivateFileAccess(provisioned.files.directoryPath);
      await assertPrivateFileAccess(provisioned.files.credentialsPath);
      await assertPrivateFileAccess(provisioned.files.manifestPath);
      expect(basename(provisioned.files.credentialsPath)).toBe(`production-demo-credentials-${runId}.json`);
      expect(await client.query('SELECT count(*)::int AS count FROM "Session" WHERE "userId" = ANY($1::uuid[])', [provisioned.manifest.users.map((row) => row.id)]).then((r) => r.rows[0].count)).toBe(0);
      expect(await client.query('SELECT count(*)::int AS count FROM "Comment" WHERE "ticketId" = ANY($1::uuid[])', [provisioned.manifest.tickets.map((row) => row.id)]).then((r) => r.rows[0].count)).toBe(0);

      const apiClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl!, max: 2 }) });
      const appOrigin = 'http://localhost:5173';
      const app = createApp({
        getClient: () => apiClient,
        appOrigin,
        sessionSecret: 'synthetic-production-demo-test-csrf-secret-32-chars',
        production: false,
      });
      try {
        const journeyAccounts = credentials.accounts.filter((account) =>
          account.organization === 'alpha' && ['admin', 'agent', 'customer-one'].includes(account.label));
        expect(journeyAccounts).toHaveLength(3);
        for (const credential of journeyAccounts) {
          const login = await request(app).post('/api/auth/login').set('Origin', appOrigin)
            .set('X-CSRF-Protection', '1').send({ email: credential.email, password: credential.password });
          expect(login.status).toBe(200);
          expect(login.body.memberships).toEqual([expect.objectContaining({
            organizationId: credential.organizationId,
            role: credential.role,
          })]);
          const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
          const restored = await request(app).get('/api/auth/me').set('Cookie', cookie);
          expect(restored.status).toBe(200);
          expect(restored.body.memberships[0].role).toBe(credential.role);

          const tickets = await request(app).get('/api/tickets').set('Cookie', cookie)
            .set('X-Organization-ID', credential.organizationId);
          expect(tickets.status).toBe(200);
          expect(tickets.body.total).toBe(credential.role === 'CUSTOMER' ? 1 : 2);
          expect(tickets.body.items.every((ticket: { organizationId: string }) => ticket.organizationId === credential.organizationId)).toBe(true);
          const otherOrganizationId = provisioned.manifest.organizations
            .find((organization) => organization.id !== credential.organizationId)!.id;
          const foreignTickets = await request(app).get('/api/tickets').set('Cookie', cookie)
            .set('X-Organization-ID', otherOrganizationId);
          expect(foreignTickets.status).toBe(404);
          const firstTicket = tickets.body.items[0] as { id: string; version: number; status: string };
          const detail = await request(app).get(`/api/tickets/${firstTicket.id}`).set('Cookie', cookie)
            .set('X-Organization-ID', credential.organizationId);
          expect(detail.status).toBe(200);
          expect(detail.body.id).toBe(firstTicket.id);

          if (credential.role === 'CUSTOMER') {
            const comment = await request(app).post(`/api/tickets/${firstTicket.id}/comments`)
              .set('Cookie', cookie).set('Origin', appOrigin).set('X-CSRF-Token', login.body.csrfToken)
              .set('X-Organization-ID', credential.organizationId).send({ body: `Synthetic local role journey ${runId}` });
            expect(comment.status).toBe(201);
          } else if (credential.role === 'AGENT') {
            const openTicket = tickets.body.items.find((ticket: { status: string }) => ticket.status === 'OPEN') as typeof firstTicket | undefined;
            expect(openTicket).toBeDefined();
            const update = await request(app).patch(`/api/tickets/${openTicket!.id}`)
              .set('Cookie', cookie).set('Origin', appOrigin).set('X-CSRF-Token', login.body.csrfToken)
              .set('X-Organization-ID', credential.organizationId).set('X-Ticket-Version', String(openTicket!.version))
              .send({ status: 'IN_PROGRESS' });
            expect(update.status).toBe(200);
            expect(update.body.status).toBe('IN_PROGRESS');
          }

          const dashboard = await request(app).get('/api/dashboard').set('Cookie', cookie)
            .set('X-Organization-ID', credential.organizationId);
          expect(dashboard.status).toBe(credential.role === 'CUSTOMER' ? 403 : 200);
          const roster = await request(app).get('/api/memberships').set('Cookie', cookie)
            .set('X-Organization-ID', credential.organizationId);
          expect(roster.status).toBe(credential.role === 'ADMIN' ? 200 : 403);

          const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie)
            .set('Origin', appOrigin).set('X-CSRF-Token', login.body.csrfToken);
          expect(logout.status).toBe(204);
          expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
        }
      } finally {
        await apiClient.$disconnect();
      }
    } finally {
      if (provisioned) await cleanupProvision(provisioned);
    }
    expect(await countRunRows(runId)).toEqual({ organizations: 0, users: 0, tickets: 0, events: 0 });
  }, 15000); // This one integration case hashes eight passwords and exercises real API authentication.

  it('allows only the verified local test target and rejects Production authorization on that client', () => {
    const runId = newRunId();
    expect(() => assertProvisioningClient(client, localTarget, runId)).not.toThrow();
    expect(() => assertProvisioningClient(client, {
      ...productionTarget,
      tls: 'verified',
    }, runId)).toThrow(/target verifier/i);
    expect(() => authorizeProductionWrite(client, productionTarget.projectRef, runId)).toThrow(/confirmation/i);
  });

  it('refuses duplicate persistent run IDs without changing the first run or writing another credential set', async () => {
    const runId = newRunId();
    const firstOutput = await outputDirectory(runId);
    const secondOutput = await outputDirectory(`${runId}-duplicate`);
    const first = await provisionProductionDemo({
      client, target: localTarget, runId, outputDirectory: firstOutput, repositoryRoot,
    });
    try {
      await expect(provisionProductionDemo({
        client, target: localTarget, runId, outputDirectory: secondOutput, repositoryRoot,
      })).rejects.toThrow(/run ID|collision/i);
      expect(await countRunRows(runId)).toEqual({ organizations: 2, users: 8, tickets: 4, events: 4 });
      expect(existsSync(secondOutput)).toBe(false);
    } finally {
      await cleanupProvision(first);
    }
    expect(await countRunRows(runId)).toEqual({ organizations: 0, users: 0, tickets: 0, events: 0 });
  }, 15000); // Includes one full eight-account provisioning transaction before the collision check.

  it('rolls back every fixture row and removes private files on a confirmed pre-commit failure', async () => {
    const runId = newRunId();
    const outputDir = await outputDirectory(runId);
    await expect(provisionProductionDemo({
      client,
      target: localTarget,
      runId,
      outputDirectory: outputDir,
      repositoryRoot,
      beforeCommit: async () => { throw new Error('synthetic test failure before commit'); },
    })).rejects.toThrow(/before commit/i);
    expect(await countRunRows(runId)).toEqual({ organizations: 0, users: 0, tickets: 0, events: 0 });
    expect(existsSync(outputDir)).toBe(false);
  }, 15000); // It exercises all eight scrypt hashes before an induced rollback.

  it('preserves manifest and credentials when COMMIT succeeds but its acknowledgement is lost', async () => {
    const runId = newRunId();
    const outputDir = await outputDirectory(runId);
    const originalQuery = client.query.bind(client);
    const query = async (...args: Parameters<Client['query']>) => {
      const result = await originalQuery(...args);
      if (args[0] === 'COMMIT') throw new Error('synthetic lost commit acknowledgement');
      return result;
    };
    (client as unknown as { query: typeof query }).query = query;
    let filesExist = false;
    try {
      await expect(provisionProductionDemo({
        client, target: localTarget, runId, outputDirectory: outputDir, repositoryRoot,
      })).rejects.toThrow(/uncertain|reconcile/i);
      const entries = await import('node:fs/promises').then(({ readdir }) => readdir(outputDir));
      filesExist = entries.includes(`production-demo-credentials-${runId}.json`)
        && entries.includes(`production-demo-manifest-${runId}.json`);
      expect(filesExist).toBe(true);
      expect(await countRunRows(runId)).toEqual({ organizations: 2, users: 8, tickets: 4, events: 4 });
      const manifest = JSON.parse(await readFile(join(outputDir, `production-demo-manifest-${runId}.json`), 'utf8')) as ProductionDemoManifest;
      (client as unknown as { query: Client['query'] }).query = originalQuery;
      await removeTestRun(manifest);
      await rm(outputDir, { recursive: true, force: true });
    } finally {
      (client as unknown as { query: Client['query'] }).query = originalQuery;
    }
    expect(await countRunRows(runId)).toEqual({ organizations: 0, users: 0, tickets: 0, events: 0 });
  }, 15000); // It exercises all eight scrypt hashes before the simulated lost acknowledgement.

  it('rejects output directories inside the repository and existing paths before writing', async () => {
    const runId = newRunId();
    await expect(createPrivateRunFiles(join(repositoryRoot, 'private-output-test'), repositoryRoot, runId, {}, {})).rejects.toThrow(/outside the repository/i);
    await expect(createPrivateRunFiles(join(repositoryRoot, 'scripts', 'private-output-test'), repositoryRoot, runId, {}, {})).rejects.toThrow(/outside the repository/i);
    await expect(createPrivateRunFiles(join(repositoryRoot, '..private'), repositoryRoot, runId, {}, {})).rejects.toThrow(/outside the repository/i);
    await expect(createPrivateRunFiles(join(repositoryRoot, 'scripts', '..private'), repositoryRoot, runId, {}, {})).rejects.toThrow(/outside the repository/i);
    const existing = join(temporaryRoot, 'already-exists');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(existing, { recursive: true }));
    await expect(createPrivateRunFiles(existing, repositoryRoot, runId, {}, {})).rejects.toThrow(/new|exist/i);
  });

  it('accepts an owner-private sibling destination and creates only its two files', async () => {
    const runId = newRunId();
    const parent = join(tmpdir(), `csp-private-parent-${randomBytes(4).toString('hex')}`);
    const destination = join(parent, runId);
    await mkdir(parent, { recursive: false, mode: 0o700 });
    try {
      const files = await createPrivateRunFiles(destination, repositoryRoot, runId, { accounts: [] }, { runId });
      expect(await assertPrivateFileAccess(files.directoryPath)).toBeUndefined();
      expect(await assertPrivateFileAccess(files.credentialsPath)).toBeUndefined();
      expect(await assertPrivateFileAccess(files.manifestPath)).toBeUndefined();
      await discardPrivateRunFiles(files);
      expect(existsSync(destination)).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }, 10000); // Windows ACL verification starts several native icacls processes.

  it('rejects a directory symlink or junction that redirects output into the repository', async () => {
    const runId = newRunId();
    const parent = join(tmpdir(), `csp-private-link-${randomBytes(4).toString('hex')}`);
    const link = join(parent, 'repo-link');
    await mkdir(parent, { recursive: false, mode: 0o700 });
    try {
      await symlink(repositoryRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(createPrivateRunFiles(join(link, 'credential-output'), repositoryRoot, runId, {}, {}))
        .rejects.toThrow(/outside the repository/i);
      expect(existsSync(join(repositoryRoot, 'credential-output'))).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
