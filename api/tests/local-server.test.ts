import { afterEach, expect, test } from 'vitest';
import type { Server } from 'node:http';
import { startLocalServer } from '../src/local-server.js';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  const current = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => {
    current.close((error) => (error ? reject(error) : resolve()));
  });
});

test('local API listener serves the health endpoint without opening a database connection', async () => {
  server = startLocalServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve, reject) => {
    server!.once('listening', resolve);
    server!.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP listener.');
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/health');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
