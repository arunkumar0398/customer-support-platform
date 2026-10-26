import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { app } from '../../src/app.js';
import { errorHandler } from '../../src/middleware/errors.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { validateBody } from '../../src/middleware/validate.js';

// Test routes exercise the production middleware without adding product endpoints.
const testApp = express();
testApp.use(requestIdMiddleware);
testApp.use(express.json());
testApp.post('/validated', validateBody(z.object({
  title: z.string().trim().min(1).max(120),
})), (req, res) => res.json(req.body));
testApp.post('/failure', async () => {
  throw new Error('Database internals: must-not-leak');
});
testApp.get('/stream-failure', (_req, res) => {
  res.write('partial response');
  throw new Error('Database internals: must-not-leak');
});
testApp.use(errorHandler);

afterEach(() => vi.restoreAllMocks());

describe('API HTTP error contract', () => {
  it('generates a distinct request ID instead of trusting an incoming value', async () => {
    const first = await request(app).get('/api/health').set('X-Request-ID', 'caller-controlled');
    const second = await request(app).get('/api/health');

    expect(first.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('returns a safe JSON envelope for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request body must be valid JSON.',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('returns a non-disclosing JSON envelope for an unknown route', async () => {
    const response = await request(app).get('/api/missing-sensitive-record');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found.',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('returns a safe 413 envelope when the JSON body limit is exceeded', async () => {
    const response = await request(app).post('/api/health').send({ title: 'x'.repeat(33 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large.',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it.each([
    { header: 'Content-Type', value: 'application/json; charset=iso-8859-1' },
    { header: 'Content-Encoding', value: 'gzip' },
  ])('rejects unsupported JSON encoding with a safe 415 envelope: $value', async ({ header, value }) => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .set(header, value)
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Request body encoding is unsupported.',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('sanitizes unexpected async errors and logs only safe correlation metadata', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(testApp)
      .post('/failure?secret=must-not-leak')
      .set('Authorization', 'Bearer must-not-leak')
      .set('Cookie', 'session=must-not-leak')
      .send({ password: 'must-not-leak' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(errorLog).toHaveBeenCalledExactlyOnceWith({
      event: 'api_error',
      code: 'INTERNAL_ERROR',
      status: 500,
      requestId: response.headers['x-request-id'],
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('must-not-leak');
  });

  it('closes a partially sent response without delegating secret-bearing errors to Express logging', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(request(testApp).get('/stream-failure')).rejects.toThrow();

    expect(errorLog).toHaveBeenCalledExactlyOnceWith({
      event: 'api_error',
      code: 'INTERNAL_ERROR',
      status: 500,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('must-not-leak');
  });
});

describe('request body validation', () => {
  it('passes parsed and normalized allowlisted values to the handler', async () => {
    const response = await request(testApp).post('/validated').send({ title: '  Ticket title  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ title: 'Ticket title' });
  });

  it.each([
    {},
    { title: '' },
    { title: '   ' },
    { title: 'x'.repeat(121) },
    { title: 42 },
    { title: 'Ticket', organizationId: 'foreign-org' },
    { title: 'Ticket', passwordHash: 'must-not-leak' },
    { title: 'Ticket', role: 'ADMIN' },
    { title: 'Ticket', createdBy: 'another-user' },
    { title: 'Ticket', authorId: 'another-user' },
  ])('rejects invalid or non-allowlisted input: %j', async (body) => {
    const response = await request(testApp).post('/validated').send(body);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body is invalid.',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.text).not.toContain('must-not-leak');
  });
});
