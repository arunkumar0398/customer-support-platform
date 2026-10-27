import { Router } from 'express';
import { getPrismaClient } from '../db/client.js';
import type { AuthOptions } from './auth/session.js';

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
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });
  return router;
}
