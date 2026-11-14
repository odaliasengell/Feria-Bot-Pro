import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Mail,
  MapPin,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { DatosOrganizador, EstadoCuenta, OrganizadorAdmin, Plan, PlanId } from '../../types';
import { adminApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { mensajeError, useToast } from '../../context/ToastContext';
import { useConfirmar } from '../../context/ConfirmarContext';
import { ESTADO_CUENTA, ORDEN_ESTADOS, PLAN_TONO, cifra, diasHasta, dinero, textoVencimiento } from '../../lib/planes';
import { ESTADO_FERIA } from '../../lib/ferias';
import { hoyISO, normalizar, rangoFechas } from '../../lib/utils';
import { errorEmail, errorNombre, errorPassword, errorRuc, errorTelefono, errorUrl, limpiarRuc } from '../../lib/validacion';
import { useValidacion } from '../../lib/useValidacion';
import { Alert, Avatar, EmptyState, Field, Loader, Modal, PageHeader } from '../../components/ui';
import PasswordInput from '../../components/PasswordInput';
import UsoBarra from '../../components/UsoBarra';
import Paginacion from '../../components/Paginacion';
import { paginaDe, usePaginado } from '../../lib/usePaginado';

/** Suma meses a una fecha ISO (YYYY-MM-DD). */
function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y!, m! - 1 + meses, d!);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

const VACIO: DatosOrganizador = {
  nombre: '',
  ruc: '',
  contactoNombre: '',
  telefono: '',
  direccion: '',
  ciudad: '',
  sitioWeb: '',
  notas: '',
  email: '',
  password: '',
  plan: 'basico',
  planInicio: hoyISO(),
  planFin: sumarMeses(hoyISO(), 12),
  activo: true,
};

export default function AdminOrganizadores() {
  const [params, setParams] = useSearchParams();
  const { data, cargando, error, recargar } = useAsync(() => Promise.all([adminApi.organizadores(), adminApi.planes()]), []);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<EstadoCuenta | ''>('');
  const [plan, setPlan] = useState<PlanId | ''>('');
  const [editando, setEditando] = useState<OrganizadorAdmin | 'nuevo' | null>(params.get('nuevo') ? 'nuevo' : null);
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([q, estado, plan], 10);
  const toast = useToast();
  const confirmar = useConfirmar();

  const [organizadores, planes] = data ?? [[], []];
  const planDe = (id: PlanId) => planes.find((p) => p.id === id);
  const filtrados = useMemo(() => {
    const nq = normalizar(q);
    return organizadores.filter(
      (o) =>
        (!estado || o.estado === estado) &&
        (!plan || o.plan === plan) &&
        (!nq || normalizar([o.nombre, o.ruc, o.email, o.ciudad, o.contactoNombre].join(' ')).includes(nq)),
    );
  }, [organizadores, q, estado, plan]);

  function cerrarModal() {
    setEditando(null);
    if (params.get('nuevo')) setParams({}, { replace: true });
  }

  async function cambiarActivo(o: OrganizadorAdmin) {
    const suspender = o.activo;
    const ok = await confirmar({
      titulo: suspender ? 'Suspender cuenta' : 'Reactivar cuenta',
      mensaje: suspender ? (
        <>
          <p>
            ¿Suspender a <b>{o.nombre}</b>?
          </p>
          <p className="muted small">
            No podrá ingresar a su panel ni recibir inscripciones nuevas. Sus ferias y datos se conservan y puedes reactivarla cuando quieras.
          </p>
        </>
      ) : (
        <p>
          ¿Reactivar la cuenta de <b>{o.nombre}</b>? Podrá ingresar de nuevo.
        </p>
      ),
      confirmar: suspender ? 'Suspender' : 'Reactivar',
      peligro: suspender,
    });
    if (!ok) return;
    try {
      await adminApi.actualizarOrganizador(o.id, { activo: !o.activo });
      toast.exito(suspender ? `${o.nombre} quedó suspendida.` : `${o.nombre} está activa de nuevo.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo cambiar el estado.'));
    }
  }

  async function renovar(o: OrganizadorAdmin) {
    // Desde el fin actual si aún no venció; si ya venció, desde hoy.
    const desde = o.planFin && o.planFin >= hoyISO() ? o.planFin : hoyISO();
    const fin = sumarMeses(desde, 12);
    const ok = await confirmar({
      titulo: 'Renovar plan por un año',
      mensaje: (
        <p>
          El plan {planDe(o.plan)?.nombre} de <b>{o.nombre}</b> quedará vigente hasta el <b>{rangoFechas(fin, fin)}</b>.
        </p>
      ),
      confirmar: 'Renovar',
    });
    if (!ok) return;
    try {
      const cambios: Partial<DatosOrganizador> = { planFin: fin };
      if (!o.planFin || o.planFin < hoyISO()) cambios.planInicio = hoyISO();
      await adminApi.actualizarOrganizador(o.id, cambios);
      toast.exito(`Plan de ${o.nombre} renovado hasta el ${rangoFechas(fin, fin)}.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo renovar.'));
    }
  }

  async function eliminar(o: OrganizadorAdmin) {
    const ok = await confirmar({
      titulo: 'Eliminar organizador',
      mensaje: (
        <>
          <p>
            ¿Eliminar la cuenta de <b>{o.nombre}</b>?
          </p>
          <p className="muted small">No tiene ferias registradas. No se puede deshacer.</p>
        </>
      ),
      confirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await adminApi.eliminarOrganizador(o.id);
      toast.exito(`${o.nombre} eliminado.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar.'));
    }
  }

  return (
    <>
      <PageHeader
        title="Organizadores"
        subtitle="Clientes que organizan ferias con FeriaBot Pro: su ficha, su plan, la vigencia y cuánto usan."
        actions={
          <button className="btn btn-primary" onClick={() => setEditando('nuevo')}>
            <Plus size={17} /> Nuevo organizador
          </button>
        }
      />

      {cargando && !data ? (
        <Loader />
      ) : error && !data ? (
        <Alert>
          {error}{' '}
          <button type="button" className="link-btn" onClick={recargar}>
            Reintentar
          </button>
        </Alert>
      ) : (
        <>
          <div className="toolbar toolbar-suelta">
            <div className="search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, RUC, correo, ciudad…" aria-label="Buscar organizadores" />
            </div>
            <div className="seg" role="group" aria-label="Filtrar por estado">
              <button className={!estado ? 'active' : ''} onClick={() => setEstado('')}>
                Todos
              </button>
              {ORDEN_ESTADOS.map((e) => (
                <button key={e} className={estado === e ? `active tone-${ESTADO_CUENTA[e].tone}` : ''} onClick={() => setEstado(e)}>
                  {ESTADO_CUENTA[e].label}
                </button>
              ))}
            </div>
            <select className="input input-sm" value={plan} onChange={(e) => setPlan(e.target.value as PlanId | '')} aria-label="Filtrar por plan">
              <option value="">Todos los planes</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {filtrados.length === 0 ? (
            <EmptyState icon={<Briefcase />} title={organizadores.length ? 'Sin resultados' : 'Aún no hay organizadores'}>
              {organizadores.length ? (
                'Prueba con otra búsqueda o filtro.'
              ) : (
                <button className="btn btn-primary" onClick={() => setEditando('nuevo')}>
                  Crear el primero
                </button>
              )}
            </EmptyState>
          ) : (
            <ul className="org-lista">
              {paginaDe(filtrados, pagina, porPagina).map((o) => (
                <li key={o.id}>
                  <TarjetaOrganizador
                    o={o}
                    plan={planDe(o.plan)}
                    onEditar={() => setEditando(o)}
                    onActivo={() => cambiarActivo(o)}
                    onRenovar={() => renovar(o)}
                    onEliminar={() => eliminar(o)}
                  />
                </li>
              ))}
            </ul>
          )}
          <Paginacion
            pagina={pagina}
            porPagina={porPagina}
            total={filtrados.length}
            onPagina={setPagina}
            onPorPagina={setPorPagina}
            opciones={[10, 25, 50]}
            etiqueta="organizadores"
          />
        </>
      )}

      <Modal open={editando !== null} onClose={cerrarModal} title={editando === 'nuevo' ? 'Nuevo organizador' : 'Editar organizador'} className="modal-empresa">
        {editando !== null && planes.length > 0 && (
          <FormOrganizador
            planes={planes}
            inicial={editando === 'nuevo' ? null : editando}
            onGuardado={(o, nuevo) => {
              cerrarModal();
              toast.exito(nuevo ? `${o.nombre} creado. Le enviamos su acceso por correo.` : 'Cambios guardados.');
              recargar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function TarjetaOrganizador({
  o,
  plan,
  onEditar,
  onActivo,
  onRenovar,
  onEliminar,
}: {
  o: OrganizadorAdmin;
  plan?: Plan;
  onEditar: () => void;
  onActivo: () => void;
  onRenovar: () => void;
  onEliminar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const est = ESTADO_CUENTA[o.estado];
  const vigentes = o.uso.ferias.filter((f) => f.estado !== 'finalizada');
  const dias = diasHasta(o.planFin);

  return (
    <article className={`org-card ${o.activo ? '' : 'is-suspendida'}`}>
      <div className="org-card-fila">
        <div className="org-card-id">
          <Avatar nombre={o.nombre} size={46} square />
          <div>
            <strong>{o.nombre}</strong>
            <span className="org-ruc">{o.ruc ? `RUC ${o.ruc}` : 'Sin RUC'}</span>
            <div className="org-badges">
              <span className={`badge tone-${PLAN_TONO[o.plan]}`}>Plan {plan?.nombre ?? o.plan}</span>
              <span className={`badge tone-${est.tone}`}>{est.label}</span>
            </div>
          </div>
        </div>

        <ul className="org-contacto muted small">
          {o.contactoNombre && <li>{o.contactoNombre}</li>}
          <li>
            <Mail size={13} /> <a href={`mailto:${o.email}`}>{o.email}</a>
          </li>
          {o.telefono && (
            <li>
              <Phone size={13} /> {o.telefono}
            </li>
          )}
          {(o.ciudad || o.direccion) && (
            <li>
              <MapPin size={13} /> {[o.direccion, o.ciudad].filter(Boolean).join(', ')}
            </li>
          )}
        </ul>

        <div className="org-vigencia">
          <span className="muted small">Vigencia</span>
          <strong>{o.planInicio && o.planFin ? rangoFechas(o.planInicio, o.planFin) : 'Sin fechas'}</strong>
          <span className={`small ${dias != null && dias < 0 ? 'texto-rojo' : dias != null && dias <= 15 ? 'texto-naranja' : 'muted'}`}>
            {textoVencimiento(dias)}
          </span>
        </div>

        <div className="org-uso">
          {plan && <UsoBarra etiqueta="Ferias en curso o próximas" usado={o.uso.feriasActivas} limite={plan.ferias} />}
          <button type="button" className="link-btn small" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} disabled={o.uso.feriasTotal === 0}>
            {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{' '}
            {o.uso.feriasTotal === 0 ? 'Sin ferias' : `${o.uso.feriasTotal} ${o.uso.feriasTotal === 1 ? 'feria' : 'ferias'} en total`}
          </button>
        </div>

        <div className="org-acciones">
          <button className="btn btn-ghost btn-sm" onClick={onEditar}>
            <Pencil size={15} /> Editar
          </button>
          {o.uso.feriasTotal > 0 && (
            <Link className="btn btn-ghost btn-sm" to={`/admin/ferias?organizador=${encodeURIComponent(o.id)}`}>
              <CalendarDays size={15} /> Ferias
            </Link>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onRenovar} title="Renovar el plan por un año">
            <CalendarPlus size={15} /> Renovar
          </button>
          <button className="icon-btn" onClick={onActivo} title={o.activo ? 'Suspender' : 'Reactivar'} aria-label={o.activo ? `Suspender a ${o.nombre}` : `Reactivar a ${o.nombre}`}>
            {o.activo ? <Pause size={16} /> : <Play size={16} />}
          </button>
          {o.uso.feriasTotal === 0 && (
            <button className="icon-btn danger" onClick={onEliminar} title="Eliminar" aria-label={`Eliminar a ${o.nombre}`}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {abierto && plan && (
        <div className="org-ferias">
          {vigentes.length === 0 && <p className="muted small">No tiene ferias en curso ni próximas.</p>}
          {vigentes.map((f) => (
            <div key={f.id} className="org-feria">
              <div className="org-feria-titulo">
                <strong>{f.nombre}</strong>
                <span className={`badge tone-${ESTADO_FERIA[f.estado].tone}`}>{ESTADO_FERIA[f.estado].label}</span>
                <span className="muted small">{rangoFechas(f.fechaInicio, f.fechaFin)}</span>
              </div>
              <UsoBarra etiqueta="Empresas" usado={f.empresas} limite={plan.empresasPorFeria} compacta />
              <UsoBarra etiqueta="Visitantes" usado={f.visitantes} limite={plan.visitantesPorFeria} compacta />
            </div>
          ))}
          {o.uso.feriasTotal > vigentes.length && (
            <p className="muted small">
              {o.uso.feriasTotal - vigentes.length} {o.uso.feriasTotal - vigentes.length === 1 ? 'feria finalizada' : 'ferias finalizadas'} (no cuentan para el plan).
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function FormOrganizador({
  planes,
  inicial,
  onGuardado,
}: {
  planes: Plan[];
  inicial: OrganizadorAdmin | null;
  onGuardado: (o: OrganizadorAdmin, nuevo: boolean) => void;
}) {
  const nuevo = inicial === null;
  const [f, setF] = useState<DatosOrganizador>(() =>
    inicial
      ? {
          nombre: inicial.nombre,
          ruc: inicial.ruc ?? '',
          contactoNombre: inicial.contactoNombre,
          telefono: inicial.telefono,
          direccion: inicial.direccion,
          ciudad: inicial.ciudad,
          sitioWeb: inicial.sitioWeb ?? '',
          notas: inicial.notas,
          email: inicial.email,
          password: '',
          plan: inicial.plan,
          planInicio: inicial.planInicio ?? hoyISO(),
          planFin: inicial.planFin ?? sumarMeses(hoyISO(), 12),
          activo: inicial.activo,
        }
      : { ...VACIO, planInicio: hoyISO(), planFin: sumarMeses(hoyISO(), 12) },
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof DatosOrganizador) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const v = useValidacion({
    nombre: errorNombre(f.nombre, { campo: 'El nombre' }),
    ruc: errorRuc(f.ruc),
    contactoNombre: errorNombre(f.contactoNombre, { campo: 'La persona de contacto', requerido: false }),
    telefono: errorTelefono(f.telefono, false),
    sitioWeb: errorUrl(f.sitioWeb),
    email: errorEmail(f.email),
    password: errorPassword(f.password ?? '', nuevo),
    planInicio: f.planInicio ? null : 'Elige la fecha de inicio.',
    planFin: !f.planFin ? 'Elige la fecha de fin.' : f.planFin < f.planInicio ? 'Debe ser posterior al inicio.' : null,
  });
  const props = (k: Parameters<typeof v.error>[0]) => ({ onBlur: v.tocar(k), 'aria-invalid': !!v.error(k) });
  const dias = diasHasta(f.planFin);
  // Si baja de plan y ya usa más ferias de las que permite el nuevo, se avisa (no se borra nada).
  const nuevoPlan = planes.find((p) => p.id === f.plan)!;
  const excede = inicial && inicial.uso.feriasActivas > nuevoPlan.ferias;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) return;
    setEnviando(true);
    setError(null);
    const datos: DatosOrganizador = { ...f, ruc: limpiarRuc(f.ruc), email: f.email.trim(), nombre: f.nombre.trim() };
    if (!datos.password) delete datos.password;
    try {
      const o = nuevo ? await adminApi.crearOrganizador(datos) : await adminApi.actualizarOrganizador(inicial.id, datos);
      onGuardado(o, nuevo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="empresa-form org-form">
      <aside className="empresa-form-feria org-form-plan" aria-label="Plan">
        <span className="empresa-form-etiqueta">Plan</span>
        <div className="plan-opciones" role="radiogroup" aria-label="Plan">
          {planes.map((p) => (
            <button
              type="button"
              key={p.id}
              role="radio"
              aria-checked={f.plan === p.id}
              className={`plan-opcion ${f.plan === p.id ? 'is-elegido' : ''}`}
              onClick={() => setF({ ...f, plan: p.id })}
            >
              <strong>
                {p.nombre} <em>{dinero(p.precioMensual)}/mes</em>
              </strong>
              <span>
                {p.ferias} ferias · {cifra(p.empresasPorFeria)} empresas · {cifra(p.visitantesPorFeria)} visitantes por feria
              </span>
            </button>
          ))}
        </div>
        {excede && (
          <p className="small texto-naranja">
            Tiene {inicial.uso.feriasActivas} ferias en curso o próximas: no podrá crear más hasta bajar de {nuevoPlan.ferias}. No se borra nada.
          </p>
        )}

        <span className="empresa-form-etiqueta">Vigencia</span>
        <div className="org-fechas">
          <Field label="Desde" error={v.error('planInicio')}>
            <input className="input" type="date" value={f.planInicio} onChange={set('planInicio')} {...props('planInicio')} />
          </Field>
          <Field label="Hasta" error={v.error('planFin')}>
            <input className="input" type="date" value={f.planFin} onChange={set('planFin')} {...props('planFin')} />
          </Field>
        </div>
        <div className="org-rapidos">
          {[
            [1, '1 mes'],
            [6, '6 meses'],
            [12, '1 año'],
          ].map(([m, t]) => (
            <button key={t} type="button" className="btn btn-outline btn-sm" onClick={() => setF({ ...f, planFin: sumarMeses(f.planInicio || hoyISO(), m as number) })}>
              {t}
            </button>
          ))}
        </div>
        <span className="muted small">{textoVencimiento(dias)}</span>

        {!nuevo && (
          <label className="org-activo">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
            <span>
              <b>Cuenta activa</b>
              <span className="muted small">Si la desmarcas, no podrá ingresar.</span>
            </span>
          </label>
        )}
      </aside>

      <div className="empresa-form-campos">
        <div className="empresa-grid">
          <h3 className="empresa-grid-titulo">Ficha del organizador</h3>
          <Field label="Nombre o razón social" className="span-2" error={v.error('nombre')}>
            <input className="input" value={f.nombre} onChange={set('nombre')} {...props('nombre')} maxLength={150} autoFocus={nuevo} />
          </Field>
          <Field label="RUC" error={v.error('ruc')}>
            <input
              className="input input-ruc"
              inputMode="numeric"
              value={f.ruc}
              onChange={(e) => setF({ ...f, ruc: e.target.value.replace(/[^\d\s-]/g, '') })}
              {...props('ruc')}
              maxLength={17}
              placeholder="13 dígitos"
            />
          </Field>
          <Field label="Persona de contacto" opcional error={v.error('contactoNombre')}>
            <input className="input" value={f.contactoNombre} onChange={set('contactoNombre')} {...props('contactoNombre')} maxLength={150} />
          </Field>
          <Field label="Teléfono" opcional error={v.error('telefono')}>
            <input className="input" type="tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} {...props('telefono')} maxLength={40} placeholder="+593 99 123 4567" />
          </Field>
          <Field label="Ciudad" opcional>
            <input className="input" value={f.ciudad} onChange={set('ciudad')} maxLength={100} />
          </Field>
          <Field label="Dirección" opcional className="span-2">
            <input className="input" value={f.direccion} onChange={set('direccion')} maxLength={255} />
          </Field>
          <Field label="Sitio web" opcional error={v.error('sitioWeb')}>
            <input className="input" type="url" value={f.sitioWeb} onChange={set('sitioWeb')} {...props('sitioWeb')} maxLength={255} placeholder="https://" />
          </Field>
          <Field label="Notas internas" opcional full>
            <textarea className="input" rows={2} value={f.notas} onChange={set('notas')} maxLength={2000} placeholder="Forma de pago, acuerdos… El organizador no las ve." />
          </Field>

          <h3 className="empresa-grid-titulo con-linea">
            Acceso al panel
            <span className="muted small">{nuevo ? 'Le enviamos estos datos por correo.' : 'Deja la contraseña vacía para no cambiarla.'}</span>
          </h3>
          <Field label="Correo" error={v.error('email')}>
            <input className="input" type="email" inputMode="email" value={f.email} onChange={set('email')} {...props('email')} maxLength={150} />
          </Field>
          <Field label={nuevo ? 'Contraseña' : 'Nueva contraseña'} opcional={!nuevo} className="span-2" error={v.error('password')}>
            <PasswordInput
              value={f.password ?? ''}
              onChange={(p) => setF({ ...f, password: p })}
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
              {enviando ? 'Guardando…' : nuevo ? 'Crear organizador' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
