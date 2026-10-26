import request from 'supertest';
import { describe, expect, it } from 'vitest';
import handler from '../index.js';
import { app } from '../src/app.js';

describe('API bootstrap', () => {
  it('exports the Express app from the serverless entrypoint', () => {
    expect(handler).toBe(app);
  });

  it('serves a healthy application response', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
