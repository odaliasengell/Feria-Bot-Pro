import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../components/ui';

export interface OpcionesConfirmar {
  titulo: string;
  /** Texto o contenido con el detalle de lo que pasará. */
  mensaje: ReactNode;
  /** Texto del botón que confirma. Por defecto «Confirmar». */
  confirmar?: string;
  cancelar?: string;
  /** Acción destructiva (eliminar, quitar…): botón rojo e ícono de advertencia. */
  peligro?: boolean;
}

type Confirmar = (opciones: OpcionesConfirmar) => Promise<boolean>;

const ConfirmarContext = createContext<Confirmar | null>(null);

/** Diálogo de confirmación de la app (en lugar del `confirm()` del navegador). */
export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState<OpcionesConfirmar | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>((opciones) => {
    resolver.current?.(false);
    setAbierto(opciones);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const cerrar = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAbierto(null);
  }, []);

  return (
    <ConfirmarContext.Provider value={confirmar}>
      {children}
      <Modal open={abierto !== null} onClose={() => cerrar(false)} title={abierto?.titulo ?? ''} className="modal-confirmar">
        {abierto && (
          <div className="confirmar">
            {abierto.peligro && (
              <span className="confirmar-icono" aria-hidden>
                <AlertTriangle size={22} />
              </span>
            )}
            <div className="confirmar-texto">{abierto.mensaje}</div>
            <div className="confirmar-acciones">
              <button type="button" className="btn btn-ghost" onClick={() => cerrar(false)} autoFocus>
                {abierto.cancelar ?? 'Cancelar'}
              </button>
              <button type="button" className={`btn ${abierto.peligro ? 'btn-danger' : 'btn-primary'}`} onClick={() => cerrar(true)}>
                {abierto.confirmar ?? 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmarContext.Provider>
  );
}

/** `const confirmar = useConfirmar(); if (!(await confirmar({ titulo, mensaje, peligro: true }))) return;` */
export function useConfirmar(): Confirmar {
  const ctx = useContext(ConfirmarContext);
  if (!ctx) throw new Error('useConfirmar debe usarse dentro de <ConfirmarProvider>');
  return ctx;
}
