import { Link } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';
import type { Periodo, Plan, PlanId } from '../types';
import { cifra, dinero } from '../lib/planes';
import { rangoFechas } from '../lib/utils';
import { INCLUYE, ahorroAnual } from './SeccionPlanes';

const PASOS = ['Tus datos', 'Pagar', 'Comenzar'];

/** Cabecera del proceso de compra: marca + pasos (1 Tus datos, 2 Pagar, 3 Comenzar). */
export function CabeceraCheckout({ paso }: { paso: 1 | 2 | 3 }) {
  return (
    <header className="ck-cabecera">
      <div className="ck-cabecera-inner">
        <Link to="/" className="brand">
          <img src="/logo-64.png" alt="" width={32} height={32} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </Link>
        <ol className="ck-pasos" aria-label="Pasos de la compra">
          {PASOS.map((nombre, i) => {
            const n = i + 1;
            const estado = n < paso ? 'hecho' : n === paso ? 'actual' : 'pendiente';
            return (
              <li key={nombre} className={`ck-paso is-${estado}`} aria-current={n === paso ? 'step' : undefined}>
                <span className="ck-paso-num">{estado === 'hecho' ? <Check size={15} /> : n}</span>
                <span className="ck-paso-nombre">{nombre}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}

function sumarMeses(meses: number): string {
  const d = new Date();
  const f = new Date(d.getFullYear(), d.getMonth() + meses, d.getDate());
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Recibo de la compra: plan y periodo, lo que incluye, precio base, descuento anual y total.
 * Con `planes` y los `onCambiar…` se puede cambiar de plan y de periodo desde el recibo.
 */
export function Recibo({
  plan,
  periodo,
  planes,
  onCambiarPlan,
  onCambiarPeriodo,
}: {
  plan: Plan;
  periodo: Periodo;
  planes?: Plan[];
  onCambiarPlan?: (id: PlanId) => void;
  onCambiarPeriodo?: (p: Periodo) => void;
}) {
  const anual = periodo === 'anual';
  const base = anual ? plan.precioMensual * 12 : plan.precioMensual;
  const total = anual ? plan.precioAnual : plan.precioMensual;
  const descuento = Math.max(0, base - total);
  const ahorro = ahorroAnual(plan);
  const editable = !!(planes && onCambiarPlan && onCambiarPeriodo);

  return (
    <aside className="ck-recibo" aria-label="Resumen de tu compra">
      <h2 className="ck-recibo-titulo">Tu recibo</h2>
      <div className="ck-recibo-caja">
        <div className="ck-recibo-plan">
          <span className="ck-recibo-marca">
            <img src="/logo-64.png" alt="" width={24} height={24} /> FeriaBot <b>Pro</b>
          </span>
          <span className="ck-recibo-sep" aria-hidden />
          <span className="ck-recibo-nombre">
            {plan.nombre} <span className="ck-recibo-periodo">{anual ? 'Anual' : 'Mensual'}</span>
          </span>
        </div>

        {anual && ahorro > 0 && (
          <div className="ck-recibo-promo">
            <Sparkles size={16} /> Pago anual: ahorras {ahorro} %
          </div>
        )}

        {editable && (
          <div className="ck-recibo-cambiar">
            <select className="input input-sm" value={plan.id} onChange={(e) => onCambiarPlan!(e.target.value as PlanId)} aria-label="Plan">
              {planes!.map((p) => (
                <option key={p.id} value={p.id}>
                  Plan {p.nombre} · {dinero(p.precioMensual)}/mes
                </option>
              ))}
            </select>
            <div className="periodo-toggle" role="radiogroup" aria-label="Periodo">
              {(['mensual', 'anual'] as Periodo[]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={periodo === p} className={periodo === p ? 'activo' : ''} onClick={() => onCambiarPeriodo!(p)}>
                  {p === 'mensual' ? 'Mensual' : 'Anual'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ck-recibo-beneficios">
          <h3>Con tu plan {plan.nombre} obtienes:</h3>
          <ul>
            <li>
              <Check size={17} /> {plan.ferias} {plan.ferias === 1 ? 'feria' : 'ferias'} en curso o próximas a la vez
            </li>
            <li>
              <Check size={17} /> {cifra(plan.empresasPorFeria)} empresas por feria
            </li>
            <li>
              <Check size={17} /> {cifra(plan.visitantesPorFeria)} visitantes por feria
            </li>
            {INCLUYE.map((t) => (
              <li key={t}>
                <Check size={17} /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <dl className="ck-recibo-cuentas">
        <div>
          <dt>Precio base{anual ? ' (12 meses)' : ''}:</dt>
          <dd>{dinero(base)} USD</dd>
        </div>
        {descuento > 0 && (
          <div className="ck-recibo-descuento">
            <dt>Descuento anual:</dt>
            <dd>−{dinero(descuento)} USD</dd>
          </div>
        )}
        <div className="ck-recibo-total">
          <dt>Total a pagar</dt>
          <dd>
            {dinero(total)} <span>USD</span>
          </dd>
        </div>
      </dl>
      <p className="ck-recibo-pie">Vigente {rangoFechas(hoy(), sumarMeses(anual ? 12 : 1))} desde que se confirme el pago.</p>
    </aside>
  );
}
