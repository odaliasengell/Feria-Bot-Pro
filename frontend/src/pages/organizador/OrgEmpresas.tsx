import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, ExternalLink, FileSpreadsheet, MapPin, Pencil, Plus, QrCode, Search, Trash2, Users } from 'lucide-react';
import type { Empresa, Feria, NuevaEmpresa } from '../../types';
import { empresasApi, feriasApi } from '../../services/api';
import { normalizar, rangoFechas } from '../../lib/utils';
import { ESTADO_FERIA } from '../../lib/ferias';
import PortadaFeria from '../../components/PortadaFeria';
import { paginaDe, usePaginado } from '../../lib/usePaginado';
import Paginacion from '../../components/Paginacion';
import { useAsync } from '../../lib/useAsync';
import { Alert, Avatar, EmptyState, Field, Loader, Modal, PageHeader, ErrorCarga } from '../../components/ui';
import { CartelStand } from '../../components/Credenciales';
import PasswordInput from '../../components/PasswordInput';
import { mensajeError, useToast } from '../../context/ToastContext';
import { errorEmail, errorNombre, errorPassword, errorRuc, errorTelefono, errorUrl, limpiarRuc } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';
import { ConFeria } from '../../components/FeriaSelector';
import ImportarEmpresas from './ImportarEmpresas';
import { useConfirmar } from '../../context/ConfirmarContext';

type DatosEmpresa = Omit<NuevaEmpresa, 'feriaId'>;

const vacia: DatosEmpresa = {
  nombre: '',
  ruc: '',
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
  const { data, cargando, error: errorCarga, recargar } = useAsync(
    () => Promise.all([empresasApi.listar(feria.id), feriasApi.estadisticas(feria.id)]),
    [feria.id],
  );
  const [q, setQ] = useState('');
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([feria.id, q], 12);
  const [editando, setEditando] = useState<Empresa | 'nueva' | null>(null);
  const [qr, setQr] = useState<Empresa | null>(null);
  const [importando, setImportando] = useState(false);
  const toast = useToast();

  const confirmar = useConfirmar();
  async function eliminar(e: Empresa) {
    const ok = await confirmar({
      titulo: 'Eliminar empresa',
      mensaje: (
        <>
          <p>
            ¿Eliminar <b>{e.nombre}</b> (stand {e.stand})?
          </p>
          <p className="muted small">También se borrarán sus leads, las visitas a su ficha y las cuentas de sus vendedores. No se puede deshacer.</p>
        </>
      ),
      confirmar: 'Eliminar empresa',
      peligro: true,
    });
    if (!ok) return;
    try {
      await empresasApi.eliminar(e.id);
      toast.exito(`Empresa «${e.nombre}» eliminada.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar la empresa.'));
    }
  }

  const [empresas, stats] = data ?? [[], null];
  const leadsPorEmpresa = new Map((stats?.rankingEmpresas ?? []).map((r) => [r.empresaId, r.leads]));
  const nq = normalizar(q);
  const filtradas = nq ? empresas.filter((e) => normalizar([e.nombre, e.ruc, e.rubro, e.stand, e.email, e.contactoNombre].join(' ')).includes(nq)) : empresas;
  const visibles = paginaDe(filtradas, pagina, porPagina);

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
      ) : errorCarga && !data ? (
        <ErrorCarga error={errorCarga} onReintentar={recargar} titulo="No pudimos cargar las empresas" />
      ) : empresas.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No hay empresas cargadas">
          <button className="btn btn-primary" onClick={() => setEditando('nueva')}>Agregar la primera</button>
        </EmptyState>
      ) : (
        <>
        <div className="toolbar toolbar-suelta">
          <div className="search">
            <Search size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, RUC, rubro, stand, correo…" aria-label="Buscar empresas" />
          </div>
        </div>
        {filtradas.length === 0 && <EmptyState icon={<Building2 />} title="Sin resultados">Prueba con otra búsqueda.</EmptyState>}
        <div className="company-grid">
          {visibles.map((e) => {
            const n = leadsPorEmpresa.get(e.id) ?? 0;
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
                  {e.ruc ? (
                    <span className="company-ruc">RUC {e.ruc}</span>
                  ) : (
                    <button type="button" className="badge tone-orange company-ruc-falta" onClick={() => setEditando(e)} title="Editar para agregar el RUC">
                      Falta el RUC
                    </button>
                  )}
                  <span>
                    {e.contactoNombre} · {e.email}
                  </span>
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
        <Paginacion
          pagina={pagina}
          porPagina={porPagina}
          total={filtradas.length}
          onPagina={setPagina}
          onPorPagina={setPorPagina}
          opciones={[12, 24, 48, 96]}
          etiqueta="empresas"
        />
        </>
      )}

      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nueva' ? 'Nueva empresa' : 'Editar empresa'}
        className="modal-empresa"
      >
        {editando !== null && (
          <FormEmpresaBasica
            feria={feria}
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
  feria,
  inicial,
  nueva,
  onGuardar,
}: {
  feria: Feria;
  inicial: DatosEmpresa;
  nueva: boolean;
  onGuardar: (d: DatosEmpresa, password: string) => Promise<void>;
}) {
  const [f, setF] = useState<DatosEmpresa>({ ...inicial, ruc: inicial.ruc ?? '' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof DatosEmpresa) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const v = useValidacion({
    nombre: errorNombre(f.nombre, { campo: 'El nombre de la empresa' }),
    ruc: errorRuc(f.ruc ?? ''),
    rubro: errorNombre(f.rubro, { campo: 'El rubro', max: 100 }),
    stand: !f.stand.trim() ? 'El stand es obligatorio.' : f.stand.trim().length > 20 ? 'El stand admite hasta 20 caracteres.' : null,
    contactoNombre: errorNombre(f.contactoNombre, { campo: 'La persona de contacto' }),
    telefono: errorTelefono(f.telefono),
    email: errorEmail(f.email),
    password: errorPassword(password, nueva),
    sitioWeb: errorUrl(f.sitioWeb ?? ''),
  });
  const props = (k: Parameters<typeof v.error>[0]) => ({ onBlur: v.tocar(k), 'aria-invalid': !!v.error(k) });
  const est = ESTADO_FERIA[feria.estado];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    try {
      await onGuardar({ ...f, ruc: limpiarRuc(f.ruc ?? '') }, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="empresa-form">
      <aside className="empresa-form-feria" aria-label="Feria de la empresa">
        <span className="empresa-form-etiqueta">{nueva ? 'Se registrará en' : 'Participa en'}</span>
        <PortadaFeria nombre={feria.nombre} portada={feria.portada} portadaAlt={feria.portadaAlt} className="empresa-form-portada" />
        <div className="empresa-form-feria-info">
          <span className={`badge tone-${est.tone}`}>{est.label}</span>
          <h3>{feria.nombre}</h3>
          <ul className="empresa-form-feria-datos">
            <li>
              <CalendarDays size={15} /> {rangoFechas(feria.fechaInicio, feria.fechaFin)}
            </li>
            {feria.lugar && (
              <li>
                <MapPin size={15} /> {feria.lugar}
              </li>
            )}
            <li>
              <Building2 size={15} /> {feria.totalEmpresas} {feria.totalEmpresas === 1 ? 'empresa' : 'empresas'}
            </li>
            <li>
              <Users size={15} /> {feria.totalVisitantes} {feria.totalVisitantes === 1 ? 'visitante inscrito' : 'visitantes inscritos'}
            </li>
          </ul>
          {feria.descripcion && <p className="empresa-form-feria-desc">{feria.descripcion}</p>}
        </div>
      </aside>

      <div className="empresa-form-campos">
        <div className="empresa-grid">
          <h3 className="empresa-grid-titulo">Datos de la empresa</h3>
          <Field label="Nombre de la empresa" className="span-2" error={v.error('nombre')}>
            <input className="input" value={f.nombre} onChange={set('nombre')} {...props('nombre')} maxLength={150} autoFocus={nueva} />
          </Field>
          <Field label="RUC" error={v.error('ruc')}>
            <input
              className="input input-ruc"
              inputMode="numeric"
              value={f.ruc ?? ''}
              onChange={(e) => setF({ ...f, ruc: e.target.value.replace(/[^\d\s-]/g, '') })}
              {...props('ruc')}
              maxLength={17}
              placeholder="13 dígitos: 1790012345001"
            />
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
          <Field label="Sitio web" opcional className="span-2" error={v.error('sitioWeb')}>
            <input className="input" type="url" inputMode="url" value={f.sitioWeb ?? ''} onChange={set('sitioWeb')} {...props('sitioWeb')} maxLength={255} placeholder="https://" />
          </Field>
          <Field label="Datos del negocio" opcional full>
            <textarea className="input" rows={2} value={f.descripcion} onChange={set('descripcion')} placeholder="Qué vende u ofrece. La empresa podrá ampliarlo en su ficha." />
          </Field>

          <h3 className="empresa-grid-titulo con-linea">
            Acceso al panel
            <span className="muted small">
              {nueva ? 'Con estos datos la empresa entra a escanear visitantes y completar su ficha.' : 'Correo y contraseña con los que entra a su panel.'}
            </span>
          </h3>
          <Field label="Correo" error={v.error('email')}>
            <input className="input" type="email" inputMode="email" value={f.email} onChange={set('email')} {...props('email')} maxLength={150} />
          </Field>
          <Field
            label="Contraseña"
            opcional={!nueva}
            className="span-2"
            hint={nueva ? 'Le llegará por correo junto con su acceso.' : 'Déjala vacía para no cambiarla.'}
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

        <div className="empresa-form-pie">
          {error && <Alert>{error}</Alert>}
          <div className="feria-form-acciones">
            <span className="muted small">Los campos sin «(opcional)» son obligatorios.</span>
            <button className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : nueva ? 'Crear empresa' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
