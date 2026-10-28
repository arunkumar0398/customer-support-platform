import type { IncomingMessage, ServerResponse } from 'node:http';
import { proxyApiRequest } from '../../src/server/api-proxy.js';

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(request.headers)) {
    if (rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      headers.set(name, name === 'cookie' ? rawValue.join('; ') : rawValue.join(', '));
    } else {
      headers.set(name, rawValue);
    }
  }
  return headers;
}

async function requestBody(request: VercelRequest): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  if (request.body !== undefined) {
    const body = request.body;
    if (typeof body === 'string') return Buffer.from(body);
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Uint8Array) return Buffer.from(body);
    return Buffer.from(JSON.stringify(body));
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(
  incoming: VercelRequest,
  outgoing: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(incoming.url ?? '/api/proxy', 'https://web.invalid');
    const body = await requestBody(incoming);
    const request = new Request(url, {
      method: incoming.method ?? 'GET',
      headers: requestHeaders(incoming),
      body,
    });
    const response = await proxyApiRequest(request);

    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers) {
      if (name === 'set-cookie') continue;
      outgoing.setHeader(name, value);
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) outgoing.setHeader('set-cookie', cookies);

    const responseBody = Buffer.from(await response.arrayBuffer());
    outgoing.end(responseBody);
  } catch (error) {
    const missingOrigin = error instanceof Error && error.message.includes('API_ORIGIN');
    outgoing.statusCode = missingOrigin ? 503 : 502;
    outgoing.setHeader('content-type', 'application/json; charset=utf-8');
    outgoing.setHeader('cache-control', 'no-store');
    outgoing.end(JSON.stringify({
      error: {
        code: missingOrigin ? 'API_NOT_CONFIGURED' : 'API_UNAVAILABLE',
        message: missingOrigin ? 'The API service is not configured.' : 'The API service is unavailable.',
      },
    }));
  }
}
