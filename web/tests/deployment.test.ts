import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { proxyApiRequest } from '../src/server/api-proxy';

describe('Vercel deployment wiring', () => {
  it('rewrites same-origin API paths to the proxy before SPA fallback', async () => {
    const config = JSON.parse(await readFile(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      regions: string[];
      rewrites: Array<{ source: string; destination: string }>;
    };
    const apiConfig = JSON.parse(await readFile(resolve(process.cwd(), '../api/vercel.json'), 'utf8')) as {
      regions: string[];
    };

    expect(config.regions).toEqual(['sin1']);
    expect(apiConfig.regions).toEqual(['sin1']);
    expect(config.rewrites).toEqual([
      { source: '/api/:path*', destination: '/api/proxy/:path*' },
      { source: '/(.*)', destination: '/index.html' },
    ]);
  });

  it('forwards API calls and cookies to the configured HTTPS API origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', {
      status: 201,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'support_session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/',
      },
    }));

    const result = await proxyApiRequest(
      new Request('https://web.example/api/proxy/tickets?status=open', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          cookie: 'support_session=opaque',
          origin: 'https://web.example',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-value',
          'x-forwarded-host': 'attacker.example',
        },
        body: '{"subject":"Help"}',
      }),
      { API_ORIGIN: 'https://api-preview.vercel.app' },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    const [target, options] = fetcher.mock.calls[0]!;
    expect(String(target)).toBe('https://api-preview.vercel.app/api/tickets?status=open');
    expect(options?.method).toBe('POST');
    expect(new Headers(options?.headers).get('cookie')).toBe('support_session=opaque');
    expect(new Headers(options?.headers).get('origin')).toBe('https://web.example');
    expect(new Headers(options?.headers).get('x-csrf-token')).toBe('csrf-value');
    expect(new Headers(options?.headers).has('x-forwarded-host')).toBe(false);
    expect(result.status).toBe(201);
    expect(result.headers.get('set-cookie')).toContain('support_session=opaque');
    expect(await result.json()).toEqual({ ok: true });
  });

  it('fails closed if the API origin is missing or unsafe', async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(proxyApiRequest(
      new Request('https://web.example/api/proxy/tickets'),
      {},
      fetcher,
    )).rejects.toThrow('API_ORIGIN');

    await expect(proxyApiRequest(
      new Request('https://web.example/api/proxy/tickets'),
      { API_ORIGIN: 'http://127.0.0.1:3000' },
      fetcher,
    )).rejects.toThrow('HTTPS');

    expect(fetcher).not.toHaveBeenCalled();
  });
});
