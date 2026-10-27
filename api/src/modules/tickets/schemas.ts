import { z } from 'zod';
import type { MembershipRole } from '../../generated/prisma/enums.js';
import { ApiError } from '../../middleware/errors.js';

const content = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
};
const customerCreate = z.object(content).strict();
const staffCreate = z.object({
  ...content,
  requesterUserId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform((id) => id.toLowerCase()),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
}).strict();

export type CreateTicketInput = {
  title: string;
  description: string;
  requesterUserId?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
};

export type UpdateTicketInput = {
  title?: string;
  description?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  reopenReason?: string;
};

export type AssignmentInput = { assigneeUserId: string | null };

export type TicketListQuery = {
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeId?: string;
  customerId?: string;
  search?: string;
  page: number;
  pageSize: number;
};

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform((id) => id.toLowerCase());
const pageNumber = (maximum: number, fallback: number) => z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(maximum))
  .optional()
  .transform((value) => value ?? fallback);
const ticketListQuery = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.union([uuid, z.literal('unassigned')]).optional(),
  customerId: uuid.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: pageNumber(1000, 1),
  pageSize: pageNumber(100, 25),
}).strict();
const customerTicketUpdate = z.object({
  title: content.title.optional(),
  description: content.description.optional(),
}).strict().refine((value) => value.title !== undefined || value.description !== undefined);
const staffTicketUpdate = z.object({
  title: content.title.optional(),
  description: content.description.optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  reopenReason: z.string().trim().min(1).max(500).optional(),
}).strict().refine((value) => Object.values(value).some((field) => field !== undefined))
  .refine((value) => value.reopenReason === undefined || value.status === 'IN_PROGRESS');
const assignmentSchema = z.object({ assigneeUserId: z.union([uuid, z.null()]) }).strict();

export function parseTicketListQuery(input: unknown): TicketListQuery {
  const result = ticketListQuery.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request query is invalid.');
  return result.data;
}

export function parseTicketId(input: unknown): string {
  const result = uuid.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request path is invalid.');
  return result.data;
}

const expectedVersion = z.string()
  .regex(/^"[1-9]\d*"$/)
  .transform((value) => Number(value.slice(1, -1)))
  .pipe(z.number().int().min(1).max(2147483647));

export function parseExpectedVersion(input: unknown): number {
  const result = expectedVersion.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'If-Match version is invalid.');
  return result.data;
}

export function parseUpdateTicket(input: unknown, role: MembershipRole): UpdateTicketInput {
  const schema = role === 'CUSTOMER' ? customerTicketUpdate : staffTicketUpdate;
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request body is invalid.');
  return result.data;
}

export function parseAssignment(input: unknown): AssignmentInput {
  const result = assignmentSchema.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request body is invalid.');
  return result.data;
}

export function parseCreateTicket(input: unknown, role: MembershipRole): CreateTicketInput {
  if (!['ADMIN', 'AGENT', 'CUSTOMER'].includes(role)) {
    throw new ApiError(403, 'FORBIDDEN', 'This action is not permitted.');
  }
  if (role === 'CUSTOMER') {
    const result = customerCreate.safeParse(input);
    if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request body is invalid.');
    return { ...result.data, priority: 'MEDIUM' };
  }
  const result = staffCreate.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request body is invalid.');
  return result.data;
}
