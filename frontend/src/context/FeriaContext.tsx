import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Feria } from '../types';
import { feriasApi } from '../services/api';

const KEY = 'feriabot.feria';

interface FeriaValue {
  ferias: Feria[];
  /** Feria que el organizador está administrando (null si aún no hay ferias). */
  feria: Feria | null;
  cargando: boolean;
  elegir: (id: string) => void;
  recargar: () => Promise<void>;
}

const FeriaContext = createContext<FeriaValue | null>(null);

function leerGuardada(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Ferias del organizador y la que tiene seleccionada (se recuerda en este navegador). */
export function FeriaProvider({ children }: { children: ReactNode }) {
  const [ferias, setFerias] = useState<Feria[]>([]);
  const [feriaId, setFeriaId] = useState<string | null>(leerGuardada);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    try {
      setFerias(await feriasApi.listar());
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar().catch(() => {});
  }, [recargar]);

  const elegir = useCallback((id: string) => {
    setFeriaId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* sin almacenamiento: solo dura esta sesión */
    }
  }, []);

  // Si la guardada ya no existe, se usa la más reciente.
  const feria = ferias.find((f) => f.id === feriaId) ?? ferias[0] ?? null;

  const value = useMemo(() => ({ ferias, feria, cargando, elegir, recargar }), [ferias, feria, cargando, elegir, recargar]);
  return <FeriaContext.Provider value={value}>{children}</FeriaContext.Provider>;
}

export function useFeria(): FeriaValue {
  const ctx = useContext(FeriaContext);
  if (!ctx) throw new Error('useFeria debe usarse dentro de <FeriaProvider>');
  return ctx;
}
