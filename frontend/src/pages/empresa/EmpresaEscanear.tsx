import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Keyboard, Mail, MapPin, Phone, RotateCcw, UserX } from 'lucide-react';
import type { Calificacion, Visitante } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { leadsApi, visitantesApi } from '../../services/api';
import { CALIFICACIONES, CALIFICACION_ORDEN, fechaHora, leerQrVisitante } from '../../lib/utils';
import { Alert, Avatar, PageHeader } from '../../components/ui';
import QRScanner from '../../components/QRScanner';

type Estado =
  | { paso: 'escaneando' }
  | { paso: 'buscando' }
  | { paso: 'no-encontrado'; texto: string }
  | { paso: 'calificar'; visitante: Visitante; previo?: string }
  | { paso: 'guardado'; visitante: Visitante; calificacion: Calificacion };

export default function EmpresaEscanear() {
  const { session } = useAuth();
  const empresaId = session?.refId ?? '';
  const [estado, setEstado] = useState<Estado>({ paso: 'escaneando' });
  const [manual, setManual] = useState('');
  const [cal, setCal] = useState<Calificacion>('interesado');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function procesar(texto: string) {
    const codigo = leerQrVisitante(texto);
    if (!codigo) {
      setEstado({ paso: 'no-encontrado', texto });
      return;
    }
    setEstado({ paso: 'buscando' });
    setError(null);
    try {
      const v = await visitantesApi.buscar(codigo);
      if (!v) {
        setEstado({ paso: 'no-encontrado', texto: codigo });
        return;
      }
      const previo = await leadsApi.obtener(empresaId, v.id);
      setCal(previo?.calificacion ?? 'interesado');
      setNota(previo?.nota ?? '');
      setEstado({ paso: 'calificar', visitante: v, previo: previo?.actualizadoEn });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el visitante');
      setEstado({ paso: 'escaneando' });
    }
  }

  function enviarManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim()) procesar(manual);
  }

  async function guardar() {
    if (estado.paso !== 'calificar') return;
    setGuardando(true);
    setError(null);
    try {
      await leadsApi.guardar(empresaId, estado.visitante.id, cal, nota.trim());
      setEstado({ paso: 'guardado', visitante: estado.visitante, calificacion: cal });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  function otro() {
    setManual('');
    setNota('');
    setError(null);
    setEstado({ paso: 'escaneando' });
  }

  return (
    <>
      <PageHeader title="Escanear visitante" subtitle="Apunta la cámara al QR de la tarjeta del visitante y califica el contacto." />

      <div className={`scan-layout ${estado.paso !== 'escaneando' ? 'is-result' : ''}`}>
        <div className="scan-col">
          <QRScanner activo={estado.paso === 'escaneando'} onResult={procesar} />
          <form className="manual" onSubmit={enviarManual}>
            <Keyboard size={18} className="muted" />
            <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="O escribe el código: FB-XXXXXX" />
            <button className="btn btn-primary" disabled={!manual.trim()}>Buscar</button>
          </form>
          <p className="muted small center">Solo se aceptan visitantes inscritos en tu feria. Demo: FB-7K3PQX, FB-M4R8TZ o FB-C5P4RN</p>
        </div>

        <div className="scan-col">
          {estado.paso === 'escaneando' && error && <Alert>{error}</Alert>}
          {estado.paso === 'escaneando' && (
            <div className="scan-hint card">
              <h3>¿Cómo funciona?</h3>
              <ol className="hint-steps">
                <li>Escanea el QR de la tarjeta del visitante.</li>
                <li>Revisa sus datos y elige el seguimiento que necesita.</li>
                <li>Guarda: el contacto queda como lead de tu empresa.</li>
              </ol>
            </div>
          )}

          {estado.paso === 'buscando' && <div className="card center muted">Buscando visitante…</div>}

          {estado.paso === 'no-encontrado' && (
            <div className="card center stack">
              <div className="empty-icon">
                <UserX />
              </div>
              <h3>No reconocimos ese código</h3>
              <p className="muted">«{estado.texto}» no corresponde a un visitante registrado.</p>
              <button className="btn btn-primary" onClick={otro}>
                <RotateCcw size={16} /> Intentar de nuevo
              </button>
            </div>
          )}

          {estado.paso === 'calificar' && (
            <div className="card stack lead-form">
              <div className="visitor-head">
                <Avatar nombre={estado.visitante.nombre} size={56} />
                <div>
                  <h3>{estado.visitante.nombre}</h3>
                  <code className="code">{estado.visitante.codigo}</code>
                </div>
              </div>
              <ul className="contact-list compact">
                {estado.visitante.empresa && (
                  <li>
                    <Building2 size={16} /> {estado.visitante.empresa}
                  </li>
                )}
                <li>
                  <MapPin size={16} /> {estado.visitante.ciudad}
                </li>
                <li>
                  <Mail size={16} /> {estado.visitante.email}
                </li>
                <li>
                  <Phone size={16} /> {estado.visitante.telefono}
                </li>
              </ul>

              {estado.previo && <Alert tone="blue">Ya registraste a este visitante ({fechaHora(estado.previo)}). Puedes actualizar la calificación.</Alert>}

              <div>
                <span className="field-label">¿Qué seguimiento necesita?</span>
                <div className="cal-grid">
                  {CALIFICACION_ORDEN.map((c) => (
                    <button key={c} type="button" className={`cal-option tone-${CALIFICACIONES[c].tone} ${cal === c ? 'active' : ''}`} onClick={() => setCal(c)}>
                      <strong>{CALIFICACIONES[c].label}</strong>
                      <span>{CALIFICACIONES[c].desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="field">
                <span className="field-label">Nota (opcional)</span>
                <textarea className="input" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Pidió cotización para 50 unidades" />
              </label>

              {error && <Alert>{error}</Alert>}
              <div className="row-gap">
                <button className="btn btn-ghost" onClick={otro}>Cancelar</button>
                <button className="btn btn-accent grow" onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar contacto'}
                </button>
              </div>
            </div>
          )}

          {estado.paso === 'guardado' && (
            <div className="card center stack success-card">
              <CheckCircle2 size={52} className="text-teal" />
              <h3>¡Contacto guardado!</h3>
              <p className="muted">
                <b>{estado.visitante.nombre}</b> quedó como lead con seguimiento <b>{CALIFICACIONES[estado.calificacion].label.toLowerCase()}</b>.
              </p>
              <div className="row-gap center-row">
                <Link to="/empresa" className="btn btn-ghost">Ver mis leads</Link>
                <button className="btn btn-primary" onClick={otro}>Escanear otro</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
