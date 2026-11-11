import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ExternalLink, MapPin, Store } from 'lucide-react';
import type { EstadoFeria, FeriaPublica } from '../types';
import { useAuth } from '../context/AuthContext';
import { feriasApi, inscripcionesApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { rangoFechas, type Tone } from '../lib/utils';
import { Alert, Avatar, EmptyState, Loader } from '../components/ui';
import PortadaFeria from '../components/PortadaFeria';

const ESTADO: Record<EstadoFeria, { label: string; tone: Tone }> = {
  proxima: { label: 'Próxima', tone: 'blue' },
  en_curso: { label: 'En curso', tone: 'teal' },
  finalizada: { label: 'Finalizada', tone: 'gray' },
};

function enlaceMaps(lugar: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;
}

/** Detalle público de una feria (sin sesión): datos, mapa, empresas participantes y botón de inscripción. */
export default function FeriaDetalle() {
  const { id = '' } = useParams();
  const { data: feria, cargando, error, recargar } = useAsync(() => feriasApi.obtenerPublica(id), [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);
  useEffect(() => {
    if (feria) document.title = `${feria.nombre} · FeriaBot Pro`;
  }, [feria]);

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
            <Link to="/ferias" className="btn btn-outline btn-sm">
              <ArrowLeft size={15} /> Ferias
            </Link>
          </div>
        </div>
      </nav>

      <main className="section feria-det">
        {cargando && !feria ? (
          <Loader />
        ) : error && !feria ? (
          <Alert>
            {error}{' '}
            <button type="button" className="link-btn" onClick={recargar}>
              Reintentar
            </button>
          </Alert>
        ) : !feria ? (
          <EmptyState icon={<CalendarDays />} title="Esta feria no existe">
            <Link to="/ferias" className="btn btn-primary">
              Ver todas las ferias
            </Link>
          </EmptyState>
        ) : (
          <Detalle feria={feria} />
        )}
      </main>
    </div>
  );
}

function Detalle({ feria }: { feria: FeriaPublica }) {
  const est = ESTADO[feria.estado];
  return (
    <>
      <PortadaFeria nombre={feria.nombre} portada={feria.portada} portadaAlt={feria.portadaAlt} variante="detalle" className="feria-det-portada" />
      <header className="feria-det-head">
        <div className="feria-det-info">
          <div className="feria-det-badges">
            <span className={`badge tone-${est.tone}`}>{est.label}</span>
            {feria.estado !== 'finalizada' &&
              (feria.abierta && feria.llena ? (
                <span className="badge tone-orange">Feria llena</span>
              ) : (
                <span className={`feria-insc ${feria.abierta ? 'is-open' : ''}`}>
                  {feria.abierta ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}
                </span>
              ))}
          </div>
          <h1>{feria.nombre}</h1>
          <ul className="feria-det-meta">
            <li>
              <CalendarDays size={17} /> {rangoFechas(feria.fechaInicio, feria.fechaFin)}
            </li>
            {feria.lugar && (
              <li>
                <MapPin size={17} />
                <a href={enlaceMaps(feria.lugar)} target="_blank" rel="noopener noreferrer">
                  {feria.lugar} <ExternalLink size={13} />
                </a>
              </li>
            )}
            <li>
              <Store size={17} /> {feria.totalEmpresas} {feria.totalEmpresas === 1 ? 'empresa participante' : 'empresas participantes'}
            </li>
          </ul>
          {feria.descripcion && <p className="feria-det-desc">{feria.descripcion}</p>}
        </div>
        <Inscribirme feria={feria} />
      </header>

      <section className="feria-det-empresas">
        <h2>Empresas participantes</h2>
        {feria.empresas.length === 0 ? (
          <EmptyState icon={<Store />} title="Empresas por confirmar">
            Pronto publicaremos las empresas que participarán en esta feria. Vuelve a revisar más adelante.
          </EmptyState>
        ) : (
          <ul className="empresas-pub-grid">
            {feria.empresas.map((e) => (
              <li key={e.id}>
                <Link to={`/ficha/${encodeURIComponent(e.id)}`} className="card empresa-pub-card">
                  <Avatar nombre={e.nombre} src={e.logo ?? undefined} size={56} square />
                  <div className="grow">
                    <strong>{e.nombre}</strong>
                    {e.rubro && <span className="muted small">{e.rubro}</span>}
                  </div>
                  {e.stand && <span className="code">Stand {e.stand}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * Sin sesión (u otro rol): lleva al registro de la feria. Visitante con sesión: se inscribe con su cuenta
 * (inscripcionesApi.inscribir); si ya está inscrito lo indica y enlaza a su tarjeta.
 */
function Inscribirme({ feria }: { feria: FeriaPublica }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const esVisitante = session?.role === 'visitante' && !!session.refId;
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: inscrito, cargando } = useAsync(
    () =>
      esVisitante
        ? inscripcionesApi.listar({ visitanteId: session!.refId, feriaId: feria.id }).then((l) => l.some((i) => i.feriaId === feria.id))
        : Promise.resolve(false),
    [esVisitante, session?.refId, feria.id],
  );

  const tarjeta = `/visitante?feria=${encodeURIComponent(feria.id)}`;

  async function inscribir() {
    setEnviando(true);
    setError(null);
    try {
      await inscripcionesApi.inscribir(feria.id);
      navigate(tarjeta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la inscripción');
      setEnviando(false);
    }
  }

  let contenido;
  if (esVisitante && cargando) {
    contenido = <Loader label="Revisando tu inscripción…" />;
  } else if (esVisitante && inscrito) {
    contenido = (
      <>
        <p className="feria-cta-ok">
          <Check size={18} /> Ya estás inscrito en esta feria.
        </p>
        <Link to={tarjeta} className="btn btn-primary btn-block">
          Ver mi tarjeta QR <ArrowRight size={16} />
        </Link>
      </>
    );
  } else if (feria.abierta && feria.llena) {
    contenido = (
      <>
        <p className="muted small">Se alcanzó el aforo de la feria.</p>
        <button type="button" className="btn btn-outline btn-block" disabled>
          Feria llena
        </button>
      </>
    );
  } else if (!feria.abierta) {
    contenido = (
      <>
        <p className="muted small">
          {feria.estado === 'finalizada' ? 'Esta feria ya terminó.' : 'Las inscripciones para esta feria están cerradas.'}
        </p>
        <button type="button" className="btn btn-outline btn-block" disabled>
          Inscripciones cerradas
        </button>
      </>
    );
  } else if (esVisitante) {
    contenido = (
      <>
        <p className="muted small">Te inscribes con tu cuenta y usas la misma tarjeta QR.</p>
        <button type="button" className="btn btn-teal btn-lg btn-block" onClick={inscribir} disabled={enviando}>
          {enviando ? 'Inscribiendo…' : 'Inscribirme'} <ArrowRight size={18} />
        </button>
      </>
    );
  } else {
    contenido = (
      <>
        <p className="muted small">Regístrate en un minuto y recibe tu credencial con QR.</p>
        <Link to={`/registro/${encodeURIComponent(feria.id)}`} className="btn btn-teal btn-lg btn-block">
          Inscribirme <ArrowRight size={18} />
        </Link>
        <p className="muted small center">
          ¿Ya tienes cuenta? <Link to={`/ingresar?rol=visitante&feria=${encodeURIComponent(feria.id)}`}>Ingresa</Link>
        </p>
      </>
    );
  }

  return (
    <aside className="card feria-cta">
      <h3>Inscripción</h3>
      {contenido}
      {error && <Alert>{error}</Alert>}
    </aside>
  );
}
