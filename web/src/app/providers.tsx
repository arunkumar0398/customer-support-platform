import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, getCurrentIdentity, signIn, signOut } from '../lib/api';
import type { Identity } from '../lib/api';

type AuthState =
  | { status: 'loading'; identity: null; error: null }
  | { status: 'anonymous'; identity: null; error: null }
  | { status: 'authenticated'; identity: Identity; error: null }
  | { status: 'unavailable'; identity: null; error: string };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clearUserScopedQueries(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  for (const family of ['tickets', 'ticket-detail', 'ticket-comments', 'ticket-activity', 'dashboard']) {
    queryClient.removeQueries({ queryKey: [family, userId] });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', identity: null, error: null });
  const queryClient = useQueryClient();
  const revalidating = useRef(false);
  const authGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++authGeneration.current;
    setState({ status: 'loading', identity: null, error: null });
    try {
      const identity = await getCurrentIdentity();
      if (generation !== authGeneration.current) return;
      setState({ status: 'authenticated', identity, error: null });
    } catch (error) {
      if (generation !== authGeneration.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: 'anonymous', identity: null, error: null });
      } else {
        setState({
          status: 'unavailable',
          identity: null,
          error: error instanceof Error ? error.message : 'The service could not be reached.',
        });
      }
    }
  }, []);

  const revalidate = useCallback(async () => {
    if (state.status !== 'authenticated' || revalidating.current) return;
    revalidating.current = true;
    const generation = authGeneration.current;
    try {
      const previous = state.identity;
      const identity = await getCurrentIdentity();
      if (generation !== authGeneration.current) return;
      const accessScope = (value: Identity) => value.memberships
        .map((membership) => `${membership.organizationId}:${membership.role}`)
        .sort()
        .join('|');
      if (previous.user.id !== identity.user.id || accessScope(previous) !== accessScope(identity)) {
        clearUserScopedQueries(queryClient, previous.user.id);
        setState({ status: 'authenticated', identity, error: null });
      } else if (previous.csrfToken !== identity.csrfToken) {
        setState({ status: 'authenticated', identity, error: null });
      }
    } catch (error) {
      if (generation !== authGeneration.current) return;
      clearUserScopedQueries(queryClient, state.identity.user.id);
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: 'anonymous', identity: null, error: null });
      } else {
        setState({
          status: 'unavailable',
          identity: null,
          error: error instanceof Error ? error.message : 'The service could not be reached.',
        });
      }
    } finally {
      revalidating.current = false;
    }
  }, [queryClient, state]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const check = () => { void revalidate(); };
    const timer = window.setInterval(check, 30_000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [revalidate, state.status]);

  const login = useCallback(async (email: string, password: string) => {
    const generation = ++authGeneration.current;
    const identity = await signIn(email, password);
    if (generation === authGeneration.current) setState({ status: 'authenticated', identity, error: null });
  }, []);

  const logout = useCallback(async () => {
    if (state.status !== 'authenticated') return;
    const generation = ++authGeneration.current;
    await signOut(state.identity.csrfToken);
    if (generation === authGeneration.current) {
      clearUserScopedQueries(queryClient, state.identity.user.id);
      setState({ status: 'anonymous', identity: null, error: null });
    }
  }, [queryClient, state]);

  const value = useMemo(() => ({ state, login, logout, refresh }), [state, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
