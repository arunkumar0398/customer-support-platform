import { Router } from 'express';
import { getPrismaClient } from '../../db/client.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import type { AuthOptions } from '../auth/session.js';
import { parseTicketId } from '../tickets/schemas.js';
import { parseCommentsQuery } from './schema.js';
import { createTicketComment, listTicketComments } from './service.js';

export function createCommentsRouter(options: AuthOptions): Router {
  const router = Router();
  router.get('/:ticketId/comments', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    const client = (options.getClient ?? getPrismaClient)();
    const ticketId = parseTicketId(request.params.ticketId);
    const query = parseCommentsQuery(request.query);
    response.json(await listTicketComments(client, actor, ticketId, query));
  });
  router.post('/:ticketId/comments', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    const client = (options.getClient ?? getPrismaClient)();
    const ticketId = parseTicketId(request.params.ticketId);
    response.status(201).json(await createTicketComment(client, actor, ticketId, request.body));
  });
  return router;
}
