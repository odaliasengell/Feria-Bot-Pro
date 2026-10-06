import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthRespuesta, Session } from '../types';
import { alExpirarSesion, setToken } from '../services/api';

const KEY = 'feriabot.auth';

interface AuthValue {
  session: Session | null;
  login: (auth: AuthRespuesta) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function leerAuth(): AuthRespuesta | null {
  try {
    const raw = localStorage.getItem(KEY);
    const auth = raw ? (JSON.parse(raw) as AuthRespuesta) : null;
    return auth?.token && auth.session ? auth : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const auth = leerAuth();
    setToken(auth?.token ?? null);
    return auth?.session ?? null;
  });

  const login = useCallback((auth: AuthRespuesta) => {
    localStorage.setItem(KEY, JSON.stringify(auth));
    setToken(auth.token);
    setSession(auth.session);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setToken(null);
    setSession(null);
  }, []);

  // Si el backend rechaza el token (vencido), se cierra la sesión y las rutas protegidas mandan a /ingresar.
  useEffect(() => alExpirarSesion(logout), [logout]);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
