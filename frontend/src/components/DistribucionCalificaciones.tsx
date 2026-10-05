import type { Lead } from '../types';
import { CALIFICACIONES, CALIFICACION_ORDEN } from '../lib/utils';

/** Barra apilada con el reparto de leads por calificación. */
export default function DistribucionCalificaciones({ leads }: { leads: Pick<Lead, 'calificacion'>[] }) {
  const total = leads.length || 1;
  const conteo = CALIFICACION_ORDEN.map((c) => ({ c, n: leads.filter((l) => l.calificacion === c).length }));
  return (
    <div className="dist">
      <div className="dist-bar">
        {conteo.map(({ c, n }) =>
          n ? <span key={c} className={`fill-${CALIFICACIONES[c].tone}`} style={{ width: `${(n / total) * 100}%` }} title={`${CALIFICACIONES[c].label}: ${n}`} /> : null,
        )}
      </div>
      <ul className="dist-legend">
        {conteo.map(({ c, n }) => (
          <li key={c}>
            <span className={`dot fill-${CALIFICACIONES[c].tone}`} />
            {CALIFICACIONES[c].label}
            <b>{n}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
