import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';
import { cleanupFixtures, provisionFixtures, removeFixtureFiles } from '../../../scripts/preview/fixtures.js';
import { connectVerifiedTarget, type VerifiedTarget } from '../../../scripts/preview/target.js';

const connectionString = process.env.TEST_DATABASE_URL;
const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const origin = 'http://localhost:5173';
const sessionSecret = 'synthetic-preview-lifecycle-test-secret-with-more-than-32-bytes';
const database = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 4 }) });
let verifier: Client;
let target: VerifiedTarget;
let outputDirectory: string;
let fixture: Awaited<ReturnType<typeof provisionFixtures>> | undefined;
let accounts: Array<{ email: string; password: string; role: string; label: string; organizationId: string }>;
let app: ReturnType<typeof createApp>;
let verified = false;
const acceptanceCreatedTicketIds: string[] = [];

type Identity = { cookie: string; csrfToken: string };

function account(label: string, organizationId: string) {
  const found = accounts.find((entry) => entry.label === label && entry.organizationId === organizationId);
  if (!found) throw new Error('Synthetic account lookup failed.');
  return found;
}

async function signIn(label: string, organizationId: string): Promise<Identity> {
  const row = account(label, organizationId);
  const response = await request(app).post('/api/auth/login').set('Origin', origin)
    .set('X-CSRF-Protection', '1').send({ email: row.email, password: row.password });
  expect(response.status).toBe(200);
  return {
    cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    csrfToken: response.body.csrfToken,
  };
}

function authenticated(method: 'get' | 'post' | 'patch', path: string, identity: Identity, organizationId: string) {
  return request(app)[method](path).set('Cookie', identity.cookie)
    .set('Origin', origin).set('X-CSRF-Token', identity.csrfToken).set('X-Organization-ID', organizationId);
}

function ticketFor(requesterUserId: string) {
  const found = fixture!.manifest.tickets.find((ticket) => ticket.requesterUserId === requesterUserId);
  if (!found) throw new Error('Synthetic ticket lookup failed.');
  return found;
}

async function snapshot(ticketId: string) {
  const ticket = await database.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  return {
    ticket: {
      organizationId: ticket.organizationId,
      requesterUserId: ticket.requesterUserId,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      assigneeUserId: ticket.assigneeUserId,
      version: ticket.version,
    },
    comments: await database.comment.count({ where: { ticketId } }),
    activity: await database.activityEvent.count({ where: { ticketId } }),
  };
}

beforeAll(async () => {
  expect(connectionString, 'TEST_DATABASE_URL must be a disposable local support_test database').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(connectionString!);
  const connected = await connectVerifiedTarget({
    connectionString: connectionString!,
    mode: 'local-test',
    expected: { endpointId: 'local', branchId: 'local', database: expected.database, username: expected.username },
    writeIntent: true,
  });
  verifier = connected.client;
  target = connected.identity;
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
  outputDirectory = await mkdtemp(resolve(tmpdir(), 'preview-acceptance-lifecycle-'));
  const runId = 'pv-local-' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  fixture = await provisionFixtures({ client: verifier, target, runId, outputDirectory, repositoryRoot });
  accounts = JSON.parse(await readFile(fixture.files.credentialsPath, 'utf8')).accounts;
  app = createApp({
    getClient: () => database,
    appOrigin: origin,
    production: false,
    sessionSecret,
  });
});

afterAll(async () => {
  if (verified && fixture) {
    try {
      for (const ticketId of acceptanceCreatedTicketIds) {
        await verifier.query('BEGIN');
        try {
          await verifier.query('DELETE FROM "Comment" WHERE "ticketId" = $1', [ticketId]);
          await verifier.query('DELETE FROM "ActivityEvent" WHERE "ticketId" = $1', [ticketId]);
          await verifier.query('DELETE FROM "Ticket" WHERE id = $1', [ticketId]);
          await verifier.query('COMMIT');
        } catch (error) {
          await verifier.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }
      await cleanupFixtures({
        client: verifier,
        target,
        runId: fixture.manifest.runId,
        manifestPath: fixture.files.manifestPath,
        repositoryRoot,
        confirm: true,
      });
      await removeFixtureFiles(fixture.files);
      const organizationIds = fixture.manifest.organizations.map((row) => row.id);
      const userIds = fixture.manifest.users.map((row) => row.id);
      const remaining = await verifier.query(
        'SELECT (SELECT count(*) FROM "Organization" WHERE id = ANY($1::uuid[]))::int AS organizations, (SELECT count(*) FROM "User" WHERE id = ANY($2::uuid[]))::int AS users, (SELECT count(*) FROM "Membership" WHERE "organizationId" = ANY($1::uuid[]) OR "userId" = ANY($2::uuid[]))::int AS memberships, (SELECT count(*) FROM "Ticket" WHERE "organizationId" = ANY($1::uuid[]))::int AS tickets, (SELECT count(*) FROM "Comment" WHERE "organizationId" = ANY($1::uuid[]))::int AS comments, (SELECT count(*) FROM "ActivityEvent" WHERE "organizationId" = ANY($1::uuid[]))::int AS activity, (SELECT count(*) FROM "Session" WHERE "userId" = ANY($2::uuid[]))::int AS sessions',
        [organizationIds, userIds],
      );
      expect(remaining.rows[0]).toEqual({ organizations: 0, users: 0, memberships: 0, tickets: 0, comments: 0, activity: 0, sessions: 0 });
      expect(await readdir(outputDirectory)).toEqual([]);
    } finally {
      await verifier.end();
      await database.$disconnect();
      if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
    }
  } else {
    await database.$disconnect();
  }
});

describe('local acceptance-shaped Preview fixture lifecycle', () => {
  it('provisions, authenticates, exercises permitted ticket and membership flows, denies unauthorized access without writes, and cleans up', async () => {
    const alpha = fixture.manifest.organizations.find((row) => row.slug.endsWith('-alpha'))!;
    const beta = fixture.manifest.organizations.find((row) => row.slug.endsWith('-beta'))!;
    const alphaCustomerOne = fixture.manifest.users.find((row) => row.organizationId === alpha.id && row.label === 'customer-one')!;
    const alphaCustomerTwo = fixture.manifest.users.find((row) => row.organizationId === alpha.id && row.label === 'customer-two')!;
    const alphaAgent = fixture.manifest.users.find((row) => row.organizationId === alpha.id && row.role === 'AGENT')!;
    const betaCustomer = fixture.manifest.users.find((row) => row.organizationId === beta.id && row.label === 'customer-one')!;
    const ownFixtureTicket = ticketFor(alphaCustomerOne.id);
    const otherCustomerTicket = ticketFor(alphaCustomerTwo.id);
    const foreignTicket = ticketFor(betaCustomer.id);
    const customer = await signIn('customer-one', alpha.id);
    const agent = await signIn('agent', alpha.id);
    const admin = await signIn('admin', alpha.id);

    const created = await authenticated('post', '/api/tickets', customer, alpha.id)
      .send({ title: 'Acceptance lifecycle ticket', description: 'Synthetic local acceptance record.' });
    expect(created.status).toBe(201);
    acceptanceCreatedTicketIds.push(created.body.id);
    const listed = await authenticated('get', '/api/tickets', customer, alpha.id);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(true);
    const opened = await authenticated('get', '/api/tickets/' + created.body.id, customer, alpha.id);
    expect(opened.status).toBe(200);
    expect(opened.body).toMatchObject({ id: created.body.id, requesterUserId: alphaCustomerOne.id, organizationId: alpha.id, version: 1 });
    const customerComment = await authenticated('post', '/api/tickets/' + created.body.id + '/comments', customer, alpha.id)
      .send({ body: 'Synthetic customer comment.' });
    expect(customerComment.status).toBe(201);
    expect(await database.comment.count({ where: { ticketId: created.body.id } })).toBe(1);
    expect(await database.activityEvent.count({ where: { ticketId: created.body.id } })).toBe(2);

    const agentUpdate = await authenticated('patch', '/api/tickets/' + ownFixtureTicket.id, agent, alpha.id)
      .set('X-Ticket-Version', '1').send({ title: 'Agent-updated acceptance fixture' });
    expect(agentUpdate.status).toBe(200);
    expect(agentUpdate.body).toMatchObject({ version: 2, title: 'Agent-updated acceptance fixture' });
    const agentComment = await authenticated('post', '/api/tickets/' + ownFixtureTicket.id + '/comments', agent, alpha.id)
      .send({ body: 'Synthetic agent comment.' });
    expect(agentComment.status).toBe(201);
    expect(await database.activityEvent.count({ where: { ticketId: ownFixtureTicket.id } })).toBe(3);

    const roleBefore = await database.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: alpha.id, userId: alphaCustomerTwo.id } },
    });
    const membershipChanged = await authenticated('patch', '/api/memberships/' + alphaCustomerTwo.id, admin, alpha.id)
      .send({ role: 'AGENT' });
    expect(membershipChanged.status).toBe(200);
    expect(membershipChanged.body.role).toBe('AGENT');
    const membershipRestored = await authenticated('patch', '/api/memberships/' + alphaCustomerTwo.id, admin, alpha.id)
      .send({ role: 'CUSTOMER' });
    expect(membershipRestored.status).toBe(200);
    expect(await database.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: alpha.id, userId: alphaCustomerTwo.id } },
    })).toMatchObject({ role: roleBefore.role, isActive: roleBefore.isActive });

    const membershipBeforeDenied = await database.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: alpha.id, userId: alphaAgent.id } },
    });
    const nonAdminMembership = await authenticated('patch', '/api/memberships/' + alphaAgent.id, agent, alpha.id)
      .send({ role: 'ADMIN' });
    expect(nonAdminMembership.status).toBe(403);
    expect(await database.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: alpha.id, userId: alphaAgent.id } },
    })).toEqual(membershipBeforeDenied);

    for (const [label, identity, ticket] of [
      ['same-tenant other customer', customer, otherCustomerTicket],
      ['cross-tenant', agent, foreignTicket],
    ] as const) {
      const before = await snapshot(ticket.id);
      const read = await authenticated('get', '/api/tickets/' + ticket.id, identity, alpha.id);
      expect(read.status, label + ' ticket read').toBe(404);
      const update = await authenticated('patch', '/api/tickets/' + ticket.id, identity, alpha.id)
        .set('X-Ticket-Version', String(before.ticket.version)).send({ title: 'Denied unauthorized update.' });
      expect(update.status, label + ' ticket update').toBe(404);
      expect(await snapshot(ticket.id), label + ' update side effects').toEqual(before);
      const assignment = await authenticated('patch', '/api/tickets/' + ticket.id + '/assignment', identity, alpha.id)
        .set('X-Ticket-Version', String(before.ticket.version)).send({ assigneeUserId: alphaAgent.id });
      expect(assignment.status, label + ' assignment').toBe(label === 'same-tenant other customer' ? 403 : 404);
      expect(await snapshot(ticket.id), label + ' assignment side effects').toEqual(before);
      const comment = await authenticated('post', '/api/tickets/' + ticket.id + '/comments', identity, alpha.id)
        .send({ body: 'Denied unauthorized comment.' });
      expect(comment.status, label + ' comment').toBe(404);
      expect(await snapshot(ticket.id), label + ' comment side effects').toEqual(before);
    }
  });
});
