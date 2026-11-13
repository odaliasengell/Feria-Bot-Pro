import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, CalendarCheck, MapPin, QrCode, ScanLine, Search, Store, Users, X } from 'lucide-react';
import type { EstadoFeria, Feria } from '../types';
import { feriasApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { normalizar, rangoFechas, type Tone } from '../lib/utils';
import { Alert, EmptyState, Loader } from '../components/ui';
import PortadaFeria from '../components/PortadaFeria';
import { usePagina } from '../lib/seo';

type Filtro = 'todas' | EstadoFeria;

const PESTANAS: { filtro: Filtro; label: string; vacio: string }[] = [
  { filtro: 'todas', label: 'Todas', vacio: 'Todavía no hay ferias publicadas.' },
  { filtro: 'en_curso', label: 'En curso', vacio: 'No hay ferias en curso en este momento.' },
  { filtro: 'proxima', label: 'Próximas', vacio: 'No hay ferias próximas por ahora.' },
  { filtro: 'finalizada', label: 'Finalizadas', vacio: 'Todavía no hay ferias finalizadas.' },
];

const ESTADO: Record<EstadoFeria, { label: string; tone: Tone }> = {
  proxima: { label: 'Próxima', tone: 'blue' },
  en_curso: { label: 'En curso', tone: 'teal' },
  finalizada: { label: 'Finalizada', tone: 'gray' },
};

const ORDEN_ESTADO: Record<EstadoFeria, number> = { en_curso: 0, proxima: 1, finalizada: 2 };

function esFiltro(v: string | null): v is Filtro {
  return v === 'todas' || v === 'proxima' || v === 'en_curso' || v === 'finalizada';
}

/** En curso primero, luego las próximas (la más cercana primero) y al final las finalizadas (la más reciente primero). */
function ordenar(a: Feria, b: Feria): number {
  if (a.estado !== b.estado) return ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado];
  if (a.estado === 'proxima') return a.fechaInicio.localeCompare(b.fechaInicio);
  return b.fechaInicio.localeCompare(a.fechaInicio);
}

/** La feria que se destaca arriba: la que más convoca entre las abiertas en curso, si no la próxima más cercana. */
function elegirDestacada(ferias: Feria[]): Feria | null {
  const enCurso = ferias.filter((f) => f.estado === 'en_curso').sort((a, b) => Number(b.abierta) - Number(a.abierta) || b.totalVisitantes - a.totalVisitantes);
  const proximas = ferias.filter((f) => f.estado === 'proxima').sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  return enCurso[0] ?? proximas[0] ?? null;
}

/** Página pública (sin sesión) con las ferias por estado, una feria destacada y un buscador por nombre o lugar. */
export default function Ferias() {
  const [params, setParams] = useSearchParams();
  const filtroParam = params.get('estado');
  const filtro: Filtro = esFiltro(filtroParam) ? filtroParam : 'todas';
  const [busqueda, setBusqueda] = useState('');

  // Una sola llamada con todas las ferias: así cada pestaña muestra cuántas tiene.
  const { data, cargando, error, recargar } = useAsync(() => feriasApi.listar(), []);

  usePagina({
    titulo: 'Ferias',
    descripcion: 'Calendario de ferias: las que están en curso, las próximas y las que ya terminaron. Regístrate y recibe tu tarjeta con QR.',
  });

  const todas = useMemo(() => [...(data ?? [])].sort(ordenar), [data]);
  const cantidad = useMemo(() => {
    const c: Record<Filtro, number> = { todas: todas.length, en_curso: 0, proxima: 0, finalizada: 0 };
    for (const f of todas) c[f.estado] += 1;
    return c;
  }, [todas]);
  const destacada = useMemo(() => elegirDestacada(todas), [todas]);

  const cifras = useMemo(() => {
    const vigentes = todas.filter((f) => f.estado !== 'finalizada');
    return {
      abiertas: todas.filter((f) => f.abierta).length,
      empresas: vigentes.reduce((n, f) => n + f.totalEmpresas, 0),
      inscritos: todas.reduce((n, f) => n + f.totalVisitantes, 0),
    };
  }, [todas]);

  const q = normalizar(busqueda.trim());
  const visibles = todas
    .filter((f) => filtro === 'todas' || f.estado === filtro)
    .filter((f) => !q || normalizar(f.nombre).includes(q) || normalizar(f.lugar).includes(q))
    // En «Todas» sin búsqueda, la destacada ya se ve arriba: no se repite en la cuadrícula.
    .filter((f) => !(filtro === 'todas' && !q && f.id === destacada?.id));

  const pestana = PESTANAS.find((p) => p.filtro === filtro)!;
  // Para el aviso de pestaña vacía: la pestaña con más ferias a la que conviene ir.
  const alternativa = PESTANAS.filter((p) => p.filtro !== 'todas' && p.filtro !== filtro && cantidad[p.filtro] > 0).sort(
    (a, b) => cantidad[b.filtro] - cantidad[a.filtro],
  )[0];

  const cambiarFiltro = (f: Filtro) => setParams(f === 'todas' ? {} : { estado: f }, { replace: true });

  return (
    <div className="landing">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link to="/" className="brand">
            <img src="/logo-64.png" alt="" width={32} height={32} />
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
        <header className={`ferias-hero ${destacada ? '' : 'sin-destacada'}`}>
          <div className="ferias-hero-texto">
            <span className="tag-mint">Calendario</span>
            <h1>Ferias en FeriaBot Pro.</h1>
            <p>
              Elige la feria a la que vas a ir, regístrate en un minuto y recibe tu tarjeta con QR para que las empresas
              guarden tu visita en cada stand.
            </p>
            {data && (
              <ul className="ferias-cifras" aria-label="Resumen">
                <li>
                  <CalendarCheck size={18} />
                  <b>{cifras.abiertas}</b>
                  <span>{cifras.abiertas === 1 ? 'feria con inscripciones abiertas' : 'ferias con inscripciones abiertas'}</span>
                </li>
                <li>
                  <Store size={18} />
                  <b>{cifras.empresas}</b>
                  <span>{cifras.empresas === 1 ? 'empresa participante' : 'empresas participantes'}</span>
                </li>
                <li>
                  <Users size={18} />
                  <b>{cifras.inscritos}</b>
                  <span>{cifras.inscritos === 1 ? 'inscripción de visitantes' : 'inscripciones de visitantes'}</span>
                </li>
              </ul>
            )}
          </div>
          {destacada && <FeriaDestacada feria={destacada} />}
        </header>

        <div className="ferias-pub-bar" id="calendario">
          <div className="tabs" role="tablist" aria-label="Estado de la feria">
            {PESTANAS.map((p) => (
              <button
                key={p.filtro}
                type="button"
                role="tab"
                aria-selected={p.filtro === filtro}
                className={`tab${p.filtro === filtro ? ' is-active' : ''}`}
                onClick={() => cambiarFiltro(p.filtro)}
              >
                {p.label}
                {data && <span className="tab-cuenta">{cantidad[p.filtro]}</span>}
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
        ) : visibles.length === 0 ? (
          filtro === 'todas' && !q && destacada ? (
            <p className="muted center ferias-solo-destacada">Por ahora esta es la única feria publicada. ¡Pronto habrá más!</p>
          ) : (
            <EmptyState icon={<CalendarDays />} title={q ? 'Sin resultados' : pestana.vacio}>
              {q ? (
                <>
                  Ninguna feria coincide con «{busqueda}».{' '}
                  <button type="button" className="link-btn" onClick={() => setBusqueda('')}>
                    Limpiar búsqueda
                  </button>
                </>
              ) : alternativa ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => cambiarFiltro(alternativa.filtro)}>
                  Ver ferias {alternativa.label.toLowerCase()} ({cantidad[alternativa.filtro]}) <ArrowRight size={15} />
                </button>
              ) : (
                'Vuelve pronto: aquí aparecerán las próximas ferias.'
              )}
            </EmptyState>
          )
        ) : (
          <ul className="ferias-pub-grid">
            {visibles.map((f) => (
              <li key={f.id}>
                <TarjetaFeria feria={f} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <section className="ferias-como">
        <div className="ferias-como-inner">
          <h2>¿Cómo funciona?</h2>
          <ol className="ferias-pasos">
            <li>
              <span className="ferias-paso-icono">
                <CalendarDays size={22} />
              </span>
              <b>Elige tu feria</b>
              <span>Revisa las fechas, el lugar y las empresas que participan.</span>
            </li>
            <li>
              <span className="ferias-paso-icono">
                <QrCode size={22} />
              </span>
              <b>Recibe tu tarjeta QR</b>
              <span>Te registras en un minuto y la recibes también en tu correo.</span>
            </li>
            <li>
              <span className="ferias-paso-icono">
                <ScanLine size={22} />
              </span>
              <b>Visita los stands</b>
              <span>Las empresas escanean tu QR y tú guardas sus contactos en tu historial.</span>
            </li>
          </ol>
          <Link to="/registro" className="btn btn-accent btn-lg">
            Registrarme ahora <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function EstadoInscripcion({ feria: f }: { feria: Feria }) {
  if (f.estado === 'finalizada') return null;
  if (f.abierta && f.llena) return <span className="feria-insc">Feria llena</span>;
  return <span className={`feria-insc ${f.abierta ? 'is-open' : ''}`}>{f.abierta ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}</span>;
}

function FeriaDestacada({ feria: f }: { feria: Feria }) {
  const est = ESTADO[f.estado];
  const puedeInscribirse = f.abierta && !f.llena;
  return (
    <article className="feria-destacada">
      <Link to={`/ferias/${encodeURIComponent(f.id)}`} className="feria-destacada-portada" tabIndex={-1} aria-hidden="true">
        <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} variante="detalle" />
        <span className="feria-destacada-sello">{f.estado === 'en_curso' ? 'Ahora' : 'Próximamente'}</span>
      </Link>
      <div className="feria-destacada-cuerpo">
        <div className="feria-card-top">
          <span className={`badge tone-${est.tone}`}>{est.label}</span>
          <EstadoInscripcion feria={f} />
        </div>
        <h2>
          <Link to={`/ferias/${encodeURIComponent(f.id)}`}>{f.nombre}</Link>
        </h2>
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
        <div className="row-gap">
          {puedeInscribirse && (
            <Link to={`/registro/${encodeURIComponent(f.id)}`} className="btn btn-accent">
              Inscribirme
            </Link>
          )}
          <Link to={`/ferias/${encodeURIComponent(f.id)}`} className={`btn ${puedeInscribirse ? 'btn-outline' : 'btn-primary'}`}>
            Ver feria <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function TarjetaFeria({ feria: f }: { feria: Feria }) {
  const est = ESTADO[f.estado];
  return (
    <Link to={`/ferias/${encodeURIComponent(f.id)}`} className="card feria-card feria-pub-card">
      <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} className="feria-card-portada" />
      <div className="feria-card-top">
        <span className={`badge tone-${est.tone}`}>{est.label}</span>
        <EstadoInscripcion feria={f} />
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
