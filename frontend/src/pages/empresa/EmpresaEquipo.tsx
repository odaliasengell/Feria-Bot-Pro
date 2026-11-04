import { useState, type FormEvent } from 'react';
import { Lock, Trash2, UserPlus, UsersRound } from 'lucide-react';
import type { UsuarioEmpresa } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { empresasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { fecha } from '../../lib/utils';
import { Alert, Avatar, Card, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';

const MIN_PASSWORD = 6;

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
  const [errorQuitar, setErrorQuitar] = useState<string | null>(null);

  async function quitar(u: UsuarioEmpresa) {
    if (!confirm(`¿Quitar a ${u.nombre} del equipo? Ya no podrá ingresar. Los leads que registró se conservan con su nombre.`)) return;
    setErrorQuitar(null);
    try {
      await empresasApi.quitarUsuario(empresaId, u.id);
      recargar();
    } catch (err) {
      setErrorQuitar(err instanceof Error ? err.message : 'No se pudo quitar al vendedor');
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

      {errorQuitar && <Alert>{errorQuitar}</Alert>}

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
            onCreado={() => {
              setAgregando(false);
              recargar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FormVendedor({ empresaId, onCreado }: { empresaId: string; onCreado: () => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await empresasApi.agregarUsuario(empresaId, { nombre: nombre.trim(), email: email.trim().toLowerCase(), password });
      onCreado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar al vendedor');
      setEnviando(false);
    }
  }

  return (
    <form className="stack" onSubmit={enviar}>
      <Field label="Nombre">
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={150} autoFocus placeholder="Ej. Ana Torres" />
      </Field>
      <Field label="Correo" hint="Con este correo ingresará en el portal de empresas.">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={150} autoComplete="off" placeholder="ana@empresa.com" />
      </Field>
      <Field label="Contraseña" hint={`Mínimo ${MIN_PASSWORD} caracteres. Compártela con el vendedor.`}>
        <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD} maxLength={72} autoComplete="new-password" />
      </Field>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary btn-block" disabled={enviando}>
        <UserPlus size={16} /> {enviando ? 'Agregando…' : 'Agregar al equipo'}
      </button>
    </form>
  );
}
