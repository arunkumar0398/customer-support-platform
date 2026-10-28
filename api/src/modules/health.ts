import { Router } from 'express';
import { getPrismaClient } from '../db/client.js';
import type { AuthOptions } from './auth/session.js';

const SAFE_DATABASE_ERROR_CODES = new Set([
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
  '28000', '28P01', '3D000', '42501', '42601', '42703', '42P01',
  '53300', '53400', '57P01', '57P02', '57P03', '58000', '58030', 'XX000',
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'ETIMEDOUT',
  'P1000', 'P1001', 'P1002', 'P1003', 'P1010', 'P1011', 'P1013', 'P1017',
]);

function safeDatabaseErrorCode(error: unknown): string {
  let candidate: unknown = error;
  let fallbackCode: string | undefined;
  for (let depth = 0; depth < 3 && typeof candidate === 'object' && candidate !== null; depth += 1) {
    if ('meta' in candidate && typeof candidate.meta === 'object' && candidate.meta !== null
      && 'code' in candidate.meta && typeof candidate.meta.code === 'string') {
      const metaCode = candidate.meta.code.toUpperCase();
      if (SAFE_DATABASE_ERROR_CODES.has(metaCode)) return metaCode;
    }
    if (!fallbackCode && 'code' in candidate && typeof candidate.code === 'string') {
      const code = candidate.code.toUpperCase();
      if (SAFE_DATABASE_ERROR_CODES.has(code)) fallbackCode = code;
    }
    candidate = 'cause' in candidate ? candidate.cause : undefined;
  }
  return fallbackCode ?? 'UNKNOWN';
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
