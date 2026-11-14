import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, FlaskConical, Lock } from 'lucide-react';
import { planesApi } from '../services/api';
import { dinero } from '../lib/planes';
import { Alert, Field } from './ui';
import { LogoTarjeta, MarcasAceptadas, NOMBRE_MARCA, marcaDeNumero } from './MarcasTarjeta';

function marcaDe(numero: string): string {
  const m = marcaDeNumero(numero);
  return m ? NOMBRE_MARCA[m] : 'Tarjeta';
}

/** Algoritmo de Luhn: el dígito de control de los números de tarjeta. */
function luhn(numero: string): boolean {
  let suma = 0;
  [...numero].reverse().forEach((c, i) => {
    let n = Number(c);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
  });
  return numero.length >= 13 && suma % 10 === 0;
}

/**
 * Cajita de PRUEBA (modo demostración, solo desarrollo): ocupa el lugar de la cajita de PayPhone. No envía la tarjeta a
 * ningún lado: solo los últimos 4 dígitos y la marca. Después sigue el flujo real (/contratar/resultado).
 */
export default function CajitaDemo({ opciones }: { opciones: Record<string, unknown> }) {
  const navigate = useNavigate();
  const monto = Number(opciones.amount) / 100;
  const [numero, setNumero] = useState('4242 4242 4242 4242');
  const [titular, setTitular] = useState('');
  const [vence, setVence] = useState('12/30');
  const [cvv, setCvv] = useState('123');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const limpio = numero.replace(/\D/g, '');

  async function pagar(aprobado: boolean, e?: FormEvent) {
    e?.preventDefault();
    if (aprobado) {
      if (!luhn(limpio)) return setError('El número de tarjeta no es válido (prueba con 4242 4242 4242 4242).');
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(vence)) return setError('Escribe la fecha de vencimiento como MM/AA.');
      if (!/^\d{3,4}$/.test(cvv)) return setError('El CVV tiene 3 o 4 dígitos.');
    }
    setError(null);
    setEnviando(true);
    try {
      const r = await planesApi.pagarDemo({
        clientTransactionId: String(opciones.clientTransactionId),
        aprobado,
        marca: marcaDe(limpio),
        ultimos: (limpio.slice(-4) || '0000').padStart(4, '0'),
      });
      // Lo mismo que hace PayPhone: lleva a la URL de respuesta con id y clientTransactionId.
      navigate(`/contratar/resultado?id=${r.id}&clientTransactionId=${encodeURIComponent(r.clientTransactionId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo simular el pago.');
      setEnviando(false);
    }
  }

  return (
    <form className="cajita-demo" onSubmit={(e) => pagar(true, e)}>
      <div className="cajita-demo-marcas">
        <span className="muted small">Aceptamos</span>
        <MarcasAceptadas />
      </div>
      <div className="cajita-demo-aviso">
        <FlaskConical size={16} /> <b>Modo demostración</b> · no se cobra nada. Aquí aparecerá la cajita real de PayPhone.
      </div>
      <Field label="Número de tarjeta">
        <div className="input-icono">
          <CreditCard size={16} />
          <input
            className="input input-ruc"
            inputMode="numeric"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))}
            autoComplete="off"
          />
          <span className="cajita-demo-marca">{marcaDeNumero(limpio) ? <LogoTarjeta marca={marcaDeNumero(limpio)!} /> : null}</span>
        </div>
      </Field>
      <Field label="Nombre del titular" opcional>
        <input className="input" value={titular} onChange={(e) => setTitular(e.target.value)} autoComplete="off" placeholder="Como aparece en la tarjeta" />
      </Field>
      <div className="form-grid">
        <Field label="Vence (MM/AA)">
          <input className="input input-ruc" value={vence} onChange={(e) => setVence(e.target.value.slice(0, 5))} autoComplete="off" />
        </Field>
        <Field label="CVV">
          <input className="input input-ruc" inputMode="numeric" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} autoComplete="off" />
        </Field>
      </div>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary btn-lg" disabled={enviando}>
        <Lock size={16} /> {enviando ? 'Procesando…' : `Pagar ${dinero(monto)}`}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => pagar(false)} disabled={enviando}>
        Simular tarjeta rechazada
      </button>
    </form>
  );
}
