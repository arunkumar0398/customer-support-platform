import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';
import {
  authSettings, csrfForSession, hashToken, readSessionToken, requireCsrf, requireOrigin,
} from '../modules/auth/session.js';
import type { AuthContext, AuthOptions } from '../modules/auth/session.js';

export function createAuthenticate(options: AuthOptions = {}): RequestHandler {
  return async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    const token = readSessionToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    const settings = authSettings(options);
    const session = await settings.getClient().session.findFirst({
      where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: settings.now() } },
      select: { id: true, userId: true },
    });
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');

    const csrfToken = csrfForSession(token, settings.sessionSecret);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      requireOrigin(request, settings.appOrigin);
      requireCsrf(request, csrfToken);
    }
    const context: AuthContext = { sessionId: session.id, userId: session.userId, csrfToken };
    response.locals.auth = context;
    next();
  };
}
