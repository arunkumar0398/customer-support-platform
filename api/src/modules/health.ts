import { Router } from 'express';
import { getPrismaClient } from '../db/client.js';
import type { AuthOptions } from './auth/session.js';

function safeDatabaseErrorCode(error: unknown): string {
  let candidate: unknown = error;
  for (let depth = 0; depth < 3 && typeof candidate === 'object' && candidate !== null; depth += 1) {
    if ('code' in candidate && typeof candidate.code === 'string' && /^[A-Z0-9_]{1,32}$/i.test(candidate.code)) {
      return candidate.code;
    }
    candidate = 'cause' in candidate ? candidate.cause : undefined;
  }
  return 'UNKNOWN';
}

export function createHealthRouter(options: AuthOptions): Router {
  const router = Router();
  router.get('/', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ status: 'ok' });
  });
  router.get('/ready', async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      await (options.getClient ?? getPrismaClient)().$queryRaw`SELECT 1`;
      response.status(200).json({ status: 'ready' });
    } catch (error) {
      console.error({
        event: 'database_readiness_failed',
        errorCode: safeDatabaseErrorCode(error),
      });
      response.status(503).json({ status: 'unavailable' });
    }
  });
  return router;
}
