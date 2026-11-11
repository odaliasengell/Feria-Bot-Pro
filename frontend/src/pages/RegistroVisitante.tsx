import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, MapPin, Sparkles } from 'lucide-react';
import type { Feria } from '../types';
import { useAuth } from '../context/AuthContext';
import { ApiError, authApi, feriasApi, visitantesApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { rangoFechas } from '../lib/utils';
import { Alert, EmptyState, Loader } from '../components/ui';
import CodigoCorreo from '../components/CodigoCorreo';
import AceptoPolitica from '../components/AceptoPolitica';
import FormVisitante, { erroresVisitante, visitanteVacio } from './organizador/FormVisitante';
import { useValidacion } from '../lib/useValidacion';

/**
 * Registro del visitante a una feria creada por el organizador.
 * `/registro` muestra las ferias con inscripción abierta; `/registro/:feriaId` (enlace o QR de la feria) entra directo.
 */
export default function RegistroVisitante() {
  const { feriaId } = useParams();
  const [elegida, setElegida] = useState<Feria | null>(null);
  const { data, cargando } = useAsync(
    () => (feriaId ? feriasApi.obtener(feriaId).then((f) => (f ? [f] : [])) : feriasApi.listar(true)),
    [feriaId],
  );

  const feria = elegida ?? (feriaId ? (data?.[0] ?? null) : null);

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
          <p>Inscríbete a la feria y presenta tu QR en los stands: cada empresa que lo escanee quedará en tu historial con sus datos de contacto.</p>
        </div>
        <small>
          Tus datos solo se comparten con las empresas que escanean tu QR. <Link to="/privacidad">Política de privacidad</Link>
        </small>
      </div>

      <div className="auth-main">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
        <h1>
          <Sparkles size={26} className="text-teal" /> Registro de visitante
        </h1>

        {cargando && !data ? (
          <Loader />
        ) : feriaId && !feria ? (
          <EmptyState icon={<CalendarDays />} title="Esta feria no existe">
            <Link to="/registro" className="btn btn-primary">Ver ferias abiertas</Link>
          </EmptyState>
        ) : feria ? (
          <FormularioRegistro feria={feria} onCambiarFeria={feriaId ? undefined : () => setElegida(null)} />
        ) : (
          <ElegirFeria ferias={data ?? []} onElegir={setElegida} />
        )}
      </div>
    </div>
  );
}

function ElegirFeria({ ferias, onElegir }: { ferias: Feria[]; onElegir: (f: Feria) => void }) {
  if (ferias.length === 0)
    return (
      <EmptyState icon={<CalendarDays />} title="No hay ferias con inscripciones abiertas">
        Vuelve pronto o pide el enlace de registro a la organización de la feria.
      </EmptyState>
    );
  return (
    <>
      <p className="muted">Elige la feria a la que vas a asistir.</p>
      <ul className="feria-list">
        {ferias.map((f) => (
          <li key={f.id}>
            <button type="button" className="feria-option" onClick={() => onElegir(f)}>
              <div className="grow">
                <strong>
                  {f.nombre} {f.llena && <span className="badge tone-orange">Feria llena</span>}
                </strong>
                <span className="feria-card-meta muted small">
                  <span>
                    <CalendarDays size={14} /> {rangoFechas(f.fechaInicio, f.fechaFin)}
                  </span>
                  {f.lugar && (
                    <span>
                      <MapPin size={14} /> {f.lugar}
                    </span>
                  )}
                </span>
                {f.descripcion && <span className="feria-option-desc">{f.descripcion}</span>}
              </div>
              <ChevronRight size={20} />
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small center">
        ¿Ya tienes cuenta? <Link to="/ingresar?rol=visitante">Ingresa</Link> para inscribirte a otra feria.
      </p>
    </>
  );
}

function FormularioRegistro({ feria, onCambiarFeria }: { feria: Feria; onCambiarFeria?: () => void }) {
  const [form, setForm] = useState(visitanteVacio);
  const [acepta, setAcepta] = useState(false);
  const [paso, setPaso] = useState<'datos' | 'codigo'>('datos');
  const [error, setError] = useState<string | null>(null);
  const [yaTieneCuenta, setYaTieneCuenta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const email = form.email.trim().toLowerCase();
  const v = useValidacion(erroresVisitante(form));

  async function registrar(codigoVerificacion?: string) {
    const v = await visitantesApi.crear(feria.id, form, codigoVerificacion);
    login(await authApi.visitante(v.codigo));
    navigate(`/visitante?nuevo=1&feria=${encodeURIComponent(feria.id)}`);
  }

  /** Con correo, primero se envía el código y el registro se completa al verificarlo. */
  async function enviar(e: FormEvent) {
    e.preventDefault();
    const datosOk = v.validar();
    if (!datosOk) {
      setError('Revisa los campos marcados en rojo.');
      return;
    }
    if (!acepta) {
      setError('Debes aceptar la política de privacidad y tratamiento de datos.');
      return;
    }
    setEnviando(true);
    setError(null);
    setYaTieneCuenta(false);
    try {
      if (email) {
        await authApi.enviarCodigo(email, 'registro');
        setPaso('codigo');
      } else {
        await registrar();
      }
    } catch (err) {
      setYaTieneCuenta(err instanceof ApiError && err.status === 409 && !!email);
      setError(err instanceof Error ? err.message : 'No se pudo registrar');
    } finally {
      setEnviando(false);
    }
  }

  const resumen = (
    <div className="feria-elegida">
      <div className="grow">
        <span className="eyebrow dark">Te inscribes a</span>
        <strong>{feria.nombre}</strong>
        <span className="muted small">
          {rangoFechas(feria.fechaInicio, feria.fechaFin)}
          {feria.lugar && ` · ${feria.lugar}`}
        </span>
      </div>
      {onCambiarFeria && paso === 'datos' && (
        <button type="button" className="link-btn" onClick={onCambiarFeria}>
          Cambiar
        </button>
      )}
    </div>
  );

  if (feria.abierta && feria.llena)
    return (
      <>
        {resumen}
        <Alert>Feria llena: se alcanzó el aforo y ya no se aceptan inscripciones.</Alert>
        <Link to="/registro" className="btn btn-outline">Ver otras ferias</Link>
      </>
    );

  if (!feria.abierta)
    return (
      <>
        {resumen}
        <Alert>Las inscripciones para esta feria están cerradas.</Alert>
        <Link to="/registro" className="btn btn-outline">Ver otras ferias</Link>
      </>
    );

  return paso === 'datos' ? (
    <>
      {resumen}
      <p className="muted">Completa tus datos para recibir tu tarjeta con QR personal.</p>
      <form className="auth-form" onSubmit={enviar}>
        <FormVisitante value={form} onChange={setForm} error={v.error} tocar={v.tocar} />
        <AceptoPolitica checked={acepta} onChange={setAcepta} />
        {error && (
          <Alert tone="orange">
            {error}
            {yaTieneCuenta && (
              <>
                {' '}
                <Link to={`/ingresar?rol=visitante&feria=${encodeURIComponent(feria.id)}`}>Ingresar ahora</Link>
              </>
            )}
          </Alert>
        )}
        <button className="btn btn-teal btn-lg btn-block" disabled={enviando}>
          {enviando ? 'Enviando código…' : 'Continuar'} <ArrowRight size={18} />
        </button>
        <p className="muted small center">
          ¿Ya tienes tarjeta? <Link to={`/ingresar?rol=visitante&feria=${encodeURIComponent(feria.id)}`}>Ingresa con tu código</Link>
        </p>
      </form>
    </>
  ) : (
    <>
      {resumen}
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
  );
}
