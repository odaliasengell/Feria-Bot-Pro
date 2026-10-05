import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, IdCard, LayoutDashboard, Store } from 'lucide-react';
import type { Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { empresasApi, visitantesApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { leerQrVisitante } from '../lib/utils';
import { Alert, Field } from '../components/ui';

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
  const [empresaId, setEmpresaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const empresas = useAsync(() => empresasApi.listar(), []);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (rol === 'organizador') {
        login({ role: 'organizador', nombre: 'Organización' });
      } else if (rol === 'empresa') {
        const emp = empresas.data?.find((x) => x.id === empresaId);
        if (!emp) throw new Error('Selecciona tu empresa.');
        login({ role: 'empresa', refId: emp.id, nombre: emp.nombre });
      } else {
        const q = codigo.includes('@') ? codigo : (leerQrVisitante(codigo) ?? codigo);
        const v = await visitantesApi.buscar(q);
        if (!v) throw new Error('No encontramos ese código o correo. ¿Ya te registraste?');
        login({ role: 'visitante', refId: v.id, nombre: v.nombre });
      }
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
        <small>Modo demo · los datos se guardan en este navegador hasta conectar el backend.</small>
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
              }}
            >
              <r.icon size={22} />
              <strong>{r.label}</strong>
              <span>{r.desc}</span>
            </button>
          ))}
        </div>

        <form className="auth-form" onSubmit={entrar}>
          {rol === 'visitante' && (
            <>
              <Field label="Código de tu tarjeta o correo" hint="El código está debajo de tu QR, por ejemplo FB-7K3PQX">
                <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="FB-XXXXXX o tu@correo.com" required autoFocus />
              </Field>
              <p className="muted small">
                ¿Aún no tienes tarjeta? <Link to="/registro">Regístrate aquí</Link>
              </p>
            </>
          )}
          {rol === 'empresa' && (
            <Field label="Tu empresa" hint="En producción cada empresa tendrá su propio usuario y contraseña.">
              <select className="input" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {empresas.data?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} — Stand {e.stand}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {rol === 'organizador' && <Alert tone="blue">Acceso de demostración al panel de la organización.</Alert>}

          {error && <Alert tone="orange">{error}</Alert>}

          <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Entrar'} <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
