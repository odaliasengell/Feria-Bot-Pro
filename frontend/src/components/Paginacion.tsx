import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  pagina: number;
  porPagina: number;
  total: number;
  onPagina: (pagina: number) => void;
  /** Si se pasa, aparece el selector «filas por página». */
  onPorPagina?: (porPagina: number) => void;
  opciones?: number[];
  /** Nombre de lo que se lista, en plural: «visitantes», «leads»… */
  etiqueta?: string;
  /** Muestra la cifra aunque haya una sola página (el texto «1–8 de 8»). */
  siempre?: boolean;
}

/** Páginas a mostrar: la primera, la última y dos alrededor de la actual, con «…» en los saltos. */
function paginasVisibles(actual: number, ultima: number): (number | '…')[] {
  const set = new Set([1, ultima, actual - 1, actual, actual + 1].filter((p) => p >= 1 && p <= ultima));
  const orden = [...set].sort((a, b) => a - b);
  const salida: (number | '…')[] = [];
  orden.forEach((p, i) => {
    if (i > 0 && p - orden[i - 1]! > 1) salida.push('…');
    salida.push(p);
  });
  return salida;
}

export default function Paginacion({ pagina, porPagina, total, onPagina, onPorPagina, opciones = [10, 25, 50, 100], etiqueta, siempre }: Props) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0 || (ultima === 1 && !siempre && !onPorPagina)) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);

  return (
    <nav className="paginacion" aria-label="Paginación">
      <span className="paginacion-info">
        {desde}–{hasta} de {total}
        {etiqueta ? ` ${etiqueta}` : ''}
      </span>
      {ultima > 1 && (
        <div className="paginacion-botones">
          <button type="button" onClick={() => onPagina(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior">
            <ChevronLeft size={16} />
          </button>
          {paginasVisibles(pagina, ultima).map((p, i) =>
            p === '…' ? (
              <span key={`s${i}`} className="paginacion-salto">
                …
              </span>
            ) : (
              <button
                type="button"
                key={p}
                className={p === pagina ? 'activa' : ''}
                onClick={() => onPagina(p)}
                aria-current={p === pagina ? 'page' : undefined}
                aria-label={`Página ${p}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" onClick={() => onPagina(pagina + 1)} disabled={pagina >= ultima} aria-label="Página siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {onPorPagina && (
        <label className="paginacion-tamano">
          <span>Por página</span>
          <select className="input input-sm" value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
            {opciones.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}
