import { useState, type FormEvent } from 'react';
import { Lock, Trash2, UserPlus, UsersRound } from 'lucide-react';
import type { UsuarioEmpresa } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { empresasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { fecha } from '../../lib/utils';
import { Alert, Avatar, Card, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';
import PasswordInput from '../../components/PasswordInput';
import { mensajeError, useToast } from '../../context/ToastContext';
import { errorEmail, errorNombre, errorPassword } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';

/** «Mi equipo»: la cuenta principal de la empresa agrega y quita vendedores que escanean con su propia cuenta. */
export default function EmpresaEquipo() {
  const { session } = useAuth();
  const empresaId = session?.refId ?? '';

  // Un vendedor no administra el equipo (el backend responde 403): ni siquiera se pide la lista.
  if (session?.usuarioId)
    return (
      <>
        <PageHeader title="Mi equipo" />
        <EmptyState icon={<Lock />} title="Solo la cuenta principal administra el equipo">
          Pide a la persona responsable de {session.nombre} que agregue o quite vendedores.
        </EmptyState>
      </>
    );

  return <Equipo empresaId={empresaId} />;
}

function Equipo({ empresaId }: { empresaId: string }) {
  const { data, cargando, error, recargar } = useAsync(() => empresasApi.usuarios(empresaId), [empresaId]);
  const [agregando, setAgregando] = useState(false);
  const toast = useToast();

  async function quitar(u: UsuarioEmpresa) {
    if (!confirm(`¿Quitar a ${u.nombre} del equipo? Ya no podrá ingresar. Los leads que registró se conservan con su nombre.`)) return;
    try {
      await empresasApi.quitarUsuario(empresaId, u.id);
      toast.exito(`${u.nombre} ya no forma parte del equipo.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo quitar al vendedor.'));
    }
  }

  const usuarios = data ?? [];

  return (
    <>
      <PageHeader
        title="Mi equipo"
        subtitle="Cada vendedor entra con su propio correo y contraseña en el portal de empresas. En los leads verás quién registró cada contacto."
        actions={
          <button className="btn btn-primary" onClick={() => setAgregando(true)}>
            <UserPlus size={17} /> Agregar vendedor
          </button>
        }
      />

      {cargando && !data ? (
        <Loader />
      ) : error && !data ? (
        <Alert>{error}</Alert>
      ) : usuarios.length === 0 ? (
        <EmptyState icon={<UsersRound />} title="Aún no hay vendedores">
          Agrega a las personas que atenderán el stand para que escaneen con su propia cuenta.
        </EmptyState>
      ) : (
        <Card>
          <ul className="mini-list equipo-list">
            {usuarios.map((u) => (
              <li key={u.id}>
                <Avatar nombre={u.nombre} size={38} />
                <div>
                  <strong>{u.nombre}</strong>
                  <span>{u.email}</span>
                </div>
                <small className="muted nowrap">Desde {fecha(u.creadoEn)}</small>
                <button className="icon-btn danger" onClick={() => quitar(u)} aria-label={`Quitar a ${u.nombre}`} title="Quitar del equipo">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small mt-sm">
            {usuarios.length} {usuarios.length === 1 ? 'vendedor' : 'vendedores'}
          </p>
        </Card>
      )}

      <Modal open={agregando} onClose={() => setAgregando(false)} title="Agregar vendedor">
        {agregando && (
          <FormVendedor
            empresaId={empresaId}
            onCreado={(nombre) => {
              setAgregando(false);
              toast.exito(`${nombre} se agregó al equipo.`);
              recargar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FormVendedor({ empresaId, onCreado }: { empresaId: string; onCreado: (nombre: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const v = useValidacion({ nombre: errorNombre(nombre), email: errorEmail(email), password: errorPassword(password) });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    try {
      await empresasApi.agregarUsuario(empresaId, { nombre: nombre.trim(), email: email.trim().toLowerCase(), password });
      onCreado(nombre.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar al vendedor');
      setEnviando(false);
    }
  }

  return (
    <form className="stack" onSubmit={enviar}>
      <Field label="Nombre" error={v.error('nombre')}>
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={v.tocar('nombre')} aria-invalid={!!v.error('nombre')} maxLength={150} autoFocus placeholder="Ej. Ana Torres" />
      </Field>
      <Field label="Correo" hint="Con este correo ingresará en el portal de empresas." error={v.error('email')}>
        <input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={v.tocar('email')} aria-invalid={!!v.error('email')} maxLength={150} autoComplete="off" placeholder="ana@empresa.com" />
      </Field>
      <Field label="Contraseña" hint="Compártela con el vendedor; podrá cambiarla en su perfil." error={v.error('password')}>
        <PasswordInput value={password} onChange={setPassword} onBlur={v.tocar('password')} invalid={!!v.error('password')} autoComplete="new-password" mostrarFuerza visibleInicial />
      </Field>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary btn-block" disabled={enviando}>
        <UserPlus size={16} /> {enviando ? 'Agregando…' : 'Agregar al equipo'}
      </button>
    </form>
  );
}
