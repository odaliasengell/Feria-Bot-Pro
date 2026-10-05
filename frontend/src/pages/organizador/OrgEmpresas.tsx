import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ExternalLink, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import type { Empresa, NuevaEmpresa } from '../../types';
import { empresasApi, leadsApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { Alert, Avatar, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';
import { CartelStand } from '../../components/Credenciales';

const vacia: NuevaEmpresa = {
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
  const { data, cargando, recargar } = useAsync(() => Promise.all([empresasApi.listar(), leadsApi.listar()]), []);
  const [editando, setEditando] = useState<Empresa | 'nueva' | null>(null);
  const [qr, setQr] = useState<Empresa | null>(null);

  async function eliminar(e: Empresa) {
    if (!confirm(`¿Eliminar ${e.nombre}? También se borrarán sus leads.`)) return;
    await empresasApi.eliminar(e.id);
    recargar();
  }

  const [empresas, leads] = data ?? [[], []];

  return (
    <>
      <PageHeader
        title="Empresas participantes"
        subtitle="Carga las empresas con su rubro y datos del negocio. Cada una completa luego su ficha digital."
        actions={
          <button className="btn btn-primary" onClick={() => setEditando('nueva')}>
            <Plus size={17} /> Nueva empresa
          </button>
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

      <Modal open={editando !== null} onClose={() => setEditando(null)} title={editando === 'nueva' ? 'Nueva empresa' : 'Editar empresa'}>
        {editando !== null && (
          <FormEmpresaBasica
            inicial={editando === 'nueva' ? vacia : editando}
            onGuardar={async (datos) => {
              if (editando === 'nueva') await empresasApi.crear(datos);
              else await empresasApi.actualizar(editando.id, datos);
              setEditando(null);
              recargar();
            }}
          />
        )}
      </Modal>

      <Modal open={qr !== null} onClose={() => setQr(null)} title="QR del stand">
        {qr && <CartelStand empresa={qr} />}
      </Modal>
    </>
  );
}

function FormEmpresaBasica({ inicial, onGuardar }: { inicial: NuevaEmpresa; onGuardar: (d: NuevaEmpresa) => Promise<void> }) {
  const [f, setF] = useState<NuevaEmpresa>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof NuevaEmpresa) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await onGuardar(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="stack">
      <div className="form-grid">
        <Field label="Nombre de la empresa" full>
          <input className="input" value={f.nombre} onChange={set('nombre')} required />
        </Field>
        <Field label="Rubro">
          <input className="input" value={f.rubro} onChange={set('rubro')} required placeholder="Ej. Alimentos y bebidas" />
        </Field>
        <Field label="Stand">
          <input className="input" value={f.stand} onChange={set('stand')} required placeholder="A-01" />
        </Field>
        <Field label="Persona de contacto">
          <input className="input" value={f.contactoNombre} onChange={set('contactoNombre')} required />
        </Field>
        <Field label="Teléfono">
          <input className="input" type="tel" value={f.telefono} onChange={set('telefono')} required />
        </Field>
        <Field label="Correo">
          <input className="input" type="email" value={f.email} onChange={set('email')} required />
        </Field>
        <Field label="Sitio web" hint="Opcional">
          <input className="input" type="url" value={f.sitioWeb ?? ''} onChange={set('sitioWeb')} placeholder="https://" />
        </Field>
        <Field label="Datos del negocio" full hint="La empresa podrá ampliar esta descripción en su ficha.">
          <textarea className="input" rows={3} value={f.descripcion} onChange={set('descripcion')} />
        </Field>
      </div>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary btn-block" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar empresa'}
      </button>
    </form>
  );
}
