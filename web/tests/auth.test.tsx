import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/router';

const identity = {
  user: { id: '10000000-0000-4000-8000-000000000001', email: 'agent@example.test' },
  memberships: [{
    organizationId: '20000000-0000-4000-8000-000000000001',
    role: 'AGENT',
    organization: { name: 'Northstar Helpdesk', slug: 'northstar' },
  }],
  csrfToken: 'c'.repeat(64),
};

function response(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  });
}

function apiError(status: number, code: string, message: string) {
  return response(status, { error: { status, code, message, requestId: '10000000-0000-4000-8000-000000000099' } });
}

describe('sign-in and session shell', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redirects an unauthenticated root visit to an accessible sign-in form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError(401, 'UNAUTHENTICATED', 'Authentication is required.')));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in to Support Desk' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('shows rejected credentials as a visible error and retains the sign-in form', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(401, 'UNAUTHENTICATED', 'Authentication is required.'))
      .mockResolvedValueOnce(apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'agent@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('sends same-origin credentialed login and enters the active organization shell', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(401, 'UNAUTHENTICATED', 'Authentication is required.'))
      .mockResolvedValueOnce(response(200, identity));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: identity.user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Your support workspace' })).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes(identity.user.email))).toBeInTheDocument();
    expect(screen.getByText('Northstar Helpdesk')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, options] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(options.credentials).toBe('include');
    expect(new Headers(options.headers).get('X-CSRF-Protection')).toBe('1');
  });
});
