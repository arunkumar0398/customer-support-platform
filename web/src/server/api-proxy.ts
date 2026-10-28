const REQUEST_HEADERS = [
  'accept',
  'content-type',
  'cookie',
  'if-match',
  'origin',
  'referer',
  'user-agent',
  'x-csrf-token',
  'x-organization-id',
  'x-request-id',
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
};

type Fetcher = typeof fetch;

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
): Promise<Response> {
  const apiOrigin = getApiOrigin(environment);
  const requestUrl = new URL(request.url);
  const proxyPrefix = '/api/proxy';

  if (!requestUrl.pathname.startsWith(`${proxyPrefix}/`)) {
    throw new Error('The API proxy only accepts paths below /api/proxy/.');
  }

  const target = new URL(apiOrigin);
  target.pathname = `/api${requestUrl.pathname.slice(proxyPrefix.length)}`;
  target.search = requestUrl.search;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
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
