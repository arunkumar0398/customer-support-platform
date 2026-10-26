import { Router } from 'express';
import { getPrismaClient } from '../../db/client.js';
import { requireAdmin } from '../../lib/policy.js';
import { createActiveMembership } from '../../middleware/active-membership.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { createAuthenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import type { AuthOptions } from '../auth/session.js';
import { createMembershipSchema, parseMembershipUserId, parseRosterQuery, updateMembershipSchema } from './schema.js';
import { createMembership, listMemberships, updateMembership } from './service.js';

export function createMembershipRouter(options: AuthOptions): Router {
  const router = Router();
  router.use(createAuthenticate(options), createActiveMembership(options), (_request, response, next) => {
    requireAdmin(response.locals.membership as ActiveMembershipContext);
    next();
  });
  router.get('/', async (request, response) => {
    const query = parseRosterQuery(request.query);
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await listMemberships((options.getClient ?? getPrismaClient)(), actor, query));
  });
  router.post('/', validateBody(createMembershipSchema), async (request, response) => {
    const actor = response.locals.membership as ActiveMembershipContext;
    const member = await createMembership((options.getClient ?? getPrismaClient)(), actor, request.body);
    response.status(201).json(member);
  });
  router.patch('/:userId', validateBody(updateMembershipSchema), async (request, response) => {
    const userId = parseMembershipUserId(request.params.userId);
    const actor = response.locals.membership as ActiveMembershipContext;
    response.json(await updateMembership((options.getClient ?? getPrismaClient)(), actor, userId, request.body));
  });
  return router;
}
