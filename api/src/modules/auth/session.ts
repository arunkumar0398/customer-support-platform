import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request } from 'express';
import { getPrismaClient } from '../../db/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ApiError } from '../../middleware/errors.js';

export const SESSION_COOKIE = 'support_session';
export const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

export interface AuthOptions {
  getClient?: () => PrismaClient;
  appOrigin?: string;
  sessionSecret?: string;
  production?: boolean;
  now?: () => Date;
}

export interface AuthContext {
  sessionId: string;
  userId: string;
  csrfToken: string;
}

export function authSettings(options: AuthOptions) {
  const appOrigin = options.appOrigin ?? process.env.APP_ORIGIN;
  const sessionSecret = options.sessionSecret ?? process.env.SESSION_SECRET;
  const production = options.production ?? process.env.NODE_ENV === 'production';
  if (!appOrigin || !sessionSecret || sessionSecret.length < 32 || /REPLACE|CHANGE_ME/i.test(sessionSecret)) {
    throw new Error('Authentication configuration is missing or invalid.');
  }
  const parsedOrigin = new URL(appOrigin);
  if (parsedOrigin.origin !== appOrigin || !['http:', 'https:'].includes(parsedOrigin.protocol)
    || (production && parsedOrigin.protocol !== 'https:')) {
    throw new Error('Authentication origin configuration is invalid.');
  }
  return {
    appOrigin, sessionSecret, production,
    getClient: options.getClient ?? getPrismaClient,
    now: options.now ?? (() => new Date()),
  };
}

export function readSessionToken(request: Request): string | undefined {
  const values = (request.headers.cookie ?? '').split(';')
    .map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return undefined;
  const token = values[0].slice(SESSION_COOKIE.length + 1);
  return /^[0-9a-f]{64}$/.test(token) ? token : undefined;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function csrfForSession(token: string, secret: string): string {
  return createHmac('sha256', secret).update('csrf:').update(token).digest('hex');
}

export function requireOrigin(request: Request, appOrigin: string): void {
  if (request.get('Origin') !== appOrigin) {
    throw new ApiError(403, 'CSRF_REJECTED', 'Request origin or CSRF proof is invalid.');
  }
}

export function requireCsrf(request: Request, expectedToken: string): void {
  const supplied = request.get('X-CSRF-Token');
  if (!supplied || !/^[0-9a-f]{64}$/.test(supplied)
    || !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expectedToken, 'hex'))) {
    throw new ApiError(403, 'CSRF_REJECTED', 'Request origin or CSRF proof is invalid.');
  }
}

export function sessionCookieOptions(production: boolean): CookieOptions {
  return { httpOnly: true, secure: production, sameSite: 'lax', path: '/api' };
}
