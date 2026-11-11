import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, ImagePlus, Trash2, Upload, X } from 'lucide-react';
import type { Empresa } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { empresasApi } from '../../services/api';
import { redimensionarImagen } from '../../lib/utils';
import { Alert, Avatar, Card, Field, Loader, PageHeader } from '../../components/ui';
import { CartelStand } from '../../components/Credenciales';
import { mensajeError, useToast } from '../../context/ToastContext';
import { errorEmail, errorNombre, errorTelefono, errorUrl } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';

const MAX_FOTOS = 3;

export default function EmpresaFicha() {
  const { session } = useAuth();
  const [f, setF] = useState<Empresa | null>(null);
  const [servicio, setServicio] = useState('');
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok'>('idle');
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const fotosRef = useRef<HTMLInputElement>(null);

  const toast = useToast();
  // Los hooks van antes del `return <Loader />`: con la ficha aún sin cargar no hay errores que mostrar.
  const v = useValidacion({
    nombre: f ? errorNombre(f.nombre, { campo: 'El nombre' }) : null,
    rubro: f ? errorNombre(f.rubro, { campo: 'El rubro', max: 100 }) : null,
    contactoNombre: f ? errorNombre(f.contactoNombre, { campo: 'La persona de contacto', requerido: false }) : null,
    telefono: f ? errorTelefono(f.telefono) : null,
    email: f ? errorEmail(f.email) : null,
    sitioWeb: f ? errorUrl(f.sitioWeb ?? '') : null,
  });

  useEffect(() => {
    if (session?.refId) empresasApi.obtener(session.refId).then(setF);
  }, [session?.refId]);

  if (!f) return <Loader />;
  const props = (k: Parameters<typeof v.error>[0]) => ({ onBlur: v.tocar(k), 'aria-invalid': !!v.error(k) });

  const set = (k: keyof Empresa) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF({ ...f, [k]: e.target.value });
    setEstado('idle');
  };

  function agregarServicio() {
    const s = servicio.trim();
    if (s && f && !f.servicios.includes(s)) setF({ ...f, servicios: [...f.servicios, s] });
    setServicio('');
  }
  function onServicioKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      agregarServicio();
    }
  }

  async function subirLogo(files: FileList | null) {
    if (!files?.[0] || !f) return;
    try {
      setF({ ...f, logo: await redimensionarImagen(files[0], 300) });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function subirFotos(files: FileList | null) {
    if (!files || !f) return;
    const libres = MAX_FOTOS - f.fotos.length;
    try {
      const nuevas = await Promise.all([...files].slice(0, libres).map((file) => redimensionarImagen(file, 1000)));
      setF({ ...f, fotos: [...f.fotos, ...nuevas] });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    if (!v.validar()) {
      toast.error('Revisa los campos marcados en rojo antes de guardar.');
      return;
    }
    setEstado('guardando');
    setError(null);
    try {
      const { id, creadoEn: _c, feriaId: _f, ...datos } = f;
      void _c;
      void _f;
      await empresasApi.actualizar(id, datos);
      setEstado('ok');
      toast.exito('Ficha guardada. Los visitantes ya ven los cambios.');
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar'));
      setEstado('idle');
    }
  }

  const checks = [
    { ok: !!f.logo, t: 'Logo' },
    { ok: f.descripcion.length > 20, t: 'Descripción' },
    { ok: f.servicios.length > 0, t: 'Servicios' },
    { ok: f.fotos.length >= 2, t: '2–3 fotos' },
  ];
  const progreso = checks.filter((c) => c.ok).length;

  return (
    <>
      <PageHeader
        title="Mi ficha digital"
        subtitle="Es lo que verán los visitantes al escanear el QR de tu stand."
        actions={
          <Link to={`/ficha/${f.id}`} target="_blank" className="btn btn-ghost">
            <ExternalLink size={16} /> Ver como visitante
          </Link>
        }
      />

      <div className="ficha-edit">
        <form className="stack" onSubmit={guardar}>
          <Card title="Identidad">
            <div className="logo-row">
              <button type="button" className="logo-drop" onClick={() => logoRef.current?.click()}>
                {f.logo ? <Avatar nombre={f.nombre} src={f.logo} size={88} square /> : <Upload size={24} />}
                <span>{f.logo ? 'Cambiar logo' : 'Subir logo'}</span>
              </button>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => subirLogo(e.target.files)} />
              <div className="form-grid grow">
                <Field label="Nombre" error={v.error('nombre')}>
                  <input className="input" value={f.nombre} onChange={set('nombre')} {...props('nombre')} maxLength={150} />
                </Field>
                <Field label="Rubro" error={v.error('rubro')}>
                  <input className="input" value={f.rubro} onChange={set('rubro')} {...props('rubro')} maxLength={100} />
                </Field>
              </div>
            </div>
            <Field label="Descripción" full>
              <textarea className="input" rows={4} value={f.descripcion} onChange={set('descripcion')} placeholder="Cuéntales a los visitantes qué hace tu empresa" />
            </Field>
          </Card>

          <Card title="Servicios">
            <div className="tags editable">
              {f.servicios.map((s) => (
                <span key={s} className="tag">
                  {s}
                  <button type="button" aria-label={`Quitar ${s}`} onClick={() => setF({ ...f, servicios: f.servicios.filter((x) => x !== s) })}>
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            <div className="row-gap">
              <input className="input grow" value={servicio} onChange={(e) => setServicio(e.target.value)} onKeyDown={onServicioKey} placeholder="Escribe un servicio y presiona Enter" />
              <button type="button" className="btn btn-outline" onClick={agregarServicio}>Agregar</button>
            </div>
          </Card>

          <Card title={`Fotos (${f.fotos.length}/${MAX_FOTOS})`}>
            <div className="galeria">
              {f.fotos.map((src, i) => (
                <div key={i} className="galeria-item">
                  <img src={src} alt={`Foto ${i + 1}`} />
                  <button type="button" className="foto-del" aria-label="Quitar foto" onClick={() => setF({ ...f, fotos: f.fotos.filter((_, j) => j !== i) })}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {f.fotos.length < MAX_FOTOS && (
                <button type="button" className="galeria-item add" onClick={() => fotosRef.current?.click()}>
                  <ImagePlus size={26} />
                  <span>Agregar foto</span>
                </button>
              )}
            </div>
            <input ref={fotosRef} type="file" accept="image/*" multiple hidden onChange={(e) => subirFotos(e.target.files)} />
          </Card>

          <Card title="Contacto">
            <div className="form-grid">
              <Field label="Persona de contacto" error={v.error('contactoNombre')}>
                <input className="input" value={f.contactoNombre} onChange={set('contactoNombre')} {...props('contactoNombre')} maxLength={150} />
              </Field>
              <Field label="Teléfono / WhatsApp" error={v.error('telefono')}>
                <input className="input" type="tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} {...props('telefono')} maxLength={40} />
              </Field>
              <Field label="Correo" hint="También es el correo con el que ingresas a tu panel." error={v.error('email')}>
                <input className="input" type="email" inputMode="email" value={f.email} onChange={set('email')} {...props('email')} maxLength={150} />
              </Field>
              <Field label="Sitio web" opcional error={v.error('sitioWeb')}>
                <input className="input" type="url" inputMode="url" value={f.sitioWeb ?? ''} onChange={set('sitioWeb')} {...props('sitioWeb')} maxLength={255} placeholder="https://" />
              </Field>
            </div>
          </Card>

          {error && <Alert>{error}</Alert>}
          <div className="save-bar">
            {estado === 'ok' && (
              <span className="text-teal save-ok">
                <Check size={17} /> Cambios guardados
              </span>
            )}
            <button className="btn btn-accent btn-lg" disabled={estado === 'guardando'}>
              {estado === 'guardando' ? 'Guardando…' : 'Guardar ficha'}
            </button>
          </div>
        </form>

        <aside className="stack ficha-aside">
          <Card title="Ficha completa">
            <div className="progress">
              <span style={{ width: `${(progreso / checks.length) * 100}%` }} />
            </div>
            <ul className="checklist">
              {checks.map((c) => (
                <li key={c.t} className={c.ok ? 'ok' : ''}>
                  <Check size={15} /> {c.t}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="QR de tu stand">
            <p className="muted small">Imprímelo y colócalo en tu stand. Cualquier cámara de celular abre tu ficha.</p>
            <CartelStand empresa={f} />
          </Card>
        </aside>
      </div>
    </>
  );
}
