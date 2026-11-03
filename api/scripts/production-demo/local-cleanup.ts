import {
  assertVerifiedLocalTestTarget,
  type VerifiedLocalTestTarget,
} from './target.js';
import {
  assertDemoRunManifest,
  createLocalDemoCleanupManifest,
  type DemoCleanupActivityEvent,
  type DemoCleanupComment,
  type DemoCleanupTicket,
  type DemoRunManifest,
  type LocalDemoCleanupManifest,
} from './provision.js';

function assertCleanupTarget(target: unknown): asserts target is VerifiedLocalTestTarget {
  assertVerifiedLocalTestTarget(target);
  if (target.identity.projectId !== 'local' || target.identity.branchId !== 'local'
    || target.identity.endpointId !== 'local' || target.identity.database !== 'support_test'
    || target.identity.username !== 'support_test') {
    throw new Error('Cleanup is restricted to the verified local support_test target.');
  }
}

async function assertConnectedIdentity(target: VerifiedLocalTestTarget): Promise<void> {
  const result = await target.client.query<{ database: string; username: string }>(
    'SELECT current_database() AS database, current_user AS username',
  );
  if (result.rows[0]?.database !== 'support_test' || result.rows[0]?.username !== 'support_test') {
    throw new Error('Local cleanup target identity changed after verification.');
  }
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function requireCount(name: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`Cleanup stopped: ${name} ownership/count mismatch.`);
}

type ExpectedActivity = Pick<DemoCleanupActivityEvent,
  'id' | 'organizationId' | 'ticketId' | 'actorUserId' | 'type' | 'previousValue' | 'newValue' | 'reason'>
  & Partial<Pick<DemoCleanupActivityEvent, 'createdAt'>>;

type ExpectedTicket = Pick<DemoCleanupTicket,
  'id' | 'organizationId' | 'requesterUserId' | 'ticketNumber'>
  & Partial<Omit<DemoCleanupTicket, 'id' | 'organizationId' | 'requesterUserId' | 'ticketNumber'>>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function cleanupEvidence(value: unknown): {
  base: DemoRunManifest;
  tickets: readonly ExpectedTicket[];
  comments: readonly DemoCleanupComment[];
  activityEvents: readonly ExpectedActivity[];
  commentCount: number;
  activityCount: number;
} {
  if (value && typeof value === 'object' && 'base' in value) {
    const extended = value as LocalDemoCleanupManifest;
    assertDemoRunManifest(extended.base);
    if (extended.counts?.comments !== extended.comments?.length
      || extended.counts?.activityEvents !== extended.activityEvents?.length
      || extended.counts?.tickets !== extended.tickets?.length) {
      throw new Error('Local cleanup evidence counts are inconsistent.');
    }
    const verified = createLocalDemoCleanupManifest(extended.base, extended.comments, extended.activityEvents, extended.tickets);
    return {
      base: verified.base,
      tickets: verified.tickets,
      comments: verified.comments,
      activityEvents: verified.activityEvents,
      commentCount: verified.counts.comments,
      activityCount: verified.counts.activityEvents,
    };
  }
  assertDemoRunManifest(value);
  return {
    base: value,
    tickets: value.tickets.map((ticket) => ({
      id: ticket.id, organizationId: ticket.organizationId,
      requesterUserId: ticket.requesterUserId, ticketNumber: ticket.ticketNumber,
    })),
    comments: [],
    activityEvents: value.activityEvents.map((event) => ({
      ...event, previousValue: null, newValue: null, reason: null,
    })),
    commentCount: 0,
    activityCount: value.activityEvents.length,
  };
}

/**
 * Removes only a manifest-verified run from disposable local support_test.
 * There is intentionally no Production cleanup function.
 */
export async function cleanupLocalDemoRun(
  targetValue: VerifiedLocalTestTarget,
  manifestValue: DemoRunManifest | LocalDemoCleanupManifest,
): Promise<{ readonly deleted: true; readonly runId: string }> {
  assertCleanupTarget(targetValue);
  const evidence = cleanupEvidence(manifestValue);
  const target = targetValue;
  const manifest = evidence.base;
  if (manifest.target.mode !== 'local-test' || manifest.target.projectId !== 'local'
    || manifest.target.branchId !== 'local' || manifest.target.endpointId !== 'local'
    || manifest.target.database !== 'support_test' || manifest.target.username !== 'support_test') {
    throw new Error('Cleanup manifest is not bound to the verified local test target.');
  }
  await assertConnectedIdentity(target);
  const client = target.client;
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  let commitStarted = false;
  try {
    const organizations = await client.query(
      'SELECT id, slug, name FROM "Organization" WHERE id = $1 FOR UPDATE',
      [manifest.organization.id],
    );
    requireCount('organization', organizations.rowCount ?? 0, 1);
    if (organizations.rows[0].slug !== manifest.organization.slug
      || organizations.rows[0].name !== manifest.organization.name) {
      throw new Error('Cleanup stopped: organization identity mismatch.');
    }

    const userIds = manifest.users.map((user) => user.id);
    const users = await client.query(
      'SELECT id, email FROM "User" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [userIds],
    );
    requireCount('users', users.rowCount ?? 0, 4);
    const expectedUsers = [...manifest.users].sort((a, b) => a.id.localeCompare(b.id));
    if (users.rows.some((row, index) => row.id !== expectedUsers[index].id || row.email !== expectedUsers[index].email)) {
      throw new Error('Cleanup stopped: user identity mismatch.');
    }

    const memberships = await client.query(
      'SELECT "organizationId", "userId", role FROM "Membership" WHERE "organizationId" = $1 OR "userId" = ANY($2::uuid[]) ORDER BY "organizationId", "userId" FOR UPDATE',
      [manifest.organization.id, userIds],
    );
    requireCount('memberships', memberships.rowCount ?? 0, 4);
    const expectedMemberships = [...manifest.users].sort((a, b) => a.id.localeCompare(b.id));
    if (memberships.rows.some((row, index) => row.organizationId !== manifest.organization.id
      || row.userId !== expectedMemberships[index].id || row.role !== expectedMemberships[index].role)) {
      throw new Error('Cleanup stopped: membership ownership mismatch.');
    }

    const foreignMemberships = await client.query(
      'SELECT count(*)::int AS count FROM "Membership" WHERE "userId" = ANY($1::uuid[]) AND "organizationId" <> $2',
      [userIds, manifest.organization.id],
    );
    requireCount('outside memberships', foreignMemberships.rows[0].count, 0);

    const ticketIds = evidence.tickets.map((ticket) => ticket.id);
    const tickets = await client.query<DemoCleanupTicket>(
      'SELECT id, "organizationId", "ticketNumber", "requesterUserId", "assigneeOrganizationId", "assigneeUserId", title, description, status, priority, "dueAt"::text AS "dueAt", version, "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt" FROM "Ticket" WHERE "organizationId" = $1 ORDER BY "ticketNumber" FOR UPDATE',
      [manifest.organization.id],
    );
    requireCount('tickets', tickets.rowCount ?? 0, evidence.tickets.length);
    if (tickets.rows.some((row, index) => {
      const expected = [...evidence.tickets].sort((a, b) => a.ticketNumber - b.ticketNumber)[index];
      return !expected || row.id !== expected.id || row.organizationId !== manifest.organization.id
        || row.requesterUserId !== expected.requesterUserId || row.ticketNumber !== expected.ticketNumber
        || (expected.title !== undefined && row.title !== expected.title)
        || (expected.description !== undefined && row.description !== expected.description)
        || (expected.assigneeOrganizationId !== undefined && row.assigneeOrganizationId !== expected.assigneeOrganizationId)
        || (expected.assigneeUserId !== undefined && row.assigneeUserId !== expected.assigneeUserId)
        || (expected.status !== undefined && row.status !== expected.status)
        || (expected.priority !== undefined && row.priority !== expected.priority)
        || (expected.dueAt !== undefined && row.dueAt !== expected.dueAt)
        || (expected.version !== undefined && row.version !== expected.version)
        || (expected.createdAt !== undefined && row.createdAt !== expected.createdAt)
        || (expected.updatedAt !== undefined && row.updatedAt !== expected.updatedAt);
    }) || !sameStrings(ticketIds, tickets.rows.map((row) => row.id))) {
      throw new Error('Cleanup stopped: ticket ownership or run graph mismatch.');
    }

    const comments = await client.query<DemoCleanupComment>(
      'SELECT id, "organizationId", "ticketId", "authorUserId", body, "createdAt"::text AS "createdAt" FROM "Comment" WHERE "organizationId" = $1 ORDER BY id FOR UPDATE',
      [manifest.organization.id],
    );
    const expectedComments = [...evidence.comments].sort((a, b) => a.id.localeCompare(b.id));
    if ((comments.rowCount ?? 0) !== evidence.commentCount || comments.rows.some((row, index) => {
      const expected = expectedComments[index];
      return !expected || row.id !== expected.id || row.organizationId !== expected.organizationId
        || row.ticketId !== expected.ticketId || row.authorUserId !== expected.authorUserId
        || row.body !== expected.body || row.createdAt !== expected.createdAt;
    })) {
      throw new Error('Cleanup stopped: comments do not exactly match captured local cleanup evidence.');
    }
    const events = await client.query<ExpectedActivity & { readonly createdAt: string }>(
      'SELECT id, "organizationId", "ticketId", "actorUserId", type, "previousValue", "newValue", reason, "createdAt"::text AS "createdAt" FROM "ActivityEvent" WHERE "organizationId" = $1 ORDER BY id FOR UPDATE',
      [manifest.organization.id],
    );
    const expectedEvents = [...evidence.activityEvents].sort((a, b) => a.id.localeCompare(b.id));
    if ((events.rowCount ?? 0) !== evidence.activityCount || events.rows.some((row, index) => {
      const expected = expectedEvents[index];
      return !expected || row.id !== expected.id || row.organizationId !== expected.organizationId
        || row.ticketId !== expected.ticketId || row.actorUserId !== expected.actorUserId
        || row.type !== expected.type || canonicalJson(row.previousValue) !== canonicalJson(expected.previousValue)
        || canonicalJson(row.newValue) !== canonicalJson(expected.newValue) || row.reason !== expected.reason
        || (expected.createdAt !== undefined && row.createdAt !== expected.createdAt);
    })) {
      throw new Error('Cleanup stopped: activity rows do not exactly match the manifest.');
    }
    const sessions = await client.query(
      'SELECT id FROM "Session" WHERE "userId" = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [userIds],
    );

    // Every dependent row was locked and proven to belong exclusively to this exact synthetic run.
    const deletedSessions = await client.query('DELETE FROM "Session" WHERE "userId" = ANY($1::uuid[]) RETURNING id', [userIds]);
    requireCount('deleted sessions', deletedSessions.rowCount ?? 0, sessions.rowCount ?? 0);
    const commentIds = evidence.comments.map((comment) => comment.id);
    const deletedComments = await client.query('DELETE FROM "Comment" WHERE id = ANY($1::uuid[]) RETURNING id', [commentIds]);
    requireCount('deleted comments', deletedComments.rowCount ?? 0, comments.rowCount ?? 0);
    const expectedEventIds = evidence.activityEvents.map((event) => event.id);
    const deletedEvents = await client.query('DELETE FROM "ActivityEvent" WHERE id = ANY($1::uuid[]) RETURNING id', [expectedEventIds]);
    requireCount('deleted events', deletedEvents.rowCount ?? 0, expectedEventIds.length);
    const deletedTickets = await client.query('DELETE FROM "Ticket" WHERE id = ANY($1::uuid[]) RETURNING id', [ticketIds]);
    requireCount('deleted tickets', deletedTickets.rowCount ?? 0, ticketIds.length);
    const deletedMemberships = await client.query('DELETE FROM "Membership" WHERE "organizationId" = $1 RETURNING "userId"', [manifest.organization.id]);
    requireCount('deleted memberships', deletedMemberships.rowCount ?? 0, 4);
    const deletedUsers = await client.query('DELETE FROM "User" WHERE id = ANY($1::uuid[]) RETURNING id', [userIds]);
    requireCount('deleted users', deletedUsers.rowCount ?? 0, 4);
    const deletedOrganizations = await client.query('DELETE FROM "Organization" WHERE id = $1 RETURNING id', [manifest.organization.id]);
    requireCount('deleted organization', deletedOrganizations.rowCount ?? 0, 1);
    commitStarted = true;
    await client.query('COMMIT');
    return { deleted: true, runId: manifest.runId };
  } catch (error) {
    if (commitStarted) throw new Error('Cleanup COMMIT outcome is uncertain; preserve recovery files and reconcile read-only.');
    try {
      await client.query('ROLLBACK');
    } catch {
      throw new Error('Cleanup transaction and rollback outcome are uncertain; preserve recovery files.');
    }
    if (error instanceof Error && /^Cleanup stopped:/.test(error.message)) throw error;
    throw new Error('Cleanup transaction rolled back; preserve recovery files for reconciliation.');
  }
}
