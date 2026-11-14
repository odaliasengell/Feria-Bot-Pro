import { cifra, tonoUso } from '../lib/planes';

/** Barra «usado / límite» del plan (verde, naranja desde el 80 %, rojo al llegar al límite). */
export default function UsoBarra({ etiqueta, usado, limite, compacta }: { etiqueta: string; usado: number; limite: number; compacta?: boolean }) {
  const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
  return (
    <div className={`uso ${compacta ? 'uso-compacta' : ''}`}>
      <div className="uso-top">
        <span>{etiqueta}</span>
        <b>
          {cifra(usado)} <span>/ {cifra(limite)}</span>
        </b>
      </div>
      <div className="uso-barra" role="meter" aria-valuemin={0} aria-valuemax={limite} aria-valuenow={usado} aria-label={etiqueta}>
        <span className={`fill-${tonoUso(usado, limite)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
