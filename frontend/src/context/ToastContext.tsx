import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type TipoAviso = 'exito' | 'error' | 'info';

interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

interface ToastValue {
  exito: (texto: string) => void;
  error: (texto: string) => void;
  info: (texto: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const DURACION: Record<TipoAviso, number> = { exito: 4000, info: 4500, error: 6500 };
const ICONOS = { exito: CheckCircle2, error: AlertTriangle, info: Info };

/** Avisos emergentes (abajo a la derecha; en el celular, sobre la barra inferior). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(1);

  const cerrar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const mostrar = useCallback(
    (tipo: TipoAviso, texto: string) => {
      const id = siguiente.current++;
      // Como mucho 4 a la vez: el más viejo se va.
      setAvisos((a) => [...a.slice(-3), { id, tipo, texto }]);
      window.setTimeout(() => cerrar(id), DURACION[tipo]);
    },
    [cerrar],
  );

  const value = useMemo<ToastValue>(
    () => ({
      exito: (t) => mostrar('exito', t),
      error: (t) => mostrar('error', t),
      info: (t) => mostrar('info', t),
    }),
    [mostrar],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts no-print" aria-live="polite" aria-atomic="false">
        {avisos.map((a) => {
          const Icono = ICONOS[a.tipo];
          return (
            <div key={a.id} className={`toast toast-${a.tipo}`} role={a.tipo === 'error' ? 'alert' : 'status'}>
              <Icono size={18} className="toast-icon" />
              <span className="toast-texto">{a.texto}</span>
              <button type="button" className="toast-cerrar" onClick={() => cerrar(a.id)} aria-label="Cerrar aviso">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

/** Mensaje de un error de la API (o el texto por defecto). */
export function mensajeError(err: unknown, porDefecto: string): string {
  return err instanceof Error && err.message ? err.message : porDefecto;
}
