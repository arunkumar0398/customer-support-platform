import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { createAuthenticate } from '../../middleware/authenticate.js';
import { ApiError } from '../../middleware/errors.js';
import { validateBody } from '../../middleware/validate.js';
import {
  authSettings, csrfForSession, hashToken, readSessionToken, requireOrigin,
  sessionCookieOptions, SESSION_COOKIE, SESSION_DURATION_MS,
} from './session.js';
import type { AuthContext, AuthOptions } from './session.js';
import { currentIdentity, passwordLogin } from './service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(256),
});

function loginThrottle(options: AuthOptions): RequestHandler {
  const attempts = new Map<string, { count: number; expires: number }>();
  const windowMs = 15 * 60 * 1000;
  return (request, response, next) => {
    const time = authSettings(options).now().getTime();
    // Express trust proxy stays disabled: untrusted forwarding headers cannot evade this key.
    const keys = [[`ip:${request.ip}`, 20], [`account:${hashToken(request.body.email)}`, 5]] as const;
    for (const [key, limit] of keys) {
      let record = attempts.get(key);
      if (record && record.expires <= time) {
        attempts.delete(key);
        record = undefined;
      }
      if (!record) {
        if (attempts.size >= 4096) {
          for (const [existingKey, value] of attempts) {
            if (value.expires <= time) attempts.delete(existingKey);
          }
        }
        if (attempts.size >= 4096) {
          response.setHeader('Retry-After', '900');
          throw new ApiError(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.');
        }
        record = { count: 0, expires: time + windowMs };
        attempts.set(key, record);
      }
      if (record.count >= limit) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((record.expires - time) / 1000))));
        throw new ApiError(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.');
      }
      record.count++;
    }
    next();
  };
}

export function createAuthRouter(options: AuthOptions): Router {
  const router = Router();
  const authenticate = createAuthenticate(options);
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post('/login', (request, _response, next) => {
    requireOrigin(request, authSettings(options).appOrigin);
    if (request.get('X-CSRF-Protection') !== '1') {
      throw new ApiError(403, 'CSRF_REJECTED', 'Request origin or CSRF proof is invalid.');
    }
    next();
  }, validateBody(loginSchema), loginThrottle(options), async (request, response) => {
    const settings = authSettings(options);
    const result = await passwordLogin(settings.getClient(), request.body.email, request.body.password,
      settings.now(), readSessionToken(request));
    response.cookie(SESSION_COOKIE, result.token, {
      ...sessionCookieOptions(settings.production), maxAge: SESSION_DURATION_MS,
    });
    response.json({ ...result.identity, csrfToken: csrfForSession(result.token, settings.sessionSecret) });
  });
  router.get('/me', authenticate, async (_request, response) => {
    const context = response.locals.auth as AuthContext;
    const identity = await currentIdentity(authSettings(options).getClient(), context.userId);
    response.json({ ...identity, csrfToken: context.csrfToken });
  });
  router.post('/logout', authenticate, async (_request, response) => {
    const context = response.locals.auth as AuthContext;
    const settings = authSettings(options);
    await settings.getClient().session.updateMany({
      where: { id: context.sessionId, userId: context.userId, revokedAt: null }, data: { revokedAt: settings.now() },
    });
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions(settings.production));
    response.status(204).end();
  });
  return router;
}
