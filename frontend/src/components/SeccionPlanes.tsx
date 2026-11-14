import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import type { Periodo, Plan } from '../types';
import { planesApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { cifra, dinero } from '../lib/planes';

/** Lo que incluyen todos los planes. */
export const INCLUYE = [
  'Tarjeta con QR para cada visitante',
  'Escaneo de leads desde el stand',
  'Ficha digital de cada empresa',
  'Control de acceso en la puerta',
  'Estadísticas y exportación a Excel',
];

/** Planes con sus precios en la página principal (los edita el Super Administrador). */
export default function SeccionPlanes() {
  const { data } = useAsync(() => Promise.all([planesApi.listar(), planesApi.metodos()]), []);
  const [planes, metodos] = data ?? [null, null];
  const [periodo, setPeriodo] = useState<Periodo>('mensual');
  if (!planes || planes.length === 0) return null;

  // El del medio se destaca como recomendado.
  const destacado = planes.length >= 3 ? planes[Math.floor(planes.length / 2)]!.id : null;
  const maxAhorro = Math.max(0, ...planes.map(ahorroAnual));

  return (
    <div className="band-paper" id="planes">
      <section className="section">
        <div className="section-head planes-head">
          <span className="tag-mint">Planes para organizadores</span>
          <h2>Organiza tus ferias con FeriaBot Pro.</h2>
          <p>Elige cuántas ferias manejas a la vez y el tamaño de cada una. Para visitantes y empresas siempre es gratis.</p>
          <div className="periodo-toggle" role="radiogroup" aria-label="Forma de pago">
            {(['mensual', 'anual'] as Periodo[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={periodo === p} className={periodo === p ? 'activo' : ''} onClick={() => setPeriodo(p)}>
                {p === 'mensual' ? 'Mensual' : 'Anual'}
                {p === 'anual' && maxAhorro > 0 && <span className="periodo-ahorro">Ahorra hasta {maxAhorro} %</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="planes-grid">
          {planes.map((p) => {
            const precio = periodo === 'anual' ? p.precioAnual : p.precioMensual;
            const ahorro = ahorroAnual(p);
            return (
              <article key={p.id} className={`plan-card ${p.id === destacado ? 'is-destacado' : ''}`}>
                {p.id === destacado && <span className="plan-card-cinta">Más elegido</span>}
                <h3>{p.nombre}</h3>
                {p.descripcion && <p className="plan-card-desc">{p.descripcion}</p>}
                <div className="plan-card-precio">
                  <b>{dinero(precio)}</b>
                  <span>/{periodo === 'anual' ? 'año' : 'mes'}</span>
                </div>
                <p className="plan-card-nota">
                  {periodo === 'anual'
                    ? ahorro > 0
                      ? `Equivale a ${dinero(Math.round((p.precioAnual / 12) * 100) / 100)} al mes · ahorras ${ahorro} %`
                      : 'Pago único por 12 meses'
                    : `O ${dinero(p.precioAnual)} al año`}
                </p>
                <ul className="plan-card-limites">
                  <li>
                    <b>{p.ferias}</b> {p.ferias === 1 ? 'feria' : 'ferias'} en curso o próximas a la vez
                  </li>
                  <li>
                    <b>{cifra(p.empresasPorFeria)}</b> empresas por feria
                  </li>
                  <li>
                    <b>{cifra(p.visitantesPorFeria)}</b> visitantes por feria
                  </li>
                </ul>
                <ul className="plan-card-incluye">
                  {INCLUYE.map((t) => (
                    <li key={t}>
                      <Check size={15} /> {t}
                    </li>
                  ))}
                </ul>
                <Link to={`/contratar?plan=${p.id}&periodo=${periodo}`} className={`btn ${p.id === destacado ? 'btn-primary' : 'btn-outline'} btn-block`}>
                  Contratar {p.nombre} <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
        <p className="planes-pie muted small">
          Precios en dólares (USD).{' '}
          {metodos?.tarjeta
            ? 'Paga con tarjeta (PayPhone) y tu cuenta se activa al instante, o por transferencia bancaria.'
            : 'Pago por transferencia bancaria; el pago con tarjeta estará disponible pronto. Tu cuenta se activa cuando confirmamos el pago.'}
        </p>
      </section>
    </div>
  );
}

/** % que se ahorra pagando el año frente a 12 meses. */
export function ahorroAnual(p: Plan): number {
  const doce = p.precioMensual * 12;
  return doce > 0 && p.precioAnual < doce ? Math.round((1 - p.precioAnual / doce) * 100) : 0;
}
