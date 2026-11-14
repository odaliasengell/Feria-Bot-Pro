import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, CalendarPlus, ChevronDown, ChevronUp, DoorOpen, Eye, History, IdCard, Mail, MapPin, Phone, Store } from 'lucide-react';
import type { Feria, Inscripcion, LeadDetalle, VistaDetalle } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mensajeError, useToast } from '../../context/ToastContext';
import { feriasApi, inscripcionesApi, leadsApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { fechaHora, rangoFechas } from '../../lib/utils';
import { ESTADO_FERIA, cuandoFeria, mapsUrl, ordenarFerias } from '../../lib/ferias';
import { Alert, Avatar, EmptyState, Loader, PageHeader } from '../../components/ui';
import PortadaFeria from '../../components/PortadaFeria';

/** «Ferias» del visitante: las vigentes, su historial de ferias anteriores y las abiertas para inscribirse. */
export default function VisitanteFerias() {
  const { session } = useAuth();
  const id = session?.refId ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const { data, cargando, error, recargar } = useAsync(
    () => Promise.all([inscripcionesApi.listar(), leadsApi.listar({ visitanteId: id }), vistasApi.listar({ visitanteId: id }), feriasApi.listar(true)]),
    [id],
  );
  const [inscribiendo, setInscribiendo] = useState<string | null>(null);

  if (cargando && !data) return <Loader />;
  if (error && !data)
    return (
      <Alert>
        {error}{' '}
        <button type="button" className="link-btn" onClick={recargar}>
          Reintentar
        </button>
      </Alert>
    );
  const [inscripciones, leads, vistas, abiertas] = data ?? [[], [], [], []];

  const conFeria = inscripciones.filter((i): i is Inscripcion & { feria: Feria } => !!i.feria).sort((a, b) => ordenarFerias(a.feria, b.feria));
  const vigentes = conFeria.filter((i) => i.feria.estado !== 'finalizada');
  const pasadas = conFeria.filter((i) => i.feria.estado === 'finalizada');
  const inscritoEn = new Set(conFeria.map((i) => i.feriaId));
  const disponibles = abiertas.filter((f) => !inscritoEn.has(f.id)).sort(ordenarFerias);

  const leadsDe = (feriaId: string) => leads.filter((l) => l.empresa?.feriaId === feriaId);
  const vistasDe = (feriaId: string) => vistas.filter((v) => v.empresa?.feriaId === feriaId);

  async function inscribirme(f: Feria) {
    setInscribiendo(f.id);
    try {
      await inscripcionesApi.inscribir(f.id);
      toast.exito(`Te inscribiste en «${f.nombre}». Tu tarjeta ya está lista.`);
      navigate(`/visitante?feria=${encodeURIComponent(f.id)}`);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo completar la inscripción.'));
      setInscribiendo(null);
    }
  }

  return (
    <>
      <PageHeader title="Mis ferias" subtitle="Tus ferias en curso y próximas, el historial de las anteriores y nuevas ferias para inscribirte." />

      <section className="vf-seccion">
        <h2 className="vf-titulo">
          <CalendarDays size={18} /> En curso y próximas <span className="count-pill">{vigentes.length}</span>
        </h2>
        {vigentes.length === 0 ? (
          <div className="card">
            <EmptyState icon={<CalendarDays />} title="No tienes ferias en curso ni próximas">
              {disponibles.length > 0 ? 'Inscríbete en una de las ferias abiertas de abajo.' : 'Cuando haya nuevas ferias abiertas aparecerán aquí.'}
            </EmptyState>
          </div>
        ) : (
          <ul className="vf-grid">
            {vigentes.map((i) => (
              <li key={i.id}>
                <TarjetaVigente feria={i.feria} leads={leadsDe(i.feriaId).length} vistas={vistasDe(i.feriaId).length} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="vf-seccion">
        <h2 className="vf-titulo">
          <History size={18} /> Ferias anteriores <span className="count-pill">{pasadas.length}</span>
        </h2>
        {pasadas.length === 0 ? (
          <p className="muted small">Aquí quedará el historial de las ferias a las que fuiste, con los contactos de cada una.</p>
        ) : (
          <ul className="vf-historial">
            {pasadas.map((i) => (
              <li key={i.id}>
                <FilaHistorial inscripcion={i} leads={leadsDe(i.feriaId)} vistas={vistasDe(i.feriaId)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {disponibles.length > 0 && (
        <section className="vf-seccion">
          <h2 className="vf-titulo">
            <CalendarPlus size={18} /> Inscríbete a otra feria <span className="count-pill">{disponibles.length}</span>
          </h2>
          <p className="muted small vf-nota">Usas la misma cuenta y el mismo código QR en todas tus ferias.</p>
          <ul className="vf-grid">
            {disponibles.map((f) => (
              <li key={f.id}>
                <article className="vf-card">
                  <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} className="vf-portada" />
                  <div className="vf-cuerpo">
                    <span className={`badge tone-${ESTADO_FERIA[f.estado].tone}`}>{ESTADO_FERIA[f.estado].label}</span>
                    <h3>{f.nombre}</h3>
                    <Meta feria={f} />
                    <div className="vf-acciones">
                      {f.llena ? (
                        <span className="badge tone-orange">Feria llena</span>
                      ) : (
                        <button type="button" className="btn btn-teal btn-sm" onClick={() => inscribirme(f)} disabled={inscribiendo !== null}>
                          <CalendarPlus size={15} /> {inscribiendo === f.id ? 'Inscribiendo…' : 'Inscribirme'}
                        </button>
                      )}
                      <Link to={`/ferias/${encodeURIComponent(f.id)}`} className="btn btn-ghost btn-sm">
                        Ver feria <ArrowRight size={15} />
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Meta({ feria: f }: { feria: Feria }) {
  return (
    <div className="feria-card-meta muted small">
      <span>
        <CalendarDays size={14} /> {rangoFechas(f.fechaInicio, f.fechaFin)}
      </span>
      {f.lugar && (
        <span>
          <MapPin size={14} />{' '}
          <a href={mapsUrl(f.lugar)} target="_blank" rel="noopener noreferrer">
            {f.lugar}
          </a>
        </span>
      )}
    </div>
  );
}

function TarjetaVigente({ feria: f, leads, vistas }: { feria: Feria; leads: number; vistas: number }) {
  const est = ESTADO_FERIA[f.estado];
  return (
    <article className="vf-card">
      <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} className="vf-portada" />
      <div className="vf-cuerpo">
        <div className="feria-sel-badges">
          <span className={`badge tone-${est.tone}`}>{est.label}</span>
          <span className="feria-sel-cuando">{cuandoFeria(f)}</span>
        </div>
        <h3>{f.nombre}</h3>
        <Meta feria={f} />
        <ul className="vf-cifras">
          <li>
            <Store size={14} /> <b>{leads}</b> {leads === 1 ? 'empresa te registró' : 'empresas te registraron'}
          </li>
          <li>
            <Eye size={14} /> <b>{vistas}</b> {vistas === 1 ? 'ficha visitada' : 'fichas visitadas'}
          </li>
        </ul>
        <div className="vf-acciones">
          <Link to={`/visitante?feria=${encodeURIComponent(f.id)}`} className="btn btn-primary btn-sm">
            <IdCard size={15} /> Ver mi tarjeta
          </Link>
          <Link to={`/ferias/${encodeURIComponent(f.id)}`} className="btn btn-ghost btn-sm">
            Ver feria <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function FilaHistorial({
  inscripcion,
  leads,
  vistas,
}: {
  inscripcion: Inscripcion & { feria: Feria };
  leads: LeadDetalle[];
  vistas: VistaDetalle[];
}) {
  const f = inscripcion.feria;
  const [abierto, setAbierto] = useState(false);
  return (
    <article className={`vf-pasada ${abierto ? 'is-abierta' : ''}`}>
      <div className="vf-pasada-fila">
        <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} variante="mini" />
        <div className="vf-pasada-info">
          <strong>{f.nombre}</strong>
          <span className="muted small">
            {rangoFechas(f.fechaInicio, f.fechaFin)}
            {f.lugar && ` · ${f.lugar}`}
          </span>
          <span className={`vf-asistencia ${inscripcion.asistioEn ? 'si' : ''}`}>
            <DoorOpen size={13} /> {inscripcion.asistioEn ? `Asististe · entrada ${fechaHora(inscripcion.asistioEn)}` : 'Sin registro de entrada'}
          </span>
        </div>
        <ul className="vf-pasada-cifras">
          <li>
            <b>{leads.length}</b>
            <span>{leads.length === 1 ? 'contacto' : 'contactos'}</span>
          </li>
          <li>
            <b>{vistas.length}</b>
            <span>{vistas.length === 1 ? 'ficha' : 'fichas'}</span>
          </li>
        </ul>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} disabled={leads.length + vistas.length === 0}>
          {abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {abierto ? 'Ocultar' : 'Ver contactos'}
        </button>
      </div>

      {abierto && (
        <div className="vf-pasada-detalle">
          {leads.length > 0 && (
            <>
              <h4>Empresas que registraron tu visita</h4>
              <ul className="company-list">
                {leads.map((l) =>
                  l.empresa ? (
                    <li key={l.id}>
                      <Avatar nombre={l.empresa.nombre} src={l.empresa.logo} size={40} square />
                      <div className="grow">
                        <strong>{l.empresa.nombre}</strong>
                        <span className="muted small">
                          {l.empresa.rubro} · Stand {l.empresa.stand}
                        </span>
                        <div className="cell-contact inline">
                          <a href={`mailto:${l.empresa.email}`}>
                            <Mail size={13} /> {l.empresa.email}
                          </a>
                          {l.empresa.telefono && (
                            <a href={`tel:${l.empresa.telefono}`}>
                              <Phone size={13} /> {l.empresa.telefono}
                            </a>
                          )}
                        </div>
                      </div>
                      <Link to={`/ficha/${l.empresa.id}`} className="btn btn-ghost btn-sm">
                        Ficha
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </>
          )}
          {vistas.length > 0 && (
            <>
              <h4>Fichas que visitaste</h4>
              <div className="vf-chips">
                {vistas.map((v) =>
                  v.empresa ? (
                    <Link key={v.id} to={`/ficha/${v.empresa.id}`} className="vf-chip">
                      <Avatar nombre={v.empresa.nombre} src={v.empresa.logo} size={22} square /> {v.empresa.nombre}
                    </Link>
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
