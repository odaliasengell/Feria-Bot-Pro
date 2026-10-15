import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Search, Store, X } from 'lucide-react';
import type { EstadoFeria, Feria } from '../types';
import { feriasApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { normalizar, rangoFechas, type Tone } from '../lib/utils';
import { Alert, EmptyState, Loader } from '../components/ui';

const PESTANAS: { estado: EstadoFeria; label: string; vacio: string }[] = [
  { estado: 'proxima', label: 'Próximas', vacio: 'No hay ferias próximas por ahora.' },
  { estado: 'en_curso', label: 'En curso', vacio: 'No hay ferias en curso en este momento.' },
  { estado: 'finalizada', label: 'Finalizadas', vacio: 'Todavía no hay ferias finalizadas.' },
];

const ESTADO: Record<EstadoFeria, { label: string; tone: Tone }> = {
  proxima: { label: 'Próxima', tone: 'blue' },
  en_curso: { label: 'En curso', tone: 'teal' },
  finalizada: { label: 'Finalizada', tone: 'gray' },
};

function esEstado(v: string | null): v is EstadoFeria {
  return v === 'proxima' || v === 'en_curso' || v === 'finalizada';
}

/** Página pública (sin sesión) con las ferias por estado y un buscador por nombre o lugar. */
export default function Ferias() {
  const [params, setParams] = useSearchParams();
  const estadoParam = params.get('estado');
  const estado: EstadoFeria = esEstado(estadoParam) ? estadoParam : 'proxima';
  const [busqueda, setBusqueda] = useState('');

  const { data, cargando, error, recargar } = useAsync(() => feriasApi.listar(false, estado), [estado]);

  useEffect(() => {
    document.title = 'Ferias · FeriaBot Pro';
  }, []);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const lista = data ?? [];
    if (!q) return lista;
    return lista.filter((f) => normalizar(f.nombre).includes(q) || normalizar(f.lugar).includes(q));
  }, [data, busqueda]);

  // Próximas: la más cercana primero. En curso y finalizadas: la más reciente primero (como llegan del backend).
  const ordenadas = estado === 'proxima' ? [...visibles].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)) : visibles;
  const pestana = PESTANAS.find((p) => p.estado === estado)!;

  return (
    <div className="landing">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link to="/" className="brand">
            <img src="/favicon.png" alt="" width={32} height={32} />
            <span>
              FeriaBot <b>Pro</b>
            </span>
          </Link>
          <div className="topnav-actions">
            <Link to="/" className="btn btn-outline btn-sm">
              <ArrowLeft size={15} /> Inicio
            </Link>
            <Link to="/registro" className="btn btn-accent btn-sm">
              Registrarme
            </Link>
          </div>
        </div>
      </nav>

      <main className="section ferias-pub">
        <div className="section-head">
          <span className="tag-mint">Calendario</span>
          <h2>Ferias en FeriaBot Pro.</h2>
          <p>Consulta las ferias próximas, las que están en curso y las que ya terminaron, y regístrate en las que tienen inscripciones abiertas.</p>
        </div>

        <div className="ferias-pub-bar">
          <div className="tabs" role="tablist" aria-label="Estado de la feria">
            {PESTANAS.map((p) => (
              <button
                key={p.estado}
                type="button"
                role="tab"
                aria-selected={p.estado === estado}
                className={`tab${p.estado === estado ? ' is-active' : ''}`}
                onClick={() => setParams(p.estado === 'proxima' ? {} : { estado: p.estado }, { replace: true })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={16} />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o lugar"
              aria-label="Buscar por nombre o lugar"
            />
            {busqueda && (
              <button type="button" className="icon-btn" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        {cargando && !data ? (
          <Loader />
        ) : error && !data ? (
          <Alert>
            {error}{' '}
            <button type="button" className="link-btn" onClick={recargar}>
              Reintentar
            </button>
          </Alert>
        ) : ordenadas.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title={busqueda ? 'Sin resultados' : pestana.vacio}>
            {busqueda ? `Ninguna feria ${pestana.label.toLowerCase()} coincide con «${busqueda}».` : 'Revisa las otras pestañas.'}
          </EmptyState>
        ) : (
          <ul className="ferias-pub-grid">
            {ordenadas.map((f) => (
              <li key={f.id}>
                <TarjetaFeria feria={f} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function TarjetaFeria({ feria: f }: { feria: Feria }) {
  const est = ESTADO[f.estado];
  return (
    <Link to={`/ferias/${encodeURIComponent(f.id)}`} className="card feria-card feria-pub-card">
      <div className="feria-card-top">
        <span className={`badge tone-${est.tone}`}>{est.label}</span>
        {f.estado !== 'finalizada' && (
          <span className={`feria-insc ${f.abierta ? 'is-open' : ''}`}>
            {f.abierta ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}
          </span>
        )}
      </div>
      <h3 className="feria-card-title">{f.nombre}</h3>
      <div className="feria-card-meta muted small">
        <span>
          <CalendarDays size={14} /> {rangoFechas(f.fechaInicio, f.fechaFin)}
        </span>
        {f.lugar && (
          <span>
            <MapPin size={14} /> {f.lugar}
          </span>
        )}
        <span>
          <Store size={14} /> {f.totalEmpresas} {f.totalEmpresas === 1 ? 'empresa' : 'empresas'}
        </span>
      </div>
      <span className="flow-link feria-pub-link">
        Ver feria <ArrowRight size={15} />
      </span>
    </Link>
  );
}
