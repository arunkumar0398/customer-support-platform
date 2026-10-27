export interface OrganizationMembership {
  organizationId: string;
  role: 'ADMIN' | 'AGENT' | 'CUSTOMER';
  organization: { name: string; slug: string };
}

export interface Identity {
  user: { id: string; email: string };
  memberships: OrganizationMembership[];
  csrfToken: string;
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'include', headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The service could not be reached. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ErrorEnvelope;
    const code = typeof body.error?.code === 'string' ? body.error.code : 'REQUEST_FAILED';
    const message = typeof body.error?.message === 'string'
      ? body.error.message
      : 'The request could not be completed. Try again.';
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function getCurrentIdentity(): Promise<Identity> {
  return request<Identity>('/api/auth/me');
}

export function signIn(email: string, password: string): Promise<Identity> {
  return request<Identity>('/api/auth/login', {
    method: 'POST',
    headers: { 'X-CSRF-Protection': '1' },
    body: JSON.stringify({ email, password }),
  });
}

export function signOut(csrfToken: string): Promise<void> {
  return request<void>('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
