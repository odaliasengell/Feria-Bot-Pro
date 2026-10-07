import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Building2, CalendarDays, Check, Copy, Link2, MapPin, Pencil, Plus, Printer, Trash2, Users } from 'lucide-react';
import type { Feria, NuevaFeria } from '../../types';
import { feriasApi } from '../../services/api';
import { useFeria } from '../../context/FeriaContext';
import { hoyISO, rangoFechas } from '../../lib/utils';
import { Alert, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';

function nuevaVacia(): NuevaFeria {
  return { nombre: '', descripcion: '', lugar: '', fechaInicio: hoyISO(), fechaFin: hoyISO(), inscripcionesAbiertas: true };
}

export function enlaceRegistro(feriaId: string): string {
  return `${window.location.origin}/registro/${feriaId}`;
}

/** Estado visible de la feria para el organizador. */
export function estadoFeria(f: Feria): { label: string; tone: 'teal' | 'orange' | 'gray' } {
  if (f.fechaFin < hoyISO()) return { label: 'Finalizada', tone: 'gray' };
  if (!f.inscripcionesAbiertas) return { label: 'Inscripciones cerradas', tone: 'orange' };
  return { label: 'Inscripciones abiertas', tone: 'teal' };
}

export default function OrgFerias() {
  const { ferias, feria: actual, cargando, elegir, recargar } = useFeria();
  const [editando, setEditando] = useState<Feria | 'nueva' | null>(null);
  const [enlace, setEnlace] = useState<Feria | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function alternar(f: Feria) {
    setError(null);
    try {
      await feriasApi.actualizar(f.id, { inscripcionesAbiertas: !f.inscripcionesAbiertas });
      await recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  }

  async function eliminar(f: Feria) {
    const msg = `¿Eliminar «${f.nombre}»? Se borrarán sus ${f.totalEmpresas} empresas, sus leads y las inscripciones de ${f.totalVisitantes} visitantes. Las cuentas de los visitantes se conservan.`;
    if (!confirm(msg)) return;
    setError(null);
    try {
      await feriasApi.eliminar(f.id);
      await recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <>
      <PageHeader
        title="Ferias"
        subtitle="Crea las ferias y abre sus inscripciones. Los visitantes eligen a qué feria registrarse y cada feria tiene sus propias empresas y leads."
        actions={
          <button className="btn btn-primary" onClick={() => setEditando('nueva')}>
            <Plus size={17} /> Nueva feria
          </button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : ferias.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Aún no hay ferias">
          Crea la primera feria para cargar sus empresas y abrir el registro de visitantes.
          <div>
            <button className="btn btn-primary" onClick={() => setEditando('nueva')}>Crear feria</button>
          </div>
        </EmptyState>
      ) : (
        <div className="company-grid">
          {ferias.map((f) => {
            const estado = estadoFeria(f);
            const esActual = actual?.id === f.id;
            return (
              <article key={f.id} className={`company-card feria-card ${esActual ? 'is-current' : ''}`}>
                <div className="feria-card-top">
                  <span className={`badge tone-${estado.tone}`}>{estado.label}</span>
                  {esActual && <span className="chip-mini teal">Administrando</span>}
                </div>
                <div>
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
                  </div>
                  {f.descripcion && <p className="feria-card-desc">{f.descripcion}</p>}
                </div>
                <div className="company-meta">
                  <div>
                    <b>{f.totalEmpresas}</b>
                    <span>
                      <Building2 size={12} /> empresas
                    </span>
                  </div>
                  <div>
                    <b>{f.totalVisitantes}</b>
                    <span>
                      <Users size={12} /> inscritos
                    </span>
                  </div>
                </div>
                <label className="switch-row">
                  <input type="checkbox" checked={f.inscripcionesAbiertas} onChange={() => alternar(f)} />
                  <span className="switch" aria-hidden="true" />
                  <span>Recibir inscripciones</span>
                </label>
                <div className="company-actions">
                  {!esActual ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        elegir(f.id);
                        navigate('/organizador');
                      }}
                    >
                      Administrar
                    </button>
                  ) : (
                    <span className="muted small">
                      <Check size={14} /> Seleccionada
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setEnlace(f)}>
                    <Link2 size={15} /> Enlace de registro
                  </button>
                  <span className="spacer" />
                  <button className="icon-btn" onClick={() => setEditando(f)} aria-label="Editar">
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn danger" onClick={() => eliminar(f)} aria-label="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal open={editando !== null} onClose={() => setEditando(null)} title={editando === 'nueva' ? 'Nueva feria' : 'Editar feria'}>
        {editando !== null && (
          <FormFeria
            inicial={editando === 'nueva' ? nuevaVacia() : editando}
            onGuardar={async (datos) => {
              if (editando === 'nueva') {
                const creada = await feriasApi.crear(datos);
                elegir(creada.id);
              } else {
                await feriasApi.actualizar(editando.id, datos);
              }
              setEditando(null);
              await recargar();
            }}
          />
        )}
      </Modal>

      <Modal open={enlace !== null} onClose={() => setEnlace(null)} title="Enlace de registro">
        {enlace && <EnlaceRegistro feria={enlace} />}
      </Modal>
    </>
  );
}

function FormFeria({ inicial, onGuardar }: { inicial: NuevaFeria; onGuardar: (d: NuevaFeria) => Promise<void> }) {
  const [f, setF] = useState<NuevaFeria>({
    nombre: inicial.nombre,
    descripcion: inicial.descripcion,
    lugar: inicial.lugar,
    fechaInicio: inicial.fechaInicio,
    fechaFin: inicial.fechaFin,
    inscripcionesAbiertas: inicial.inscripcionesAbiertas,
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof NuevaFeria) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (f.fechaFin < f.fechaInicio) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await onGuardar(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="stack">
      <div className="form-grid">
        <Field label="Nombre de la feria" full>
          <input className="input" value={f.nombre} onChange={set('nombre')} required maxLength={150} placeholder="Ej. Expo Negocios 2026" />
        </Field>
        <Field label="Fecha de inicio">
          <input className="input" type="date" value={f.fechaInicio} onChange={set('fechaInicio')} required />
        </Field>
        <Field label="Fecha de fin" hint="Las inscripciones se cierran solas al terminar este día.">
          <input className="input" type="date" value={f.fechaFin} min={f.fechaInicio} onChange={set('fechaFin')} required />
        </Field>
        <Field label="Lugar" full>
          <input className="input" value={f.lugar} onChange={set('lugar')} maxLength={255} placeholder="Ej. Centro de Convenciones, Quito" />
        </Field>
        <Field label="Descripción" full hint="La ven los visitantes al elegir la feria.">
          <textarea className="input" rows={3} value={f.descripcion} onChange={set('descripcion')} maxLength={5000} />
        </Field>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={f.inscripcionesAbiertas} onChange={(e) => setF({ ...f, inscripcionesAbiertas: e.target.checked })} />
        <span className="switch" aria-hidden="true" />
        <span>Recibir inscripciones de visitantes</span>
      </label>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary btn-block" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar feria'}
      </button>
    </form>
  );
}

function EnlaceRegistro({ feria }: { feria: Feria }) {
  const url = enlaceRegistro(feria.id);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      prompt('Copia el enlace:', url);
    }
  }

  return (
    <div className="credencial-wrap">
      {!feria.abierta && <Alert>Las inscripciones de esta feria están cerradas: el enlace no permitirá registrarse.</Alert>}
      <article className="cartel printable">
        <div className="cartel-head">
          <div>
            <strong>{feria.nombre}</strong>
            <span>{rangoFechas(feria.fechaInicio, feria.fechaFin)}</span>
          </div>
        </div>
        <p className="cartel-cta">REGÍSTRATE</p>
        <div className="credencial-qr">
          <QRCodeSVG value={url} size={196} level="M" marginSize={0} fgColor="#13304a" />
        </div>
        <p className="cartel-foot">Escanea y obtén tu tarjeta de visitante con QR</p>
      </article>
      <div className="row-gap no-print">
        <input className="input grow" value={url} readOnly onFocus={(e) => e.target.select()} />
        <button className="btn btn-outline" onClick={copiar}>
          {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <button className="btn btn-outline no-print" onClick={() => window.print()}>
        <Printer size={16} /> Imprimir cartel
      </button>
    </div>
  );
}
