import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Briefcase, Building2, CalendarDays, ExternalLink, MapPin, Pencil, Search, Trash2, Users } from 'lucide-react';
import type { Feria, FeriaAdmin, EstadoFeria } from '../../types';
import { adminApi, empresasApi, feriasApi, visitantesApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { mensajeError, useToast } from '../../context/ToastContext';
import { useConfirmar } from '../../context/ConfirmarContext';
import { ESTADO_FERIA } from '../../lib/ferias';
import { fechaHora, normalizar, rangoFechas } from '../../lib/utils';
import { paginaDe, useDebounce, usePaginado } from '../../lib/usePaginado';
import { Alert, Avatar, EmptyState, Loader, Modal, PageHeader } from '../../components/ui';
import Paginacion from '../../components/Paginacion';
import PortadaFeria from '../../components/PortadaFeria';
import { FormFeria } from '../organizador/OrgFerias';

/** Todas las ferias de todos los organizadores: editar, eliminar y ver sus participantes. Todo queda registrado. */
export default function AdminFerias() {
  const [params, setParams] = useSearchParams();
  const { data, cargando, error, recargar } = useAsync(() => adminApi.ferias(), []);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<EstadoFeria | ''>('');
  const organizador = params.get('organizador') ?? '';
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([q, estado, organizador], 10);
  const [editando, setEditando] = useState<Feria | null>(null);
  const [participantes, setParticipantes] = useState<FeriaAdmin | null>(null);
  const toast = useToast();
  const confirmar = useConfirmar();

  const ferias = data ?? [];
  const organizadores = useMemo(() => {
    const m = new Map<string, string>();
    ferias.forEach((f) => m.set(f.organizadorId, f.organizadorNombre));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [ferias]);
  const filtradas = useMemo(() => {
    const nq = normalizar(q);
    return ferias.filter(
      (f) =>
        (!estado || f.estado === estado) &&
        (!organizador || f.organizadorId === organizador) &&
        (!nq || normalizar([f.nombre, f.lugar, f.organizadorNombre].join(' ')).includes(nq)),
    );
  }, [ferias, q, estado, organizador]);

  async function abrirEdicion(f: FeriaAdmin) {
    // La lista viene sin portada (pesa); para editar se pide la feria completa.
    try {
      const completa = await feriasApi.obtener(f.id);
      if (completa) setEditando(completa);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo abrir la feria.'));
    }
  }

  async function eliminar(f: FeriaAdmin) {
    const ok = await confirmar({
      titulo: 'Eliminar feria',
      mensaje: (
        <>
          <p>
            ¿Eliminar <b>«{f.nombre}»</b> de <b>{f.organizadorNombre}</b>?
          </p>
          <p className="muted small">
            Se borran sus {f.totalEmpresas} empresas, sus leads y las inscripciones de {f.totalVisitantes} visitantes. Las cuentas de los visitantes
            se conservan. No se puede deshacer y queda en el registro de actividad.
          </p>
        </>
      ),
      confirmar: 'Eliminar feria',
      peligro: true,
    });
    if (!ok) return;
    try {
      await feriasApi.eliminar(f.id);
      toast.exito(`«${f.nombre}» eliminada.`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar la feria.'));
    }
  }

  return (
    <>
      <PageHeader title="Ferias" subtitle="Las ferias de todos los organizadores. Puedes corregirlas y ver sus participantes; cada cambio queda registrado." />
      {cargando && !data ? (
        <Loader />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : (
        <>
          <div className="toolbar toolbar-suelta">
            <div className="search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por feria, lugar u organizador…" aria-label="Buscar ferias" />
            </div>
            <div className="seg" role="group" aria-label="Filtrar por estado">
              <button className={!estado ? 'active' : ''} onClick={() => setEstado('')}>
                Todas
              </button>
              {(['en_curso', 'proxima', 'finalizada'] as EstadoFeria[]).map((e) => (
                <button key={e} className={estado === e ? `active tone-${ESTADO_FERIA[e].tone}` : ''} onClick={() => setEstado(e)}>
                  {ESTADO_FERIA[e].label}
                </button>
              ))}
            </div>
            <select
              className="input input-sm"
              value={organizador}
              onChange={(e) => setParams(e.target.value ? { organizador: e.target.value } : {}, { replace: true })}
              aria-label="Filtrar por organizador"
            >
              <option value="">Todos los organizadores</option>
              {organizadores.map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {filtradas.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="Sin ferias">
              Prueba con otra búsqueda o filtro.
            </EmptyState>
          ) : (
            <ul className="org-lista">
              {paginaDe(filtradas, pagina, porPagina).map((f) => (
                <li key={f.id}>
                  <article className="org-card">
                    <div className="af-fila">
                      <PortadaFeria nombre={f.nombre} portada={null} variante="mini" />
                      <div className="af-info">
                        <div className="org-badges">
                          <span className={`badge tone-${ESTADO_FERIA[f.estado].tone}`}>{ESTADO_FERIA[f.estado].label}</span>
                          {!f.abierta && f.estado !== 'finalizada' && <span className="badge tone-gray">Inscripciones cerradas</span>}
                          {f.llena && <span className="badge tone-orange">Llena</span>}
                        </div>
                        <strong>{f.nombre}</strong>
                        <span className="muted small">
                          <CalendarDays size={13} /> {rangoFechas(f.fechaInicio, f.fechaFin)}
                          {f.lugar && (
                            <>
                              {' · '}
                              <MapPin size={13} /> {f.lugar}
                            </>
                          )}
                        </span>
                        <span className="small">
                          <Briefcase size={13} /> {f.organizadorNombre}
                        </span>
                      </div>
                      <ul className="vf-pasada-cifras">
                        <li>
                          <b>{f.totalEmpresas}</b>
                          <span>empresas</span>
                        </li>
                        <li>
                          <b>{f.totalVisitantes}</b>
                          <span>visitantes</span>
                        </li>
                      </ul>
                      <div className="org-acciones">
                        <button className="btn btn-ghost btn-sm" onClick={() => setParticipantes(f)}>
                          <Users size={15} /> Participantes
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicion(f)}>
                          <Pencil size={15} /> Editar
                        </button>
                        <Link className="icon-btn" to={`/ferias/${encodeURIComponent(f.id)}`} target="_blank" title="Ver página pública" aria-label="Ver página pública">
                          <ExternalLink size={16} />
                        </Link>
                        <button className="icon-btn danger" onClick={() => eliminar(f)} title="Eliminar" aria-label={`Eliminar ${f.nombre}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
          <Paginacion pagina={pagina} porPagina={porPagina} total={filtradas.length} onPagina={setPagina} onPorPagina={setPorPagina} opciones={[10, 25, 50]} etiqueta="ferias" />
        </>
      )}

      <Modal open={editando !== null} onClose={() => setEditando(null)} title="Editar feria" className="modal-feria">
        {editando && (
          <FormFeria
            inicial={editando}
            onGuardar={async (datos) => {
              const { portada, ...resto } = datos;
              await feriasApi.actualizar(editando.id, portada === editando.portada ? resto : datos);
              toast.exito('Cambios guardados. Quedó en el registro de actividad.');
              setEditando(null);
              recargar();
            }}
          />
        )}
      </Modal>

      <Modal open={participantes !== null} onClose={() => setParticipantes(null)} title={participantes ? `Participantes · ${participantes.nombre}` : ''} wide>
        {participantes && <Participantes feria={participantes} />}
      </Modal>
    </>
  );
}

function Participantes({ feria }: { feria: FeriaAdmin }) {
  const [tab, setTab] = useState<'empresas' | 'visitantes'>('empresas');
  return (
    <div className="stack">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'empresas'} className={tab === 'empresas' ? 'active' : ''} onClick={() => setTab('empresas')}>
          <Building2 size={14} /> Empresas ({feria.totalEmpresas})
        </button>
        <button role="tab" aria-selected={tab === 'visitantes'} className={tab === 'visitantes' ? 'active' : ''} onClick={() => setTab('visitantes')}>
          <Users size={14} /> Visitantes ({feria.totalVisitantes})
        </button>
      </div>
      {tab === 'empresas' ? <EmpresasFeria feriaId={feria.id} /> : <VisitantesFeria feriaId={feria.id} />}
    </div>
  );
}

function EmpresasFeria({ feriaId }: { feriaId: string }) {
  const { data, cargando, error } = useAsync(() => empresasApi.listar(feriaId), [feriaId]);
  if (cargando && !data) return <Loader />;
  if (error) return <Alert>{error}</Alert>;
  if (!data?.length) return <p className="muted">Sin empresas.</p>;
  return (
    <ul className="company-list af-lista">
      {data.map((e) => (
        <li key={e.id}>
          <Avatar nombre={e.nombre} src={e.logo} size={36} square />
          <div className="grow">
            <strong>{e.nombre}</strong>
            <span className="muted small">
              {e.rubro} · Stand {e.stand} · {e.ruc ? `RUC ${e.ruc}` : 'sin RUC'}
            </span>
            <span className="muted small">
              {e.contactoNombre} · {e.email} · {e.telefono}
            </span>
          </div>
          <Link to={`/ficha/${e.id}`} target="_blank" className="btn btn-ghost btn-sm">
            Ficha
          </Link>
        </li>
      ))}
    </ul>
  );
}

function VisitantesFeria({ feriaId }: { feriaId: string }) {
  const [q, setQ] = useState('');
  const busqueda = useDebounce(q.trim());
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([feriaId, busqueda], 10);
  const { data, cargando, error } = useAsync(() => visitantesApi.pagina(feriaId, { q: busqueda, pagina, porPagina }), [feriaId, busqueda, pagina, porPagina]);
  return (
    <div className="stack">
      <div className="search">
        <Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar visitante…" aria-label="Buscar visitante" />
      </div>
      {cargando && !data ? (
        <Loader />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : !data?.items.length ? (
        <p className="muted">Sin visitantes.</p>
      ) : (
        <ul className="company-list af-lista">
          {data.items.map((v) => (
            <li key={v.id}>
              <Avatar nombre={v.nombre} size={34} />
              <div className="grow">
                <strong>{v.nombre}</strong>
                <span className="muted small">
                  <code className="code">{v.codigo}</code> · {[v.email, v.telefono, v.ciudad].filter(Boolean).join(' · ')}
                </span>
              </div>
              <span className="small muted">{v.asistioEn ? `Entró ${fechaHora(v.asistioEn)}` : 'Sin entrada'}</span>
            </li>
          ))}
        </ul>
      )}
      <Paginacion pagina={pagina} porPagina={porPagina} total={data?.total ?? 0} onPagina={setPagina} onPorPagina={setPorPagina} opciones={[10, 25, 50]} etiqueta="visitantes" />
    </div>
  );
}
