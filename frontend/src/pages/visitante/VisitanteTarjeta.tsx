import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, CalendarX, ChevronRight, Eye, Mail, MapPin, PartyPopper, Phone, ScanLine, Store, WifiOff } from 'lucide-react';
import type { Feria } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { feriasApi, inscripcionesApi, leadsApi, visitantesApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { useEnLinea } from '../../lib/useEnLinea';
import { haceCuanto, rangoFechas } from '../../lib/utils';
import { Alert, Avatar, Card, EmptyState, Loader, Modal } from '../../components/ui';
import { mensajeError, useToast } from '../../context/ToastContext';
import { TarjetaVisitante } from '../../components/Credenciales';

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

  const misFerias = inscripciones.map((i) => i.feria).filter((f): f is Feria => !!f);
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

  return (
    <>
      <div className="visitor-hero">
        <div>
          <span className="eyebrow dark">Hola,</span>
          <h1>{visitante.nombre.split(' ')[0]} 👋</h1>
          <p className="muted">Presenta tu QR en los stands y escanea el QR de cada stand para conocer a las empresas.</p>
        </div>
        {actual && (
          <Link to="/visitante/escanear" className="btn btn-teal">
            <ScanLine size={17} /> Escanear stand
          </Link>
        )}
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

      {misFerias.length > 1 && (
        <div className="seg feria-tabs" role="tablist" aria-label="Mis ferias">
          {misFerias.map((f) => (
            <button key={f.id} role="tab" aria-selected={f.id === actual?.id} className={f.id === actual?.id ? 'active' : ''} onClick={() => verFeria(f.id)}>
              {f.nombre}
            </button>
          ))}
        </div>
      )}

      {!actual ? (
        <Card>
          <EmptyState icon={<CalendarDays />} title="Aún no estás inscrito en ninguna feria">
            Elige una de las ferias abiertas para obtener tu tarjeta.
          </EmptyState>
        </Card>
      ) : (
        <div className="visitor-layout">
          <div className="stack">
            <TarjetaVisitante visitante={visitante} feria={actual} />
            {enLinea && (
              <button type="button" className="link-btn cancelar-inscripcion no-print" onClick={() => setCancelando(actual)}>
                <CalendarX size={15} /> Cancelar mi inscripción a esta feria
              </button>
            )}
          </div>

          <div className="stack">
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
