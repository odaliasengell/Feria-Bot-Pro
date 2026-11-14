import { useEffect, useRef, useState } from 'react';
import { Alert, Loader } from './ui';
import CajitaDemo from './CajitaDemo';

const CSS = 'https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css';
const JS = 'https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js';
const CONTENEDOR = 'pp-button';

declare global {
  interface Window {
    PPaymentButtonBox?: new (opciones: Record<string, unknown>) => { render: (id: string) => unknown };
  }
}

let cargando: Promise<void> | null = null;

/** Carga una sola vez la hoja de estilos y el script (módulo) de la Cajita de Pagos de PayPhone. */
function cargarPayPhone(): Promise<void> {
  if (window.PPaymentButtonBox) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise<void>((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.src = JS;
    script.onerror = () => {
      cargando = null;
      reject(new Error('No se pudo cargar PayPhone. Revisa tu conexión.'));
    };
    document.head.appendChild(script);
    // El módulo define PPaymentButtonBox al ejecutarse: se espera hasta 15 s.
    const inicio = Date.now();
    const esperar = () => {
      if (window.PPaymentButtonBox) resolve();
      else if (Date.now() - inicio > 15000) {
        cargando = null;
        reject(new Error('PayPhone tardó demasiado en cargar. Recarga la página.'));
      } else setTimeout(esperar, 100);
    };
    esperar();
  });
  return cargando;
}

/**
 * Cajita de Pagos de PayPhone dentro de la página. Al pagar, PayPhone lleva al cliente a la «URL de Respuesta» de la
 * aplicación (/contratar/resultado), donde el backend confirma el pago.
 */
export default function CajitaPayPhone({ opciones }: { opciones: Record<string, unknown> }) {
  // Modo demostración (sin cuenta de PayPhone): cajita de prueba con el resto del flujo real.
  if (opciones.demo) return <CajitaDemo opciones={opciones} />;
  return <CajitaReal opciones={opciones} />;
}

function CajitaReal({ opciones }: { opciones: Record<string, unknown> }) {
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState(false);
  const dibujada = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const id = String(opciones.clientTransactionId);
    cargarPayPhone()
      .then(() => {
        if (!vivo || dibujada.current === id || !window.PPaymentButtonBox) return;
        dibujada.current = id;
        const caja = document.getElementById(CONTENEDOR);
        if (caja) caja.innerHTML = '';
        new window.PPaymentButtonBox(opciones).render(CONTENEDOR);
        setLista(true);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar PayPhone.'));
    return () => {
      vivo = false;
    };
  }, [opciones]);

  return (
    <div className="cajita-payphone">
      {error && <Alert>{error}</Alert>}
      {!lista && !error && <Loader label="Cargando el formulario seguro de PayPhone…" />}
      <div id={CONTENEDOR} />
    </div>
  );
}
