import type { Calificacion } from '../types';
import { CALIFICACIONES, CALIFICACION_ORDEN } from '../lib/utils';

/** Barra apilada con el reparto de leads por calificación (conteos que calcula el servidor). */
export default function DistribucionCalificaciones({ conteo: porCal }: { conteo: Partial<Record<Calificacion, number>> }) {
  const conteo = CALIFICACION_ORDEN.map((c) => ({ c, n: porCal[c] ?? 0 }));
  const total = conteo.reduce((s, x) => s + x.n, 0) || 1;
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
