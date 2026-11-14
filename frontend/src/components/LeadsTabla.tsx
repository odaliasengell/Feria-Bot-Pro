import { useEffect, useState, type ReactNode } from 'react';
import { Download, FileSpreadsheet, Mail, Phone, Search, Inbox } from 'lucide-react';
import type { Calificacion, EstadoLead, LeadDetalle, PaginaLeads } from '../types';
import { leadsApi, todasLasPaginas } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { useToast } from '../context/ToastContext';
import { useDebounce, usePaginado } from '../lib/usePaginado';
import { CALIFICACIONES, CALIFICACION_ORDEN, ESTADOS_LEAD, ESTADO_LEAD_ORDEN, descargarCSV, fechaHora } from '../lib/utils';
import { Alert, Avatar, CalificacionBadge, EmptyState, Loader } from './ui';
import Paginacion from './Paginacion';

interface Props {
  /** Alcance: la feria (organizador) o la empresa (su panel). */
  alcance: { feriaId?: string; empresaId?: string };
  /** Muestra la columna empresa y el filtro por empresa (vista del organizador). */
  mostrarEmpresa?: boolean;
  archivo: string;
  onSelect?: (lead: LeadDetalle) => void;
  /** Filtro que se envía a GET /leads/exportar para el botón Excel. */
  excel?: { feriaId?: string; empresaId?: string };
  /** Contenido sobre la tabla con las cifras de todo el alcance (tarjetas, barra de interés…). */
  encabezado?: (datos: PaginaLeads) => ReactNode;
}

/** Leads paginados en el servidor: la búsqueda y los filtros también se resuelven allá. */
export default function LeadsTabla({ alcance, mostrarEmpresa, archivo, onSelect, excel, encabezado }: Props) {
  const [q, setQ] = useState('');
  const [cal, setCal] = useState<Calificacion | ''>('');
  const [estado, setEstado] = useState<EstadoLead | ''>('');
  const [empresaId, setEmpresaId] = useState('');
  const busqueda = useDebounce(q.trim());
  const filtro = { ...alcance, ...(empresaId ? { empresaId } : {}), q: busqueda, calificacion: cal, estado };
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([alcance, busqueda, cal, estado, empresaId]);
  const { data, cargando, error: errorCarga, recargar } = useAsync(
    () => leadsApi.pagina({ ...filtro, pagina, porPagina }),
    [JSON.stringify(filtro), pagina, porPagina],
  );
  /** Estados cambiados en esta pantalla (se muestran al instante). */
  const [cambios, setCambios] = useState<Record<string, EstadoLead>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<'' | 'csv' | 'excel'>('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (data && !cargando && data.items.length === 0 && data.total > 0 && pagina > 1) setPagina(Math.ceil(data.total / porPagina));
  }, [data, cargando, pagina, porPagina, setPagina]);

  const leads = (data?.items ?? []).map((l) => (cambios[l.id] && cambios[l.id] !== l.estado ? { ...l, estado: cambios[l.id]! } : l));

  async function cambiarEstado(l: LeadDetalle, nuevo: EstadoLead) {
    const anterior = l.estado;
    setCambios((c) => ({ ...c, [l.id]: nuevo }));
    setGuardando(l.id);
    setError(null);
    try {
      await leadsApi.cambiarEstado(l.id, nuevo);
      toast.exito(`${l.visitante?.nombre ?? 'Contacto'}: ${ESTADOS_LEAD[nuevo].label.toLowerCase()}.`);
    } catch (err) {
      setCambios((c) => ({ ...c, [l.id]: anterior }));
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado');
    } finally {
      setGuardando(null);
    }
  }

  async function exportarExcel() {
    setDescargando('excel');
    setError(null);
    try {
      await leadsApi.exportarExcel(excel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el Excel');
    } finally {
      setDescargando('');
    }
  }

  /** CSV con todo lo que coincide con la búsqueda y los filtros (todas las páginas). */
  async function exportar() {
    setDescargando('csv');
    setError(null);
    try {
      const todos = await todasLasPaginas((p) => leadsApi.pagina({ ...filtro, pagina: p, porPagina: 100 }));
      descargarCSV(archivo, [
        [...(mostrarEmpresa ? ['Empresa expositora'] : []), 'Nombre', 'Correo', 'Teléfono', 'Empresa', 'Ciudad', 'Calificación', 'Estado', 'Nota', 'Registrado por', 'Fecha'],
        ...todos.map((l) => {
          const est = cambios[l.id] ?? l.estado;
          return [
            ...(mostrarEmpresa ? [l.empresa?.nombre ?? ''] : []),
            l.visitante?.nombre ?? '',
            l.visitante?.email ?? '',
            l.visitante?.telefono ?? '',
            l.visitante?.empresa ?? '',
            l.visitante?.ciudad ?? '',
            CALIFICACIONES[l.calificacion].label,
            ESTADOS_LEAD[est]?.label ?? est,
            l.nota,
            l.registradoPor ?? '',
            fechaHora(l.actualizadoEn),
          ];
        }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar');
    } finally {
      setDescargando('');
    }
  }

  if (cargando && !data) return <Loader />;
  if (errorCarga && !data)
    return (
      <Alert>
        {errorCarga}{' '}
        <button type="button" className="link-btn" onClick={recargar}>
          Reintentar
        </button>
      </Alert>
    );
  const hayLeads = (data?.totalSinFiltros ?? 0) > 0;
  const filtrando = !!(busqueda || cal || estado || empresaId);

  return (
    <>
      {data && encabezado?.(data)}
      <div className={`table-card ${cargando ? 'is-cargando' : ''}`}>
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo, ciudad, nota…" aria-label="Buscar leads" />
          </div>
          {mostrarEmpresa && (
            <select className="input input-sm" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} aria-label="Filtrar por empresa">
              <option value="">Todas las empresas</option>
              {(data?.empresas ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}
          <div className="seg">
            <button className={!cal ? 'active' : ''} onClick={() => setCal('')}>
              Todos
            </button>
            {CALIFICACION_ORDEN.map((c) => (
              <button key={c} className={cal === c ? `active tone-${CALIFICACIONES[c].tone}` : ''} onClick={() => setCal(c)}>
                {CALIFICACIONES[c].label}
              </button>
            ))}
          </div>
          <select className="input input-sm" value={estado} onChange={(e) => setEstado(e.target.value as EstadoLead | '')} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADO_LEAD_ORDEN.map((e) => (
              <option key={e} value={e}>
                {ESTADOS_LEAD[e].label}
              </option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={exportar} disabled={!data?.total || descargando !== ''}>
            <Download size={15} /> {descargando === 'csv' ? 'Exportando…' : 'CSV'}
          </button>
          {excel && (
            <button className="btn btn-outline btn-sm" onClick={exportarExcel} disabled={descargando !== '' || !hayLeads}>
              <FileSpreadsheet size={15} /> {descargando === 'excel' ? 'Descargando…' : 'Excel'}
            </button>
          )}
        </div>
        {error && (
          <div className="table-alert">
            <Alert>{error}</Alert>
          </div>
        )}

        {leads.length === 0 ? (
          <EmptyState icon={<Inbox />} title={hayLeads ? 'Sin resultados' : 'Aún no hay leads'}>
            {hayLeads ? 'Prueba con otro filtro.' : 'Los contactos aparecerán aquí cuando se escaneen QR de visitantes.'}
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Visitante</th>
                  {mostrarEmpresa && <th>Stand / empresa</th>}
                  <th>Contacto</th>
                  <th>Calificación</th>
                  <th>Estado</th>
                  <th>Nota</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className={onSelect ? 'clickable' : ''} onClick={() => onSelect?.(l)}>
                    <td>
                      <div className="cell-person">
                        <Avatar nombre={l.visitante?.nombre ?? '?'} size={34} />
                        <div>
                          <strong>{l.visitante?.nombre ?? 'Visitante eliminado'}</strong>
                          <span>{[l.visitante?.empresa, l.visitante?.ciudad].filter(Boolean).join(' · ')}</span>
                        </div>
                      </div>
                    </td>
                    {mostrarEmpresa && (
                      <td>
                        <strong className="nowrap">{l.empresa?.nombre}</strong>
                        <div className="muted small">Stand {l.empresa?.stand}</div>
                      </td>
                    )}
                    <td>
                      <div className="cell-contact">
                        <a href={`mailto:${l.visitante?.email}`} onClick={(e) => e.stopPropagation()}>
                          <Mail size={14} /> {l.visitante?.email}
                        </a>
                        <a href={`tel:${l.visitante?.telefono}`} onClick={(e) => e.stopPropagation()}>
                          <Phone size={14} /> {l.visitante?.telefono}
                        </a>
                      </div>
                    </td>
                    <td>
                      <CalificacionBadge c={l.calificacion} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={`input input-sm estado-lead tone-${ESTADOS_LEAD[l.estado]?.tone ?? 'gray'}`}
                        value={l.estado}
                        onChange={(e) => cambiarEstado(l, e.target.value as EstadoLead)}
                        disabled={guardando === l.id}
                        aria-label={`Estado del lead de ${l.visitante?.nombre ?? 'visitante'}`}
                      >
                        {ESTADO_LEAD_ORDEN.map((e) => (
                          <option key={e} value={e}>
                            {ESTADOS_LEAD[e].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="cell-nota">{l.nota || <span className="muted">—</span>}</td>
                    <td className="nowrap">
                      <span className="muted">{fechaHora(l.actualizadoEn)}</span>
                      {l.registradoPor && <div className="small muted">por {l.registradoPor}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-foot muted small">
          <span>
            {filtrando ? `${data?.total ?? 0} de ${data?.totalSinFiltros ?? 0} contactos` : `${data?.totalSinFiltros ?? 0} contactos`}
          </span>
          <Paginacion pagina={pagina} porPagina={porPagina} total={data?.total ?? 0} onPagina={setPagina} onPorPagina={setPorPagina} />
        </div>
      </div>
    </>
  );
}
