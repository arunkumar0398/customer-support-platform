import { z } from 'zod';
import { ApiError } from '../../middleware/errors.js';

const membershipRole = z.enum(['ADMIN', 'AGENT', 'CUSTOMER']);
export const createMembershipSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: membershipRole,
}).strict();
export const updateMembershipSchema = z.object({
  role: membershipRole.optional(),
  isActive: z.boolean().optional(),
}).strict().refine((input) => input.role !== undefined || input.isActive !== undefined);

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

const rosterQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export type RosterQuery = z.infer<typeof rosterQuerySchema>;
const userIdSchema = z.string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());

export function parseRosterQuery(value: unknown): RosterQuery {
  const result = rosterQuerySchema.safeParse(value);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request query is invalid.');
  return result.data;
}

export function parseMembershipUserId(value: unknown): string {
  const result = userIdSchema.safeParse(value);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Membership identifier is invalid.');
  return result.data;
}
