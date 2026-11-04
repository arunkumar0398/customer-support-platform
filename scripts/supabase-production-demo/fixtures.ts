import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hashPassword } from '../../api/src/modules/auth/password.js';
import { assertProvisioningClient } from './target.js';
import type { VerifiedTarget } from './profile.js';
import { createPrivateRunFiles, discardPrivateRunFiles, type PrivateRunFiles } from './private-files.js';

export type ProductionDemoManifest = {
  version: 1;
  runId: string;
  createdAt: string;
  target: VerifiedTarget;
  organizations: Array<{ id: string; slug: string; name: string }>;
  users: Array<{ id: string; organizationId: string; email: string; role: 'ADMIN' | 'AGENT' | 'CUSTOMER'; label: string }>;
  tickets: Array<{ id: string; organizationId: string; requesterUserId: string; assigneeUserId: string; ticketNumber: number; title: string }>;
  activityEvents: Array<{ id: string; ticketId: string; organizationId: string; actorUserId: string }>;
};

type Role = ProductionDemoManifest['users'][number]['role'];
type OrganizationKey = 'alpha' | 'beta';

const labels = ['admin', 'agent', 'customer-one', 'customer-two'] as const;
const roles: readonly Role[] = ['ADMIN', 'AGENT', 'CUSTOMER', 'CUSTOMER'];

function assertRunId(runId: string): void {
  if (!/^prod-demo-\d{8}-[a-f0-9]{8}$/.test(runId)) {
    throw new Error('Run ID must match prod-demo-YYYYMMDD-xxxxxxxx.');
  }
}

function buildData(runId: string) {
  const organizations = (['alpha', 'beta'] as const).map((key: OrganizationKey) => ({
    key,
    id: randomUUID(),
    slug: `${runId}-${key}`,
    name: `Synthetic ${key.toUpperCase()} ${runId}`,
  }));
  const users = organizations.flatMap((organization) => labels.map((label, index) => ({
    id: randomUUID(),
    organizationId: organization.id,
    email: `${runId}+${organization.key}-${label}@example.test`,
    role: roles[index]!,
    label,
    password: `Prod-${randomBytes(32).toString('base64url')}`,
  })));
  const ticketNumberBase = 1_500_000_000 + randomInt(100_000_000);
  const tickets = organizations.flatMap((organization, orgIndex) => {
    const customers = users.filter((user) => user.organizationId === organization.id && user.role === 'CUSTOMER');
    const agent = users.find((user) => user.organizationId === organization.id && user.role === 'AGENT')!;
    return customers.map((customer, customerIndex) => ({
      id: randomUUID(),
      organizationId: organization.id,
      requesterUserId: customer.id,
      assigneeOrganizationId: organization.id,
      assigneeUserId: agent.id,
      ticketNumber: ticketNumberBase + orgIndex * 10 + customerIndex,
      title: `Synthetic ${runId} ${organization.key} ${customer.label} demo ticket`,
      description: `Synthetic Production demo fixture ${runId}. Do not use for real customer support.`,
      status: customerIndex === 0 ? 'OPEN' : 'IN_PROGRESS',
      priority: customerIndex === 0 ? 'MEDIUM' : 'HIGH',
    }));
  });
  const events = tickets.map((ticket) => ({
    id: randomUUID(),
    ticket,
    actor: users.find((user) => user.id === ticket.requesterUserId)!,
  }));
  return { organizations, users, tickets, events };
}

async function assertNoCollisions(client: Client, data: ReturnType<typeof buildData>): Promise<void> {
  const collision = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM "Organization" WHERE slug = ANY($1::text[]) OR id = ANY($3::uuid[])) AS organizations,
      EXISTS (SELECT 1 FROM "User" WHERE email = ANY($2::text[]) OR id = ANY($3::uuid[])) AS users,
      EXISTS (SELECT 1 FROM "Ticket" WHERE id = ANY($3::uuid[]) OR "ticketNumber" = ANY($4::integer[]) OR title = ANY($5::text[])) AS tickets
  `, [
    data.organizations.map((row) => row.slug),
    data.users.map((row) => row.email),
    [...data.organizations, ...data.users, ...data.tickets].map((row) => row.id),
    data.tickets.map((row) => row.ticketNumber),
    data.tickets.map((row) => row.title),
  ]);
  if (Object.values(collision.rows[0] as Record<string, boolean>).some(Boolean)) {
    throw new Error('Synthetic run identity collision detected; no records were changed.');
  }
}

export async function provisionProductionDemo(options: {
  client: Client;
  target: VerifiedTarget;
  runId: string;
  outputDirectory: string;
  repositoryRoot: string;
  beforeCommit?: () => Promise<void>;
}): Promise<{ manifest: ProductionDemoManifest; files: PrivateRunFiles }> {
  assertRunId(options.runId);
  assertProvisioningClient(options.client, options.target, options.runId);

  const data = buildData(options.runId);
  const events = data.events.map(({ id, ticket, actor }) => ({
    id,
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorUserId: actor.id,
  }));
  const manifest: ProductionDemoManifest = {
    version: 1,
    runId: options.runId,
    createdAt: new Date().toISOString(),
    target: options.target,
    organizations: data.organizations.map(({ id, slug, name }) => ({ id, slug, name })),
    users: data.users.map(({ id, organizationId, email, role, label }) => ({ id, organizationId, email, role, label })),
    tickets: data.tickets.map(({ id, organizationId, requesterUserId, assigneeUserId, ticketNumber, title }) => ({
      id, organizationId, requesterUserId, assigneeUserId, ticketNumber, title,
    })),
    activityEvents: events,
  };
  const credentials = {
    warning: 'Persistent synthetic Production demo credentials. Deliver through the owner-approved private channel.',
    runId: options.runId,
    accounts: data.users.map(({ email, password, role, label, organizationId }) => ({
      email,
      password,
      role,
      label,
      organization: data.organizations.find((organization) => organization.id === organizationId)!.key,
      organizationId,
    })),
  };
  const files = await createPrivateRunFiles(
    options.outputDirectory, options.repositoryRoot, options.runId, credentials, manifest,
  );

  let transactionOpen = false;
  let commitAttempted = false;
  let rollbackConfirmed = false;
  try {
    await options.client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    transactionOpen = true;
    await assertNoCollisions(options.client, data);
    for (const organization of data.organizations) {
      await options.client.query('INSERT INTO "Organization" (id, slug, name) VALUES ($1, $2, $3)', [
        organization.id, organization.slug, organization.name,
      ]);
    }
    for (const user of data.users) {
      await options.client.query('INSERT INTO "User" (id, email, "passwordHash") VALUES ($1, $2, $3)', [
        user.id, user.email, await hashPassword(user.password),
      ]);
      await options.client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", role, "isActive") VALUES ($1, $2, $3, TRUE)',
        [user.organizationId, user.id, user.role],
      );
    }
    for (const ticket of data.tickets) {
      await options.client.query(`
        INSERT INTO "Ticket" (
          id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId",
          "assigneeUserId", title, description, status, priority, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)
      `, [ticket.id, ticket.organizationId, ticket.ticketNumber, ticket.requesterUserId,
        ticket.assigneeOrganizationId, ticket.assigneeUserId, ticket.title, ticket.description,
        ticket.status, ticket.priority]);
      const event = events.find((row) => row.ticketId === ticket.id)!;
      await options.client.query(`
        INSERT INTO "ActivityEvent" (id, "organizationId", "ticketId", "actorUserId", type, "newValue")
        VALUES ($1, $2, $3, $4, 'TICKET_CREATED', $5::jsonb)
      `, [event.id, event.organizationId, event.ticketId, event.actorUserId,
        JSON.stringify({ status: ticket.status, version: 1 })]);
    }
    await options.beforeCommit?.();
    commitAttempted = true;
    await options.client.query('COMMIT');
    transactionOpen = false;
    return { manifest, files };
  } catch (error) {
    if (transactionOpen) {
      try {
        await options.client.query('ROLLBACK');
        rollbackConfirmed = true;
      } catch {
        // Keep recovery files if transaction outcome cannot be established.
      }
    }
    if (!commitAttempted && (!transactionOpen || rollbackConfirmed)) {
      await discardPrivateRunFiles(files);
    }
    if (commitAttempted) {
      throw new Error(`Production demo commit outcome is uncertain for ${options.runId}; preserve recovery files and reconcile this exact run before any retry. ${error instanceof Error ? error.message : 'Unknown database error'}`);
    }
    throw error;
  }
}
