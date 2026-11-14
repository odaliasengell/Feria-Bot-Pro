import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, CreditCard, FileText, Inbox, Landmark, Mail, MapPin, Phone, Receipt, X } from 'lucide-react';
import type { EstadoSolicitud, SolicitudPlan } from '../../types';
import { adminApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { mensajeError, useToast } from '../../context/ToastContext';
import { useConfirmar } from '../../context/ConfirmarContext';
import { PLAN_TONO, dinero } from '../../lib/planes';
import { fechaHora, haceCuanto } from '../../lib/utils';
import { Alert, Avatar, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';
import type { Tone } from '../../lib/utils';
import { LogoTarjeta, marcaDeTexto } from '../../components/MarcasTarjeta';

const ESTADO: Record<EstadoSolicitud, { label: string; tone: Tone }> = {
  pendiente: { label: 'Pendiente', tone: 'orange' },
  pago_pendiente: { label: 'Pago sin completar', tone: 'gray' },
  aprobada: { label: 'Aprobada', tone: 'teal' },
  rechazada: { label: 'Rechazada', tone: 'red' },
};

/** Solicitudes de planes pagadas por transferencia: el encargado revisa el comprobante y aprueba o rechaza. */
export default function AdminSolicitudes() {
  const [filtro, setFiltro] = useState<EstadoSolicitud | ''>('pendiente');
  const { data, cargando, error, recargar } = useAsync(() => adminApi.solicitudes(filtro || undefined), [filtro]);
  const [viendo, setViendo] = useState<SolicitudPlan | null>(null);
  const [rechazando, setRechazando] = useState<SolicitudPlan | null>(null);
  const toast = useToast();
  const confirmar = useConfirmar();

  async function aprobar(s: SolicitudPlan) {
    const ok = await confirmar({
      titulo: 'Aprobar y crear la cuenta',
      mensaje: (
        <>
          <p>
            ¿Confirmas que recibiste <b>{dinero(s.monto)}</b> de <b>{s.nombre}</b>?
          </p>
          <p className="muted small">
            Se crea su cuenta de organizador con el plan {s.planNombre} por {s.periodo === 'anual' ? '1 año' : '1 mes'} desde hoy y le
            enviamos su acceso a {s.email}.
          </p>
        </>
      ),
      confirmar: 'Aprobar y crear cuenta',
    });
    if (!ok) return;
    try {
      const org = await adminApi.aprobarSolicitud(s.id);
      toast.exito(`Cuenta de ${org.nombre} creada. Le enviamos su acceso por correo.`);
      setViendo(null);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo aprobar la solicitud.'));
    }
  }

  return (
    <>
      <PageHeader
        title="Solicitudes"
        subtitle="Planes contratados. Transferencias: revisa el comprobante y aprueba para crear la cuenta. Tarjeta (PayPhone): la cuenta se crea sola al aprobarse el pago."
      />
      <div className="toolbar toolbar-suelta">
        <div className="seg" role="group" aria-label="Filtrar por estado">
          {(['pendiente', 'aprobada', 'rechazada', 'pago_pendiente', ''] as const).map((e) => (
            <button key={e || 'todas'} className={filtro === e ? `active ${e ? `tone-${ESTADO[e].tone}` : ''}` : ''} onClick={() => setFiltro(e)}>
              {e === 'pago_pendiente' ? 'Sin completar' : e ? `${ESTADO[e].label}s` : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {cargando && !data ? (
        <Loader />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={<Inbox />} title={filtro === 'pendiente' ? 'No hay solicitudes pendientes' : 'Sin solicitudes'}>
          Cuando alguien contrate un plan desde la página principal aparecerá aquí.
        </EmptyState>
      ) : (
        <ul className="sol-lista">
          {(data ?? []).map((s) => (
            <li key={s.id} className={`sol-card is-${s.estado}`}>
              <div className="sol-id">
                <Avatar nombre={s.nombre} size={42} square />
                <div>
                  <strong>{s.nombre}</strong>
                  <span className="org-ruc">RUC {s.ruc}</span>
                  <span className="muted small">
                    {s.contactoNombre} · {haceCuanto(s.creadoEn)}
                  </span>
                </div>
              </div>
              <ul className="org-contacto muted small">
                <li>
                  <Mail size={13} /> <a href={`mailto:${s.email}`}>{s.email}</a>
                </li>
                <li>
                  <Phone size={13} /> <a href={`tel:${s.telefono}`}>{s.telefono}</a>
                </li>
                {s.ciudad && (
                  <li>
                    <MapPin size={13} /> {s.ciudad}
                  </li>
                )}
              </ul>
              <div className="sol-pago">
                <span className={`badge tone-${PLAN_TONO[s.planId]}`}>
                  {s.planNombre} · {s.periodo === 'anual' ? 'anual' : 'mensual'}
                </span>
                <b>{dinero(s.monto)}</b>
                {s.metodoPago === 'tarjeta' ? (
                  <span className="small">
                    {s.tarjeta && marcaDeTexto(s.tarjeta) ? <LogoTarjeta marca={marcaDeTexto(s.tarjeta)!} /> : <CreditCard size={13} />} Tarjeta
                    {s.tarjeta ? ` · ${s.tarjeta}` : ''}
                    {s.autorizacion && <span className="muted"> · aut. {s.autorizacion}</span>}
                  </span>
                ) : (
                  <span className="muted small">
                    <Landmark size={13} /> {s.referencia ? `Transferencia · ref. ${s.referencia}` : 'Transferencia sin número'}
                  </span>
                )}
              </div>
              <div className="sol-estado">
                <span className={`badge tone-${ESTADO[s.estado].tone}`}>{ESTADO[s.estado].label}</span>
                {s.revisadoPor && (
                  <span className="muted small">
                    {s.revisadoPor} · {s.revisadoEn ? fechaHora(s.revisadoEn) : ''}
                  </span>
                )}
                {s.estado === 'rechazada' && s.motivoRechazo && <span className="small texto-rojo">{s.motivoRechazo}</span>}
              </div>
              <div className="sol-acciones">
                {s.tieneComprobante && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setViendo(s)}>
                    <Receipt size={15} /> Comprobante
                  </button>
                )}
                {s.estado === 'pendiente' && (
                  <>
                    <button className="btn btn-teal btn-sm" onClick={() => aprobar(s)}>
                      <Check size={15} /> Aprobar
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setRechazando(s)}>
                      <X size={15} /> Rechazar
                    </button>
                  </>
                )}
                {s.estado === 'aprobada' && (
                  <Link to="/admin/organizadores" className="btn btn-ghost btn-sm">
                    Ver organizador
                  </Link>
                )}
              </div>
              {s.mensaje && <p className="sol-mensaje small">“{s.mensaje}”</p>}
            </li>
          ))}
        </ul>
      )}

      <Modal open={viendo !== null} onClose={() => setViendo(null)} title="Comprobante de transferencia" wide>
        {viendo && <VerComprobante s={viendo} onAprobar={() => aprobar(viendo)} onRechazar={() => { setRechazando(viendo); setViendo(null); }} />}
      </Modal>
      <Modal open={rechazando !== null} onClose={() => setRechazando(null)} title="Rechazar solicitud">
        {rechazando && (
          <Rechazar
            s={rechazando}
            onListo={() => {
              setRechazando(null);
              toast.info('Solicitud rechazada. Le avisamos por correo.');
              recargar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function VerComprobante({ s, onAprobar, onRechazar }: { s: SolicitudPlan; onAprobar: () => void; onRechazar: () => void }) {
  const { data, cargando, error } = useAsync(() => adminApi.comprobante(s.id), [s.id]);
  const url = data?.comprobante ?? '';
  return (
    <div className="stack">
      <p className="muted">
        <b>{s.nombre}</b> · {s.planNombre} {s.periodo} · <b>{dinero(s.monto)}</b>
        {s.referencia && ` · Ref. ${s.referencia}`}
      </p>
      {cargando ? (
        <Loader />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : url.startsWith('data:image/') ? (
        <img className="comprobante-grande" src={url} alt={`Comprobante de ${s.nombre}`} />
      ) : url.startsWith('data:application/pdf') ? (
        <>
          <iframe className="comprobante-pdf" src={url} title={`Comprobante de ${s.nombre}`} />
          <a className="btn btn-outline btn-sm" href={url} download={`comprobante-${s.ruc}.pdf`}>
            <FileText size={15} /> Descargar PDF
          </a>
        </>
      ) : (
        <Alert>Sin comprobante.</Alert>
      )}
      {s.estado === 'pendiente' && (
        <div className="row-gap">
          <button className="btn btn-teal" onClick={onAprobar}>
            <Check size={16} /> Aprobar y crear cuenta
          </button>
          <button className="btn btn-ghost" onClick={onRechazar}>
            <X size={16} /> Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

function Rechazar({ s, onListo }: { s: SolicitudPlan; onListo: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const motivos = ['El monto transferido no coincide.', 'No recibimos la transferencia.', 'El comprobante no se puede leer.'];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 5) {
      setError('Escribe el motivo (mínimo 5 caracteres).');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await adminApi.rechazarSolicitud(s.id, motivo.trim());
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rechazar');
      setEnviando(false);
    }
  }

  return (
    <form className="stack" onSubmit={enviar}>
      <p className="muted">
        Le enviaremos el motivo a <b>{s.email}</b> para que pueda corregirlo y volver a enviar la solicitud.
      </p>
      <div className="org-rapidos">
        {motivos.map((m) => (
          <button key={m} type="button" className="btn btn-outline btn-sm" onClick={() => setMotivo(m)}>
            {m}
          </button>
        ))}
      </div>
      <Field label="Motivo" error={error}>
        <textarea className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} autoFocus />
      </Field>
      <button className="btn btn-danger" disabled={enviando}>
        {enviando ? 'Rechazando…' : 'Rechazar solicitud'}
      </button>
    </form>
  );
}
