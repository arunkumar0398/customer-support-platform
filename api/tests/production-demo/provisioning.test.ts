import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { cleanupLocalDemoRun } from '../../scripts/production-demo/local-cleanup.js';
import { preparePrivateRunOutput, type PreparedPrivateRunOutput } from '../../scripts/production-demo/output.js';
import {
  createLocalDemoCleanupManifest,
  provisionPersistentDemo,
  verifyExistingPersistentDemo,
  type DemoCleanupActivityEvent,
  type DemoCleanupComment,
  type DemoCleanupTicket,
  type DemoRunManifest,
} from '../../scripts/production-demo/provision.js';
import { verifyLocalTestTarget, type VerifiedLocalTestTarget } from '../../scripts/production-demo/target.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
let target: VerifiedLocalTestTarget | undefined;
const testDirectories: string[] = [];

async function privateDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'production-demo-local-test-'));
  testDirectories.push(directory);
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot ?? 'C:\\Windows';
    const whoami = execFileSync(resolve(root, 'System32', 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
    const sid = whoami.match(/S-1-[0-9-]+/)?.[0];
    if (!sid) throw new Error('Could not identify the test process SID.');
    execFileSync(resolve(root, 'System32', 'icacls.exe'), [
      directory, '/inheritance:r', '/grant:r',
      `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
    ], { stdio: 'ignore' });
  } else {
    await chmod(directory, 0o700);
  }
  return directory;
}

function runId(): string {
  return `demo-${crypto.randomUUID().replaceAll('-', '')}`;
}

function localManifest(id = runId()): DemoRunManifest {
  const organizationId = crypto.randomUUID();
  const users = [
    ['admin', 'ADMIN'], ['agent', 'AGENT'], ['customer-one', 'CUSTOMER'], ['customer-two', 'CUSTOMER'],
  ] as const;
  const userRows = users.map(([label, role]) => ({
    id: crypto.randomUUID(), label, role, organizationId, email: `demo+${id}.${label}@example.test`,
  }));
  const tickets = userRows.filter((user) => user.role === 'CUSTOMER').map((user, index) => ({
    id: crypto.randomUUID(), ticketNumber: index + 1, organizationId, requesterUserId: user.id,
    title: `Synthetic demo ticket ${index + 1}`, status: 'OPEN' as const, version: 1 as const,
  }));
  return {
    version: 1,
    runId: id,
    target: { mode: 'local-test', projectId: 'local', branchId: 'local', endpointId: 'local', database: 'support_test', username: 'support_test' },
    organization: { id: organizationId, slug: `demo-${id}`, name: `Synthetic evaluator demo ${id}` },
    users: userRows,
    tickets,
    activityEvents: tickets.map((ticket) => ({
      id: crypto.randomUUID(), organizationId, ticketId: ticket.id,
      actorUserId: ticket.requesterUserId, type: 'TICKET_CREATED' as const,
    })),
    counts: { organizations: 1, users: 4, memberships: 4, tickets: 2, activityEvents: 2 },
  };
}

function capturedTickets(base: DemoRunManifest): DemoCleanupTicket[] {
  const createdAt = new Date().toISOString();
  return base.tickets.map((ticket) => ({
    ...ticket,
    assigneeOrganizationId: null,
    assigneeUserId: null,
    description: 'Synthetic evaluator demo fixture.',
    priority: 'MEDIUM' as const,
    dueAt: null,
    createdAt,
    updatedAt: createdAt,
  }));
}

it('rejects foreign and inactive memberships when verifying a persistent demo run', async () => {
  const manifest = localManifest();
  const client = new Client();
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  let includeForeignMembership = true;
  let inactiveUserId: string | undefined;
  Object.defineProperty(client, 'connect', { configurable: true, value: async () => undefined });
  Object.defineProperty(client, 'end', { configurable: true, value: async () => undefined });
  Object.defineProperty(client, 'query', {
    configurable: true,
    value: async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      if (text.includes('current_database()')) return { rowCount: 1, rows: [{ database: 'support_test', username: 'support_test' }] };
      if (text.includes('FROM "Organization"')) return { rowCount: 1, rows: [{
        id: manifest.organization.id, slug: manifest.organization.slug, name: manifest.organization.name,
      }] };
      if (text.includes('FROM "Membership"') && text.includes('ANY')) return {
        rowCount: includeForeignMembership ? 5 : 4,
        rows: [
          ...manifest.users.map((user) => ({
            userId: user.id, organizationId: user.organizationId, role: user.role,
            isActive: user.id !== inactiveUserId,
          })),
          ...(includeForeignMembership
            ? [{ userId: manifest.users[2].id, organizationId: crypto.randomUUID(), role: 'CUSTOMER', isActive: true }]
            : []),
        ].sort((a, b) => a.userId.localeCompare(b.userId) || a.organizationId.localeCompare(b.organizationId)),
      };
      if (text.includes('FROM "User"')) return {
        rowCount: 4,
        rows: [...manifest.users].sort((a, b) => a.id.localeCompare(b.id)).map((user) => ({
          id: user.id, email: user.email, role: user.role, organizationId: user.organizationId,
        })),
      };
      if (text.includes('FROM "Ticket"')) return {
        rowCount: 2,
        rows: manifest.tickets.map((ticket) => ({
          id: ticket.id, ticketNumber: ticket.ticketNumber, organizationId: ticket.organizationId,
          requesterUserId: ticket.requesterUserId, title: ticket.title, status: ticket.status, version: ticket.version,
        })),
      };
      if (text.includes('FROM "ActivityEvent"')) return {
        rowCount: 2, rows: [...manifest.activityEvents].sort((a, b) => a.id.localeCompare(b.id)),
      };
      throw new Error('Unexpected test query');
    },
  });

  const verified = await verifyLocalTestTarget({
    databaseUrl: 'postgresql://support_test:synthetic@127.0.0.1/support_test',
    clientFactory: () => client,
  });
  try {
    await expect(verifyExistingPersistentDemo(verified, manifest)).rejects.toThrow(/memberships do not match/);
    expect(queries.some(({ text, values }) => text.includes('FROM "Membership"')
      && text.includes('ANY') && JSON.stringify(values) === JSON.stringify([manifest.users.map((user) => user.id)]))).toBe(true);

    includeForeignMembership = false;
    inactiveUserId = manifest.users[2].id;
    await expect(verifyExistingPersistentDemo(verified, manifest)).rejects.toThrow(/memberships do not match/);
    expect(queries.some(({ text }) => text.includes('FROM "Membership"')
      && text.includes('ANY') && text.includes('"isActive"'))).toBe(true);
  } finally {
    await verified.client.end();
  }
});

async function preparedOutput(id = runId()): Promise<PreparedPrivateRunOutput> {
  return preparePrivateRunOutput(await privateDirectory(), repositoryRoot, id);
}

const localTests = describe.skipIf(!databaseUrl);

describe('local cleanup evidence manifest', () => {
  it('captures exact lifecycle comment and post-provision activity rows and counts in memory', () => {
    const base = localManifest();
    const ticket = base.tickets[0];
    const author = base.users.find((user) => user.label === 'customer-one')!;
    const createdAt = new Date().toISOString();
    const comment = {
      id: crypto.randomUUID(), organizationId: base.organization.id, ticketId: ticket.id,
      authorUserId: author.id, body: 'Synthetic lifecycle comment.', createdAt,
    };
    const activity = {
      id: crypto.randomUUID(), organizationId: base.organization.id, ticketId: ticket.id,
      actorUserId: author.id, type: 'COMMENT_ADDED' as const,
      previousValue: null, newValue: { commentId: comment.id } as const,
      reason: null, createdAt,
    };
    const extended = createLocalDemoCleanupManifest(base, [comment], [
      ...base.activityEvents.map((event) => ({ ...event, previousValue: null, newValue: null, reason: null, createdAt })),
      activity,
    ], capturedTickets(base));
    expect(extended.counts).toEqual({ tickets: 2, comments: 1, activityEvents: 3 });
    expect(extended.comments).toEqual([comment]);
    expect(extended.activityEvents).toContainEqual(activity);
    expect(JSON.stringify(extended)).not.toContain('password');
  });

  it('rejects foreign-owner comments and any post-provision activity list that omits baseline rows', () => {
    const base = localManifest();
    const createdAt = new Date().toISOString();
    const comment = {
      id: crypto.randomUUID(), organizationId: base.organization.id, ticketId: base.tickets[0].id,
      authorUserId: crypto.randomUUID(), body: 'Not owned by a run account.', createdAt,
    };
    const fullEvents = base.activityEvents.map((event) => ({
      ...event, previousValue: null, newValue: null, reason: null, createdAt,
    }));
    expect(() => createLocalDemoCleanupManifest(base, [comment], fullEvents, capturedTickets(base))).toThrow(/comment evidence/);
    expect(() => createLocalDemoCleanupManifest(base, [], fullEvents.slice(1), capturedTickets(base))).toThrow(/omits provisioned events/);
  });

  it('does not permit changing the provisioner-created immutable activity records', () => {
    const base = localManifest();
    const createdAt = new Date().toISOString();
    const events = base.activityEvents.map((event, index) => ({
      ...event,
      actorUserId: index === 0 ? base.users.find((user) => user.label === 'agent')!.id : event.actorUserId,
      previousValue: null, newValue: null, reason: null, createdAt,
    }));
    expect(() => createLocalDemoCleanupManifest(base, [], events, capturedTickets(base))).toThrow(/immutable activity/);
  });
});

localTests('persistent demo provisioning on verified disposable local support_test', () => {
  beforeAll(async () => {
    target = await verifyLocalTestTarget({ databaseUrl: databaseUrl! });
  }, 10_000);

  afterAll(async () => {
    await target?.client.end().catch(() => undefined);
    await Promise.all(testDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('provisions the dedicated org, role accounts, tickets and activity in one run, then removes only that local run', async () => {
    const id = runId();
    const output = await preparedOutput(id);
    try {
      const created = await provisionPersistentDemo(target!, id, output);
      expect(created.manifest).toMatchObject({
        version: 1,
        runId: id,
        target: { mode: 'local-test', database: 'support_test', username: 'support_test' },
        counts: { organizations: 1, users: 4, memberships: 4, tickets: 2, activityEvents: 2 },
      });
      expect(created.manifest.users.map((user) => [user.label, user.role]).sort()).toEqual([
        ['admin', 'ADMIN'], ['agent', 'AGENT'], ['customer-one', 'CUSTOMER'], ['customer-two', 'CUSTOMER'],
      ].sort());
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "Organization" WHERE slug = $1', [created.manifest.organization.slug])).rows[0].n).toBe(1);
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "User" WHERE id = ANY($1::uuid[])', [created.manifest.users.map((row) => row.id)])).rows[0].n).toBe(4);
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "Membership" WHERE "organizationId" = $1', [created.manifest.organization.id])).rows[0].n).toBe(4);
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "Ticket" WHERE "organizationId" = $1', [created.manifest.organization.id])).rows[0].n).toBe(2);
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "ActivityEvent" WHERE "organizationId" = $1', [created.manifest.organization.id])).rows[0].n).toBe(2);

      const credentialFile = JSON.parse(await readFile(output.credentialsPath, 'utf8')) as { accounts: Array<{ email: string; password: string }> };
      expect(credentialFile.accounts).toHaveLength(4);
      expect(credentialFile.accounts.every((account) => account.email.endsWith('@example.test') && account.password.length >= 16)).toBe(true);
      const manifestText = await readFile(output.manifestPath, 'utf8');
      expect(manifestText).not.toMatch(/password|passwordHash|\$scrypt\$|connectionString|databaseUrl/i);

      await cleanupLocalDemoRun(target!, created.manifest);
      const remaining = await target!.client.query(
        'SELECT (SELECT count(*) FROM "Organization" WHERE id = $1)::int AS organizations, (SELECT count(*) FROM "User" WHERE id = ANY($2::uuid[]))::int AS users, (SELECT count(*) FROM "Membership" WHERE "organizationId" = $1 OR "userId" = ANY($2::uuid[]))::int AS memberships, (SELECT count(*) FROM "Ticket" WHERE "organizationId" = $1)::int AS tickets, (SELECT count(*) FROM "Comment" WHERE "organizationId" = $1)::int AS comments, (SELECT count(*) FROM "ActivityEvent" WHERE "organizationId" = $1)::int AS activity, (SELECT count(*) FROM "Session" WHERE "userId" = ANY($2::uuid[]))::int AS sessions',
        [created.manifest.organization.id, created.manifest.users.map((row) => row.id)],
      );
      expect(remaining.rows[0]).toEqual({ organizations: 0, users: 0, memberships: 0, tickets: 0, comments: 0, activity: 0, sessions: 0 });
      expect(await readdir(output.directory)).toEqual([
        'production-demo-credentials-' + id + '.json', 'production-demo-manifest-' + id + '.json',
      ].sort());
    } finally {
      await output.close();
    }
  }, 60_000);

  it('requires an exact captured comment/activity manifest and refuses later unlisted children', async () => {
    const id = runId();
    const output = await preparedOutput(id);
    try {
      const created = await provisionPersistentDemo(target!, id, output);
      const ticket = created.manifest.tickets[0];
      const author = created.manifest.users.find((user) => user.label === 'customer-one')!;
      await target!.client.query(
        'INSERT INTO "Comment" (id, "organizationId", "ticketId", "authorUserId", body, "createdAt") VALUES ($1, $2, $3, $4, $5, now())',
        [crypto.randomUUID(), ticket.organizationId, ticket.id, author.id, 'Synthetic local lifecycle comment.'],
      );
      await target!.client.query(
        'INSERT INTO "ActivityEvent" (id, "organizationId", "ticketId", "actorUserId", type, "previousValue", "newValue", reason, "createdAt") VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL, now())',
        [crypto.randomUUID(), ticket.organizationId, ticket.id, author.id, 'COMMENT_ADDED', { comment: 'created' }],
      );
      const commentsBefore = (await target!.client.query<DemoCleanupComment>(
        'SELECT id, "organizationId", "ticketId", "authorUserId", body, "createdAt"::text AS "createdAt" FROM "Comment" WHERE "organizationId" = $1 ORDER BY id',
        [created.manifest.organization.id],
      )).rows;
      const activitiesBefore = (await target!.client.query<DemoCleanupActivityEvent>(
        'SELECT id, "organizationId", "ticketId", "actorUserId", type, "previousValue", "newValue", reason, "createdAt"::text AS "createdAt" FROM "ActivityEvent" WHERE "organizationId" = $1 ORDER BY id',
        [created.manifest.organization.id],
      )).rows;
      const ticketsBefore = (await target!.client.query<DemoCleanupTicket>(
        'SELECT id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, "dueAt"::text AS "dueAt", version, "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt" FROM "Ticket" WHERE "organizationId" = $1 ORDER BY "ticketNumber"',
        [created.manifest.organization.id],
      )).rows;
      const captured = createLocalDemoCleanupManifest(created.manifest, commentsBefore, activitiesBefore, ticketsBefore);
      expect(captured.counts).toEqual({ tickets: 2, comments: 1, activityEvents: 3 });

      await target!.client.query(
        'INSERT INTO "Comment" (id, "organizationId", "ticketId", "authorUserId", body, "createdAt") VALUES ($1, $2, $3, $4, $5, now())',
        [crypto.randomUUID(), ticket.organizationId, ticket.id, author.id, 'Unlisted synthetic child.'],
      );
      await expect(cleanupLocalDemoRun(target!, captured)).rejects.toThrow(/comments do not exactly match/);
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "Organization" WHERE id = $1', [created.manifest.organization.id])).rows[0].n).toBe(1);

      const commentsFinal = (await target!.client.query<DemoCleanupComment>(
        'SELECT id, "organizationId", "ticketId", "authorUserId", body, "createdAt"::text AS "createdAt" FROM "Comment" WHERE "organizationId" = $1 ORDER BY id',
        [created.manifest.organization.id],
      )).rows;
      const ticketsFinal = (await target!.client.query<DemoCleanupTicket>(
        'SELECT id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, "dueAt"::text AS "dueAt", version, "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt" FROM "Ticket" WHERE "organizationId" = $1 ORDER BY "ticketNumber"',
        [created.manifest.organization.id],
      )).rows;
      const reconciled = createLocalDemoCleanupManifest(created.manifest, commentsFinal, activitiesBefore, ticketsFinal);
      await cleanupLocalDemoRun(target!, reconciled);
      const residual = await target!.client.query(
        'SELECT (SELECT count(*) FROM "Organization" WHERE id = $1)::int AS organizations, (SELECT count(*) FROM "Comment" WHERE "organizationId" = $1)::int AS comments, (SELECT count(*) FROM "ActivityEvent" WHERE "organizationId" = $1)::int AS activity',
        [created.manifest.organization.id],
      );
      expect(residual.rows[0]).toEqual({ organizations: 0, comments: 0, activity: 0 });
    } finally {
      await output.close();
    }
  }, 60_000);

  it('cleans an explicitly captured customer-created third ticket and refuses an unlisted extra ticket', async () => {
    const id = runId();
    const output = await preparedOutput(id);
    try {
      const created = await provisionPersistentDemo(target!, id, output);
      const customer = created.manifest.users.find((user) => user.label === 'customer-one')!;
      const thirdTicketId = crypto.randomUUID();
      const thirdEventId = crypto.randomUUID();
      await target!.client.query(
        'INSERT INTO "Ticket" (id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, "dueAt", version, "createdAt", "updatedAt") VALUES ($1, $2, 3, $3, NULL, NULL, $4, $5, $6, $7, NULL, 1, now(), now())',
        [thirdTicketId, created.manifest.organization.id, customer.id, 'Customer-created synthetic ticket', 'Lifecycle fixture.', 'OPEN', 'MEDIUM'],
      );
      await target!.client.query(
        'INSERT INTO "ActivityEvent" (id, "organizationId", "ticketId", "actorUserId", type, "previousValue", "newValue", reason, "createdAt") VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, now())',
        [thirdEventId, created.manifest.organization.id, thirdTicketId, customer.id, 'TICKET_CREATED'],
      );

      const readTicketRows = async () => (await target!.client.query<DemoCleanupTicket>(
        'SELECT id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, "dueAt"::text AS "dueAt", version, "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt" FROM "Ticket" WHERE "organizationId" = $1 ORDER BY "ticketNumber"',
        [created.manifest.organization.id],
      )).rows;
      const readActivityRows = async () => (await target!.client.query<DemoCleanupActivityEvent>(
        'SELECT id, "organizationId", "ticketId", "actorUserId", type, "previousValue", "newValue", reason, "createdAt"::text AS "createdAt" FROM "ActivityEvent" WHERE "organizationId" = $1 ORDER BY id',
        [created.manifest.organization.id],
      )).rows;
      const captured = createLocalDemoCleanupManifest(
        created.manifest, [], await readActivityRows(), await readTicketRows(),
      );
      expect(captured.counts.tickets).toBe(3);
      expect(captured.tickets.map((ticket) => ticket.id)).toContain(thirdTicketId);

      const extraTicketId = crypto.randomUUID();
      await target!.client.query(
        'INSERT INTO "Ticket" (id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, "dueAt", version, "createdAt", "updatedAt") VALUES ($1, $2, 4, $3, NULL, NULL, $4, $5, $6, $7, NULL, 1, now(), now())',
        [extraTicketId, created.manifest.organization.id, customer.id, 'Unlisted synthetic ticket', 'Must not be removed implicitly.', 'OPEN', 'MEDIUM'],
      );
      await expect(cleanupLocalDemoRun(target!, captured)).rejects.toThrow(/tickets ownership\/count mismatch/);
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "Ticket" WHERE "organizationId" = $1', [created.manifest.organization.id])).rows[0].n).toBe(4);

      const removed = await target!.client.query('DELETE FROM "Ticket" WHERE id = $1 RETURNING id', [extraTicketId]);
      expect(removed.rowCount).toBe(1);
      await cleanupLocalDemoRun(target!, captured);
      const residual = await target!.client.query(
        'SELECT (SELECT count(*) FROM "Organization" WHERE id = $1)::int AS organizations, (SELECT count(*) FROM "Ticket" WHERE "organizationId" = $1)::int AS tickets, (SELECT count(*) FROM "ActivityEvent" WHERE "organizationId" = $1)::int AS activity',
        [created.manifest.organization.id],
      );
      expect(residual.rows[0]).toEqual({ organizations: 0, tickets: 0, activity: 0 });
    } finally {
      await output.close();
    }
  }, 60_000);

  it('rejects a duplicate run ID without rotating passwords or changing persisted rows', async () => {
    const id = runId();
    const firstOutput = await preparedOutput(id);
    const secondOutput = await preparedOutput(id);
    try {
      const first = await provisionPersistentDemo(target!, id, firstOutput);
      const before = await verifyExistingPersistentDemo(target!, first.manifest);
      await expect(provisionPersistentDemo(target!, id, secondOutput)).rejects.toThrow(/already exists|collision/);
      expect(await readFile(secondOutput.credentialsPath, 'utf8')).toBe('');
      expect(await readFile(secondOutput.manifestPath, 'utf8')).toBe('');
      expect(await verifyExistingPersistentDemo(target!, first.manifest)).toEqual(before);
      await cleanupLocalDemoRun(target!, first.manifest);
    } finally {
      await firstOutput.close();
      await secondOutput.close();
    }
  }, 60_000);

  it('rejects a run account that has an additional membership in another organization', async () => {
    const id = runId();
    const output = await preparedOutput(id);
    let foreignOrganizationId: string | undefined;
    let createdManifest: DemoRunManifest | undefined;
    try {
      const created = await provisionPersistentDemo(target!, id, output);
      createdManifest = created.manifest;
      foreignOrganizationId = crypto.randomUUID();
      await target!.client.query(
        'INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
        [foreignOrganizationId, `foreign-${id}`, `Synthetic unrelated ${id}`],
      );
      const customer = created.manifest.users.find((user) => user.label === 'customer-one')!;
      await target!.client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", role, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, now(), now())',
        [foreignOrganizationId, customer.id, 'CUSTOMER'],
      );

      await expect(verifyExistingPersistentDemo(target!, created.manifest)).rejects.toThrow(/memberships do not match/);
    } finally {
      if (foreignOrganizationId && createdManifest) {
        await target!.client.query('DELETE FROM "Membership" WHERE "organizationId" = $1', [foreignOrganizationId]);
        await target!.client.query('DELETE FROM "Organization" WHERE id = $1', [foreignOrganizationId]);
        await cleanupLocalDemoRun(target!, createdManifest);
      }
      await output.close();
    }
  }, 60_000);

  it('rolls back inserted rows after an injected transaction failure and removes misleading private output', async () => {
    const id = runId();
    const output = await preparedOutput(id);
    const client = target!.client;
    const originalQuery = client.query.bind(client);
    let injected = false;
    Object.defineProperty(client, 'query', {
      configurable: true,
      value: ((text: string, values?: unknown[]) => {
        if (!injected && text.includes('INSERT INTO "ActivityEvent"')) {
          injected = true;
          throw new Error('injected local test failure');
        }
        return originalQuery(text, values as never);
      }) as typeof client.query,
    });
    try {
      await expect(provisionPersistentDemo(target!, id, output)).rejects.toThrow(/rolled back/);
      expect(injected).toBe(true);
      expect((await client.query('SELECT count(*)::int AS n FROM "Organization" WHERE slug = $1', [`demo-${id}`])).rows[0].n).toBe(0);
      expect((await client.query('SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1', [`demo+${id}.%@example.test`])).rows[0].n).toBe(0);
      expect(await readdir(output.directory)).toEqual([]);
    } finally {
      Object.defineProperty(client, 'query', { configurable: true, value: originalQuery });
      await output.close();
    }
  }, 60_000);

  it('retains recovery files and verifies rows read-only when COMMIT succeeded but its response was lost', async () => {
    const id = runId();
    const output = await preparedOutput(id);
    const client = target!.client;
    const originalQuery = client.query.bind(client);
    let commitApplied = false;
    Object.defineProperty(client, 'query', {
      configurable: true,
      value: (async (text: string, values?: unknown[]) => {
        if (text === 'COMMIT' && !commitApplied) {
          await originalQuery(text, values as never);
          commitApplied = true;
          throw new Error('simulated lost COMMIT response');
        }
        return originalQuery(text, values as never);
      }) as typeof client.query,
    });
    try {
      await expect(provisionPersistentDemo(target!, id, output)).rejects.toThrow(/outcome is uncertain/);
      expect(commitApplied).toBe(true);
      const manifest = JSON.parse(await readFile(output.manifestPath, 'utf8')) as DemoRunManifest;
      const verified = await verifyExistingPersistentDemo(target!, manifest);
      expect(verified.runId).toBe(id);
      expect(await readdir(output.directory)).toHaveLength(2);
      await cleanupLocalDemoRun(target!, manifest);
    } finally {
      Object.defineProperty(client, 'query', { configurable: true, value: originalQuery });
      await output.close();
    }
  }, 60_000);

  it('refuses tampered ownership data before cleanup deletes anything', async () => {
    const id = runId();
    const output = await preparedOutput(id);
    try {
      const created = await provisionPersistentDemo(target!, id, output);
      const changed = {
        ...created.manifest,
        users: created.manifest.users.map((user, index) => index === 0
          ? { ...user, organizationId: crypto.randomUUID() }
          : user),
      };
      await expect(cleanupLocalDemoRun(target!, changed)).rejects.toThrow(/manifest|ownership/);
      expect((await target!.client.query('SELECT count(*)::int AS n FROM "Organization" WHERE id = $1', [created.manifest.organization.id])).rows[0].n).toBe(1);
      await cleanupLocalDemoRun(target!, created.manifest);
    } finally {
      await output.close();
    }
  }, 60_000);

});

it('rejects a Production-shaped cleanup target before any query or delete', async () => {
  const fake = { mode: 'production', identity: {}, client: { query: () => { throw new Error('must not query'); } } } as unknown as VerifiedLocalTestTarget;
  await expect(cleanupLocalDemoRun(fake, {} as DemoRunManifest)).rejects.toThrow(/not been verified/);
});
