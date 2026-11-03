import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';
import { cleanupLocalDemoRun } from '../../scripts/production-demo/local-cleanup.js';
import {
  createLocalDemoCleanupManifest,
  provisionPersistentDemo,
  type DemoCleanupActivityEvent,
  type DemoCleanupComment,
  type DemoCleanupTicket,
  type DemoRunManifest,
} from '../../scripts/production-demo/provision.js';
import { preparePrivateRunOutput, type PersistentDemoCredentials, type PreparedPrivateRunOutput } from '../../scripts/production-demo/output.js';
import { verifyLocalTestTarget, type VerifiedLocalTestTarget } from '../../scripts/production-demo/target.js';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const origin = 'http://localhost:5173';
const sessionSecret = 'synthetic-production-demo-lifecycle-csrf-secret';
const appName = `demo-lifecycle-${randomUUID()}`;
const betaId = randomUUID();
const betaUsers = { agent: randomUUID(), customer: randomUUID() };
const betaEmail = (role: keyof typeof betaUsers) => `demo-lifecycle-beta-${betaId}.${role}@example.test`;
let target: VerifiedLocalTestTarget | undefined;
let db: PrismaClient | undefined;
let app: ReturnType<typeof createApp> | undefined;
let output: PreparedPrivateRunOutput | undefined;
let outputDirectory: string | undefined;
let runManifest: DemoRunManifest | undefined;
let credentials: PersistentDemoCredentials | undefined;
let betaCreated = false;
let betaTicketId: string | undefined;
let runCleanupConfirmed = false;
let preserveRecoveryOutput = false;
const privateDirectories: string[] = [];
const identities = new Map<string, { cookie: string; csrf: string }>();

function client(): PrismaClient {
  if (!db) throw new Error('Lifecycle Prisma client was not initialized for support_test.');
  return db;
}

function application(): ReturnType<typeof createApp> {
  if (!app) throw new Error('Lifecycle API app was not initialized.');
  return app;
}

async function createPrivateDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'production-demo-lifecycle-'));
  privateDirectories.push(directory);
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot ?? 'C:\\Windows';
    const whoami = execFileSync(resolve(root, 'System32', 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
    const sid = whoami.match(/S-1-[0-9-]+/)?.[0];
    if (!sid) throw new Error('Could not identify the lifecycle test process SID.');
    execFileSync(resolve(root, 'System32', 'icacls.exe'), [
      directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
    ], { stdio: 'ignore' });
  } else {
    await chmod(directory, 0o700);
  }
  return directory;
}

async function signIn(label: string): Promise<{ cookie: string; csrf: string }> {
  if (!credentials) throw new Error('Provisioner credentials are not available in memory.');
  const account = credentials.accounts.find((candidate) => candidate.label === label);
  if (!account) throw new Error('Provisioner role account is missing.');
  const response = await request(application()).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: account.email, password: account.password });
  expect(response.status).toBe(200);
  const identity = {
    cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    csrf: response.body.csrfToken as string,
  };
  identities.set(label, identity);
  return identity;
}

async function signInBeta(label: keyof typeof betaUsers): Promise<{ cookie: string; csrf: string }> {
  const password = `synthetic-beta-${randomUUID()}-not-a-production-secret`;
  // The account hash was prepared using the application's password hashing implementation.
  await client().user.update({ where: { id: betaUsers[label] }, data: { passwordHash: await hashPassword(password) } });
  const response = await request(application()).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: betaEmail(label), password });
  expect(response.status).toBe(200);
  return {
    cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    csrf: response.body.csrfToken as string,
  };
}

function betaCall(identity: { cookie: string; csrf: string }, method: 'get' | 'post' | 'patch', path: string) {
  let call = request(application())[method](path).set('Cookie', identity.cookie).set('X-Organization-ID', betaId);
  if (method !== 'get') call = call.set('Origin', origin).set('X-CSRF-Token', identity.csrf);
  return call;
}

async function ticketState(ticketId: string) {
  const prisma = client();
  return {
    ticket: await prisma.ticket.findUnique({ where: { id: ticketId }, select: {
      id: true, organizationId: true, requesterUserId: true, assigneeOrganizationId: true,
      assigneeUserId: true, title: true, description: true, status: true, priority: true, version: true,
    } }),
    comments: await prisma.comment.findMany({ where: { ticketId }, orderBy: { id: 'asc' }, select: {
      id: true, organizationId: true, ticketId: true, authorUserId: true, body: true, createdAt: true,
    } }),
    activity: await prisma.activityEvent.findMany({ where: { ticketId }, orderBy: { id: 'asc' }, select: {
      id: true, organizationId: true, ticketId: true, actorUserId: true, type: true,
      previousValue: true, newValue: true, reason: true, createdAt: true,
    } }),
  };
}

async function deniedNoWrite(
  ticketId: string,
  attempt: () => Promise<Response>,
  status: number,
  code: string,
): Promise<void> {
  const before = await ticketState(ticketId);
  const response = await attempt();
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);
  expect(await ticketState(ticketId)).toEqual(before);
}

async function captureRunOwnedRows(): Promise<{
  tickets: DemoCleanupTicket[];
  comments: DemoCleanupComment[];
  events: DemoCleanupActivityEvent[];
}> {
  if (!target || !runManifest) throw new Error('No verified provisioned local run to capture.');
  const organizationId = runManifest.organization.id;
  const tickets = (await target.client.query<DemoCleanupTicket>(
    'SELECT id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, "dueAt"::text AS "dueAt", version, "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt" FROM "Ticket" WHERE "organizationId" = $1 ORDER BY "ticketNumber", id',
    [organizationId],
  )).rows;
  const comments = (await target.client.query<DemoCleanupComment>(
    'SELECT id, "organizationId", "ticketId", "authorUserId", body, "createdAt"::text AS "createdAt" FROM "Comment" WHERE "organizationId" = $1 ORDER BY id',
    [organizationId],
  )).rows;
  const events = (await target.client.query<DemoCleanupActivityEvent>(
    'SELECT id, "organizationId", "ticketId", "actorUserId", type, "previousValue", "newValue", reason, "createdAt"::text AS "createdAt" FROM "ActivityEvent" WHERE "organizationId" = $1 ORDER BY id',
    [organizationId],
  )).rows;
  return { tickets, comments, events };
}

describe.skipIf(!testUrl)('production-demo provisioner acceptance-shaped local lifecycle', () => {
  it('provisions service-generated Alpha credentials, exercises normal role routes, captures denials, and cleans the exact run', async () => {
    if (!target || !db) throw new Error('Verified local test resources were not initialized.');
    const runId = `demo-${randomUUID().replaceAll('-', '')}`;
    outputDirectory = await createPrivateDirectory();
    output = await preparePrivateRunOutput(outputDirectory, repositoryRoot, runId);

    // This lifecycle test needs generated passwords only while authenticating the
    // in-process synthetic users. Keep the real output handle/brand so the
    // provisioner still validates it, but capture its credential callback in
    // memory instead of writing plaintext credentials to disk.
    let generatedCredentials: PersistentDemoCredentials | undefined;
    Object.defineProperty(output, 'writeCredentials', {
      configurable: false,
      enumerable: true,
      value: async (value: PersistentDemoCredentials) => { generatedCredentials = value; },
    });

    try {
      const provisioned = await provisionPersistentDemo(target, runId, output);
      runManifest = provisioned.manifest;
      if (!generatedCredentials) throw new Error('Provisioner did not provide in-memory credentials.');
      credentials = generatedCredentials;
      expect((await (await import('node:fs/promises')).stat(output.credentialsPath)).size).toBe(0);
      expect(credentials.runId).toBe(runId);
      expect(credentials.accounts.map(({ label, role }) => [label, role]).sort()).toEqual([
        ['admin', 'ADMIN'], ['agent', 'AGENT'], ['customer-one', 'CUSTOMER'], ['customer-two', 'CUSTOMER'],
      ].sort());

      const existing = new Set([runManifest.organization.id, ...runManifest.users.map((user) => user.id)]);
      expect(await db.organization.count({ where: { id: betaId } })).toBe(0);
      expect(await db.user.count({ where: { id: { in: Object.values(betaUsers) } } })).toBe(0);
      expect(await db.user.count({ where: { email: { in: [betaEmail('agent'), betaEmail('customer')] } } })).toBe(0);
      const betaPasswordHash = await hashPassword(`synthetic-beta-seed-${randomUUID()}-local-only`);
      const betaTicket = await db.$transaction(async (transaction) => {
        await transaction.organization.create({ data: { id: betaId, slug: `demo-lifecycle-beta-${runId}`, name: `Synthetic Beta ${runId}` } });
        await transaction.user.createMany({ data: Object.entries(betaUsers).map(([role, id]) => ({
          id, email: betaEmail(role as keyof typeof betaUsers), passwordHash: betaPasswordHash,
        })) });
        await transaction.membership.createMany({ data: [
          { organizationId: betaId, userId: betaUsers.agent, role: 'AGENT' },
          { organizationId: betaId, userId: betaUsers.customer, role: 'CUSTOMER' },
        ] });
        const ticket = await transaction.ticket.create({ data: {
          organizationId: betaId, requesterUserId: betaUsers.customer, ticketNumber: 1,
          title: 'Synthetic Beta foreign ticket', description: 'Disposable separate-tenant fixture.',
        } });
        await transaction.activityEvent.create({ data: {
          organizationId: betaId, ticketId: ticket.id, actorUserId: betaUsers.customer, type: 'TICKET_CREATED',
        } });
        return ticket;
      });
      betaCreated = true;
      betaTicketId = betaTicket.id;
      expect(existing.has(betaId)).toBe(false);

      app = createApp({ getClient: () => db!, appOrigin: origin, production: false, sessionSecret });
      const admin = await signIn('admin');
      const agent = await signIn('agent');
      const customer = await signIn('customer-one');
      await signIn('customer-two');
      const customerMe = await request(application()).get('/api/auth/me').set('Cookie', customer.cookie);
      expect(customerMe.status).toBe(200);
      expect(customerMe.body.memberships).toEqual([expect.objectContaining({ organizationId: runManifest.organization.id, role: 'CUSTOMER' })]);

      const created = await request(application()).post('/api/tickets').set('Cookie', customer.cookie).set('Origin', origin)
        .set('X-CSRF-Token', customer.csrf).set('X-Organization-ID', runManifest.organization.id)
        .send({ title: 'Customer lifecycle ticket', description: 'Created through the real app route.' });
      expect(created.status).toBe(201);
      const createdTicketId = created.body.id as string;
      const createdRequester = runManifest.users.find((user) => user.label === 'customer-one')!.id;
      expect(created.body).toMatchObject({ organizationId: runManifest.organization.id, requesterUserId: createdRequester, version: 1, status: 'OPEN' });

      const listed = await request(application()).get('/api/tickets').set('Cookie', customer.cookie).set('X-Organization-ID', runManifest.organization.id);
      expect(listed.status).toBe(200);
      expect(listed.body.items.map((ticket: { id: string }) => ticket.id)).toContain(createdTicketId);
      const detail = await request(application()).get(`/api/tickets/${createdTicketId}`).set('Cookie', customer.cookie)
        .set('X-Organization-ID', runManifest.organization.id);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({ id: createdTicketId, requesterUserId: createdRequester });
      const customerComment = await request(application()).post(`/api/tickets/${createdTicketId}/comments`).set('Cookie', customer.cookie)
        .set('Origin', origin).set('X-CSRF-Token', customer.csrf).set('X-Organization-ID', runManifest.organization.id)
        .send({ body: 'Synthetic customer lifecycle comment.' });
      expect(customerComment.status).toBe(201);
      expect(customerComment.body).toMatchObject({ ticketId: createdTicketId, authorUserId: createdRequester });
      const readComments = await request(application()).get(`/api/tickets/${createdTicketId}/comments`).set('Cookie', customer.cookie)
        .set('X-Organization-ID', runManifest.organization.id);
      expect(readComments.status).toBe(200);
      expect(readComments.body.items.map((row: { id: string }) => row.id)).toContain(customerComment.body.id);

      const agentUpdate = await request(application()).patch(`/api/tickets/${createdTicketId}`).set('Cookie', agent.cookie)
        .set('Origin', origin).set('X-CSRF-Token', agent.csrf).set('X-Organization-ID', runManifest.organization.id)
        .set('X-Ticket-Version', String(detail.body.version)).send({ title: 'Agent-updated demo ticket', priority: 'HIGH' });
      expect(agentUpdate.status).toBe(200);
      expect(agentUpdate.body).toMatchObject({ title: 'Agent-updated demo ticket', priority: 'HIGH' });
      const assigned = await request(application()).patch(`/api/tickets/${createdTicketId}/assignment`).set('Cookie', agent.cookie)
        .set('Origin', origin).set('X-CSRF-Token', agent.csrf).set('X-Organization-ID', runManifest.organization.id)
        .set('X-Ticket-Version', String(agentUpdate.body.version)).send({ assigneeUserId: runManifest.users.find((user) => user.label === 'agent')!.id });
      expect(assigned.status).toBe(200);

      const customerTwo = runManifest.users.find((user) => user.label === 'customer-two')!;
      const membershipBefore = await db.membership.findUniqueOrThrow({ where: {
        organizationId_userId: { organizationId: runManifest.organization.id, userId: customerTwo.id },
      } });
      const membershipUpdate = await request(application()).patch(`/api/memberships/${customerTwo.id}`).set('Cookie', admin.cookie)
        .set('Origin', origin).set('X-CSRF-Token', admin.csrf).set('X-Organization-ID', runManifest.organization.id)
        .send({ isActive: false });
      expect(membershipUpdate.status).toBe(200);
      const dashboard = await request(application()).get('/api/dashboard').set('Cookie', admin.cookie)
        .set('X-Organization-ID', runManifest.organization.id);
      expect(dashboard.status).toBe(200);
      expect(dashboard.body.totalTickets).toBe(3);
      expect(dashboard.text).not.toContain(betaEmail('agent'));
      const membershipRestore = await request(application()).patch(`/api/memberships/${customerTwo.id}`).set('Cookie', admin.cookie)
        .set('Origin', origin).set('X-CSRF-Token', admin.csrf).set('X-Organization-ID', runManifest.organization.id)
        .send({ isActive: membershipBefore.isActive });
      expect(membershipRestore.status).toBe(200);
      expect(await db.membership.findUniqueOrThrow({ where: {
        organizationId_userId: { organizationId: runManifest.organization.id, userId: customerTwo.id },
      } })).toMatchObject({ role: membershipBefore.role, isActive: membershipBefore.isActive });

      const secondCustomerTicketId = runManifest.tickets.find((ticket) => ticket.requesterUserId === customerTwo.id)!.id;
      const deniedSameTenantRead = await request(application()).get(`/api/tickets/${secondCustomerTicketId}`).set('Cookie', customer.cookie)
        .set('X-Organization-ID', runManifest.organization.id);
      expect(deniedSameTenantRead.status).toBe(404);
      expect(deniedSameTenantRead.body.error.code).toBe('NOT_FOUND');
      const secondCustomerTicket = await db.ticket.findUniqueOrThrow({ where: { id: secondCustomerTicketId }, select: { version: true } });
      await deniedNoWrite(secondCustomerTicketId, () => request(application()).patch(`/api/tickets/${secondCustomerTicketId}`)
        .set('Cookie', customer.cookie).set('Origin', origin).set('X-CSRF-Token', customer.csrf)
        .set('X-Organization-ID', runManifest!.organization.id).set('X-Ticket-Version', String(secondCustomerTicket.version))
        .send({ title: 'Denied other-customer edit' }), 404, 'NOT_FOUND');
      await deniedNoWrite(secondCustomerTicketId, () => request(application()).post(`/api/tickets/${secondCustomerTicketId}/comments`)
        .set('Cookie', customer.cookie).set('Origin', origin).set('X-CSRF-Token', customer.csrf)
        .set('X-Organization-ID', runManifest!.organization.id).send({ body: 'Denied other-customer comment' }), 404, 'NOT_FOUND');

      const betaTicketBefore = await db.ticket.findUniqueOrThrow({ where: { id: betaTicket.id }, select: { version: true } });
      for (const [actor, identity] of [['agent', agent], ['customer-one', customer]] as const) {
        const foreignRead = await request(application()).get(`/api/tickets/${betaTicket.id}`).set('Cookie', identity.cookie)
          .set('X-Organization-ID', runManifest.organization.id);
        expect(foreignRead.status).toBe(404);
        expect(foreignRead.body.error.code).toBe('NOT_FOUND');
        await deniedNoWrite(betaTicket.id, () => request(application()).patch(`/api/tickets/${betaTicket.id}`).set('Cookie', identity.cookie)
          .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', runManifest!.organization.id)
          .set('X-Ticket-Version', String(betaTicketBefore.version)).send({ title: `Denied foreign edit ${actor}` }), 404, 'NOT_FOUND');
        await deniedNoWrite(betaTicket.id, () => request(application()).post(`/api/tickets/${betaTicket.id}/comments`).set('Cookie', identity.cookie)
          .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', runManifest!.organization.id)
          .send({ body: `Denied foreign comment ${actor}` }), 404, 'NOT_FOUND');
      }
      await deniedNoWrite(betaTicket.id, () => request(application()).patch(`/api/tickets/${betaTicket.id}/assignment`).set('Cookie', agent.cookie)
        .set('Origin', origin).set('X-CSRF-Token', agent.csrf).set('X-Organization-ID', runManifest!.organization.id)
        .set('X-Ticket-Version', String(betaTicketBefore.version)).send({ assigneeUserId: runManifest!.users.find((user) => user.label === 'agent')!.id }), 404, 'NOT_FOUND');
      for (const [label, identity] of [['customer-one', customer], ['agent', agent]] as const) {
        const before = await db.membership.findMany({ where: { organizationId: runManifest.organization.id }, orderBy: { userId: 'asc' } });
        const denied = await request(application()).patch(`/api/memberships/${customerTwo.id}`).set('Cookie', identity.cookie)
          .set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-ID', runManifest.organization.id)
          .send({ isActive: false });
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe('FORBIDDEN');
        expect(await db.membership.findMany({ where: { organizationId: runManifest.organization.id }, orderBy: { userId: 'asc' } })).toEqual(before);
        expect(label).toBeTruthy();
      }

      const betaIdentity = await signInBeta('customer');
      const betaOwnRead = await betaCall(betaIdentity, 'get', `/api/tickets/${betaTicket.id}`);
      expect(betaOwnRead.status).toBe(200);
      expect(betaOwnRead.body.organizationId).toBe(betaId);
      const logout = await request(application()).post('/api/auth/logout').set('Cookie', customer.cookie)
        .set('Origin', origin).set('X-CSRF-Token', customer.csrf);
      expect(logout.status).toBe(204);
      expect((await request(application()).get('/api/auth/me').set('Cookie', customer.cookie)).status).toBe(401);

      // Capture current full ticket/comment/activity rows for the exact extended local cleanup manifest.
      const captured = await captureRunOwnedRows();
      const extended = createLocalDemoCleanupManifest(runManifest, captured.comments, captured.events, captured.tickets);
      expect(extended.counts).toMatchObject({ tickets: 3, comments: 1 });
      await cleanupBetaFixture();
      await cleanupLocalDemoRun(target, extended);
      runCleanupConfirmed = true;
      await assertNoRunRows();
      await output.discard();
      await rmdir(outputDirectory);
      output = undefined;
      outputDirectory = undefined;
    } catch (error) {
      if (error instanceof Error && /COMMIT outcome is uncertain|outcome are uncertain|could not be verified/i.test(error.message)) {
        preserveRecoveryOutput = true;
      }
      throw error;
    }
  }, 90_000);
});

async function assertNoRunRows(): Promise<void> {
  if (!target || !runManifest) return;
  const userIds = runManifest.users.map((user) => user.id);
  const result = await target.client.query(
    'SELECT (SELECT count(*) FROM "Organization" WHERE id = $1)::int AS organizations, (SELECT count(*) FROM "User" WHERE id = ANY($2::uuid[]))::int AS users, (SELECT count(*) FROM "Membership" WHERE "organizationId" = $1 OR "userId" = ANY($2::uuid[]))::int AS memberships, (SELECT count(*) FROM "Ticket" WHERE "organizationId" = $1)::int AS tickets, (SELECT count(*) FROM "Comment" WHERE "organizationId" = $1)::int AS comments, (SELECT count(*) FROM "ActivityEvent" WHERE "organizationId" = $1)::int AS activity, (SELECT count(*) FROM "Session" WHERE "userId" = ANY($2::uuid[]))::int AS sessions',
    [runManifest.organization.id, userIds],
  );
  expect(result.rows[0]).toEqual({ organizations: 0, users: 0, memberships: 0, tickets: 0, comments: 0, activity: 0, sessions: 0 });
}

async function cleanupBetaFixture(): Promise<void> {
  if (!target || !db || !betaCreated) return;
  if (!betaTicketId) throw new Error('Synthetic Beta ticket identity was not retained.');
  await target.client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  let committed = false;
  try {
    const organization = await target.client.query('SELECT id, slug FROM "Organization" WHERE id = $1 FOR UPDATE', [betaId]);
    expect(organization.rowCount).toBe(1);
    expect(organization.rows[0].slug).toMatch(/^demo-lifecycle-beta-demo-/);
    const userIds = Object.values(betaUsers);
    const users = await target.client.query('SELECT id, email FROM "User" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [userIds]);
    expect(users.rowCount).toBe(2);
    expect(users.rows.every((row) => userIds.includes(row.id) && [betaEmail('agent'), betaEmail('customer')].includes(row.email))).toBe(true);
    const memberships = await target.client.query('SELECT "organizationId", "userId", role FROM "Membership" WHERE "userId" = ANY($1::uuid[]) ORDER BY "userId", "organizationId" FOR UPDATE', [userIds]);
    expect(memberships.rowCount).toBe(2);
    expect(memberships.rows.every((row) => row.organizationId === betaId && userIds.includes(row.userId))).toBe(true);
    const tickets = await target.client.query('SELECT id, "organizationId", "requesterUserId", "ticketNumber" FROM "Ticket" WHERE "organizationId" = $1 ORDER BY id FOR UPDATE', [betaId]);
    expect(tickets.rowCount).toBe(1);
    expect(tickets.rows[0]).toMatchObject({ id: betaTicketId, organizationId: betaId, requesterUserId: betaUsers.customer, ticketNumber: 1 });
    const comments = await target.client.query('SELECT id, "ticketId", "authorUserId" FROM "Comment" WHERE "organizationId" = $1 ORDER BY id FOR UPDATE', [betaId]);
    expect(comments.rows.every((row) => row.ticketId === betaTicketId && userIds.includes(row.authorUserId))).toBe(true);
    const events = await target.client.query('SELECT id, "ticketId", "actorUserId" FROM "ActivityEvent" WHERE "organizationId" = $1 ORDER BY id FOR UPDATE', [betaId]);
    expect(events.rows.every((row) => row.ticketId === betaTicketId && userIds.includes(row.actorUserId))).toBe(true);
    await target.client.query('DELETE FROM "Comment" WHERE id = ANY($1::uuid[])', [comments.rows.map((row) => row.id)]);
    await target.client.query('DELETE FROM "ActivityEvent" WHERE id = ANY($1::uuid[])', [events.rows.map((row) => row.id)]);
    await target.client.query('DELETE FROM "Ticket" WHERE id = $1', [betaTicketId]);
    await target.client.query('DELETE FROM "Session" WHERE "userId" = ANY($1::uuid[])', [userIds]);
    await target.client.query('DELETE FROM "Membership" WHERE "userId" = ANY($1::uuid[])', [userIds]);
    await target.client.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [userIds]);
    await target.client.query('DELETE FROM "Organization" WHERE id = $1', [betaId]);
    committed = true;
    await target.client.query('COMMIT');
    betaCreated = false;
  } catch (error) {
    if (!committed) await target.client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
  const residual = await target.client.query(
    'SELECT (SELECT count(*) FROM "Organization" WHERE id = $1)::int AS organizations, (SELECT count(*) FROM "User" WHERE id = ANY($2::uuid[]))::int AS users, (SELECT count(*) FROM "Membership" WHERE "userId" = ANY($2::uuid[]))::int AS memberships, (SELECT count(*) FROM "Ticket" WHERE id = $3)::int AS tickets, (SELECT count(*) FROM "Comment" WHERE "organizationId" = $1)::int AS comments, (SELECT count(*) FROM "ActivityEvent" WHERE "organizationId" = $1)::int AS activity',
    [betaId, Object.values(betaUsers), betaTicketId],
  );
  expect(residual.rows[0]).toEqual({ organizations: 0, users: 0, memberships: 0, tickets: 0, comments: 0, activity: 0 });
}

beforeAll(async () => {
  if (!testUrl) return;
  const expected = assertSafeTestDatabaseUrl(testUrl);
  target = await verifyLocalTestTarget({ databaseUrl: testUrl });
  const identity = await target.client.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  expect(identity.rows[0]).toEqual({ database: 'support_test', username: 'support_test' });
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 5, application_name: appName }) });
});

afterAll(async () => {
  const errors: unknown[] = [];
  if (target && betaCreated) {
    try { await cleanupBetaFixture(); } catch (error) { errors.push(error); }
  }
  if (target && runManifest && !runCleanupConfirmed) {
    try {
      const captured = await captureRunOwnedRows();
      const extended = createLocalDemoCleanupManifest(runManifest, captured.comments, captured.events, captured.tickets);
      await cleanupLocalDemoRun(target, extended);
      runCleanupConfirmed = true;
      await assertNoRunRows();
    } catch (error) { errors.push(error); }
  }
  if (output) {
    try {
      if (runCleanupConfirmed && !preserveRecoveryOutput) {
        await output.discard();
        if (outputDirectory) await rm(outputDirectory, { recursive: false });
      } else {
        await output.close();
      }
    } catch (error) { errors.push(error); }
  }
  await db?.$disconnect().catch((error) => errors.push(error));
  await target?.client.end().catch((error) => errors.push(error));
  if (privateDirectories.length > 0 && (!output || runCleanupConfirmed)) {
    await Promise.all(privateDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))).catch((error) => errors.push(error));
  }
  if (errors.length) throw new AggregateError(errors, 'Synthetic lifecycle cleanup failed; preserve any recovery files and reconcile the disposable database.');
});
