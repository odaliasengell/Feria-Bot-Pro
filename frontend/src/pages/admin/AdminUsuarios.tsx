import { useState, type FormEvent } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { SuperAdminUsuario } from '../../types';
import { adminApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../context/AuthContext';
import { mensajeError, useToast } from '../../context/ToastContext';
import { useConfirmar } from '../../context/ConfirmarContext';
import { errorEmail, errorNombre, errorPassword } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';
import { haceCuanto } from '../../lib/utils';
import { Alert, Avatar, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';
import PasswordInput from '../../components/PasswordInput';

/** Equipo de FeriaBot Pro: personas con acceso de Super Administrador. */
export default function AdminUsuarios() {
  const { session } = useAuth();
  const { data, cargando, error, recargar } = useAsync(() => adminApi.usuarios(), []);
  const [nuevo, setNuevo] = useState(false);
  const toast = useToast();
  const confirmar = useConfirmar();

  async function quitar(u: SuperAdminUsuario) {
    const ok = await confirmar({
      titulo: 'Quitar acceso',
      mensaje: (
        <>
          <p>
            ¿Quitar el acceso de <b>{u.nombre}</b> ({u.email})?
          </p>
          <p className="muted small">Ya no podrá entrar al panel de administración.</p>
        </>
      ),
      confirmar: 'Quitar acceso',
      peligro: true,
    });
    if (!ok) return;
    try {
      await adminApi.eliminarUsuario(u.id);
      toast.exito(`${u.nombre} ya no tiene acceso.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo quitar el acceso.'));
    }
  }

  return (
    <>
      <PageHeader
        title="Equipo de FeriaBot Pro"
        subtitle="Personas de tu empresa que pueden entrar a este panel: crean organizadores, asignan planes y ven el uso."
        actions={
          <button className="btn btn-primary" onClick={() => setNuevo(true)}>
            <Plus size={17} /> Agregar persona
          </button>
        }
      />
      {cargando && !data ? (
        <Loader />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Sin usuarios" />
      ) : (
        <div className="table-card">
          <ul className="admin-equipo">
            {(data ?? []).map((u) => (
              <li key={u.id}>
                <Avatar nombre={u.nombre} size={40} />
                <div className="grow">
                  <strong>
                    {u.nombre} {u.id === session?.refId && <span className="badge tone-teal">Tú</span>}
                  </strong>
                  <span className="muted small">
                    {u.email} · desde {haceCuanto(u.creadoEn)}
                  </span>
                </div>
                {u.id !== session?.refId && (
                  <button className="icon-btn danger" onClick={() => quitar(u)} aria-label={`Quitar a ${u.nombre}`} title="Quitar acceso">
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small admin-nota">
        Las personas del equipo entran en <code>/ingresar?rol=superadmin</code> con su correo y contraseña.
      </p>

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Agregar persona al equipo">
        {nuevo && (
          <NuevoUsuario
            onCreado={(u) => {
              setNuevo(false);
              toast.exito(`${u.nombre} ya puede entrar al panel.`);
              recargar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function NuevoUsuario({ onCreado }: { onCreado: (u: SuperAdminUsuario) => void }) {
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
      onCreado(await adminApi.crearUsuario({ nombre: nombre.trim(), email: email.trim(), password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="stack">
      <Field label="Nombre" error={v.error('nombre')}>
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={v.tocar('nombre')} aria-invalid={!!v.error('nombre')} maxLength={150} autoFocus />
      </Field>
      <Field label="Correo" error={v.error('email')}>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={v.tocar('email')} aria-invalid={!!v.error('email')} maxLength={150} />
      </Field>
      <Field label="Contraseña" hint="Entrégasela a la persona; puede cambiarla en su Perfil." error={v.error('password')}>
        <PasswordInput value={password} onChange={setPassword} onBlur={v.tocar('password')} invalid={!!v.error('password')} autoComplete="new-password" mostrarFuerza visibleInicial />
      </Field>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary" disabled={enviando}>
        {enviando ? 'Agregando…' : 'Agregar al equipo'}
      </button>
    </form>
  );
}
