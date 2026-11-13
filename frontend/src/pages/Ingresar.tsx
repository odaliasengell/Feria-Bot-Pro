import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, IdCard, LayoutDashboard, Store } from 'lucide-react';
import type { Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Alert, Field } from '../components/ui';
import CodigoCorreo from '../components/CodigoCorreo';
import PasswordInput from '../components/PasswordInput';
import { errorCodigoTarjeta, errorEmail } from '../lib/validacion';
import { usePagina } from '../lib/seo';
import { useValidacion } from '../lib/useValidacion';

const ROLES: { id: Role; label: string; icon: typeof Store; desc: string }[] = [
  { id: 'visitante', label: 'Visitante', icon: IdCard, desc: 'Tu tarjeta QR y las empresas que visitaste' },
  { id: 'empresa', label: 'Empresa', icon: Store, desc: 'Escanea visitantes y revisa tus leads' },
  { id: 'organizador', label: 'Organizador', icon: LayoutDashboard, desc: 'Administra empresas, visitantes y leads' },
];

export default function Ingresar() {
  const [params] = useSearchParams();
  const inicial = (params.get('rol') as Role) || 'visitante';
  /** Feria desde la que llegó el visitante (registro con correo ya existente): se le ofrece inscribirse al entrar. */
  const feriaPendiente = params.get('feria');
  const destinoVisitante = feriaPendiente ? `/visitante?feria=${encodeURIComponent(feriaPendiente)}` : '/visitante';
  const [rol, setRol] = useState<Role>(ROLES.some((r) => r.id === inicial) ? inicial : 'visitante');
  const { login } = useAuth();
  const navigate = useNavigate();
  usePagina({ titulo: 'Ingresar', noIndex: true });

  const [codigo, setCodigo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Correo del visitante al que se envió el código para ingresar. */
  const [correoPendiente, setCorreoPendiente] = useState<string | null>(null);
  const esVisitante = rol === 'visitante';
  const v = useValidacion({
    codigo: esVisitante ? errorCodigoTarjeta(codigo) : null,
    email: esVisitante ? null : errorEmail(email),
    password: esVisitante || password ? null : 'Escribe tu contraseña.',
  });

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setError(null);
    setEnviando(true);
    try {
      if (rol === 'visitante' && codigo.includes('@')) {
        const correo = codigo.trim().toLowerCase();
        await authApi.enviarCodigo(correo, 'ingreso');
        setCorreoPendiente(correo);
        return;
      }
      const auth =
        rol === 'organizador'
          ? await authApi.organizador(email.trim(), password)
          : rol === 'empresa'
            ? await authApi.empresa(email.trim(), password)
            : await authApi.visitante(codigo.trim());
      login(auth);
      navigate(rol === 'visitante' ? destinoVisitante : `/${rol}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-side">
        <Link to="/" className="brand">
          <img src="/logo-64.png" alt="" width={36} height={36} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </Link>
        <div>
          <h2>Una feria más conectada, contactos mejor organizados.</h2>
          <p>Elige cómo participas en la feria para entrar a tu espacio.</p>
        </div>
        <small>Visitantes: con el código de su tarjeta. Organización y empresas: con su correo y contraseña.</small>
      </div>

      <div className="auth-main">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
        <h1>Ingresar</h1>

        <div className="role-tabs" role="tablist">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={rol === r.id}
              className={`role-tab role-${r.id} ${rol === r.id ? 'active' : ''}`}
              onClick={() => {
                setRol(r.id);
                setError(null);
                setCorreoPendiente(null);
                v.reiniciar();
              }}
            >
              <r.icon size={22} />
              <strong>{r.label}</strong>
              <span>{r.desc}</span>
            </button>
          ))}
        </div>

        {rol === 'visitante' && correoPendiente ? (
          <CodigoCorreo
            email={correoPendiente}
            textoBoton="Entrar"
            onVerificar={async (c) => {
              login(await authApi.visitanteCorreo(correoPendiente, c));
              navigate(destinoVisitante);
            }}
            onReenviar={async () => {
              await authApi.enviarCodigo(correoPendiente, 'ingreso');
            }}
            onCambiarCorreo={() => setCorreoPendiente(null)}
          />
        ) : (
        <form className="auth-form" onSubmit={entrar}>
          {rol === 'visitante' && (
            <>
              <Field
                label="Código de tu tarjeta o correo"
                hint="El código está debajo de tu QR, por ejemplo FB-7K3PQX. Si usas tu correo, te enviaremos un código."
                error={v.error('codigo')}
              >
                <input
                  className="input"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  onBlur={v.tocar('codigo')}
                  aria-invalid={!!v.error('codigo')}
                  placeholder="FB-XXXXXX o tu@correo.com"
                  autoCapitalize="characters"
                  autoFocus
                />
              </Field>
              <p className="muted small">
                ¿Aún no tienes tarjeta? <Link to="/registro">Regístrate aquí</Link>
              </p>
            </>
          )}
          {rol !== 'visitante' && (
            <>
              <Field label="Correo" hint={rol === 'empresa' ? 'El correo registrado de tu empresa.' : undefined} error={v.error('email')}>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={v.tocar('email')}
                  aria-invalid={!!v.error('email')}
                  autoComplete="username"
                  autoFocus
                />
              </Field>
              <Field label="Contraseña" hint={rol === 'empresa' ? 'Te la entrega la organización de la feria.' : undefined} error={v.error('password')}>
                <PasswordInput value={password} onChange={setPassword} onBlur={v.tocar('password')} invalid={!!v.error('password')} autoComplete="current-password" />
              </Field>
              <p className="muted small">
                <Link to={`/recuperar?rol=${rol}${email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ''}`}>¿Olvidaste tu contraseña?</Link>
              </p>
            </>
          )}

          {error && <Alert tone="orange">{error}</Alert>}

          <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
            {enviando ? 'Ingresando…' : rol === 'visitante' && codigo.includes('@') ? 'Enviarme un código' : 'Entrar'} <ArrowRight size={18} />
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
