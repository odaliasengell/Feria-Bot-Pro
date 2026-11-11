import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Building2, CalendarDays, Check, Copy, CopyPlus, ImagePlus, Link2, MapPin, Pencil, Plus, Printer, Trash2, Users } from 'lucide-react';
import type { Feria, NuevaFeria } from '../../types';
import { feriasApi } from '../../services/api';
import { useFeria } from '../../context/FeriaContext';
import { mensajeError, useToast } from '../../context/ToastContext';
import { hoyISO, portadaDesdeArchivo, rangoFechas } from '../../lib/utils';
import PortadaFeria from '../../components/PortadaFeria';
import { errorNombre } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';
import { Alert, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';

function nuevaVacia(): NuevaFeria {
  return {
    nombre: '',
    descripcion: '',
    lugar: '',
    portada: null,
    portadaAlt: '',
    fechaInicio: hoyISO(),
    fechaFin: hoyISO(),
    inscripcionesAbiertas: true,
    aforo: null,
  };
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
  const [duplicando, setDuplicando] = useState<Feria | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  async function alternar(f: Feria) {
    try {
      await feriasApi.actualizar(f.id, { inscripcionesAbiertas: !f.inscripcionesAbiertas });
      await recargar();
      toast.exito(f.inscripcionesAbiertas ? `Inscripciones cerradas en «${f.nombre}».` : `Inscripciones abiertas en «${f.nombre}».`);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo actualizar la feria.'));
    }
  }

  async function eliminar(f: Feria) {
    const msg = `¿Eliminar «${f.nombre}»? Se borrarán sus ${f.totalEmpresas} empresas, sus leads y las inscripciones de ${f.totalVisitantes} visitantes. Las cuentas de los visitantes se conservan.`;
    if (!confirm(msg)) return;
    try {
      await feriasApi.eliminar(f.id);
      await recargar();
      toast.exito(`Feria «${f.nombre}» eliminada.`);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar la feria.'));
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
                <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} className="feria-card-portada" />
                <div className="feria-card-top">
                  <span className={`badge tone-${estado.tone}`}>{estado.label}</span>
                  {f.llena && <span className="badge tone-orange">Llena</span>}
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
                    <b>
                      {f.totalVisitantes}
                      {f.aforo !== null && <small className="muted"> / {f.aforo}</small>}
                    </b>
                    <span>
                      <Users size={12} /> {f.aforo !== null ? 'inscritos / aforo' : 'inscritos'}
                    </span>
                  </div>
                </div>
                <label className="switch-row">
                  <input type="checkbox" checked={f.inscripcionesAbiertas} onChange={() => alternar(f)} />
                  <span className="switch" aria-hidden="true" />
                  <span>Recibir inscripciones</span>
                </label>
                <div className="feria-card-acciones">
                  <div className="feria-card-principal">
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
                      <span className="feria-seleccionada">
                        <Check size={14} /> Seleccionada
                      </span>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEnlace(f)}>
                      <Link2 size={15} /> Enlace de registro
                    </button>
                  </div>
                  <div className="feria-card-iconos">
                    <button className="icon-btn" onClick={() => setDuplicando(f)} aria-label={`Duplicar ${f.nombre}`} title="Duplicar">
                      <CopyPlus size={16} />
                    </button>
                    <button className="icon-btn" onClick={() => setEditando(f)} aria-label={`Editar ${f.nombre}`} title="Editar">
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => eliminar(f)} aria-label={`Eliminar ${f.nombre}`} title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </div>
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
                toast.exito(`Feria «${creada.nombre}» creada.`);
              } else {
                // La portada solo viaja si cambió (es una imagen grande).
                const { portada, ...resto } = datos;
                await feriasApi.actualizar(editando.id, portada === editando.portada ? resto : datos);
                toast.exito('Cambios guardados.');
              }
              setEditando(null);
              await recargar();
            }}
          />
        )}
      </Modal>

      <Modal open={duplicando !== null} onClose={() => setDuplicando(null)} title="Duplicar feria">
        {duplicando && (
          <FormDuplicar
            origen={duplicando}
            onDuplicar={async (datos) => {
              const nueva = await feriasApi.duplicar(duplicando.id, datos);
              setDuplicando(null);
              await recargar();
              elegir(nueva.id);
              toast.exito(`Feria «${nueva.nombre}» creada a partir de «${duplicando.nombre}».`);
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
    portada: inicial.portada,
    portadaAlt: inicial.portadaAlt,
    fechaInicio: inicial.fechaInicio,
    fechaFin: inicial.fechaFin,
    inscripcionesAbiertas: inicial.inscripcionesAbiertas,
    aforo: inicial.aforo,
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof NuevaFeria) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const v = useValidacion({
    nombre: errorNombre(f.nombre, { campo: 'El nombre de la feria' }),
    fechaInicio: f.fechaInicio ? null : 'Elige la fecha de inicio.',
    fechaFin: !f.fechaFin ? 'Elige la fecha de fin.' : f.fechaFin < f.fechaInicio ? 'La fecha de fin no puede ser anterior a la de inicio.' : null,
    aforo: f.aforo !== null && (!Number.isInteger(f.aforo) || f.aforo < 1) ? 'El aforo debe ser un número entero mayor que 0.' : null,
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
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
        <Field label="Nombre de la feria" full error={v.error('nombre')}>
          <input className="input" value={f.nombre} onChange={set('nombre')} onBlur={v.tocar('nombre')} aria-invalid={!!v.error('nombre')} maxLength={150} placeholder="Ej. Expo Negocios 2026" />
        </Field>
        <Field label="Fecha de inicio" error={v.error('fechaInicio')}>
          <input className="input" type="date" value={f.fechaInicio} onChange={set('fechaInicio')} onBlur={v.tocar('fechaInicio')} aria-invalid={!!v.error('fechaInicio')} />
        </Field>
        <Field label="Fecha de fin" hint="Las inscripciones se cierran solas al terminar este día." error={v.error('fechaFin')}>
          <input className="input" type="date" value={f.fechaFin} min={f.fechaInicio} onChange={set('fechaFin')} onBlur={v.tocar('fechaFin')} aria-invalid={!!v.error('fechaFin')} />
        </Field>
        <Field label="Lugar" hint="Dirección o recinto; los visitantes la abren en Google Maps." opcional>
          <input className="input" value={f.lugar} onChange={set('lugar')} maxLength={255} placeholder="Ej. Centro de Convenciones, Quito" />
        </Field>
        <Field label="Aforo" hint="Máximo de visitantes inscritos. Vacío = sin límite." error={v.error('aforo')} opcional>
          <input
            onBlur={v.tocar('aforo')}
            aria-invalid={!!v.error('aforo')}
            className="input"
            type="number"
            min={1}
            max={1000000}
            step={1}
            value={f.aforo ?? ''}
            onChange={(e) => setF({ ...f, aforo: e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value))) })}
            placeholder="Sin límite"
          />
        </Field>
        <SelectorPortada
          nombre={f.nombre || 'Nueva feria'}
          portada={f.portada}
          portadaAlt={f.portadaAlt}
          onCambiar={(portada, portadaAlt) => setF((x) => ({ ...x, portada, portadaAlt }))}
        />
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

/** Imagen de portada opcional: subir, cambiar o quitar, con su texto alternativo. */
function SelectorPortada({
  nombre,
  portada,
  portadaAlt,
  onCambiar,
}: {
  nombre: string;
  portada: string | null;
  portadaAlt: string;
  onCambiar: (portada: string | null, portadaAlt: string) => void;
}) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(files: FileList | null) {
    const archivo = files?.[0];
    if (!archivo) return;
    setProcesando(true);
    setError(null);
    try {
      onCambiar(await portadaDesdeArchivo(archivo), portadaAlt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo usar esa imagen.');
    } finally {
      setProcesando(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  }

  return (
    <div className="field field-full">
      <span className="field-label">
        Imagen de portada <span className="field-opcional">(opcional)</span>
      </span>
      <div className="portada-editor">
        <PortadaFeria nombre={nombre} portada={portada} portadaAlt={portadaAlt} variante="detalle" />
        <div className="portada-editor-acciones">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => archivoRef.current?.click()} disabled={procesando}>
            <ImagePlus size={15} /> {procesando ? 'Procesando…' : portada ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
          {portada && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar(null, '')} disabled={procesando}>
              <Trash2 size={15} /> Quitar
            </button>
          )}
        </div>
      </div>
      <input ref={archivoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => elegir(e.target.files)} />
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="field-hint">
          Horizontal, se recorta a 16:9 (1200×675 px). Usa una imagen propia o con permiso de uso. Sin imagen se muestra una portada con los colores de la marca.
        </span>
      )}
      {portada && (
        <label className="field">
          <span className="field-label">
            Descripción de la imagen <span className="field-opcional">(para lectores de pantalla)</span>
          </span>
          <input
            className="input"
            value={portadaAlt}
            onChange={(e) => onCambiar(portada, e.target.value)}
            maxLength={200}
            placeholder="Ej. Pabellón principal del Centro de Convenciones"
          />
        </label>
      )}
    </div>
  );
}

/** Suma un año a una fecha YYYY-MM-DD (para sugerir las fechas de la próxima edición). */
function masUnAnio(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${Number(a) + 1}-${m}-${d}`;
}

function FormDuplicar({
  origen,
  onDuplicar,
}: {
  origen: Feria;
  onDuplicar: (d: { nombre: string; fechaInicio: string; fechaFin: string }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(origen.nombre);
  const [fechaInicio, setFechaInicio] = useState(masUnAnio(origen.fechaInicio));
  const [fechaFin, setFechaFin] = useState(masUnAnio(origen.fechaFin));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const v = useValidacion({
    nombre: errorNombre(nombre, { campo: 'El nombre de la feria' }),
    fechaInicio: fechaInicio ? null : 'Elige la fecha de inicio.',
    fechaFin: !fechaFin ? 'Elige la fecha de fin.' : fechaFin < fechaInicio ? 'La fecha de fin no puede ser anterior a la de inicio.' : null,
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    try {
      await onDuplicar({ nombre: nombre.trim(), fechaInicio, fechaFin });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo duplicar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="stack">
      <p className="muted small">
        Se crea una nueva feria con la descripción, el lugar, la portada y el aforo de «{origen.nombre}». Las empresas y los visitantes no se copian.
      </p>
      <div className="form-grid">
        <Field label="Nombre de la nueva feria" full error={v.error('nombre')}>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={v.tocar('nombre')} aria-invalid={!!v.error('nombre')} maxLength={150} autoFocus />
        </Field>
        <Field label="Fecha de inicio" error={v.error('fechaInicio')}>
          <input className="input" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} onBlur={v.tocar('fechaInicio')} aria-invalid={!!v.error('fechaInicio')} />
        </Field>
        <Field label="Fecha de fin" error={v.error('fechaFin')}>
          <input className="input" type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} onBlur={v.tocar('fechaFin')} aria-invalid={!!v.error('fechaFin')} />
        </Field>
      </div>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary btn-block" disabled={enviando}>
        <CopyPlus size={16} /> {enviando ? 'Duplicando…' : 'Duplicar feria'}
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
      {feria.abierta && feria.llena && <Alert>La feria llegó a su aforo: el enlace no permitirá registrarse.</Alert>}
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
