import { Router } from 'express';
import { z } from 'zod';
import { getPrismaClient } from '../../db/client.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { ApiError } from '../../middleware/errors.js';
import type { AuthOptions } from '../auth/session.js';
import { parseTicketId } from '../tickets/schemas.js';
import { listTicketActivity } from './service.js';

const pageNumber = (maximum: number, fallback: number) => z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(maximum))
  .optional()
  .transform((value) => value ?? fallback);

const querySchema = z.object({
  page: pageNumber(1000, 1),
  pageSize: pageNumber(100, 25),
}).strict();

function parseQuery(input: unknown) {
  const result = querySchema.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request query is invalid.');
  return result.data;
}

export function createActivityRouter(options: AuthOptions): Router {
  const router = Router();
  router.get('/:ticketId/activity', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    const client = (options.getClient ?? getPrismaClient)();
    const ticketId = parseTicketId(request.params.ticketId);
    const query = parseQuery(request.query);
    response.setHeader('Cache-Control', 'no-store');
    response.json(await listTicketActivity(client, actor, ticketId, query));
  });
  return router;
}
