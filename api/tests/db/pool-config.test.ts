import { describe, expect, it } from 'vitest';
import { postgresPoolMax } from '../../src/db/pool-config.js';

describe('PostgreSQL client pool sizing', () => {
  it('limits a Vercel warm function instance to one client connection', () => {
    expect(postgresPoolMax({ VERCEL: '1' })).toBe(1);
  });

  it('retains the local development pool when the Vercel marker is absent', () => {
    expect(postgresPoolMax({ VERCEL: undefined })).toBe(10);
  });

  it('does not treat unrelated environment values as proof of a Vercel runtime', () => {
    expect(postgresPoolMax({ VERCEL: 'true' })).toBe(10);
  });
});
