import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createHealthRouter } from '../../src/modules/health.js';

describe('readiness failure diagnostics', () => {
  it('logs only a safe database error code when readiness fails', async () => {
    const databaseError = Object.assign(
      new Error('password=do-not-log host=private-db.example'),
      { code: '28P01' },
    );
    const getClient = () => ({ $queryRaw: vi.fn().mockRejectedValue(databaseError) });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    app.use('/api/health', createHealthRouter({
      getClient: getClient as never,
    }));

    try {
      const response = await request(app).get('/api/health/ready');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'unavailable' });
      expect(logError).toHaveBeenCalledOnce();
      expect(logError.mock.calls[0]?.[0]).toEqual({
        event: 'database_readiness_failed',
        errorCode: '28P01',
      });
      expect(JSON.stringify(logError.mock.calls[0]?.[0])).not.toContain('do-not-log');
      expect(JSON.stringify(logError.mock.calls[0]?.[0])).not.toContain('private-db');
    } finally {
      logError.mockRestore();
    }
  });
});
