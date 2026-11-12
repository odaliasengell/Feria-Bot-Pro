import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  Check,
  ChevronRight,
  Eye,
  Mail,
  MapPin,
  PartyPopper,
  Phone,
  ScanLine,
  Store,
  WifiOff,
} from 'lucide-react';
import type { EstadoFeria, Feria } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { feriasApi, inscripcionesApi, leadsApi, visitantesApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { useEnLinea } from '../../lib/useEnLinea';
import { haceCuanto, hoyISO, rangoFechas, type Tone } from '../../lib/utils';
import { Alert, Avatar, Card, EmptyState, Loader, Modal } from '../../components/ui';
import { mensajeError, useToast } from '../../context/ToastContext';
import { TarjetaVisitante } from '../../components/Credenciales';
import PortadaFeria from '../../components/PortadaFeria';

const ESTADO: Record<EstadoFeria, { label: string; tone: Tone }> = {
  en_curso: { label: 'En curso', tone: 'teal' },
  proxima: { label: 'Próxima', tone: 'blue' },
  finalizada: { label: 'Finalizada', tone: 'gray' },
};
const ORDEN: Record<EstadoFeria, number> = { en_curso: 0, proxima: 1, finalizada: 2 };

/** En curso primero, luego las próximas (la más cercana primero) y al final las finalizadas (la más reciente primero). */
function ordenarFerias(a: Feria, b: Feria): number {
  if (a.estado !== b.estado) return ORDEN[a.estado] - ORDEN[b.estado];
  return a.estado === 'proxima' ? a.fechaInicio.localeCompare(b.fechaInicio) : b.fechaInicio.localeCompare(a.fechaInicio);
}

/** «Hoy», «Mañana», «En 5 días», «Hasta el 30 nov», «Terminó el 9 nov». */
function cuando(f: Feria): string {
  const dia = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y!, m! - 1, d!);
  };
  const corto = (iso: string) => dia(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  if (f.estado === 'finalizada') return `Terminó el ${corto(f.fechaFin)}`;
  if (f.estado === 'en_curso') return f.fechaFin === hoyISO() ? 'Último día' : `Hasta el ${corto(f.fechaFin)}`;
  const dias = Math.round((dia(f.fechaInicio).getTime() - dia(hoyISO()).getTime()) / 86_400_000);
  return dias <= 1 ? 'Empieza mañana' : `Empieza en ${dias} días`;
}

function mapsUrl(lugar: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;
}

export default function VisitanteTarjeta() {
  const { session } = useAuth();
  const id = session?.refId ?? '';
  const [params, setParams] = useSearchParams();
  const pedida = params.get('feria');
  const enLinea = useEnLinea();
  const { data, cargando, recargar } = useAsync(
    () =>
      Promise.all([
        visitantesApi.obtener(id),
        inscripcionesApi.listar(),
        leadsApi.listar({ visitanteId: id }),
        vistasApi.listar({ visitanteId: id }),
        feriasApi.listar(true),
        pedida ? feriasApi.obtener(pedida) : Promise.resolve(null),
      ]),
    [id, pedida],
  );
  const [inscribiendo, setInscribiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Feria cuya inscripción se está por cancelar (abre la confirmación). */
  const [cancelando, setCancelando] = useState<Feria | null>(null);
  const [quitando, setQuitando] = useState(false);
  const toast = useToast();

  if (cargando && !data) return <Loader />;
  const [visitante, inscripciones, leads, vistas, abiertas, feriaPedida] = data ?? [null, [], [], [], [], null];
  if (!visitante)
    return enLinea ? (
      <Alert>No encontramos tu registro. Vuelve a ingresar.</Alert>
    ) : (
      <Alert>
        <WifiOff size={16} style={{ verticalAlign: -3 }} /> Sin conexión. Abre tu tarjeta una vez con internet para tenerla
        disponible sin conexión.
      </Alert>
    );

  const misFerias = inscripciones
    .map((i) => i.feria)
    .filter((f): f is Feria => !!f)
    .sort(ordenarFerias);
  const inscritoEn = new Set(misFerias.map((f) => f.id));
  const actual = misFerias.find((f) => f.id === pedida) ?? misFerias[0] ?? null;
  const otras = abiertas.filter((f) => !inscritoEn.has(f.id));
  const ofrecer = feriaPedida && !inscritoEn.has(feriaPedida.id) ? feriaPedida : null;

  const leadsFeria = leads.filter((l) => l.empresa?.feriaId === actual?.id);
  const vistasFeria = vistas.filter((v) => v.empresa?.feriaId === actual?.id);

  function verFeria(feriaId: string) {
    const p = new URLSearchParams(params);
    p.set('feria', feriaId);
    p.delete('nuevo');
    setParams(p, { replace: true });
  }

  async function inscribirme(f: Feria) {
    setInscribiendo(f.id);
    setError(null);
    try {
      await inscripcionesApi.inscribir(f.id);
      verFeria(f.id);
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la inscripción');
    } finally {
      setInscribiendo(null);
    }
  }

  async function cancelarInscripcion(f: Feria) {
    setQuitando(true);
    try {
      await inscripcionesApi.quitar(f.id, id);
      setCancelando(null);
      toast.exito(`Cancelaste tu inscripción a «${f.nombre}».`);
      const p = new URLSearchParams(params);
      p.delete('feria');
      p.delete('nuevo');
      setParams(p, { replace: true });
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo cancelar la inscripción.'));
    } finally {
      setQuitando(false);
    }
  }

  const encabezado = (
    <>
      <div className="visitante-saludo">
        <h1>Hola, {visitante.nombre.split(' ')[0]} 👋</h1>
        <p className="muted">
          {misFerias.length === 0
            ? 'Inscríbete a una feria para recibir tu tarjeta con QR.'
            : misFerias.length === 1
              ? 'Estás inscrito en 1 feria. Presenta tu QR en los stands.'
              : `Estás inscrito en ${misFerias.length} ferias. Elige una para ver su tarjeta y tu historial.`}
        </p>
      </div>

      {params.get('nuevo') && (
        <Alert tone="teal">
          <PartyPopper size={18} /> ¡Listo! Esta es tu tarjeta. Guárdala en tu celular o imprímela.
        </Alert>
      )}
      {!enLinea && (
        <Alert tone="gray">
          <WifiOff size={16} style={{ verticalAlign: -3 }} /> Sin conexión: ves tu tarjeta guardada. Tu QR funciona igual en los stands.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}

      {ofrecer && (
        <div className="card feria-oferta">
          <div className="grow">
            <span className="eyebrow dark">¿Vas a esta feria?</span>
            <strong>{ofrecer.nombre}</strong>
            <span className="muted small">
              {rangoFechas(ofrecer.fechaInicio, ofrecer.fechaFin)}
              {ofrecer.lugar && ` · ${ofrecer.lugar}`}
            </span>
          </div>
          {ofrecer.abierta && ofrecer.llena ? (
            <span className="badge tone-orange">Feria llena</span>
          ) : ofrecer.abierta ? (
            <button className="btn btn-teal" onClick={() => inscribirme(ofrecer)} disabled={inscribiendo !== null}>
              <CalendarPlus size={17} /> {inscribiendo === ofrecer.id ? 'Inscribiendo…' : 'Inscribirme con mi cuenta'}
            </button>
          ) : (
            <span className="badge tone-orange">Inscripciones cerradas</span>
          )}
        </div>
      )}

      {misFerias.length > 0 && (
        <section className="mis-ferias" aria-label="Mis ferias">
          <h2 className="mis-ferias-titulo">Mis ferias</h2>
          <div className="mis-ferias-lista" role="tablist">
            {misFerias.map((f) => {
              const sel = f.id === actual?.id;
              const est = ESTADO[f.estado];
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={sel}
                  className={`mi-feria ${sel ? 'is-sel' : ''} ${f.estado === 'finalizada' ? 'is-pasada' : ''}`}
                  onClick={() => verFeria(f.id)}
                >
                  <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} variante="mini" />
                  <span className="mi-feria-texto">
                    <strong>{f.nombre}</strong>
                    <span className="muted small">{rangoFechas(f.fechaInicio, f.fechaFin)}</span>
                    <span className={`badge tone-${est.tone}`}>{est.label}</span>
                  </span>
                  {sel && (
                    <span className="mi-feria-check" aria-hidden="true">
                      <Check size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );

  return (
    <>


      {!actual ? (
        <>
          {encabezado}
          <Card>
            <EmptyState icon={<CalendarDays />} title="Aún no estás inscrito en ninguna feria">
              Elige una de las ferias abiertas para obtener tu tarjeta.
            </EmptyState>
          </Card>
        </>
      ) : (
        // El QR arriba a la izquierda desde el principio de la página; el resto, a la derecha.
        <div className="visitor-layout visitor-layout-arriba">
          <div className="visitor-qr">
            <TarjetaVisitante visitante={visitante} feria={actual} />
          </div>

          <div className="stack">
            <div className="visitor-encabezado">{encabezado}</div>
            <section className="feria-sel">
              <PortadaFeria nombre={actual.nombre} portada={actual.portada} portadaAlt={actual.portadaAlt} variante="detalle" className="feria-sel-portada" />
              <div className="feria-sel-info">
                <div className="feria-sel-badges">
                  <span className={`badge tone-${ESTADO[actual.estado].tone}`}>{ESTADO[actual.estado].label}</span>
                  <span className="feria-sel-cuando">{cuando(actual)}</span>
                </div>
                <h2>{actual.nombre}</h2>
                <ul className="feria-sel-meta">
                  <li>
                    <CalendarDays size={16} /> {rangoFechas(actual.fechaInicio, actual.fechaFin)}
                  </li>
                  {actual.lugar && (
                    <li>
                      <MapPin size={16} />
                      <a href={mapsUrl(actual.lugar)} target="_blank" rel="noopener noreferrer">
                        {actual.lugar}
                      </a>
                    </li>
                  )}
                </ul>
                <div className="feria-sel-acciones">
                  {actual.estado !== 'finalizada' && (
                    <Link to="/visitante/escanear" className="btn btn-teal">
                      <ScanLine size={17} /> Escanear stand
                    </Link>
                  )}
                  <Link to={`/ferias/${encodeURIComponent(actual.id)}`} className="btn btn-outline">
                    Ver feria <ArrowRight size={16} />
                  </Link>
                  {enLinea && (
                    <button type="button" className="link-btn cancelar-inscripcion no-print" onClick={() => setCancelando(actual)}>
                      <CalendarX size={15} /> Cancelar inscripción
                    </button>
                  )}
                </div>
              </div>
            </section>
            <Card title="Empresas que registraron tu visita" action={<span className="count-pill">{leadsFeria.length}</span>}>
              {leadsFeria.length === 0 ? (
                <EmptyState icon={<Store />} title="Aún nadie escaneó tu QR">
                  Cuando una empresa de esta feria escanee tu tarjeta aparecerá aquí con sus datos de contacto.
                </EmptyState>
              ) : (
                <ul className="company-list">
                  {leadsFeria.map((l) =>
                    l.empresa ? (
                      <li key={l.id}>
                        <Avatar nombre={l.empresa.nombre} src={l.empresa.logo} size={44} square />
                        <div className="grow">
                          <strong>{l.empresa.nombre}</strong>
                          <span className="muted small">
                            Stand {l.empresa.stand} · {haceCuanto(l.creadoEn)}
                          </span>
                          <div className="cell-contact inline">
                            <a href={`mailto:${l.empresa.email}`}>
                              <Mail size={13} /> {l.empresa.email}
                            </a>
                            <a href={`tel:${l.empresa.telefono}`}>
                              <Phone size={13} /> {l.empresa.telefono}
                            </a>
                          </div>
                        </div>
                        <Link to={`/ficha/${l.empresa.id}`} className="icon-btn" aria-label="Ver ficha">
                          <ChevronRight size={18} />
                        </Link>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
            </Card>

            <Card title="Fichas que visitaste" action={<span className="count-pill">{vistasFeria.length}</span>}>
              {vistasFeria.length === 0 ? (
                <EmptyState icon={<Eye />} title="Todavía no escaneaste stands">
                  <Link to="/visitante/escanear" className="btn btn-outline btn-sm">Escanear un stand</Link>
                </EmptyState>
              ) : (
                <ul className="company-list">
                  {vistasFeria.map((v) =>
                    v.empresa ? (
                      <li key={v.id}>
                        <Avatar nombre={v.empresa.nombre} src={v.empresa.logo} size={40} square />
                        <div className="grow">
                          <strong>{v.empresa.nombre}</strong>
                          <span className="muted small">
                            {v.empresa.rubro} · {haceCuanto(v.creadoEn)}
                          </span>
                        </div>
                        <Link to={`/ficha/${v.empresa.id}`} className="icon-btn" aria-label="Ver ficha">
                          <ChevronRight size={18} />
                        </Link>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {otras.filter((f) => f.id !== ofrecer?.id).length > 0 && (
        <Card title="Inscríbete a otra feria" className="mt">
          <p className="muted small">Usas la misma cuenta y el mismo código QR en todas tus ferias.</p>
          <ul className="company-list">
            {otras
              .filter((f) => f.id !== ofrecer?.id)
              .map((f) => (
                <li key={f.id}>
                  <div className="grow">
                    <strong>{f.nombre}</strong>
                    <span className="feria-card-meta muted small">
                      <span>
                        <CalendarDays size={13} /> {rangoFechas(f.fechaInicio, f.fechaFin)}
                      </span>
                      {f.lugar && (
                        <span>
                          <MapPin size={13} /> {f.lugar}
                        </span>
                      )}
                    </span>
                  </div>
                  {f.llena ? (
                    <span className="badge tone-orange">Feria llena</span>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => inscribirme(f)} disabled={inscribiendo !== null}>
                      <CalendarPlus size={15} /> {inscribiendo === f.id ? 'Inscribiendo…' : 'Inscribirme'}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Modal open={cancelando !== null} onClose={() => !quitando && setCancelando(null)} title="¿Cancelar tu inscripción?">
        {cancelando && (
          <div className="stack">
            <p>
              Vas a dejar de estar inscrito en <b>{cancelando.nombre}</b>.
            </p>
            <ul className="lista-consecuencias">
              <li>Tu tarjeta ya no servirá en los stands de esta feria.</li>
              <li>Se borra tu historial en esta feria: las empresas que escanearon tu QR aquí dejarán de ver tus datos.</li>
              <li>Tu cuenta, tu código y tus otras ferias se mantienen. Puedes volver a inscribirte mientras las inscripciones estén abiertas.</li>
            </ul>
            <div className="row-gap">
              <button type="button" className="btn btn-danger" onClick={() => cancelarInscripcion(cancelando)} disabled={quitando}>
                <CalendarX size={16} /> {quitando ? 'Cancelando…' : 'Sí, cancelar inscripción'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCancelando(null)} disabled={quitando}>
                Volver
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
