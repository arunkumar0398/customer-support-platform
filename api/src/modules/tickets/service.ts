import type { PrismaClient } from '../../generated/prisma/client.js';
import { assertCanEditTicketContent, ticketScope } from '../../lib/policy.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { ApiError } from '../../middleware/errors.js';
import { parseCreateTicket } from './schemas.js';
import type { TicketListQuery } from './schemas.js';
import { parseUpdateTicket } from './schemas.js';

export async function createTicket(client: PrismaClient, actor: ActiveMembershipContext, payload: unknown) {
  ticketScope(actor); // Fail closed on incomplete/unrecognized service context.
  return client.$transaction(async (transaction) => {
    // Same organization lock protocol as membership administration: requester
    // eligibility and actor authority cannot change during this creation.
    const organizations = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Organization" WHERE "id" = ${actor.organizationId}::uuid FOR UPDATE
    `;
    if (organizations.length !== 1) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const current = await transaction.membership.findFirst({
      where: { organizationId: actor.organizationId, userId: actor.userId, isActive: true },
      select: { organizationId: true, userId: true, role: true },
    });
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const input = parseCreateTicket(payload, current.role);
    const requesterUserId = input.requesterUserId ?? current.userId;
    const requester = await transaction.membership.findFirst({
      where: { organizationId: current.organizationId, userId: requesterUserId, isActive: true, role: 'CUSTOMER' },
      select: { userId: true },
    });
    if (!requester) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const maximum = await transaction.ticket.aggregate({
      where: { organizationId: current.organizationId }, _max: { ticketNumber: true },
    });
    const ticketNumber = (maximum._max.ticketNumber ?? 0) + 1;
    if (ticketNumber > 2147483647) throw new ApiError(409, 'TICKET_NUMBER_LIMIT', 'Ticket number limit reached.');
    const priority = input.priority;
    return transaction.ticket.create({
      data: {
        organizationId: current.organizationId, requesterUserId, ticketNumber,
        title: input.title, description: input.description, status: 'OPEN', priority,
        activityEvents: { create: {
          actorUserId: current.userId, type: 'TICKET_CREATED',
          newValue: { title: input.title, status: 'OPEN', priority, requesterUserId },
        } },
      },
      select: {
        id: true, organizationId: true, ticketNumber: true, requesterUserId: true,
        assigneeUserId: true, title: true, description: true, status: true, priority: true,
        dueAt: true, version: true, createdAt: true, updatedAt: true,
      },
    });
  }, { maxWait: 5000, timeout: 10000 });
}

export async function getTicketDetail(client: PrismaClient, actor: ActiveMembershipContext, id: string) {
  const ticket = await client.ticket.findFirst({
    where: ticketScope(actor, { id }),
    select: {
      id: true, organizationId: true, ticketNumber: true, requesterUserId: true,
      assigneeUserId: true, title: true, description: true, status: true, priority: true,
      dueAt: true, version: true, createdAt: true, updatedAt: true,
    },
  });
  if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
  return ticket;
}

const allowedStatusTransitions: Record<string, readonly string[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};

export async function updateTicket(client: PrismaClient, actor: ActiveMembershipContext, id: string, payload: unknown) {
  return client.$transaction(async (transaction) => {
    // Serialize ticket changes with membership writes in this organization and
    // re-check the actor after acquiring the same organization lock.
    const organizations = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Organization" WHERE "id" = ${actor.organizationId}::uuid FOR UPDATE
    `;
    if (organizations.length !== 1) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const membership = await transaction.membership.findFirst({
      where: { organizationId: actor.organizationId, userId: actor.userId, isActive: true },
      select: { organizationId: true, userId: true, role: true },
    });
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const currentActor = { ...actor, organizationId: membership.organizationId, userId: membership.userId, role: membership.role };
    const input = parseUpdateTicket(payload, membership.role);
    const ticket = await transaction.ticket.findFirst({
      where: ticketScope(currentActor, { id }),
      select: {
        id: true, organizationId: true, ticketNumber: true, requesterUserId: true,
        assigneeUserId: true, title: true, description: true, status: true, priority: true,
        dueAt: true, version: true, createdAt: true, updatedAt: true,
      },
    });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    assertCanEditTicketContent(currentActor, ticket);

    const isReopen = ticket.status === 'RESOLVED' && input.status === 'IN_PROGRESS';
    if (input.reopenReason !== undefined && !isReopen) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'A reopen reason is only valid when reopening a resolved ticket.');
    }
    if (input.status !== undefined && input.status !== ticket.status) {
      if (!allowedStatusTransitions[ticket.status]?.includes(input.status)) {
        throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Ticket status cannot transition to the requested value.');
      }
      if (isReopen && !input.reopenReason) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'A reason is required to reopen a resolved ticket.');
      }
    }
    if (ticket.version >= 2147483647) throw new ApiError(409, 'TICKET_VERSION_LIMIT', 'Ticket version limit reached.');

    const changes: { title?: string; description?: string; status?: typeof ticket.status; priority?: typeof ticket.priority } = {};
    const events: {
      organizationId: string; ticketId: string; actorUserId: string;
      type: 'TITLE_CHANGED' | 'DESCRIPTION_CHANGED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED';
      previousValue: string; newValue: string; reason?: string;
    }[] = [];
    if (input.title !== undefined && input.title !== ticket.title) {
      changes.title = input.title;
      events.push({ organizationId: ticket.organizationId, ticketId: ticket.id, actorUserId: currentActor.userId, type: 'TITLE_CHANGED', previousValue: ticket.title, newValue: input.title });
    }
    if (input.description !== undefined && input.description !== ticket.description) {
      changes.description = input.description;
      events.push({ organizationId: ticket.organizationId, ticketId: ticket.id, actorUserId: currentActor.userId, type: 'DESCRIPTION_CHANGED', previousValue: ticket.description, newValue: input.description });
    }
    if (input.status !== undefined && input.status !== ticket.status) {
      changes.status = input.status;
      events.push({
        organizationId: ticket.organizationId, ticketId: ticket.id, actorUserId: currentActor.userId,
        type: 'STATUS_CHANGED', previousValue: ticket.status, newValue: input.status,
        ...(ticket.status === 'RESOLVED' && input.status === 'IN_PROGRESS' ? { reason: input.reopenReason } : {}),
      });
    }
    if (input.priority !== undefined && input.priority !== ticket.priority) {
      changes.priority = input.priority;
      events.push({ organizationId: ticket.organizationId, ticketId: ticket.id, actorUserId: currentActor.userId, type: 'PRIORITY_CHANGED', previousValue: ticket.priority, newValue: input.priority });
    }
    if (events.length === 0) return ticket;

    const updated = await transaction.ticket.update({
      where: { organizationId_id: { organizationId: ticket.organizationId, id: ticket.id } },
      data: { ...changes, version: { increment: 1 } },
      select: {
        id: true, organizationId: true, ticketNumber: true, requesterUserId: true,
        assigneeUserId: true, title: true, description: true, status: true, priority: true,
        dueAt: true, version: true, createdAt: true, updatedAt: true,
      },
    });
    await transaction.activityEvent.createMany({ data: events });
    return updated;
  }, { maxWait: 5000, timeout: 10000 });
}

export async function listTickets(client: PrismaClient, actor: ActiveMembershipContext, query: TicketListQuery) {
  // Prisma maps contains to SQL LIKE/ILIKE; escape pattern metacharacters so
  // the public contract remains a literal substring search.
  const search = query.search?.replace(/[\\%_]/g, '\\$&');
  const filters = [
    ...(query.status ? [{ status: query.status }] : []),
    ...(query.priority ? [{ priority: query.priority }] : []),
    ...(query.assigneeId ? [{ assigneeUserId: query.assigneeId === 'unassigned' ? null : query.assigneeId }] : []),
    ...(query.customerId ? [{ requesterUserId: query.customerId }] : []),
    ...(search ? [{ OR: [
      { title: { contains: search, mode: 'insensitive' as const } },
      { description: { contains: search, mode: 'insensitive' as const } },
    ] }] : []),
  ];
  // ticketScope is always an independent AND child: caller filters never replace
  // tenant scope or the authenticated customer's requester restriction.
  const where = { AND: [ticketScope(actor), ...filters] };
  const { page, pageSize } = query;
  return client.$transaction(async (transaction) => {
    const total = await transaction.ticket.count({ where });
    const items = await transaction.ticket.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, organizationId: true, ticketNumber: true, requesterUserId: true,
        assigneeUserId: true, title: true, status: true, priority: true, dueAt: true,
        version: true, createdAt: true, updatedAt: true,
      },
    });
    return { items, total, page, pageSize };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}
