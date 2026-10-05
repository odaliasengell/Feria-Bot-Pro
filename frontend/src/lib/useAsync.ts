import { useCallback, useEffect, useState, type DependencyList } from 'react';

/** Carga datos async y expone `recargar` para refrescar después de una mutación. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fn()
      .then((d) => vivo && (setData(d), setError(null)))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : 'Error inesperado'))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { data, cargando, error, recargar, setData };
}
