import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { proxyApiRequest } from '../src/server/api-proxy';
import { originalApiUrl, toFetchBody } from '../api';

describe('Vercel deployment wiring', () => {
  it('converts buffered request bytes to a Fetch-compatible body without changing them', () => {
    const bytes = Buffer.from([0, 1, 127, 128, 255]);

    expect(toFetchBody(bytes)).toEqual(new Uint8Array([0, 1, 127, 128, 255]));
    expect(toFetchBody(undefined)).toBeUndefined();
  });

  it('restores a rewritten nested API path while preserving application query parameters', () => {
    expect(originalApiUrl('https://web.example/api?__api_path=health%2Fready&probe=a%2Fb&probe=two').toString())
      .toBe('https://web.example/api/health/ready?probe=a%2Fb&probe=two');
  });

  it('removes Vercel’s implicit path query parameter when restoring a rewritten API path', () => {
    expect(originalApiUrl('https://web.example/api?path=dashboard').toString())
      .toBe('https://web.example/api/dashboard');
  });

  it('routes same-origin API paths to the Vercel function before SPA fallback', async () => {
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
      { source: '/api/:path*', destination: '/api?__api_path=:path*' },
      { source: '/((?!api/).*)', destination: '/index.html' },
    ]);
    await expect(readFile(resolve(process.cwd(), 'api/index.ts'), 'utf8')).resolves.toContain('proxyApiRequest');
  });

  it('forwards API calls and cookies to the configured HTTPS API origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      const headers = new Headers({
        'content-type': 'application/json',
        'cache-control': 'no-store',
        etag: '"ticket-v1"',
        'retry-after': '900',
        vary: 'Origin',
        'x-request-id': 'upstream-request-id',
        location: 'https://redirect-attacker.example/',
        server: 'private-upstream',
        authorization: 'Bearer response-secret',
        'x-vercel-trusted-oidc-idp-token': 'response-oidc-secret',
      });
      headers.append('set-cookie', 'support_session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/');
      headers.append('set-cookie', 'csrf_hint=opaque; Secure; SameSite=Lax; Path=/');
      return new Response('{"ok":true}', { status: 201, headers });
    });

    const result = await proxyApiRequest(
      new Request('https://web.example/api/tickets?status=open', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          cookie: 'support_session=opaque',
          origin: 'https://web.example',
          'content-type': 'application/json',
          'x-csrf-protection': '1',
          'x-csrf-token': 'csrf-value',
          'x-ticket-version': '2',
          'x-organization-id': 'org-1',
          'x-request-id': 'browser-request-id',
          authorization: 'Bearer attacker-token',
          'x-forwarded-for': '203.0.113.9',
          'x-forwarded-host': 'attacker.example',
          'x-vercel-trusted-oidc-idp-token': 'attacker-oidc-token',
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
    expect(new Headers(options?.headers).get('x-csrf-protection')).toBe('1');
    expect(new Headers(options?.headers).get('x-csrf-token')).toBe('csrf-value');
    expect(new Headers(options?.headers).get('x-ticket-version')).toBe('2');
    expect(new Headers(options?.headers).get('x-organization-id')).toBe('org-1');
    expect(new Headers(options?.headers).get('x-request-id')).toBe('browser-request-id');
    expect(new Headers(options?.headers).has('authorization')).toBe(false);
    expect(new Headers(options?.headers).has('x-forwarded-for')).toBe(false);
    expect(new Headers(options?.headers).has('x-forwarded-host')).toBe(false);
    expect(new Headers(options?.headers).has('x-vercel-trusted-oidc-idp-token')).toBe(false);
    expect(new TextDecoder().decode(options?.body as ArrayBuffer)).toBe('{"subject":"Help"}');
    expect(result.status).toBe(201);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('etag')).toBe('"ticket-v1"');
    expect(result.headers.get('retry-after')).toBe('900');
    expect(result.headers.get('vary')).toBe('Origin');
    expect(result.headers.get('x-request-id')).toBe('upstream-request-id');
    expect(result.headers.has('location')).toBe(false);
    expect(result.headers.has('server')).toBe(false);
    expect(result.headers.has('authorization')).toBe(false);
    expect(result.headers.has('x-vercel-trusted-oidc-idp-token')).toBe(false);
    expect(result.headers.get('set-cookie')).toContain('support_session=opaque');
    expect(result.headers.getSetCookie()).toHaveLength(2);
    expect(await result.json()).toEqual({ ok: true });
  });

  it('refuses unsafe origins and paths before contacting the upstream stub', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const invalidOrigins = [
      'https://api.example.test',
      'https://api.vercel.app.attacker.example',
      'https://user:password@api-preview.vercel.app',
      'https://api-preview.vercel.app/base',
      'https://api-preview.vercel.app/?target=attacker',
      'https://api-preview.vercel.app/#fragment',
    ];

    for (const API_ORIGIN of invalidOrigins) {
      await expect(proxyApiRequest(
        new Request('https://web.example/api/health'), { API_ORIGIN }, fetcher,
      )).rejects.toThrow('HTTPS Vercel API origin');
    }
    for (const path of ['/health', '/api', '/apiary/health']) {
      await expect(proxyApiRequest(
        new Request(`https://web.example${path}`),
        { API_ORIGIN: 'https://api-preview.vercel.app' }, fetcher,
      )).rejects.toThrow('only accepts paths below /api/');
    }

    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'])('preserves the method and query without attaching a body to %s', async (method) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

    await proxyApiRequest(
      new Request('https://web.example/api/health?probe=a%2Fb&probe=two', { method }),
      { API_ORIGIN: 'https://api-preview.vercel.app' }, fetcher,
    );

    const [target, options] = fetcher.mock.calls[0]!;
    expect(String(target)).toBe('https://api-preview.vercel.app/api/health?probe=a%2Fb&probe=two');
    expect(options?.method).toBe(method);
    expect(options?.body).toBeUndefined();
  });

  it('returns an upstream redirect without following it or exposing Location', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.redirect).toBe('manual');
      return new Response(null, { status: 302, headers: { location: 'https://redirect-attacker.example/' } });
    });

    const result = await proxyApiRequest(
      new Request('https://web.example/api/tickets/123'),
      { API_ORIGIN: 'https://api-preview.vercel.app' }, fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.status).toBe(302);
    expect(result.headers.has('location')).toBe(false);
  });

  it('propagates an upstream network failure without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('stubbed upstream unavailable'); });

    await expect(proxyApiRequest(
      new Request('https://web.example/api/health', {
        headers: { 'x-vercel-trusted-oidc-idp-token': 'attacker-supplied-token' },
      }),
      { API_ORIGIN: 'https://api-preview.vercel.app' }, fetcher,
    )).rejects.toThrow('stubbed upstream unavailable');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('forwards the Vercel OIDC token as a trusted-source token only from Preview', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const oidcTokenProvider = vi.fn(async () => 'short-lived-oidc-token');

    const result = await proxyApiRequest(
      new Request('https://web.example/api/health', {
        headers: { 'x-vercel-trusted-oidc-idp-token': 'attacker-supplied-token' },
      }),
      { API_ORIGIN: 'https://api-preview.vercel.app', VERCEL_ENV: 'preview' },
      fetcher,
      oidcTokenProvider,
    );

    const [, options] = fetcher.mock.calls[0]!;
    expect(new Headers(options?.headers).get('x-vercel-trusted-oidc-idp-token')).toBe('short-lived-oidc-token');
    expect(result.headers.has('x-vercel-trusted-oidc-idp-token')).toBe(false);
    expect(result.headers.has('x-vercel-oidc-token')).toBe(false);
  });

  it('fails closed when a Preview request has no Vercel OIDC token', async () => {
    const fetcher = vi.fn<typeof fetch>();

    const oidcTokenProvider = vi.fn(async () => {
      throw new Error('Vercel OIDC token is unavailable.');
    });
    await expect(proxyApiRequest(
      new Request('https://web.example/api/health'),
      { API_ORIGIN: 'https://api-preview.vercel.app', VERCEL_ENV: 'preview' },
      fetcher,
      oidcTokenProvider,
    )).rejects.toThrow('Vercel OIDC token');

    expect(oidcTokenProvider).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not forward Vercel OIDC tokens outside Preview', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', { status: 200 }));

    const oidcTokenProvider = vi.fn(async () => 'token-must-not-be-forwarded');
    await proxyApiRequest(
      new Request('https://web.example/api/health', {
        headers: { 'x-vercel-trusted-oidc-idp-token': 'attacker-supplied-token' },
      }),
      { API_ORIGIN: 'https://api.vercel.app', VERCEL_ENV: 'production' },
      fetcher,
      oidcTokenProvider,
    );

    const [, options] = fetcher.mock.calls[0]!;
    expect(new Headers(options?.headers).has('x-vercel-trusted-oidc-idp-token')).toBe(false);
    expect(oidcTokenProvider).not.toHaveBeenCalled();
  });

  it('fails closed if the API origin is missing or unsafe', async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(proxyApiRequest(
      new Request('https://web.example/api/tickets'),
      {},
      fetcher,
    )).rejects.toThrow('API_ORIGIN');

    await expect(proxyApiRequest(
      new Request('https://web.example/api/tickets'),
      { API_ORIGIN: 'http://127.0.0.1:3000' },
      fetcher,
    )).rejects.toThrow('HTTPS');

    expect(fetcher).not.toHaveBeenCalled();
  });
});
