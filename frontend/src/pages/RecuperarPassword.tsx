import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Alert, Field } from '../components/ui';
import CodigoCorreo from '../components/CodigoCorreo';
import PasswordInput from '../components/PasswordInput';
import { useToast } from '../context/ToastContext';
import { errorConfirmacion, errorEmail, errorPassword } from '../lib/validacion';
import { useValidacion } from '../lib/useValidacion';

type RolConPassword = 'empresa' | 'organizador';

/** Olvidé mi contraseña: código por correo y nueva contraseña (empresas y organizador). */
export default function RecuperarPassword() {
  const [params] = useSearchParams();
  const role: RolConPassword = params.get('rol') === 'organizador' ? 'organizador' : 'empresa';
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const correo = email.trim().toLowerCase();
  const toast = useToast();
  const vCorreo = useValidacion({ email: errorEmail(email) });
  const vPass = useValidacion({ password: errorPassword(password), confirmar: errorConfirmacion(password, confirmar) });

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    if (!vCorreo.validar()) return;
    setEnviando(true);
    setError(null);
    try {
      await authApi.recuperarEnviarCodigo(correo, role);
      setPaso('codigo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el código');
    } finally {
      setEnviando(false);
    }
  }

  async function cambiar(codigo: string) {
    if (!vPass.validar()) throw new Error(errorPassword(password) ?? errorConfirmacion(password, confirmar) ?? 'Revisa la contraseña.');
    login(await authApi.recuperarCambiar(correo, role, codigo, password));
    toast.exito('Contraseña cambiada. ¡Bienvenido de nuevo!');
    navigate(`/${role}`);
  }

  return (
    <div className="auth-page">
      <div className="auth-side">
        <Link to="/" className="brand">
          <img src="/favicon.png" alt="" width={36} height={36} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </Link>
        <div>
          <h2>Recupera el acceso a tu cuenta.</h2>
          <p>Te enviaremos un código a tu correo para que elijas una contraseña nueva.</p>
        </div>
        <small>Si no recuerdas qué correo usaste, pídelo a la organización de la feria.</small>
      </div>

      <div className="auth-main">
        <Link to={`/ingresar?rol=${role}`} className="back-link">
          <ArrowLeft size={16} /> Volver a ingresar
        </Link>
        <h1>
          <KeyRound size={26} /> Olvidé mi contraseña
        </h1>
        <p className="muted">{role === 'empresa' ? 'Cuenta de empresa participante' : 'Cuenta de la organización'}</p>

        {paso === 'correo' ? (
          <form className="auth-form" onSubmit={pedirCodigo}>
            <Field label="Correo de tu cuenta" error={vCorreo.error('email')}>
              <input
                className="input"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={vCorreo.tocar('email')}
                aria-invalid={!!vCorreo.error('email')}
                autoComplete="username"
                autoFocus
              />
            </Field>
            {error && <Alert tone="orange">{error}</Alert>}
            <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
              {enviando ? 'Enviando código…' : 'Enviarme un código'} <ArrowRight size={18} />
            </button>
          </form>
        ) : (
          <CodigoCorreo
            email={correo}
            mensaje={
              <>
                Si <b>{correo}</b> tiene una cuenta, le enviamos un código de 6 dígitos.
              </>
            }
            textoBoton="Cambiar contraseña y entrar"
            onVerificar={cambiar}
            onReenviar={async () => {
              await authApi.recuperarEnviarCodigo(correo, role);
            }}
            onCambiarCorreo={() => {
              setError(null);
              setPaso('correo');
            }}
          >
            <Field label="Nueva contraseña" error={vPass.error('password')}>
              <PasswordInput
                value={password}
                onChange={setPassword}
                onBlur={vPass.tocar('password')}
                invalid={!!vPass.error('password')}
                autoComplete="new-password"
                mostrarFuerza
              />
            </Field>
            <Field label="Repite la contraseña" error={confirmar && password !== confirmar ? 'Las contraseñas no coinciden.' : vPass.error('confirmar')}>
              <PasswordInput
                value={confirmar}
                onChange={setConfirmar}
                onBlur={vPass.tocar('confirmar')}
                invalid={!!vPass.error('confirmar') || (!!confirmar && password !== confirmar)}
                autoComplete="new-password"
              />
            </Field>
          </CodigoCorreo>
        )}
      </div>
    </div>
  );
}
