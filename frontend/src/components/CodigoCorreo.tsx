import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, MailCheck } from 'lucide-react';
import { Alert, Field } from './ui';

const ESPERA_REENVIO = 60;

/** Paso donde el usuario escribe el código de 6 dígitos que le llegó al correo. */
export default function CodigoCorreo({
  email,
  textoBoton,
  onVerificar,
  onReenviar,
  onCambiarCorreo,
  mensaje,
  children,
}: {
  email: string;
  /** Reemplaza el aviso "Enviamos un código a …". */
  mensaje?: ReactNode;
  textoBoton: string;
  onVerificar: (codigo: string) => Promise<void>;
  onReenviar: () => Promise<void>;
  onCambiarCorreo: () => void;
  /** Campos extra debajo del código (por ejemplo, la nueva contraseña). */
  children?: ReactNode;
}) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(ESPERA_REENVIO);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function verificar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      await onVerificar(codigo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar el código');
      setEnviando(false);
    }
  }

  async function reenviar() {
    setError(null);
    setAviso(null);
    try {
      await onReenviar();
      setEspera(ESPERA_REENVIO);
      setCodigo('');
      setAviso('Te enviamos un código nuevo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el código');
    }
  }

  return (
    <form className="auth-form" onSubmit={verificar}>
      <Alert tone="blue">
        <MailCheck size={18} />{' '}
        {mensaje ?? (
          <>
            Enviamos un código de 6 dígitos a <b>{email}</b>.
          </>
        )}{' '}
        Revisa también la carpeta de spam.
      </Alert>
      <Field label="Código de verificación">
        <input
          className="input"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          placeholder="123456"
          required
          autoFocus
        />
      </Field>
      {children}
      {aviso && <Alert tone="teal">{aviso}</Alert>}
      {error && <Alert tone="orange">{error}</Alert>}
      <button className="btn btn-primary btn-lg btn-block" disabled={enviando || codigo.length !== 6}>
        {enviando ? 'Verificando…' : textoBoton} <ArrowRight size={18} />
      </button>
      <p className="muted small center">
        {espera > 0 ? (
          <>¿No llegó? Puedes pedir otro en {espera} s</>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reenviar}>
            Reenviar código
          </button>
        )}{' '}
        ·{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCambiarCorreo}>
          Cambiar correo
        </button>
      </p>
    </form>
  );
}
