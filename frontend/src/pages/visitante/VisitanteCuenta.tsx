import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Mail, Trash2 } from 'lucide-react';
import type { Visitante } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { miCuentaApi, visitantesApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { Alert, Card, Field, Loader, Modal, PageHeader } from '../../components/ui';
import CodigoCorreo from '../../components/CodigoCorreo';
import { mensajeError, useToast } from '../../context/ToastContext';
import { errorEmail, errorNombre, errorTelefono } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';

/** «Mi cuenta» del visitante: editar datos, cambiar el correo con código y borrar la cuenta. */
export default function VisitanteCuenta() {
  const { session } = useAuth();
  const { data: visitante, cargando, error, setData } = useAsync(() => visitantesApi.obtener(session!.refId!), [session?.refId]);

  return (
    <>
      <PageHeader title="Mi cuenta" subtitle="Tus datos de contacto son los que reciben las empresas que escanean tu QR." />
      {cargando && !visitante ? (
        <Loader />
      ) : error || !visitante ? (
        <Alert>{error ?? 'No encontramos tu cuenta.'}</Alert>
      ) : (
        <div className="grid-2">
          <DatosPersonales visitante={visitante} onGuardado={setData} />
          <div className="stack">
            <CambioCorreo visitante={visitante} onCambiado={setData} />
            <BorrarCuenta />
          </div>
        </div>
      )}
    </>
  );
}

function DatosPersonales({ visitante, onGuardado }: { visitante: Visitante; onGuardado: (v: Visitante) => void }) {
  const { actualizarSesion } = useAuth();
  const inicial = { nombre: visitante.nombre, telefono: visitante.telefono, empresa: visitante.empresa, ciudad: visitante.ciudad };
  const [form, setForm] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cambios = Object.fromEntries(
    Object.entries(form).filter(([k, v]) => v.trim() !== inicial[k as keyof typeof inicial]),
  ) as Partial<typeof form>;
  const hayCambios = Object.keys(cambios).length > 0;
  const toast = useToast();
  const v = useValidacion({
    nombre: errorNombre(form.nombre),
    telefono: errorTelefono(form.telefono, false),
    ciudad: errorNombre(form.ciudad, { campo: 'La ciudad', requerido: false, max: 100 }),
    empresa: form.empresa.trim().length > 150 ? 'La empresa admite hasta 150 caracteres.' : null,
  });
  const props = (k: Parameters<typeof v.error>[0]) => ({ onBlur: v.tocar(k), 'aria-invalid': !!v.error(k) });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setGuardado(false);
    setForm({ ...form, [k]: e.target.value });
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    try {
      const actualizado = await miCuentaApi.actualizar(cambios);
      onGuardado(actualizado);
      setForm({ nombre: actualizado.nombre, telefono: actualizado.telefono, empresa: actualizado.empresa, ciudad: actualizado.ciudad });
      actualizarSesion({ nombre: actualizado.nombre });
      setGuardado(true);
      toast.exito('Tus datos se guardaron.');
    } catch (err) {
      setError(mensajeError(err, 'No se pudieron guardar los cambios'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Datos personales">
      <form className="stack" onSubmit={guardar}>
        <div className="form-grid">
          <Field label="Nombre completo" full error={v.error('nombre')}>
            <input className="input" value={form.nombre} onChange={set('nombre')} {...props('nombre')} maxLength={150} autoComplete="name" />
          </Field>
          <Field label="Teléfono" error={v.error('telefono')}>
            <input className="input" type="tel" inputMode="tel" value={form.telefono} onChange={set('telefono')} {...props('telefono')} maxLength={40} autoComplete="tel" />
          </Field>
          <Field label="Ciudad" error={v.error('ciudad')}>
            <input className="input" value={form.ciudad} onChange={set('ciudad')} {...props('ciudad')} maxLength={100} autoComplete="address-level2" />
          </Field>
          <Field label="Empresa" opcional full error={v.error('empresa')}>
            <input className="input" value={form.empresa} onChange={set('empresa')} {...props('empresa')} maxLength={150} autoComplete="organization" />
          </Field>
        </div>
        <p className="muted small">
          Código de tu tarjeta: <span className="code">{visitante.codigo}</span>
        </p>
        {error && <Alert>{error}</Alert>}
        {guardado && (
          <Alert tone="teal">
            <Check size={16} style={{ verticalAlign: -3 }} /> Cambios guardados.
          </Alert>
        )}
        <div className="row-gap">
          <button className="btn btn-primary" disabled={enviando || !hayCambios}>
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {hayCambios && (
            <button type="button" className="btn btn-ghost" onClick={() => setForm(inicial)} disabled={enviando}>
              Descartar
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Cambio de correo en dos pasos: escribir el nuevo correo (se envía un código) y confirmar con el código. */
function CambioCorreo({ visitante, onCambiado }: { visitante: Visitante; onCambiado: (v: Visitante) => void }) {
  const [paso, setPaso] = useState<'ver' | 'correo' | 'codigo'>('ver');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nuevo = email.trim().toLowerCase();
  const toast = useToast();
  const v = useValidacion({ email: errorEmail(email) });

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    if (nuevo === visitante.email) {
      setError('Ese ya es el correo de tu cuenta.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await miCuentaApi.enviarCodigoCorreo(nuevo);
      setPaso('codigo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el código');
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(codigo: string) {
    const actualizado = await miCuentaApi.cambiarCorreo(nuevo, codigo);
    onCambiado(actualizado);
    setAviso(`Tu correo ahora es ${actualizado.email}.`);
    toast.exito('Correo actualizado.');
    setEmail('');
    setPaso('ver');
  }

  return (
    <Card title="Correo electrónico">
      {paso === 'ver' && (
        <div className="stack">
          <p>
            <Mail size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
            {visitante.email ? <b>{visitante.email}</b> : <span className="muted">Sin correo registrado</span>}
          </p>
          {aviso && <Alert tone="teal">{aviso}</Alert>}
          <div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setAviso(null);
                setError(null);
                setPaso('correo');
              }}
            >
              {visitante.email ? 'Cambiar correo' : 'Agregar correo'}
            </button>
          </div>
        </div>
      )}

      {paso === 'correo' && (
        <form className="stack" onSubmit={enviarCodigo}>
          <Field label="Correo nuevo" hint="Te enviaremos un código de 6 dígitos para confirmar que es tuyo." error={v.error('email')}>
            <input
              className="input"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={v.tocar('email')}
              aria-invalid={!!v.error('email')}
              maxLength={150}
              autoComplete="email"
              placeholder="tu@correo.com"
              autoFocus
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="row-gap">
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Enviando código…' : 'Enviar código'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPaso('ver')} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {paso === 'codigo' && (
        <CodigoCorreo
          email={nuevo}
          textoBoton="Confirmar correo nuevo"
          onVerificar={confirmar}
          onReenviar={() => miCuentaApi.enviarCodigoCorreo(nuevo)}
          onCambiarCorreo={() => {
            setError(null);
            setPaso('correo');
          }}
        />
      )}
    </Card>
  );
}

function BorrarCuenta() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    if (!abierto) {
      setConfirmacion('');
      setError(null);
    }
  }, [abierto]);

  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      await miCuentaApi.borrar();
      logout();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar la cuenta');
      setBorrando(false);
    }
  }

  return (
    <Card title="Borrar cuenta" className="card-danger">
      <p className="muted small">
        Se eliminan tu cuenta, tu tarjeta QR, tus inscripciones y tu historial. Las empresas que ya escanearon tu QR dejarán
        de ver tus datos en la plataforma. Esta acción no se puede deshacer.
      </p>
      <div className="mt-sm">
        <button type="button" className="btn btn-danger" onClick={() => setAbierto(true)}>
          <Trash2 size={16} /> Borrar mi cuenta
        </button>
      </div>

      <Modal open={abierto} onClose={() => !borrando && setAbierto(false)} title="¿Borrar tu cuenta?">
        <div className="stack">
          <p>
            Vas a borrar tu cuenta de forma permanente y se cerrará tu sesión. Escribe <b>BORRAR</b> para confirmar.
          </p>
          <input
            className="input"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder="BORRAR"
            aria-label="Escribe BORRAR para confirmar"
            autoFocus
          />
          {error && <Alert>{error}</Alert>}
          <div className="row-gap">
            <button
              type="button"
              className="btn btn-danger"
              onClick={borrar}
              disabled={borrando || confirmacion.trim().toUpperCase() !== 'BORRAR'}
            >
              {borrando ? 'Borrando…' : 'Sí, borrar mi cuenta'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAbierto(false)} disabled={borrando}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
