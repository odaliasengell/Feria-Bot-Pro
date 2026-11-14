import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import type { ResultadoPago as Resultado } from '../types';
import { planesApi } from '../services/api';
import { dinero } from '../lib/planes';
import { usePagina } from '../lib/seo';
import { Loader } from '../components/ui';
import { CabeceraCheckout } from '../components/Checkout';
import { LogoTarjeta, marcaDeTexto } from '../components/MarcasTarjeta';

/**
 * PayPhone devuelve aquí al cliente (`?id=<transacción>&clientTransactionId=<solicitud>`). El backend confirma el pago
 * con PayPhone: hay que hacerlo en los 5 minutos siguientes, por eso se llama apenas carga la página.
 */
export default function ResultadoPago() {
  usePagina({ titulo: 'Resultado del pago', noIndex: true });
  const [params] = useSearchParams();
  const id = Number(params.get('id'));
  const clientTx = params.get('clientTransactionId') ?? '';
  const [r, setR] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const pedido = useRef(-1);

  useEffect(() => {
    if (!id || !clientTx) {
      setError('Faltan los datos del pago. Si pagaste, escríbenos con el comprobante de PayPhone.');
      return;
    }
    // Una sola llamada por intento (en desarrollo React monta dos veces el componente).
    if (pedido.current === intento) return;
    pedido.current = intento;
    setError(null);
    planesApi
      .confirmarPago(id, clientTx)
      .then(setR)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo confirmar el pago.'));
  }, [id, clientTx, intento]);

  return (
    <div className="ck-pagina">
      <CabeceraCheckout paso={r?.estado === 'aprobada' ? 3 : 2} />
      {error ? (
        <div className="contratar-listo pago-resultado is-error">
          <XCircle size={48} />
          <h1>No pudimos confirmar el pago</h1>
          <p>{error}</p>
          {id > 0 && clientTx && (
            <button className="btn btn-primary" onClick={() => setIntento((n) => n + 1)}>
              <RefreshCw size={16} /> Intentar de nuevo
            </button>
          )}
        </div>
      ) : !r ? (
        <div className="contratar-listo pago-resultado">
          <Loader label="Confirmando tu pago con PayPhone…" />
        </div>
      ) : r.estado === 'aprobada' ? (
        <div className="contratar-listo pago-resultado">
          <CheckCircle2 size={48} />
          <h1>¡Pago aprobado!</h1>
          <p>
            Ya tienes el plan <b>{r.planNombre}</b> ({r.periodo === 'anual' ? '1 año' : '1 mes'}). Te enviamos el acceso a tu panel de organizador a{' '}
            <b>{r.email}</b>.
          </p>
          <ul className="pago-detalle">
            <li>
              Total pagado: <b>{dinero(r.monto)}</b>
            </li>
            {r.tarjeta && (
              <li className="pago-tarjeta">
                Tarjeta: {marcaDeTexto(r.tarjeta) && <LogoTarjeta marca={marcaDeTexto(r.tarjeta)!} />} {r.tarjeta}
              </li>
            )}
            {r.autorizacion && <li>Código de autorización: {r.autorizacion}</li>}
          </ul>
          <p className="muted small">Revisa también tu carpeta de spam. La contraseña es temporal: cámbiala en tu Perfil.</p>
          <Link to="/ingresar?rol=organizador" className="btn btn-primary">
            Ir a ingresar
          </Link>
        </div>
      ) : r.estado === 'pendiente' ? (
        <div className="contratar-listo pago-resultado">
          <Clock size={48} />
          <h1>Recibimos tu pago</h1>
          <p>{r.mensaje}</p>
          <Link to="/" className="btn btn-primary">
            Volver al inicio
          </Link>
        </div>
      ) : (
        <div className="contratar-listo pago-resultado is-error">
          <XCircle size={48} />
          <h1>El pago no se completó</h1>
          <p>{r.mensaje} No se hizo ningún cobro.</p>
          <Link to="/contratar" className="btn btn-primary">
            Intentar de nuevo
          </Link>
        </div>
      )}
    </div>
  );
}
