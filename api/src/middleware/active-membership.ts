import type { RequestHandler } from 'express';
import { getPrismaClient } from '../db/client.js';
import type { MembershipRole } from '../generated/prisma/enums.js';
import type { AuthContext, AuthOptions } from '../modules/auth/session.js';
import { ApiError } from './errors.js';

export interface ActiveMembershipContext {
  organizationId: string;
  userId: string;
  role: MembershipRole;
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createActiveMembership(options: AuthOptions = {}): RequestHandler {
  return async (request, response, next) => {
    const auth = response.locals.auth as AuthContext | undefined;
    if (!auth?.userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');

    const selector = request.get('X-Organization-ID');
    if (!selector) throw new ApiError(400, 'ORGANIZATION_REQUIRED', 'Select an active organization.');
    if (!canonicalUuid.test(selector)) {
      throw new ApiError(400, 'INVALID_ORGANIZATION', 'Organization selector is invalid.');
    }

    const client = (options.getClient ?? getPrismaClient)();
    const membership = await client.membership.findFirst({
      where: { organizationId: selector.toLowerCase(), userId: auth.userId, isActive: true },
      select: { organizationId: true, userId: true, role: true },
    });
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');

    const context: ActiveMembershipContext = membership;
    response.locals.membership = context;
    next();
  };
}
