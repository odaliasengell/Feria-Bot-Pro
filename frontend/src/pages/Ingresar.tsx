import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, IdCard, LayoutDashboard, Store } from 'lucide-react';
import type { Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Alert, Field } from '../components/ui';
import CodigoCorreo from '../components/CodigoCorreo';

const ROLES: { id: Role; label: string; icon: typeof Store; desc: string }[] = [
  { id: 'visitante', label: 'Visitante', icon: IdCard, desc: 'Tu tarjeta QR y las empresas que visitaste' },
  { id: 'empresa', label: 'Empresa', icon: Store, desc: 'Escanea visitantes y revisa tus leads' },
  { id: 'organizador', label: 'Organizador', icon: LayoutDashboard, desc: 'Administra empresas, visitantes y leads' },
];

export default function Ingresar() {
  const [params] = useSearchParams();
  const inicial = (params.get('rol') as Role) || 'visitante';
  const [rol, setRol] = useState<Role>(ROLES.some((r) => r.id === inicial) ? inicial : 'visitante');
  const { login } = useAuth();
  const navigate = useNavigate();

  const [codigo, setCodigo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Correo del visitante al que se envió el código para ingresar. */
  const [correoPendiente, setCorreoPendiente] = useState<string | null>(null);

  async function entrar(e: FormEvent) {
    e.preventDefault();
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
      navigate(`/${rol}`);
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
          <img src="/favicon.png" alt="" width={36} height={36} />
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
              navigate('/visitante');
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
              <Field label="Código de tu tarjeta o correo" hint="El código está debajo de tu QR, por ejemplo FB-7K3PQX. Si usas tu correo, te enviaremos un código.">
                <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="FB-XXXXXX o tu@correo.com" required autoFocus />
              </Field>
              <p className="muted small">
                ¿Aún no tienes tarjeta? <Link to="/registro">Regístrate aquí</Link>
              </p>
            </>
          )}
          {rol !== 'visitante' && (
            <>
              <Field label="Correo" hint={rol === 'empresa' ? 'El correo registrado de tu empresa.' : undefined}>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
              </Field>
              <Field label="Contraseña" hint={rol === 'empresa' ? 'Te la entrega la organización de la feria.' : undefined}>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
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
