import { useEffect, useState } from 'react';

/** true mientras el navegador tiene conexión (eventos online / offline). */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return enLinea;
}
