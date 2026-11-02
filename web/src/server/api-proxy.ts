import { getVercelOidcToken } from '@vercel/oidc';

const REQUEST_HEADERS = [
  'accept',
  'content-type',
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'x-csrf-protection',
  'x-csrf-token',
  'x-organization-id',
  'x-request-id',
  'x-ticket-version',
] as const;

const RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'etag',
  'retry-after',
  'vary',
  'x-request-id',
] as const;

export type ProxyEnvironment = {
  API_ORIGIN?: string;
  VERCEL_ENV?: string;
};

type Fetcher = typeof fetch;
type OidcTokenProvider = typeof getVercelOidcToken;

function getApiOrigin(environment: ProxyEnvironment): URL {
  if (!environment.API_ORIGIN) {
    throw new Error('API_ORIGIN must be configured for the Vercel web project.');
  }

  let origin: URL;
  try {
    origin = new URL(environment.API_ORIGIN);
  } catch {
    throw new Error('API_ORIGIN must be an HTTPS Vercel API origin.');
  }

  if (
    origin.protocol !== 'https:' ||
    !origin.hostname.endsWith('.vercel.app') ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('API_ORIGIN must be an HTTPS Vercel API origin.');
  }

  return origin;
}

export async function proxyApiRequest(
  request: Request,
  environment: ProxyEnvironment = process.env,
  fetcher: Fetcher = fetch,
  oidcTokenProvider: OidcTokenProvider = getVercelOidcToken,
): Promise<Response> {
  const apiOrigin = getApiOrigin(environment);
  const requestUrl = new URL(request.url);

  if (!requestUrl.pathname.startsWith('/api/')) {
    throw new Error('The API proxy only accepts paths below /api/.');
  }

  const target = new URL(apiOrigin);
  target.pathname = requestUrl.pathname;
  target.search = requestUrl.search;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  if (environment.VERCEL_ENV === 'preview') {
    const oidcToken = await oidcTokenProvider();
    if (!oidcToken) {
      throw new Error('Vercel OIDC token is required for Preview-to-Preview API requests.');
    }
    headers.set('x-vercel-trusted-oidc-idp-token', oidcToken);
  }

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();
  const upstream = await fetcher(target, {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
