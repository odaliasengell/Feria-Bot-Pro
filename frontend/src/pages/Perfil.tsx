import { useState, type FormEvent } from 'react';
import { Check, KeyRound, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Alert, Card, Field, PageHeader } from '../components/ui';

const MIN_PASSWORD = 6;

/** Perfil del organizador y de la empresa (/organizador/perfil y /empresa/perfil): contraseña y correo de ingreso. */
export default function Perfil() {
  const { session } = useAuth();
  return (
    <>
      <PageHeader title="Perfil" subtitle={`Datos de acceso de ${session?.nombre ?? 'tu cuenta'}.`} />
      <div className="grid-2">
        <CambiarPassword />
        <CambiarCorreo />
      </div>
    </>
  );
}

function CambiarPassword() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setListo(false);
    if (nueva.length < MIN_PASSWORD) return setError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (nueva !== repetir) return setError('Las contraseñas nuevas no coinciden.');
    if (nueva === actual) return setError('La nueva contraseña debe ser distinta de la actual.');
    setEnviando(true);
    setError(null);
    try {
      await authApi.cambiarPassword(actual, nueva);
      setActual('');
      setNueva('');
      setRepetir('');
      setListo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Cambiar contraseña">
      <form className="stack" onSubmit={enviar}>
        <Field label="Contraseña actual">
          <input className="input" type="password" value={actual} onChange={(e) => setActual(e.target.value)} required maxLength={72} autoComplete="current-password" />
        </Field>
        <Field label="Nueva contraseña" hint={`Mínimo ${MIN_PASSWORD} caracteres.`}>
          <input className="input" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={MIN_PASSWORD} maxLength={72} autoComplete="new-password" />
        </Field>
        <Field label="Repite la nueva contraseña">
          <input className="input" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} required maxLength={72} autoComplete="new-password" />
        </Field>
        {error && <Alert>{error}</Alert>}
        {listo && (
          <Alert tone="teal">
            <Check size={16} style={{ verticalAlign: -3 }} /> Contraseña actualizada. Úsala la próxima vez que ingreses.
          </Alert>
        )}
        <div>
          <button className="btn btn-primary" disabled={enviando || !actual || !nueva || !repetir}>
            <KeyRound size={16} /> {enviando ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function CambiarCorreo() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setListo(null);
    const nuevo = email.trim().toLowerCase();
    try {
      // El backend devuelve una sesión nueva: se guarda para seguir conectado con el correo nuevo.
      login(await authApi.cambiarCorreo(nuevo, password));
      setEmail('');
      setPassword('');
      setListo(nuevo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el correo');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Cambiar correo">
      <form className="stack" onSubmit={enviar}>
        <p className="muted small">Es el correo con el que ingresas al panel. Confirma el cambio con tu contraseña.</p>
        <Field label="Correo nuevo">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={150} autoComplete="email" placeholder="nuevo@correo.com" />
        </Field>
        <Field label="Contraseña">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={72} autoComplete="current-password" />
        </Field>
        {error && <Alert>{error}</Alert>}
        {listo && (
          <Alert tone="teal">
            <Check size={16} style={{ verticalAlign: -3 }} /> Listo: ahora ingresas con <b>{listo}</b>.
          </Alert>
        )}
        <div>
          <button className="btn btn-primary" disabled={enviando || !email.trim() || !password}>
            <Mail size={16} /> {enviando ? 'Guardando…' : 'Cambiar correo'}
          </button>
        </div>
      </form>
    </Card>
  );
}
