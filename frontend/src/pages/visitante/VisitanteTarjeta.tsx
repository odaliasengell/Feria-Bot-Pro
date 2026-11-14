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
import type { Feria } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { feriasApi, inscripcionesApi, leadsApi, visitantesApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { useEnLinea } from '../../lib/useEnLinea';
import { haceCuanto, rangoFechas } from '../../lib/utils';
import { Alert, Avatar, Card, EmptyState, Loader, Modal } from '../../components/ui';
import { mensajeError, useToast } from '../../context/ToastContext';
import { TarjetaVisitante } from '../../components/Credenciales';
import PortadaFeria from '../../components/PortadaFeria';
import { ESTADO_FERIA as ESTADO, cuandoFeria as cuando, mapsUrl, ordenarFerias } from '../../lib/ferias';

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

  const todas = inscripciones
    .map((i) => i.feria)
    .filter((f): f is Feria => !!f)
    .sort(ordenarFerias);
  // Mi tarjeta es para la feria actual: las que ya terminaron están en «Ferias» (historial).
  const misFerias = todas.filter((f) => f.estado !== 'finalizada');
  const pasadas = todas.length - misFerias.length;
  const inscritoEn = new Set(todas.map((f) => f.id));
  const actual = misFerias.find((f) => f.id === pedida) ?? misFerias[0] ?? null;
  const otras = abiertas.filter((f) => !inscritoEn.has(f.id));
  const ofrecer = feriaPedida && !inscritoEn.has(feriaPedida.id) ? feriaPedida : null;
  /** Ferias abiertas en las que aún no está (sin contar la que se le ofrece arriba). */
  const nuevasFerias = otras.filter((f) => f.id !== ofrecer?.id).length;

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
            ? pasadas > 0
              ? 'Tus ferias ya terminaron. Revisa tu historial o inscríbete a una nueva.'
              : 'Inscríbete a una feria para recibir tu tarjeta con QR.'
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
            <EmptyState
              icon={<CalendarDays />}
              title={pasadas > 0 ? 'No tienes ferias en curso ni próximas' : 'Aún no estás inscrito en ninguna feria'}
            >
              <Link to="/visitante/ferias" className="btn btn-primary btn-sm">
                {pasadas > 0 ? 'Ver mi historial y otras ferias' : 'Ver ferias para inscribirme'} <ArrowRight size={15} />
              </Link>
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

      {(nuevasFerias > 0 || pasadas > 0) && actual && (
        <Link to="/visitante/ferias" className="vf-aviso">
          <CalendarPlus size={18} />
          <span>
            {[
              nuevasFerias > 0 && `Hay ${nuevasFerias} ${nuevasFerias === 1 ? 'feria abierta' : 'ferias abiertas'} para inscribirte`,
              pasadas > 0 && `${nuevasFerias > 0 ? 'y' : 'Revisa'} el historial de tus ${pasadas === 1 ? 'feria anterior' : `${pasadas} ferias anteriores`}`,
            ]
              .filter(Boolean)
              .join(' ')}
            .
          </span>
          <b>
            Ver ferias <ArrowRight size={15} />
          </b>
        </Link>
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
