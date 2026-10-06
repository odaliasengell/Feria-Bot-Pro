import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi, visitantesApi } from '../services/api';
import { Alert } from '../components/ui';
import CodigoCorreo from '../components/CodigoCorreo';
import FormVisitante, { visitanteVacio } from './organizador/FormVisitante';

/** Registro que el propio visitante hace al ingresar a la feria. */
export default function RegistroVisitante() {
  const [form, setForm] = useState(visitanteVacio);
  const [paso, setPaso] = useState<'datos' | 'codigo'>('datos');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const email = form.email.trim().toLowerCase();

  async function registrar(codigoVerificacion?: string) {
    const v = await visitantesApi.crear(form, codigoVerificacion);
    login(await authApi.visitante(v.codigo));
    navigate('/visitante?nuevo=1');
  }

  /** Con correo, primero se envía el código y el registro se completa al verificarlo. */
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      if (email) {
        await authApi.enviarCodigo(email, 'registro');
        setPaso('codigo');
      } else {
        await registrar();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-side tone-teal">
        <Link to="/" className="brand">
          <img src="/favicon.png" alt="" width={36} height={36} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </Link>
        <div>
          <h2>Tu credencial con QR en un minuto.</h2>
          <p>Preséntala en los stands: cada empresa que la escanee quedará en tu historial con sus datos de contacto.</p>
        </div>
        <small>Tus datos solo se comparten con las empresas que escanean tu QR.</small>
      </div>

      <div className="auth-main">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
        <h1>
          <Sparkles size={26} className="text-teal" /> Registro de visitante
        </h1>
        {paso === 'datos' ? (
          <>
            <p className="muted">Completa tus datos para recibir tu tarjeta con QR personal.</p>

            <form className="auth-form" onSubmit={enviar}>
              <FormVisitante value={form} onChange={setForm} />
              {error && <Alert tone="orange">{error}</Alert>}
              <button className="btn btn-teal btn-lg btn-block" disabled={enviando}>
                {enviando ? 'Enviando código…' : 'Continuar'} <ArrowRight size={18} />
              </button>
              <p className="muted small center">
                ¿Ya tienes tarjeta? <Link to="/ingresar?rol=visitante">Ingresa con tu código</Link>
              </p>
            </form>
          </>
        ) : (
          <>
            <p className="muted">Confirma tu correo para recibir tu tarjeta.</p>
            <CodigoCorreo
              email={email}
              textoBoton="Obtener mi tarjeta QR"
              onVerificar={registrar}
              onReenviar={async () => {
                await authApi.enviarCodigo(email, 'registro');
              }}
              onCambiarCorreo={() => {
                setError(null);
                setPaso('datos');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
