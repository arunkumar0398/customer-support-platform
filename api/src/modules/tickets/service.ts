import type { PrismaClient } from '../../generated/prisma/client.js';
import { ticketScope } from '../../lib/policy.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { ApiError } from '../../middleware/errors.js';
import { parseCreateTicket } from './schemas.js';

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
