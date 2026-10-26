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
