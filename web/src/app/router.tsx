import { useState } from 'react';
import type { FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './providers';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { TicketCreatePage } from '../features/tickets/create/TicketCreatePage';
import { TicketDetailPage } from '../features/tickets/detail/TicketDetailPage';
import { TicketListPage } from '../features/tickets/list/TicketListPage';
import type { CreatedTicket } from '../lib/api';
import './styles.css';

function LoadingScreen() {
  return <main className="status-screen" aria-live="polite">Restoring your secure session…</main>;
}

function SessionUnavailable() {
  const { state, refresh } = useAuth();
  if (state.status !== 'unavailable') return null;
  return (
    <main className="status-screen">
      <section className="status-card" aria-labelledby="service-title">
        <p className="eyebrow">Connection interrupted</p>
        <h1 id="service-title">Your workspace is out of reach.</h1>
        <p role="alert">{state.error}</p>
        <button className="button button-primary" onClick={() => void refresh()}>Try again</button>
      </section>
    </main>
  );
}

function SignInPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'unavailable') return <SessionUnavailable />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  return (
    <main className="auth-layout">
      <aside className="auth-story" aria-label="Support Desk introduction">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">S</span><span>Support Desk</span></div>
        <div className="story-copy">
          <p className="eyebrow">CUSTOMER SUPPORT / SHARED WORKSPACE</p>
          <h1>Every open thread deserves a next step.</h1>
          <p className="story-intro">A clear place for the people waiting, and the team working to help.</p>
        </div>
        <div className="queue-lanes" aria-label="Ticket lifecycle">
          <div><span className="lane-dot lane-open" /><span>Open</span><small>Ready for a first look</small></div>
          <div><span className="lane-dot lane-working" /><span>In progress</span><small>Someone is on it</small></div>
          <div><span className="lane-dot lane-done" /><span>Resolved</span><small>The customer has an answer</small></div>
        </div>
        <p className="story-footer">ONE TEAM · MANY CUSTOMERS · CLEAR OWNERSHIP</p>
      </aside>

      <section className="auth-panel" aria-labelledby="sign-in-title">
        <div className="auth-panel-inner">
          <p className="eyebrow panel-eyebrow">WORKSPACE ACCESS</p>
          <h2 id="sign-in-title">Sign in to Support Desk</h2>
          <p className="form-intro">Use your organization account to pick up where your team left off.</p>
          <form onSubmit={submit} noValidate={false}>
            <label htmlFor="email">Email</label>
            <input
              autoComplete="username"
              autoCapitalize="none"
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary sign-in-button" disabled={submitting} type="submit">
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="privacy-note"><span aria-hidden="true">●</span> Your session is protected and stays in this browser.</p>
        </div>
      </section>
    </main>
  );
}

function WorkspacePage() {
  const { state, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  if (state.status !== 'authenticated') return null;
  const membership = state.identity.memberships[0];
  const createdTicketPath = location.pathname.match(/^\/tickets\/([0-9a-f-]+)$/i);
  const createdTicket = (location.state as { createdTicket?: CreatedTicket } | null)?.createdTicket;

  async function signOut() {
    setError('');
    try {
      await logout();
      navigate('/sign-in', { replace: true });
    } catch {
      setError('We could not end your session. Try again.');
    }
  }

  return (
    <div className="workspace-layout">
      <header className="workspace-header">
        <Link className="workspace-brand" to="/" aria-label="Support Desk home"><span className="brand-mark" aria-hidden="true">S</span>Support Desk</Link>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          <Link className={location.pathname === '/' ? 'workspace-nav-active' : undefined} to="/">Ticket queue</Link>
          {['ADMIN', 'AGENT'].includes(membership?.role ?? '') && (
            <Link className={location.pathname === '/dashboard' ? 'workspace-nav-active' : undefined} to="/dashboard">Dashboard</Link>
          )}
        </nav>
        <div className="account-block">
          <div className="account-copy">
            <span>{membership?.organization.name ?? 'No active organization'}</span>
            <small>{state.identity.user.email} · {membership?.role.toLowerCase() ?? 'no role'}</small>
          </div>
          <button className="button button-quiet" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      {error && <p role="alert" className="form-error workspace-signout-error">{error}</p>}
      {location.pathname === '/' && (
        <main>
          <TicketListPage identity={state.identity} organizationId={membership?.organizationId} />
        </main>
      )}
      {location.pathname === '/dashboard' && (
        <DashboardPage identity={state.identity} organizationId={membership?.organizationId} />
      )}
      {location.pathname === '/tickets/new' && (
        <TicketCreatePage identity={state.identity} organizationId={membership?.organizationId} />
      )}
      {createdTicketPath && (
        <TicketDetailPage
          identity={state.identity}
          organizationId={membership?.organizationId}
          ticketId={createdTicketPath[1]}
          createdTicket={createdTicket}
        />
      )}
      {location.pathname !== '/' && location.pathname !== '/dashboard' && location.pathname !== '/tickets/new' && !createdTicketPath && (
        <Navigate to="/" replace />
      )}
    </div>
  );
}

function AuthenticatedRoute() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'unavailable') return <SessionUnavailable />;
  if (state.status === 'anonymous') return <Navigate to="/sign-in" replace state={{ from: location }} />;
  return <WorkspacePage />;
}

function SignInRoute() {
  const { state } = useAuth();
  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  if (state.status === 'unavailable') return <SessionUnavailable />;
  return <SignInPage />;
}

export function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/sign-in" element={<SignInRoute />} />
            <Route path="*" element={<AuthenticatedRoute />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
