import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, getTokens, setTokens } from '../lib/api';

type User = {
  id: string;
  email: string;
  displayName: string | null;
  householdId: string;
  role?: string;
  emailDigest?: boolean;
  emailAlerts?: boolean;
  household: { id: string; name: string };
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    displayName?: string;
    householdName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getTokens()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {
      setTokens(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = async (email: string, password: string) => {
    const res = await api<{ accessToken: string; refreshToken: string }>(
      '/auth/login',
      { method: 'POST', json: { email, password }, auth: false },
    );
    setTokens(res);
    await loadMe();
  };

  const demoLogin = async () => {
    const res = await api<{ accessToken: string; refreshToken: string }>(
      '/auth/demo-login',
      { method: 'POST', auth: false },
    );
    setTokens(res);
    await loadMe();
  };

  const register = async (input: {
    email: string;
    password: string;
    displayName?: string;
    householdName?: string;
  }) => {
    const res = await api<{ accessToken: string; refreshToken: string }>(
      '/auth/register',
      { method: 'POST', json: input, auth: false },
    );
    setTokens(res);
    await loadMe();
  };

  const logout = async () => {
    const tokens = getTokens();
    if (tokens?.refreshToken) {
      try {
        await api('/auth/logout', {
          method: 'POST',
          json: { refreshToken: tokens.refreshToken },
          auth: false,
        });
      } catch {
        // Local clear still proceeds if revoke fails (offline / expired).
      }
    }
    setTokens(null);
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{ user, loading, login, demoLogin, register, logout, refreshUser: loadMe }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
