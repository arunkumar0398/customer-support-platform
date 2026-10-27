import { Router } from 'express';
import { getPrismaClient } from '../../db/client.js';
import { createActiveMembership } from '../../middleware/active-membership.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { createAuthenticate } from '../../middleware/authenticate.js';
import { ApiError } from '../../middleware/errors.js';
import type { AuthOptions } from '../auth/session.js';
import { getDashboard } from './service.js';

export function createDashboardRouter(options: AuthOptions): Router {
  const router = Router();
  router.use(createAuthenticate(options), createActiveMembership(options));
  router.get('/', async (request, response) => {
    if (Object.keys(request.query).length > 0) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Dashboard does not accept query parameters.');
    }
    const actor = response.locals.membership as ActiveMembershipContext;
    response.setHeader('Cache-Control', 'no-store');
    response.json(await getDashboard((options.getClient ?? getPrismaClient)(), actor, options.now));
  });
  return router;
}
