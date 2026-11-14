import { useState, type FormEvent } from 'react';
import { Check, KeyRound, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Alert, Card, Field, PageHeader } from '../components/ui';
import PasswordInput from '../components/PasswordInput';
import MiPlanTarjeta from '../components/MiPlanTarjeta';
import { useToast } from '../context/ToastContext';
import { errorConfirmacion, errorEmail, errorPassword } from '../lib/validacion';
import { useValidacion } from '../lib/useValidacion';

/** Perfil del organizador, la empresa y el Super Administrador: contraseña y correo de ingreso (y el plan del organizador). */
export default function Perfil() {
  const { session } = useAuth();
  return (
    <>
      <PageHeader title="Perfil" subtitle={`Datos de acceso de ${session?.nombre ?? 'tu cuenta'}.`} />
      {session?.role === 'organizador' && <MiPlanTarjeta />}
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
  const toast = useToast();
  const v = useValidacion({
    actual: actual ? null : 'Escribe tu contraseña actual.',
    nueva: errorPassword(nueva) ?? (nueva === actual ? 'La nueva contraseña debe ser distinta de la actual.' : null),
    repetir: errorConfirmacion(nueva, repetir),
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setListo(false);
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    try {
      await authApi.cambiarPassword(actual, nueva);
      setActual('');
      setNueva('');
      setRepetir('');
      v.reiniciar();
      setListo(true);
      toast.exito('Contraseña actualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Cambiar contraseña">
      <form className="stack" onSubmit={enviar}>
        <Field label="Contraseña actual" error={v.error('actual')}>
          <PasswordInput value={actual} onChange={setActual} onBlur={v.tocar('actual')} invalid={!!v.error('actual')} autoComplete="current-password" />
        </Field>
        <Field label="Nueva contraseña" error={v.error('nueva')}>
          <PasswordInput value={nueva} onChange={setNueva} onBlur={v.tocar('nueva')} invalid={!!v.error('nueva')} autoComplete="new-password" mostrarFuerza />
        </Field>
        <Field label="Repite la nueva contraseña" error={repetir && nueva !== repetir ? 'Las contraseñas no coinciden.' : v.error('repetir')}>
          <PasswordInput value={repetir} onChange={setRepetir} onBlur={v.tocar('repetir')} invalid={!!v.error('repetir') || (!!repetir && nueva !== repetir)} autoComplete="new-password" />
        </Field>
        {error && <Alert>{error}</Alert>}
        {listo && (
          <Alert tone="teal">
            <Check size={16} style={{ verticalAlign: -3 }} /> Contraseña actualizada. Úsala la próxima vez que ingreses.
          </Alert>
        )}
        <div>
          <button className="btn btn-primary" disabled={enviando}>
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
  const toast = useToast();
  const v = useValidacion({ email: errorEmail(email), password: password ? null : 'Confirma con tu contraseña.' });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    setListo(null);
    const nuevo = email.trim().toLowerCase();
    try {
      // El backend devuelve una sesión nueva: se guarda para seguir conectado con el correo nuevo.
      login(await authApi.cambiarCorreo(nuevo, password));
      setEmail('');
      setPassword('');
      v.reiniciar();
      setListo(nuevo);
      toast.exito(`Correo actualizado: ahora ingresas con ${nuevo}.`);
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
        <Field label="Correo nuevo" error={v.error('email')}>
          <input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={v.tocar('email')} aria-invalid={!!v.error('email')} maxLength={150} autoComplete="email" placeholder="nuevo@correo.com" />
        </Field>
        <Field label="Contraseña" error={v.error('password')}>
          <PasswordInput value={password} onChange={setPassword} onBlur={v.tocar('password')} invalid={!!v.error('password')} autoComplete="current-password" />
        </Field>
        {error && <Alert>{error}</Alert>}
        {listo && (
          <Alert tone="teal">
            <Check size={16} style={{ verticalAlign: -3 }} /> Listo: ahora ingresas con <b>{listo}</b>.
          </Alert>
        )}
        <div>
          <button className="btn btn-primary" disabled={enviando}>
            <Mail size={16} /> {enviando ? 'Guardando…' : 'Cambiar correo'}
          </button>
        </div>
      </form>
    </Card>
  );
}
