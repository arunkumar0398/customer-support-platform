import type { Prisma, Ticket } from '../generated/prisma/client.js';
import type { ActiveMembershipContext } from '../middleware/active-membership.js';
import { ApiError } from '../middleware/errors.js';

export type TicketPolicyTarget = Pick<Ticket, 'organizationId' | 'requesterUserId' | 'status'>;

function requireContext(context: ActiveMembershipContext): void {
  if (typeof context?.organizationId !== 'string' || !context.organizationId
    || typeof context.userId !== 'string' || !context.userId) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }
  if (!['ADMIN', 'AGENT', 'CUSTOMER'].includes(context.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'This action is not permitted.');
  }
}

export function requireAdmin(context: ActiveMembershipContext): void {
  requireContext(context);
  if (context.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'This action is not permitted.');
}

export function requireStaff(context: ActiveMembershipContext): void {
  requireContext(context);
  if (context.role === 'CUSTOMER') throw new ApiError(403, 'FORBIDDEN', 'This action is not permitted.');
}

export function assertTicketVisible(context: ActiveMembershipContext, ticket: TicketPolicyTarget | null): void {
  requireContext(context);
  if (!ticket || ticket.organizationId !== context.organizationId
    || (context.role === 'CUSTOMER' && ticket.requesterUserId !== context.userId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
  }
}

export function assertCanEditTicketContent(context: ActiveMembershipContext, ticket: TicketPolicyTarget): void {
  assertTicketVisible(context, ticket);
  if (context.role === 'CUSTOMER' && ticket.status !== 'OPEN') {
    throw new ApiError(403, 'FORBIDDEN', 'This action is not permitted.');
  }
}

export function assertCanComment(context: ActiveMembershipContext, ticket: TicketPolicyTarget): void {
  assertTicketVisible(context, ticket);
  if (ticket.status === 'CLOSED') throw new ApiError(409, 'TICKET_CLOSED', 'Closed tickets do not accept comments.');
}

export function assertCanManageTicket(context: ActiveMembershipContext, ticket: TicketPolicyTarget): void {
  assertTicketVisible(context, ticket);
  requireStaff(context);
}

export function ticketScope(context: ActiveMembershipContext, criteria: Prisma.TicketWhereInput = {}): Prisma.TicketWhereInput {
  requireContext(context);
  const scope: Prisma.TicketWhereInput = { organizationId: context.organizationId };
  if (context.role === 'CUSTOMER') scope.requesterUserId = context.userId;
  // AND preserves mandatory scope even when criteria contain organization/owner fields.
  return { AND: [scope, criteria] };
}
