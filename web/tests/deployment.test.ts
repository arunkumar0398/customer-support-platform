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
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', {
      status: 201,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'support_session=opaque; HttpOnly; Secure; SameSite=Lax; Path=/',
      },
    }));

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
    expect(new Headers(options?.headers).get('x-csrf-protection')).toBe('1');
    expect(new Headers(options?.headers).get('x-csrf-token')).toBe('csrf-value');
    expect(new Headers(options?.headers).has('x-forwarded-host')).toBe(false);
    expect(result.status).toBe(201);
    expect(result.headers.get('set-cookie')).toContain('support_session=opaque');
    expect(await result.json()).toEqual({ ok: true });
  });

  it('forwards the Vercel OIDC token as a trusted-source token only from Preview', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const oidcTokenProvider = vi.fn(async () => 'short-lived-oidc-token');

    const result = await proxyApiRequest(
      new Request('https://web.example/api/health'),
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
      new Request('https://web.example/api/health'),
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
