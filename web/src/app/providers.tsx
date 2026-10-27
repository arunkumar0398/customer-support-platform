import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', identity: null, error: null });

  const refresh = useCallback(async () => {
    setState({ status: 'loading', identity: null, error: null });
    try {
      const identity = await getCurrentIdentity();
      setState({ status: 'authenticated', identity, error: null });
    } catch (error) {
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const identity = await signIn(email, password);
    setState({ status: 'authenticated', identity, error: null });
  }, []);

  const logout = useCallback(async () => {
    if (state.status !== 'authenticated') return;
    await signOut(state.identity.csrfToken);
    setState({ status: 'anonymous', identity: null, error: null });
  }, [state]);

  const value = useMemo(() => ({ state, login, logout, refresh }), [state, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
