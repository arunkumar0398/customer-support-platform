import { Router } from 'express';
import { getPrismaClient } from '../../db/client.js';
import { createActiveMembership } from '../../middleware/active-membership.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { createAuthenticate } from '../../middleware/authenticate.js';
import type { AuthOptions } from '../auth/session.js';
import { createTicket } from './service.js';

export function createTicketRouter(options: AuthOptions): Router {
  const router = Router();
  router.use(createAuthenticate(options), createActiveMembership(options));
  router.post('/', async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    response.status(201).json(await createTicket((options.getClient ?? getPrismaClient)(), actor, request.body));
  });
  return router;
}
