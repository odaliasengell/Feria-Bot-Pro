import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ExternalLink, FileSpreadsheet, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import type { Empresa, Feria, NuevaEmpresa } from '../../types';
import { empresasApi, leadsApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { Alert, Avatar, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';
import { CartelStand } from '../../components/Credenciales';
import PasswordInput from '../../components/PasswordInput';
import { mensajeError, useToast } from '../../context/ToastContext';
import { errorEmail, errorNombre, errorPassword, errorTelefono, errorUrl } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';
import { ConFeria } from '../../components/FeriaSelector';
import ImportarEmpresas from './ImportarEmpresas';

type DatosEmpresa = Omit<NuevaEmpresa, 'feriaId'>;

const vacia: DatosEmpresa = {
  nombre: '',
  rubro: '',
  descripcion: '',
  servicios: [],
  contactoNombre: '',
  email: '',
  telefono: '',
  sitioWeb: '',
  stand: '',
  fotos: [],
};

export default function OrgEmpresas() {
  return <ConFeria>{(feria) => <EmpresasFeria feria={feria} />}</ConFeria>;
}

function EmpresasFeria({ feria }: { feria: Feria }) {
  const { data, cargando, recargar } = useAsync(
    () => Promise.all([empresasApi.listar(feria.id), leadsApi.listar({ feriaId: feria.id })]),
    [feria.id],
  );
  const [editando, setEditando] = useState<Empresa | 'nueva' | null>(null);
  const [qr, setQr] = useState<Empresa | null>(null);
  const [importando, setImportando] = useState(false);
  const toast = useToast();

  async function eliminar(e: Empresa) {
    if (!confirm(`¿Eliminar ${e.nombre}? También se borrarán sus leads.`)) return;
    try {
      await empresasApi.eliminar(e.id);
      toast.exito(`Empresa «${e.nombre}» eliminada.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar la empresa.'));
    }
  }

  const [empresas, leads] = data ?? [[], []];

  return (
    <>
      <PageHeader
        title="Empresas participantes"
        subtitle={`Empresas de «${feria.nombre}». Carga su rubro y datos del negocio; cada una completa luego su ficha digital.`}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setImportando(true)}>
              <FileSpreadsheet size={17} /> Importar desde Excel
            </button>
            <button className="btn btn-primary" onClick={() => setEditando('nueva')}>
              <Plus size={17} /> Nueva empresa
            </button>
          </>
        }
      />

      {cargando && !data ? (
        <Loader />
      ) : empresas.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No hay empresas cargadas">
          <button className="btn btn-primary" onClick={() => setEditando('nueva')}>Agregar la primera</button>
        </EmptyState>
      ) : (
        <div className="company-grid">
          {empresas.map((e) => {
            const n = leads.filter((l) => l.empresaId === e.id).length;
            const completa = e.descripcion && e.servicios.length && e.fotos.length >= 2 && e.logo;
            return (
              <article key={e.id} className="company-card">
                <div className="company-top">
                  <Avatar nombre={e.nombre} src={e.logo} size={52} square />
                  <div className="company-title">
                    <strong>{e.nombre}</strong>
                    <span>{e.rubro}</span>
                  </div>
                  <span className="stand-tag">{e.stand}</span>
                </div>
                <div className="company-meta">
                  <div>
                    <b>{n}</b>
                    <span>leads</span>
                  </div>
                  <div>
                    <b>{e.servicios.length}</b>
                    <span>servicios</span>
                  </div>
                  <div>
                    <span className={`badge tone-${completa ? 'teal' : 'orange'}`}>{completa ? 'Ficha completa' : 'Ficha pendiente'}</span>
                  </div>
                </div>
                <div className="company-contact muted small">
                  {e.contactoNombre} · {e.email}
                </div>
                <div className="company-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setQr(e)}>
                    <QrCode size={15} /> QR stand
                  </button>
                  <Link className="btn btn-ghost btn-sm" to={`/ficha/${e.id}`} target="_blank">
                    <ExternalLink size={15} /> Ficha
                  </Link>
                  <span className="spacer" />
                  <button className="icon-btn" onClick={() => setEditando(e)} aria-label="Editar">
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn danger" onClick={() => eliminar(e)} aria-label="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nueva' ? 'Nueva empresa' : 'Editar empresa'}
        className="modal-feria"
      >
        {editando !== null && (
          <FormEmpresaBasica
            inicial={editando === 'nueva' ? vacia : datosDe(editando)}
            nueva={editando === 'nueva'}
            onGuardar={async (datos, password) => {
              const conPassword = password ? { ...datos, password } : datos;
              if (editando === 'nueva') {
                await empresasApi.crear({ ...conPassword, feriaId: feria.id });
                toast.exito(password ? `Empresa «${datos.nombre}» creada. Le enviamos su acceso por correo.` : `Empresa «${datos.nombre}» creada.`);
              } else {
                await empresasApi.actualizar(editando.id, conPassword);
                toast.exito(password ? 'Cambios guardados y contraseña actualizada.' : 'Cambios guardados.');
              }
              setEditando(null);
              recargar();
            }}
          />
        )}
      </Modal>

      <Modal open={importando} onClose={() => setImportando(false)} title="Importar empresas desde Excel" wide>
        {importando && <ImportarEmpresas feria={feria} onImportadas={recargar} />}
      </Modal>

      <Modal open={qr !== null} onClose={() => setQr(null)} title="QR del stand">
        {qr && <CartelStand empresa={qr} />}
      </Modal>
    </>
  );
}

function datosDe(e: Empresa): DatosEmpresa {
  const { id: _id, feriaId: _f, creadoEn: _c, ...datos } = e;
  void _id;
  void _f;
  void _c;
  return datos;
}

function FormEmpresaBasica({
  inicial,
  nueva,
  onGuardar,
}: {
  inicial: DatosEmpresa;
  nueva: boolean;
  onGuardar: (d: DatosEmpresa, password: string) => Promise<void>;
}) {
  const [f, setF] = useState<DatosEmpresa>(inicial);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof DatosEmpresa) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const v = useValidacion({
    nombre: errorNombre(f.nombre, { campo: 'El nombre de la empresa' }),
    rubro: errorNombre(f.rubro, { campo: 'El rubro', max: 100 }),
    stand: !f.stand.trim() ? 'El stand es obligatorio.' : f.stand.trim().length > 20 ? 'El stand admite hasta 20 caracteres.' : null,
    contactoNombre: errorNombre(f.contactoNombre, { campo: 'La persona de contacto' }),
    telefono: errorTelefono(f.telefono),
    email: errorEmail(f.email),
    password: errorPassword(password, nueva),
    sitioWeb: errorUrl(f.sitioWeb ?? ''),
  });
  const props = (k: Parameters<typeof v.error>[0]) => ({ onBlur: v.tocar(k), 'aria-invalid': !!v.error(k) });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    try {
      await onGuardar(f, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="feria-form">
      <div className="form-grid feria-form-datos">
        <Field label="Nombre de la empresa" full error={v.error('nombre')}>
          <input className="input" value={f.nombre} onChange={set('nombre')} {...props('nombre')} maxLength={150} />
        </Field>
        <Field label="Rubro" error={v.error('rubro')}>
          <input className="input" value={f.rubro} onChange={set('rubro')} {...props('rubro')} maxLength={100} placeholder="Ej. Alimentos y bebidas" />
        </Field>
        <Field label="Stand" error={v.error('stand')}>
          <input className="input" value={f.stand} onChange={set('stand')} {...props('stand')} maxLength={20} placeholder="A-01" />
        </Field>
        <Field label="Persona de contacto" error={v.error('contactoNombre')}>
          <input className="input" value={f.contactoNombre} onChange={set('contactoNombre')} {...props('contactoNombre')} maxLength={150} />
        </Field>
        <Field label="Teléfono" error={v.error('telefono')}>
          <input className="input" type="tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} {...props('telefono')} maxLength={40} placeholder="+593 99 123 4567" />
        </Field>
        <Field label="Sitio web" opcional full error={v.error('sitioWeb')}>
          <input className="input" type="url" inputMode="url" value={f.sitioWeb ?? ''} onChange={set('sitioWeb')} {...props('sitioWeb')} maxLength={255} placeholder="https://" />
        </Field>
        <Field label="Datos del negocio" full opcional hint="La empresa podrá ampliar esta descripción en su ficha.">
          <textarea className="input" rows={3} value={f.descripcion} onChange={set('descripcion')} />
        </Field>
      </div>
      <div className="feria-form-lateral stack">
        <div>
          <h3 className="form-lateral-titulo">Acceso al panel</h3>
          <p className="muted small">
            {nueva ? 'Con estos datos la empresa entra a escanear visitantes y completar su ficha.' : 'Datos con los que la empresa entra a su panel.'}
          </p>
        </div>
        <Field label="Correo" hint="Es también su correo de contacto." error={v.error('email')}>
          <input className="input" type="email" inputMode="email" value={f.email} onChange={set('email')} {...props('email')} maxLength={150} />
        </Field>
        <Field
          label="Contraseña"
          opcional={!nueva}
          hint={nueva ? 'Le llegará por correo. Usa una contraseña segura.' : 'Déjala vacía para no cambiarla.'}
          error={v.error('password')}
        >
          <PasswordInput
            value={password}
            onChange={setPassword}
            onBlur={v.tocar('password')}
            invalid={!!v.error('password')}
            autoComplete="new-password"
            mostrarFuerza
            visibleInicial
          />
        </Field>
      </div>
      <div className="feria-form-pie">
        {error && <Alert>{error}</Alert>}
        <div className="feria-form-acciones">
          <span className="muted small">Los campos sin «(opcional)» son obligatorios.</span>
          <button className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar empresa'}
          </button>
        </div>
      </div>
    </form>
  );
}
