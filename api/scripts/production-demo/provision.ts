import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/modules/auth/password.js';
import {
  assertVerifiedLocalTestTarget,
  assertVerifiedProductionTarget,
  type VerifiedLocalTestTarget,
  type VerifiedProductionTarget,
} from './target.js';
import {
  assertPreparedPrivateRunOutput,
  assertProductionDemoRunId,
  type PreparedPrivateRunOutput,
  type PersistentDemoCredentialAccount,
  type SafeJsonValue,
} from './output.js';

export type DemoProvisioningTarget = VerifiedProductionTarget | VerifiedLocalTestTarget;
export type DemoRole = 'ADMIN' | 'AGENT' | 'CUSTOMER';
export type DemoLabel = 'admin' | 'agent' | 'customer-one' | 'customer-two';

export interface DemoRunManifest {
  readonly version: 1;
  readonly runId: string;
  readonly target: {
    readonly mode: 'production' | 'local-test';
    readonly projectId: string;
    readonly branchId: string;
    readonly endpointId: string;
    readonly database: string;
    readonly username: string;
  };
  readonly organization: { readonly id: string; readonly slug: string; readonly name: string };
  readonly users: readonly {
    readonly id: string;
    readonly label: DemoLabel;
    readonly email: string;
    readonly role: DemoRole;
    readonly organizationId: string;
  }[];
  readonly tickets: readonly {
    readonly id: string;
    readonly ticketNumber: number;
    readonly organizationId: string;
    readonly requesterUserId: string;
    readonly title: string;
    readonly status: 'OPEN';
    readonly version: 1;
  }[];
  readonly activityEvents: readonly {
    readonly id: string;
    readonly organizationId: string;
    readonly ticketId: string;
    readonly actorUserId: string;
    readonly type: 'TICKET_CREATED';
  }[];
  readonly counts: {
    readonly organizations: 1;
    readonly users: 4;
    readonly memberships: 4;
    readonly tickets: 2;
    readonly activityEvents: 2;
  };
}

export interface DemoCleanupComment {
  readonly id: string;
  readonly organizationId: string;
  readonly ticketId: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface DemoCleanupTicket {
  readonly id: string;
  readonly organizationId: string;
  readonly ticketNumber: number;
  readonly requesterUserId: string;
  readonly assigneeOrganizationId: string | null;
  readonly assigneeUserId: string | null;
  readonly title: string;
  readonly description: string;
  readonly status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  readonly dueAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type DemoCleanupActivityType =
  | 'TICKET_CREATED' | 'TITLE_CHANGED' | 'DESCRIPTION_CHANGED' | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED' | 'ASSIGNMENT_CHANGED' | 'COMMENT_ADDED';

export interface DemoCleanupActivityEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly ticketId: string;
  readonly actorUserId: string;
  readonly type: DemoCleanupActivityType;
  readonly previousValue: SafeJsonValue | null;
  readonly newValue: SafeJsonValue | null;
  readonly reason: string | null;
  readonly createdAt: string;
}

/** In-memory only: this is not written to the persistent credential/manifest files. */
export interface LocalDemoCleanupManifest {
  readonly base: DemoRunManifest;
  /** Full current rows for both provisioned tickets and any explicitly reconciled local lifecycle tickets. */
  readonly tickets: readonly DemoCleanupTicket[];
  readonly comments: readonly DemoCleanupComment[];
  readonly activityEvents: readonly DemoCleanupActivityEvent[];
  readonly counts: { readonly tickets: number; readonly comments: number; readonly activityEvents: number };
}

export interface ProvisionPersistentDemoResult {
  readonly manifest: DemoRunManifest;
  readonly created: true;
}

const ACCOUNT_ROLES: readonly { label: DemoLabel; role: DemoRole }[] = [
  { label: 'admin', role: 'ADMIN' },
  { label: 'agent', role: 'AGENT' },
  { label: 'customer-one', role: 'CUSTOMER' },
  { label: 'customer-two', role: 'CUSTOMER' },
];

function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    && /^[A-Z0-9_]{1,32}$/.test(error.code)) return error.code;
  return 'UNKNOWN';
}

function makeCredentials(runId: string): PersistentDemoCredentialAccount[] {
  const accounts: PersistentDemoCredentialAccount[] = [];
  // Hashing happens asynchronously in the caller; keep generated secrets out of diagnostics.
  for (const account of ACCOUNT_ROLES) {
    accounts.push({
      ...account,
      email: `demo+${runId}.${account.label}@example.test`,
      password: randomBytes(32).toString('base64url'),
    });
  }
  return accounts;
}

function runIdentity(target: DemoProvisioningTarget): DemoRunManifest['target'] {
  return {
    mode: target.mode,
    projectId: target.identity.projectId,
    branchId: target.identity.branchId,
    endpointId: target.identity.endpointId,
    database: target.identity.database,
    username: target.identity.username,
  };
}

function validateTarget(target: DemoProvisioningTarget): void {
  if (target?.mode === 'production') assertVerifiedProductionTarget(target);
  else if (target?.mode === 'local-test') assertVerifiedLocalTestTarget(target);
  else throw new Error('Provisioning requires a verified target.');
}

async function assertConnectedIdentity(target: DemoProvisioningTarget): Promise<void> {
  const result = await target.client.query<{ database: string; username: string }>(
    'SELECT current_database() AS database, current_user AS username',
  );
  if (result.rows[0]?.database !== target.identity.database || result.rows[0]?.username !== target.identity.username) {
    throw new Error('Connected database identity changed after target verification.');
  }
}

function buildManifest(runId: string, target: DemoProvisioningTarget, credentials: readonly PersistentDemoCredentialAccount[]): DemoRunManifest {
  const organizationId = randomUUID();
  const slug = `demo-${runId}`;
  const users = ACCOUNT_ROLES.map(({ label, role }) => ({
    id: randomUUID(), label, email: credentials.find((account) => account.label === label)!.email,
    role, organizationId,
  }));
  const customers = users.filter((user) => user.role === 'CUSTOMER');
  const tickets = customers.map((customer, index) => ({
    id: randomUUID(), ticketNumber: index + 1, organizationId, requesterUserId: customer.id,
    title: `Synthetic demo ticket ${index + 1}`, status: 'OPEN' as const, version: 1 as const,
  }));
  const activityEvents = tickets.map((ticket) => ({
    id: randomUUID(), organizationId, ticketId: ticket.id, actorUserId: ticket.requesterUserId,
    type: 'TICKET_CREATED' as const,
  }));
  return {
    version: 1,
    runId,
    target: runIdentity(target),
    organization: { id: organizationId, slug, name: `Synthetic evaluator demo ${runId}` },
    users,
    tickets,
    activityEvents,
    counts: { organizations: 1, users: 4, memberships: 4, tickets: 2, activityEvents: 2 },
  };
}

function manifestJson(manifest: DemoRunManifest): SafeJsonValue {
  return JSON.parse(JSON.stringify(manifest)) as SafeJsonValue;
}

async function assertNoCollisions(target: DemoProvisioningTarget, manifest: DemoRunManifest): Promise<void> {
  const slug = await target.client.query('SELECT 1 FROM "Organization" WHERE slug = $1 LIMIT 1', [manifest.organization.slug]);
  if (slug.rowCount !== 0) throw new Error('Run identity collision; no records were changed.');
  const emails = manifest.users.map((user) => user.email);
  const users = await target.client.query('SELECT 1 FROM "User" WHERE email = ANY($1::varchar[]) LIMIT 1', [emails]);
  if (users.rowCount !== 0) throw new Error('Run identity collision; no records were changed.');
}

async function discardKnownFailedOutput(output: PreparedPrivateRunOutput): Promise<void> {
  try {
    await output.discard();
  } catch {
    throw new Error('The database change was not committed, but private output cleanup could not be verified; preserve the files.');
  }
}

async function insertRun(
  target: DemoProvisioningTarget,
  manifest: DemoRunManifest,
  hashes: Map<DemoLabel, string>,
  output: PreparedPrivateRunOutput,
): Promise<void> {
  const client = target.client;
  let transactionStarted = false;
  let commitStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    // Recheck inside the transaction so concurrent runs fail on a unique constraint without overwriting.
    await assertNoCollisions(target, manifest);
    await client.query(
      'INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
      [manifest.organization.id, manifest.organization.slug, manifest.organization.name],
    );
    for (const user of manifest.users) {
      const passwordHash = hashes.get(user.label);
      if (!passwordHash) throw new Error('Credential hashing did not complete.');
      await client.query(
        'INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
        [user.id, user.email, passwordHash],
      );
      await client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", role, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, now(), now())',
        [manifest.organization.id, user.id, user.role],
      );
    }
    for (const ticket of manifest.tickets) {
      await client.query(
        'INSERT INTO "Ticket" (id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, version, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, $9, now(), now())',
        [ticket.id, ticket.organizationId, ticket.ticketNumber, ticket.requesterUserId,
          ticket.title, 'Synthetic evaluator demo fixture.', ticket.status, 'MEDIUM', ticket.version],
      );
    }
    for (const event of manifest.activityEvents) {
      await client.query(
        'INSERT INTO "ActivityEvent" (id, "organizationId", "ticketId", "actorUserId", type, "previousValue", "newValue", reason, "createdAt") VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, now())',
        [event.id, event.organizationId, event.ticketId, event.actorUserId, event.type],
      );
    }
    commitStarted = true;
    await client.query('COMMIT');
  } catch (error) {
    if (commitStarted) {
      throw new Error('Provisioning COMMIT outcome is uncertain; preserve recovery files and reconcile read-only.');
    }
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        throw new Error('Provisioning transaction and rollback outcome are uncertain; preserve recovery files.');
      }
    }
    await discardKnownFailedOutput(output);
    const stage = transactionStarted ? 'transaction rolled back' : 'transaction did not begin';
    throw new Error(`Provisioning ${stage} (${safeErrorCode(error)}); private run files were removed.`);
  }
}

export async function provisionPersistentDemo(
  target: DemoProvisioningTarget,
  runId: string,
  output: PreparedPrivateRunOutput,
): Promise<ProvisionPersistentDemoResult> {
  validateTarget(target);
  assertProductionDemoRunId(runId);
  assertPreparedPrivateRunOutput(output, runId);
  await assertConnectedIdentity(target);

  const credentials = makeCredentials(runId);
  const hashes = new Map<DemoLabel, string>();
  for (const account of credentials) hashes.set(account.label, await hashPassword(account.password));
  const manifest = buildManifest(runId, target, credentials);

  // Detect duplicate run identity before writing or altering persistent state.
  await assertNoCollisions(target, manifest);
  try {
    await output.writeCredentials({ runId, accounts: credentials });
    await output.writeManifest(manifestJson(manifest));
  } catch {
    await discardKnownFailedOutput(output);
    throw new Error('Private run output could not be written safely; partial files were removed.');
  }

  await insertRun(target, manifest, hashes, output);
  return { manifest, created: true };
}

export function assertDemoRunManifest(value: unknown): asserts value is DemoRunManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Run manifest is invalid.');
  const manifest = value as DemoRunManifest;
  assertProductionDemoRunId(manifest.runId);
  if (manifest.version !== 1 || !manifest.target || !manifest.organization
    || !Array.isArray(manifest.users) || manifest.users.length !== 4
    || !Array.isArray(manifest.tickets) || manifest.tickets.length !== 2
    || !Array.isArray(manifest.activityEvents) || manifest.activityEvents.length !== 2
    || manifest.counts?.organizations !== 1 || manifest.counts.users !== 4
    || manifest.counts.memberships !== 4 || manifest.counts.tickets !== 2
    || manifest.counts.activityEvents !== 2) {
    throw new Error('Run manifest is incomplete or has unsupported counts.');
  }
  const id = manifest.runId;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(manifest.organization.id)
    || manifest.users.some((user) => !uuid.test(user.id))
    || manifest.tickets.some((ticket) => !uuid.test(ticket.id))
    || manifest.activityEvents.some((event) => !uuid.test(event.id))) {
    throw new Error('Run manifest identifiers are invalid.');
  }
  if (manifest.organization.slug !== `demo-${id}`
    || manifest.users.some((user) => user.organizationId !== manifest.organization!.id
      || user.email !== `demo+${id}.${user.label}@example.test`)
    || manifest.tickets.some((ticket, index) => ticket.organizationId !== manifest.organization!.id
      || ticket.ticketNumber !== index + 1 || ticket.status !== 'OPEN' || ticket.version !== 1)
    || manifest.activityEvents.some((event) => event.organizationId !== manifest.organization!.id
      || !manifest.tickets.some((ticket) => ticket.id === event.ticketId && ticket.requesterUserId === event.actorUserId))) {
    throw new Error('Run manifest ownership does not match its run identity.');
  }
  const expectedLabels: readonly [DemoLabel, DemoRole][] = [
    ['admin', 'ADMIN'], ['agent', 'AGENT'], ['customer-one', 'CUSTOMER'], ['customer-two', 'CUSTOMER'],
  ];
  if (expectedLabels.some(([label, role]) => !manifest.users.some((user) => user.label === label && user.role === role))) {
    throw new Error('Run manifest roles are invalid.');
  }
}

export function createLocalDemoCleanupManifest(
  baseValue: unknown,
  comments: readonly DemoCleanupComment[],
  activityEvents: readonly DemoCleanupActivityEvent[],
  tickets: readonly DemoCleanupTicket[],
): LocalDemoCleanupManifest {
  assertDemoRunManifest(baseValue);
  const base = baseValue;
  if (base.target.mode !== 'local-test' || !Array.isArray(comments)
    || !Array.isArray(activityEvents) || !Array.isArray(tickets)) {
    throw new Error('Extended cleanup evidence is restricted to local-test runs.');
  }
  const ticketIds = new Set(base.tickets.map((ticket) => ticket.id));
  const userIds = new Set(base.users.map((user) => user.id));
  const ids = new Set<string>();
  const ticketNumbers = new Set<number>();
  for (const ticket of tickets) {
    if (!ticket || !/^[0-9a-f-]{36}$/i.test(ticket.id) || ids.has(ticket.id)
      || !Number.isSafeInteger(ticket.ticketNumber) || ticket.ticketNumber < 1 || ticketNumbers.has(ticket.ticketNumber)
      || ticket.organizationId !== base.organization.id || !userIds.has(ticket.requesterUserId)
      || (ticket.assigneeUserId !== null && (!userIds.has(ticket.assigneeUserId)
        || ticket.assigneeOrganizationId !== base.organization.id))
      || (ticket.assigneeUserId === null && ticket.assigneeOrganizationId !== null)
      || typeof ticket.title !== 'string' || typeof ticket.description !== 'string'
      || !['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(ticket.status)
      || !['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(ticket.priority)
      || (ticket.dueAt !== null && (typeof ticket.dueAt !== 'string' || Number.isNaN(Date.parse(ticket.dueAt))))
      || !Number.isSafeInteger(ticket.version) || ticket.version < 1
      || typeof ticket.createdAt !== 'string' || Number.isNaN(Date.parse(ticket.createdAt))
      || typeof ticket.updatedAt !== 'string' || Number.isNaN(Date.parse(ticket.updatedAt))) {
      throw new Error('Local cleanup ticket evidence is invalid.');
    }
    ids.add(ticket.id);
    ticketIds.add(ticket.id);
    ticketNumbers.add(ticket.ticketNumber);
  }
  const sortedBaseTickets = [...base.tickets].sort((a, b) => a.ticketNumber - b.ticketNumber);
  if (tickets.length < sortedBaseTickets.length || sortedBaseTickets.some((baseTicket) => {
    const captured = tickets.find((ticket) => ticket.id === baseTicket.id);
    return !captured || captured.organizationId !== baseTicket.organizationId
      || captured.requesterUserId !== baseTicket.requesterUserId
      || captured.ticketNumber !== baseTicket.ticketNumber;
  })) {
    throw new Error('Local cleanup ticket evidence omits a provisioned base ticket.');
  }
  ids.clear();
  for (const comment of comments) {
    if (!comment || !/^[0-9a-f-]{36}$/i.test(comment.id) || ids.has(comment.id)
      || comment.organizationId !== base.organization.id || !ticketIds.has(comment.ticketId)
      || !userIds.has(comment.authorUserId) || typeof comment.body !== 'string'
      || typeof comment.createdAt !== 'string' || Number.isNaN(Date.parse(comment.createdAt))) {
      throw new Error('Local cleanup comment evidence is invalid.');
    }
    ids.add(comment.id);
  }
  ids.clear();
  const baselineEvents = new Map(base.activityEvents.map((event) => [event.id, event]));
  for (const event of activityEvents) {
    if (!event || !/^[0-9a-f-]{36}$/i.test(event.id) || ids.has(event.id)
      || event.organizationId !== base.organization.id || !ticketIds.has(event.ticketId)
      || !userIds.has(event.actorUserId)
      || !['TICKET_CREATED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED', 'STATUS_CHANGED',
        'PRIORITY_CHANGED', 'ASSIGNMENT_CHANGED', 'COMMENT_ADDED'].includes(event.type)
      || typeof event.createdAt !== 'string' || Number.isNaN(Date.parse(event.createdAt))) {
      throw new Error('Local cleanup activity evidence is invalid.');
    }
    const baseline = baselineEvents.get(event.id);
    if (baseline && (event.organizationId !== baseline.organizationId || event.ticketId !== baseline.ticketId
      || event.actorUserId !== baseline.actorUserId || event.type !== baseline.type
      || event.previousValue !== null || event.newValue !== null || event.reason !== null)) {
      throw new Error('Local cleanup evidence changed a provisioned immutable activity event.');
    }
    ids.add(event.id);
  }
  if (activityEvents.length < base.activityEvents.length
    || [...baselineEvents.keys()].some((id) => !ids.has(id))) {
    throw new Error('Local cleanup activity evidence omits provisioned events.');
  }
  return {
    base,
    tickets: [...tickets],
    comments: [...comments],
    activityEvents: [...activityEvents],
    counts: { tickets: tickets.length, comments: comments.length, activityEvents: activityEvents.length },
  };
}

export async function verifyExistingPersistentDemo(
  target: DemoProvisioningTarget,
  manifestValue: unknown,
): Promise<DemoRunManifest> {
  validateTarget(target);
  assertDemoRunManifest(manifestValue);
  const manifest = manifestValue;
  if (JSON.stringify(manifest.target) !== JSON.stringify(runIdentity(target))) {
    throw new Error('Run manifest target does not match the verified database.');
  }
  await assertConnectedIdentity(target);
  const org = await target.client.query(
    'SELECT id, slug, name FROM "Organization" WHERE id = $1 AND slug = $2',
    [manifest.organization.id, manifest.organization.slug],
  );
  if (org.rowCount !== 1 || org.rows[0].name !== manifest.organization.name) {
    throw new Error('Persistent demo organization does not match the run manifest.');
  }
  const users = await target.client.query(
    'SELECT u.id, u.email, m.role, m."organizationId" FROM "User" u JOIN "Membership" m ON m."userId" = u.id WHERE m."organizationId" = $1 ORDER BY u.id',
    [manifest.organization.id],
  );
  const expectedUsers = [...manifest.users].sort((a, b) => a.id.localeCompare(b.id));
  if (users.rowCount !== 4 || JSON.stringify(users.rows.map((row) => ({ ...row, role: String(row.role) })))
    !== JSON.stringify(expectedUsers.map((row) => ({ id: row.id, email: row.email, role: row.role, organizationId: row.organizationId })))) {
    throw new Error('Persistent demo accounts or memberships do not match the run manifest.');
  }
  const memberships = await target.client.query(
    'SELECT "userId", "organizationId", role FROM "Membership" WHERE "userId" = ANY($1::uuid[]) ORDER BY "userId", "organizationId"',
    [manifest.users.map((user) => user.id)],
  );
  const expectedMemberships = [...manifest.users]
    .map((user) => ({ userId: user.id, organizationId: user.organizationId, role: user.role }))
    .sort((a, b) => a.userId.localeCompare(b.userId) || a.organizationId.localeCompare(b.organizationId));
  const actualMemberships = memberships.rows.map((row) => ({
    userId: row.userId,
    organizationId: row.organizationId,
    role: String(row.role),
  }));
  if (memberships.rowCount !== expectedMemberships.length
    || JSON.stringify(actualMemberships) !== JSON.stringify(expectedMemberships)) {
    throw new Error('Persistent demo memberships do not match the run manifest.');
  }
  const tickets = await target.client.query(
    'SELECT id, "ticketNumber", "organizationId", "requesterUserId", title, status, version FROM "Ticket" WHERE "organizationId" = $1 ORDER BY "ticketNumber"',
    [manifest.organization.id],
  );
  if (tickets.rowCount !== 2 || tickets.rows.some((row, index) => {
    const expected = manifest.tickets[index];
    return !expected || row.id !== expected.id || row.ticketNumber !== expected.ticketNumber
      || row.requesterUserId !== expected.requesterUserId || row.title !== expected.title
      || row.status !== expected.status || row.version !== expected.version;
  })) throw new Error('Persistent demo tickets do not match the run manifest.');
  const events = await target.client.query(
    'SELECT id, "organizationId", "ticketId", "actorUserId", type FROM "ActivityEvent" WHERE "organizationId" = $1 ORDER BY id',
    [manifest.organization.id],
  );
  const expectedEvents = [...manifest.activityEvents].sort((a, b) => a.id.localeCompare(b.id));
  if (events.rowCount !== 2 || JSON.stringify(events.rows) !== JSON.stringify(expectedEvents)) {
    throw new Error('Persistent demo activity does not match the run manifest.');
  }
  return manifest;
}
