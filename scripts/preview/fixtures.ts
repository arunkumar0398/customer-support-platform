import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Client } from 'pg';
import { hashPassword } from '../../api/src/modules/auth/password.js';
import { assertVerifiedTargetClient, type VerifiedTarget } from './target.js';

export type FixtureManifest = {
  version: 1;
  runId: string;
  createdAt: string;
  target: VerifiedTarget;
  organizations: Array<{ id: string; slug: string; name: string }>;
  users: Array<{ id: string; organizationId: string; role: 'ADMIN' | 'AGENT' | 'CUSTOMER'; label: string }>;
  tickets: Array<{ id: string; organizationId: string; requesterUserId: string; ticketNumber: number; label: string }>;
};

type PrivateFilePaths = { credentialsPath: string; manifestPath: string };

const roles = ['ADMIN', 'AGENT', 'CUSTOMER', 'CUSTOMER'] as const;
const labels = ['admin', 'agent', 'customer-one', 'customer-two'] as const;
const runPattern = /^[a-z0-9][a-z0-9-]{7,47}$/;

function assertRunId(runId: string): void {
  if (!runPattern.test(runId)) throw new Error('Run ID must be 8–48 lowercase letters, digits, or hyphens.');
}

function assertOutsideRepository(candidate: string, repositoryRoot: string): void {
  const relativePath = relative(resolve(repositoryRoot), resolve(candidate));
  const isOutside = relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
  if (!isOutside) {
    throw new Error('Credentials and manifest must be written outside the repository.');
  }
}

async function createPrivateOutputFiles(outputDirectory: string, repositoryRoot: string, runId: string) {
  if (!isAbsolute(outputDirectory)) throw new Error('Output directory must be an absolute path.');
  const canonicalRepositoryRoot = await realpath(resolve(repositoryRoot));
  const resolved = await realpath(outputDirectory);
  assertOutsideRepository(resolved, canonicalRepositoryRoot);
  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error('Output path must be a directory.');
  const credentialsPath = resolve(resolved, `preview-credentials-${runId}.json`);
  const manifestPath = resolve(resolved, `preview-fixtures-${runId}.json`);
  assertOutsideRepository(credentialsPath, canonicalRepositoryRoot);
  assertOutsideRepository(manifestPath, canonicalRepositoryRoot);
  return { credentialsPath, manifestPath } satisfies PrivateFilePaths;
}

async function writeExclusive(path: string, value: string): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(value, { encoding: 'utf8' }); }
  finally { await handle.close(); }
}

function safeEmail(runId: string, organization: 'alpha' | 'beta', label: string): string {
  return `pv+${runId}-${organization}-${label}@example.test`;
}

function buildFixtureData(runId: string) {
  const ticketNumberBase = 1_500_000_000 + randomInt(100_000_000);
  const organizations = (['alpha', 'beta'] as const).map((name) => ({
    key: name,
    id: randomUUID(),
    slug: `pv-${runId}-${name}`,
    name: `Synthetic ${name.toUpperCase()} ${runId}`,
  }));
  const users = organizations.flatMap((organization) => labels.map((label, index) => ({
    id: randomUUID(),
    organizationId: organization.id,
    email: safeEmail(runId, organization.key, label),
    role: roles[index],
    label,
    password: `Pv-${randomBytes(32).toString('base64url')}`,
  })));
  const tickets = organizations.flatMap((organization, orgIndex) => {
    const customers = users.filter((user) => user.organizationId === organization.id && user.role === 'CUSTOMER');
    return customers.map((customer, index) => ({
      id: randomUUID(),
      organizationId: organization.id,
      requesterUserId: customer.id,
      assigneeUserId: users.find((user) => user.organizationId === organization.id && user.role === 'AGENT')!.id,
      assigneeOrganizationId: organization.id,
      ticketNumber: ticketNumberBase + orgIndex * 10 + index,
      title: `Preview ${runId} ${organization.key} ${customer.label} ticket`,
      description: `Synthetic acceptance fixture ${runId}; safe to modify and remove with its matching manifest.`,
    }));
  });
  return { organizations, users, tickets };
}

async function assertNoCollisions(client: Client, data: ReturnType<typeof buildFixtureData>) {
  const slugs = data.organizations.map((row) => row.slug);
  const emails = data.users.map((row) => row.email);
  const ids = [
    ...data.organizations.map((row) => row.id),
    ...data.users.map((row) => row.id),
    ...data.tickets.map((row) => row.id),
  ];
  const titles = data.tickets.map((row) => row.title);
  const collision = await client.query(
    `SELECT
       EXISTS(SELECT 1 FROM "Organization" WHERE slug = ANY($1::text[]) OR id = ANY($3::uuid[])) AS organization_collision,
       EXISTS(SELECT 1 FROM "User" WHERE email = ANY($2::text[]) OR id = ANY($3::uuid[])) AS user_collision,
       EXISTS(SELECT 1 FROM "Ticket" WHERE id = ANY($3::uuid[]) OR "ticketNumber" = ANY($4::integer[]) OR title = ANY($5::text[])) AS ticket_collision`,
    [slugs, emails, ids, data.tickets.map((row) => row.ticketNumber), titles],
  );
  if (Object.values(collision.rows[0]).some(Boolean)) throw new Error('Fixture collision detected; no objects were changed.');
}

export async function provisionFixtures(options: {
  client: Client;
  target: VerifiedTarget;
  runId: string;
  outputDirectory: string;
  repositoryRoot: string;
  beforeCommit?: () => Promise<void>;
}): Promise<{ manifest: FixtureManifest; files: PrivateFilePaths }> {
  assertRunId(options.runId);
  assertVerifiedTargetClient(options.client, options.target, true);
  const files = await createPrivateOutputFiles(options.outputDirectory, options.repositoryRoot, options.runId);
  const data = buildFixtureData(options.runId);
  const createdAt = new Date().toISOString();
  const manifest: FixtureManifest = {
    version: 1,
    runId: options.runId,
    createdAt,
    target: options.target,
    organizations: data.organizations.map(({ id, slug, name }) => ({ id, slug, name })),
    users: data.users.map(({ id, organizationId, role, label }) => ({ id, organizationId, role, label })),
    tickets: data.tickets.map(({ id, organizationId, requesterUserId, ticketNumber, title }) => ({
      id, organizationId, requesterUserId, ticketNumber, label: title,
    })),
  };
  const credentials = {
    warning: 'Synthetic one-time Preview credentials. Store privately and revoke after validation.',
    runId: options.runId,
    accounts: data.users.map(({ email, password, role, label, organizationId }) => ({
      email, password, role, label, organizationId,
    })),
  };
  let credentialsWritten = false;
  let manifestWritten = false;
  let transactionOpen = false;
  let commitStarted = false;
  let rollbackConfirmed = false;
  try {
    await writeExclusive(files.credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`);
    credentialsWritten = true;
    await writeExclusive(files.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    manifestWritten = true;
    await options.client.query('BEGIN');
    transactionOpen = true;
    await assertNoCollisions(options.client, data);
    for (const organization of data.organizations) {
      await options.client.query(
        'INSERT INTO "Organization" (id, slug, name) VALUES ($1, $2, $3)',
        [organization.id, organization.slug, organization.name],
      );
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
      await options.client.query(
        `INSERT INTO "Ticket" (id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId",
            "assigneeUserId", title, description, status, priority, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', 'MEDIUM', 1)`,
        [ticket.id, ticket.organizationId, ticket.ticketNumber, ticket.requesterUserId, ticket.assigneeOrganizationId,
          ticket.assigneeUserId, ticket.title, ticket.description],
      );
      const eventId = randomUUID();
      const actor = data.users.find((user) => user.id === ticket.requesterUserId)!;
      await options.client.query(
        `INSERT INTO "ActivityEvent" (id, "organizationId", "ticketId", "actorUserId", type, "newValue")
         VALUES ($1, $2, $3, $4, 'TICKET_CREATED', $5::jsonb)`,
        [eventId, ticket.organizationId, ticket.id, actor.id, JSON.stringify({ status: 'OPEN', version: 1 })],
      );
    }
    await options.beforeCommit?.();
    commitStarted = true;
    await options.client.query('COMMIT');
    transactionOpen = false;
    return { manifest, files };
  } catch (error) {
    if (transactionOpen) {
      try {
        await options.client.query('ROLLBACK');
        rollbackConfirmed = true;
      } catch {
        // Preserve recovery files when transaction outcome cannot be established.
      }
    }
    if (!commitStarted && (!transactionOpen || rollbackConfirmed)) {
      if (manifestWritten) await rm(files.manifestPath, { force: true });
      if (credentialsWritten) await rm(files.credentialsPath, { force: true });
    }
    throw error;
  }
}

function parseManifest(value: unknown): FixtureManifest {
  if (!value || typeof value !== 'object') throw new Error('Fixture manifest is invalid.');
  const manifest = value as FixtureManifest;
  assertRunId(manifest.runId);
  if (manifest.version !== 1 || !Array.isArray(manifest.organizations) || manifest.organizations.length !== 2
    || !Array.isArray(manifest.users) || manifest.users.length !== 8
    || !Array.isArray(manifest.tickets) || manifest.tickets.length !== 4) {
    throw new Error('Fixture manifest does not describe the expected run-owned fixture set.');
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!Number.isFinite(Date.parse(manifest.createdAt)) || !manifest.target || typeof manifest.target !== 'object') {
    throw new Error('Fixture manifest metadata is invalid.');
  }
  if (manifest.organizations.some((row) => !row || !uuidPattern.test(row.id)
    || row.slug !== `pv-${manifest.runId}-alpha` && row.slug !== `pv-${manifest.runId}-beta`
    || typeof row.name !== 'string' || !row.name.startsWith('Synthetic '))
    || !unique(manifest.organizations.map((row) => row.id))
    || new Set(manifest.organizations.map((row) => row.slug)).size !== 2) {
    throw new Error('Fixture manifest organization ownership data is invalid.');
  }
  const orgs = new Map(manifest.organizations.map((row) => [row.id, row.slug.endsWith('-alpha') ? 'alpha' : 'beta']));
  const expectedLabels = new Set(labels);
  if (manifest.users.some((row) => !row || !uuidPattern.test(row.id) || !orgs.has(row.organizationId)
    || !roles.includes(row.role) || !expectedLabels.has(row.label as typeof labels[number]))
    || !unique(manifest.users.map((row) => row.id))
    || manifest.organizations.some((org) => {
      const members = manifest.users.filter((user) => user.organizationId === org.id);
      return members.length !== 4 || roles.some((role, index) => members.filter((user) => user.role === role
        && user.label === labels[index]).length !== 1);
    })) {
    throw new Error('Fixture manifest user ownership data is invalid.');
  }
  if (manifest.tickets.some((row) => {
    const requester = manifest.users.find((user) => user.id === row.requesterUserId);
    return !row || !uuidPattern.test(row.id) || !orgs.has(row.organizationId)
      || !Number.isSafeInteger(row.ticketNumber) || typeof row.label !== 'string'
      || !requester || requester.role !== 'CUSTOMER' || requester.organizationId !== row.organizationId
      || !row.label.includes(manifest.runId);
  }) || !unique(manifest.tickets.map((row) => row.id))
    || new Set(manifest.tickets.map((row) => row.ticketNumber)).size !== 4
    || manifest.organizations.some((org) => manifest.tickets.filter((ticket) => ticket.organizationId === org.id).length !== 2)) {
    throw new Error('Fixture manifest ticket ownership data is invalid.');
  }
  return manifest;
}

export async function cleanupFixtures(options: {
  client: Client;
  target: VerifiedTarget;
  runId: string;
  manifestPath: string;
  repositoryRoot: string;
  confirm: boolean;
}): Promise<PrivateFilePaths> {
  assertRunId(options.runId);
  if (!options.confirm) throw new Error('Cleanup requires the explicit --confirm-cleanup acknowledgement.');
  assertVerifiedTargetClient(options.client, options.target, true);
  if (!isAbsolute(options.manifestPath)) throw new Error('Manifest path must be absolute.');
  const canonicalRepositoryRoot = await realpath(resolve(options.repositoryRoot));
  assertOutsideRepository(options.manifestPath, canonicalRepositoryRoot);
  const resolvedManifestPath = await realpath(options.manifestPath);
  assertOutsideRepository(resolvedManifestPath, canonicalRepositoryRoot);
  if (resolvedManifestPath.split(/[\\/]/).at(-1) !== `preview-fixtures-${options.runId}.json`) {
    throw new Error('Manifest filename does not match the requested run ID; no cleanup was performed.');
  }
  const files: PrivateFilePaths = {
    manifestPath: resolvedManifestPath,
    credentialsPath: resolve(resolve(resolvedManifestPath, '..'), `preview-credentials-${options.runId}.json`),
  };
  assertOutsideRepository(files.credentialsPath, canonicalRepositoryRoot);
  const manifest = parseManifest(JSON.parse(await readFile(resolvedManifestPath, 'utf8')));
  if (manifest.runId !== options.runId || JSON.stringify(manifest.target) !== JSON.stringify(options.target)) {
    throw new Error('Manifest run or verified database target does not match; no cleanup was performed.');
  }
  const organizationIds = manifest.organizations.map((row) => row.id);
  const userIds = manifest.users.map((row) => row.id);
  const ticketIds = manifest.tickets.map((row) => row.id);

  await options.client.query('BEGIN');
  try {
    const organizations = await options.client.query(
      'SELECT id, slug FROM "Organization" WHERE id = ANY($1::uuid[]) FOR UPDATE', [organizationIds],
    );
    const users = await options.client.query(
      'SELECT id, email FROM "User" WHERE id = ANY($1::uuid[]) FOR UPDATE', [userIds],
    );
    const memberships = await options.client.query(
      'SELECT "organizationId", "userId" FROM "Membership" WHERE "organizationId" = ANY($1::uuid[]) OR "userId" = ANY($2::uuid[]) FOR UPDATE',
      [organizationIds, userIds],
    );
    const tickets = await options.client.query(
      'SELECT id, "organizationId", "requesterUserId", "ticketNumber" FROM "Ticket" WHERE id = ANY($1::uuid[]) FOR UPDATE', [ticketIds],
    );
    const childOwners = await options.client.query(
      `SELECT c.id, c."authorUserId" AS actor_id FROM "Comment" c WHERE c."ticketId" = ANY($1::uuid[])
       UNION ALL
       SELECT a.id, a."actorUserId" AS actor_id FROM "ActivityEvent" a WHERE a."ticketId" = ANY($1::uuid[])`,
      [ticketIds],
    );
    if (organizations.rows.length === 0 && users.rows.length === 0 && memberships.rows.length === 0
      && tickets.rows.length === 0 && childOwners.rows.length === 0) {
      // Supports safe retry after a process stopped after DB commit but before deleting private files.
      await options.client.query('COMMIT');
      return files;
    }
    const expectedOrgSlugs = new Map(manifest.organizations.map((row) => [row.id, row.slug]));
    const expectedUserIds = new Set(userIds);
    const expectedTicket = new Map(manifest.tickets.map((row) => [row.id, row]));
    if (organizations.rows.length !== 2 || organizations.rows.some((row) => expectedOrgSlugs.get(row.id) !== row.slug)) {
      throw new Error('A run-owned organization is missing or its ownership marker changed; cleanup stopped.');
    }
    const expectedEmails = new Set(manifest.users.map((user) => `pv+${options.runId}-${manifest.organizations
      .find((org) => org.id === user.organizationId)!.slug.split('-').at(-1)}-${user.label}@example.test`));
    if (users.rows.length !== 8 || users.rows.some((row) => !expectedEmails.has(row.email))) {
      throw new Error('A run-owned account is missing or its ownership marker changed; cleanup stopped.');
    }
    if (memberships.rows.some((row) => !organizationIds.includes(row.organizationId) || !expectedUserIds.has(row.userId))) {
      throw new Error('Cleanup found a membership outside the exact fixture set; no objects were removed.');
    }
    if (tickets.rows.length !== 4 || tickets.rows.some((row) => {
      const expected = expectedTicket.get(row.id);
      return !expected || row.organizationId !== expected.organizationId || row.requesterUserId !== expected.requesterUserId
        || row.ticketNumber !== expected.ticketNumber;
    })) {
      throw new Error('A run-owned ticket is missing or its ownership marker changed; cleanup stopped.');
    }
    if (childOwners.rows.some((row) => !expectedUserIds.has(row.actor_id))) {
      throw new Error('Cleanup found a comment/activity actor outside the exact fixture set; no objects were removed.');
    }
    await options.client.query('DELETE FROM "Session" WHERE "userId" = ANY($1::uuid[])', [userIds]);
    await options.client.query('DELETE FROM "Comment" WHERE "ticketId" = ANY($1::uuid[])', [ticketIds]);
    await options.client.query('DELETE FROM "ActivityEvent" WHERE "ticketId" = ANY($1::uuid[])', [ticketIds]);
    await options.client.query('DELETE FROM "Ticket" WHERE id = ANY($1::uuid[])', [ticketIds]);
    await options.client.query('DELETE FROM "Membership" WHERE "organizationId" = ANY($1::uuid[]) AND "userId" = ANY($2::uuid[])', [organizationIds, userIds]);
    await options.client.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [userIds]);
    await options.client.query('DELETE FROM "Organization" WHERE id = ANY($1::uuid[])', [organizationIds]);
    await options.client.query('COMMIT');
    return files;
  } catch (error) {
    await options.client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function removeFixtureFiles(files: PrivateFilePaths): Promise<void> {
  await rm(files.credentialsPath, { force: true });
  await rm(files.manifestPath, { force: true });
}

export async function prepareOutputDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: false, mode: 0o700 });
}
