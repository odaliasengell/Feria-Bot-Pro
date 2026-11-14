import { useEffect, useState } from 'react';

/** Devuelve `valor` cuando deja de cambiar durante `ms` (para buscar en el servidor sin una petición por tecla). */
export function useDebounce<T>(valor: T, ms = 300): T {
  const [estable, setEstable] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setEstable(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return estable;
}

const KEY = 'feriabot.porPagina';

function leerPorPagina(inicial: number): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return [10, 25, 50, 100].includes(n) ? n : inicial;
  } catch {
    return inicial;
  }
}

/**
 * Página actual y filas por página. Vuelve a la página 1 cuando cambia `reinicio` (búsqueda, filtros, feria).
 * Las filas por página se recuerdan en este navegador.
 */
export function usePaginado(reinicio: unknown[], porPaginaInicial = 25) {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPaginaEstado] = useState(() => leerPorPagina(porPaginaInicial));
  // Se reinicia durante el render (no en un efecto) para no pedir al servidor la página vieja con el filtro nuevo.
  const clave = JSON.stringify(reinicio);
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    setPagina(1);
  }

  function setPorPagina(n: number) {
    setPorPaginaEstado(n);
    setPagina(1);
    try {
      localStorage.setItem(KEY, String(n));
    } catch {
      /* sin almacenamiento */
    }
  }
  return { pagina, setPagina, porPagina, setPorPagina };
}

/** Paginación en el navegador para listas que ya vienen completas y son cortas (p. ej. empresas de una feria). */
export function paginaDe<T>(items: T[], pagina: number, porPagina: number): T[] {
  return items.slice((pagina - 1) * porPagina, pagina * porPagina);
}
