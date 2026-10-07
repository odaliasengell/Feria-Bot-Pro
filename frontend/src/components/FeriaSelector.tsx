import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import type { Feria } from '../types';
import { useFeria } from '../context/FeriaContext';
import { rangoFechas } from '../lib/utils';
import { EmptyState, Loader } from './ui';

/** Barra superior del organizador para cambiar la feria que está administrando. */
export function FeriaSelector() {
  const { ferias, feria, elegir } = useFeria();
  if (!feria) return null;
  return (
    <div className="feria-bar no-print">
      <CalendarDays size={17} />
      <label className="feria-bar-label" htmlFor="feria-actual">
        Feria
      </label>
      <select id="feria-actual" className="input input-sm feria-bar-select" value={feria.id} onChange={(e) => elegir(e.target.value)}>
        {ferias.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nombre} · {rangoFechas(f.fechaInicio, f.fechaFin)}
          </option>
        ))}
      </select>
      <Link to="/organizador/ferias" className="link-sm">
        Gestionar ferias
      </Link>
    </div>
  );
}

/** Muestra el contenido solo si hay una feria seleccionada; si no, invita a crear una. */
export function ConFeria({ children }: { children: (feria: Feria) => ReactNode }) {
  const { feria, cargando } = useFeria();
  if (cargando) return <Loader />;
  if (!feria)
    return (
      <EmptyState icon={<CalendarDays />} title="Primero crea una feria">
        Las empresas, los visitantes y los leads se organizan por feria.
        <div>
          <Link to="/organizador/ferias" className="btn btn-primary">Ir a Ferias</Link>
        </div>
      </EmptyState>
    );
  return <>{children(feria)}</>;
}
