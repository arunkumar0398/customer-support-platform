import { Router } from 'express';
import { getPrismaClient } from '../../db/client.js';
import { createActiveMembership } from '../../middleware/active-membership.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { createAuthenticate } from '../../middleware/authenticate.js';
import type { AuthOptions } from '../auth/session.js';
import { createActivityRouter } from '../activity/routes.js';
import { createCommentsRouter } from '../comments/routes.js';
import { assignTicket, createTicket, getTicketDetail, listTickets, updateTicket } from './service.js';
import { parseTicketId, parseTicketListQuery } from './schemas.js';

export function createTicketRouter(options: AuthOptions): Router {
  const router = Router();
  router.use(createAuthenticate(options), createActiveMembership(options));
  router.use(createActivityRouter(options));
  router.use(createCommentsRouter(options));
  router.get('/', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await listTickets((options.getClient ?? getPrismaClient)(), actor, parseTicketListQuery(request.query)));
  });
  router.get('/:ticketId', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await getTicketDetail((options.getClient ?? getPrismaClient)(), actor, parseTicketId(request.params.ticketId)));
  });
  router.patch('/:ticketId', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await updateTicket((options.getClient ?? getPrismaClient)(), actor, parseTicketId(request.params.ticketId), request.body));
  });
  router.patch('/:ticketId/assignment', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await assignTicket((options.getClient ?? getPrismaClient)(), actor, parseTicketId(request.params.ticketId), request.body));
  });
  router.post('/', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.status(201).json(await createTicket((options.getClient ?? getPrismaClient)(), actor, request.body));
  });
  return router;
}
