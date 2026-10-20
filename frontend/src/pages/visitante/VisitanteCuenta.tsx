import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Mail, Trash2 } from 'lucide-react';
import type { Visitante } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { miCuentaApi, visitantesApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { Alert, Card, Field, Loader, Modal, PageHeader } from '../../components/ui';
import CodigoCorreo from '../../components/CodigoCorreo';

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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setGuardado(false);
    setForm({ ...form, [k]: e.target.value });
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const v = await miCuentaApi.actualizar(cambios);
      onGuardado(v);
      setForm({ nombre: v.nombre, telefono: v.telefono, empresa: v.empresa, ciudad: v.ciudad });
      actualizarSesion({ nombre: v.nombre });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Datos personales">
      <form className="stack" onSubmit={guardar}>
        <div className="form-grid">
          <Field label="Nombre completo" full>
            <input className="input" value={form.nombre} onChange={set('nombre')} required maxLength={150} autoComplete="name" />
          </Field>
          <Field label="Teléfono">
            <input className="input" type="tel" value={form.telefono} onChange={set('telefono')} maxLength={40} autoComplete="tel" />
          </Field>
          <Field label="Ciudad">
            <input className="input" value={form.ciudad} onChange={set('ciudad')} maxLength={100} autoComplete="address-level2" />
          </Field>
          <Field label="Empresa" hint="Opcional" full>
            <input className="input" value={form.empresa} onChange={set('empresa')} maxLength={150} autoComplete="organization" />
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

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault();
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
    const v = await miCuentaApi.cambiarCorreo(nuevo, codigo);
    onCambiado(v);
    setAviso(`Tu correo ahora es ${v.email}.`);
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
          <Field label="Correo nuevo" hint="Te enviaremos un código de 6 dígitos para confirmar que es tuyo.">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={150}
              autoComplete="email"
              placeholder="tu@correo.com"
              autoFocus
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="row-gap">
            <button className="btn btn-primary" disabled={enviando || !nuevo}>
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
