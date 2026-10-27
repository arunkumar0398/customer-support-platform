import type { PrismaClient } from '../../generated/prisma/client.js';
import { ticketScope } from '../../lib/policy.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { ApiError } from '../../middleware/errors.js';

export interface ActivityPage {
  page: number;
  pageSize: number;
}

export async function listTicketActivity(
  client: PrismaClient,
  actor: ActiveMembershipContext,
  ticketId: string,
  { page, pageSize }: ActivityPage,
) {
  return client.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findFirst({
      where: ticketScope(actor, { id: ticketId }),
      select: { id: true },
    });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');

    const where = { organizationId: actor.organizationId, ticketId: ticket.id };
    const [total, items] = await Promise.all([
      transaction.activityEvent.count({ where }),
      transaction.activityEvent.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          organizationId: true,
          ticketId: true,
          actorUserId: true,
          type: true,
          previousValue: true,
          newValue: true,
          reason: true,
          createdAt: true,
        },
      }),
    ]);
    return { items, total, page, pageSize };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}
