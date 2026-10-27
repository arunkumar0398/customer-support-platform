import type { PrismaClient } from '../../generated/prisma/client.js';
import { assertCanComment, ticketScope } from '../../lib/policy.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { ApiError } from '../../middleware/errors.js';
import { parseCommentBody } from './schema.js';

export interface CommentsPage {
  page: number;
  pageSize: number;
}

export async function listTicketComments(
  client: PrismaClient,
  actor: ActiveMembershipContext,
  ticketId: string,
  { page, pageSize }: CommentsPage,
) {
  return client.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findFirst({
      where: ticketScope(actor, { id: ticketId }),
      select: { id: true },
    });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');

    const where = { organizationId: actor.organizationId, ticketId: ticket.id };
    const [total, items] = await Promise.all([
      transaction.comment.count({ where }),
      transaction.comment.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          organizationId: true,
          ticketId: true,
          authorUserId: true,
          body: true,
          createdAt: true,
        },
      }),
    ]);
    return { items, total, page, pageSize };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}

export async function createTicketComment(
  client: PrismaClient,
  actor: ActiveMembershipContext,
  ticketId: string,
  payload: unknown,
) {
  return client.$transaction(async (transaction) => {
    const organizations = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Organization" WHERE "id" = ${actor.organizationId}::uuid FOR UPDATE
    `;
    if (organizations.length !== 1) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const membership = await transaction.membership.findFirst({
      where: { organizationId: actor.organizationId, userId: actor.userId, isActive: true },
      select: { organizationId: true, userId: true, role: true },
    });
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const currentActor = {
      ...actor,
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role,
    };
    const input = parseCommentBody(payload);
    const ticket = await transaction.ticket.findFirst({
      where: ticketScope(currentActor, { id: ticketId }),
      select: { id: true, organizationId: true, requesterUserId: true, status: true },
    });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    assertCanComment(currentActor, ticket);

    const comment = await transaction.comment.create({
      data: {
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        authorUserId: currentActor.userId,
        body: input.body,
      },
      select: {
        id: true,
        organizationId: true,
        ticketId: true,
        authorUserId: true,
        body: true,
        createdAt: true,
      },
    });
    await transaction.activityEvent.create({
      data: {
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        actorUserId: currentActor.userId,
        type: 'COMMENT_ADDED',
        newValue: { commentId: comment.id },
      },
    });
    return comment;
  }, { maxWait: 5000, timeout: 10000 });
}
