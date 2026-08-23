import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, readSession, writeSession, type Session } from './api';
import type { AuthResult } from './types';

interface SessionContextValue {
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  register(displayName: string, email: string, password: string): Promise<void>;
  session: Session | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(() => readSession());

  useEffect(() => {
    const sync = () => setSession(readSession());
    window.addEventListener('skillbridge:session', sync);
    return () => window.removeEventListener('skillbridge:session', sync);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      login: async (email, password) => {
        const result = await api.post<AuthResult>('/auth/login', { email, password });
        writeSession(result);
      },
      logout: async () => {
        const current = readSession();
        try {
          if (current)
            await api.post('/auth/logout', { refreshToken: current.tokens.refreshToken });
        } finally {
          writeSession(null);
        }
      },
      register: async (displayName, email, password) => {
        const result = await api.post<AuthResult>('/auth/register', {
          displayName,
          email,
          password,
        });
        writeSession(result);
      },
      session,
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

// Context and hook intentionally share this module so the public session API stays cohesive.
// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider.');
  return context;
};
