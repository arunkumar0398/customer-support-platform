import { Router } from 'express';
import { getPrismaClient } from '../../db/client.js';
import { createActiveMembership } from '../../middleware/active-membership.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { createAuthenticate } from '../../middleware/authenticate.js';
import type { AuthOptions } from '../auth/session.js';
import { createActivityRouter } from '../activity/routes.js';
import { createCommentsRouter } from '../comments/routes.js';
import { assignTicket, createTicket, getTicketDetail, listTicketRequesters, listTickets, updateTicket } from './service.js';
import { parseTicketVersion, parseTicketId, parseTicketListQuery } from './schemas.js';
import { ApiError } from '../../middleware/errors.js';

export function createTicketRouter(options: AuthOptions): Router {
  const router = Router();
  router.use(createAuthenticate(options), createActiveMembership(options));
  router.use(createActivityRouter(options));
  router.use(createCommentsRouter(options));
  router.get('/', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await listTickets((options.getClient ?? getPrismaClient)(), actor, parseTicketListQuery(request.query)));
  });
  router.get('/requesters', async (_request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await listTicketRequesters((options.getClient ?? getPrismaClient)(), actor));
  });
  router.get('/:ticketId', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    const ticket = await getTicketDetail((options.getClient ?? getPrismaClient)(), actor, parseTicketId(request.params.ticketId));
    response.setHeader('ETag', `"${ticket.version}"`);
    response.json(ticket);
  });
  router.patch('/:ticketId', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    const ticketId = parseTicketId(request.params.ticketId);
    const ticketVersion = request.get('X-Ticket-Version');
    if (ticketVersion === undefined) throw new ApiError(428, 'PRECONDITION_REQUIRED', 'X-Ticket-Version with the current ticket version is required.');
    const expectedVersion = parseTicketVersion(ticketVersion);
    const ticket = await updateTicket((options.getClient ?? getPrismaClient)(), actor, ticketId, request.body, expectedVersion);
    response.setHeader('ETag', `"${ticket.version}"`);
    response.json(ticket);
  });
  router.patch('/:ticketId/assignment', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    const ticketId = parseTicketId(request.params.ticketId);
    const ticketVersion = request.get('X-Ticket-Version');
    if (ticketVersion === undefined) throw new ApiError(428, 'PRECONDITION_REQUIRED', 'X-Ticket-Version with the current ticket version is required.');
    const expectedVersion = parseTicketVersion(ticketVersion);
    const ticket = await assignTicket((options.getClient ?? getPrismaClient)(), actor, ticketId, request.body, expectedVersion);
    response.setHeader('ETag', `"${ticket.version}"`);
    response.json(ticket);
  });
  router.post('/', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.status(201).json(await createTicket((options.getClient ?? getPrismaClient)(), actor, request.body));
  });
  return router;
}
