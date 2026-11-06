import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Mail, Phone, Search, Inbox } from 'lucide-react';
import type { Calificacion, EstadoLead, LeadDetalle } from '../types';
import { leadsApi } from '../services/api';
import { CALIFICACIONES, CALIFICACION_ORDEN, ESTADOS_LEAD, ESTADO_LEAD_ORDEN, descargarCSV, fechaHora, normalizar } from '../lib/utils';
import { Alert, Avatar, CalificacionBadge, EmptyState } from './ui';

interface Props {
  leads: LeadDetalle[];
  /** Muestra la columna empresa (vista del organizador). */
  mostrarEmpresa?: boolean;
  archivo: string;
  onSelect?: (lead: LeadDetalle) => void;
  /** Filtro que se envía a GET /leads/exportar para el botón Excel. */
  excel?: { feriaId?: string; empresaId?: string };
}

export default function LeadsTabla({ leads: recibidos, mostrarEmpresa, archivo, onSelect, excel }: Props) {
  const [q, setQ] = useState('');
  const [cal, setCal] = useState<Calificacion | ''>('');
  const [estado, setEstado] = useState<EstadoLead | ''>('');
  const [empresaId, setEmpresaId] = useState('');
  /** Estados cambiados en esta pantalla (se muestran al instante, antes de que el padre recargue). */
  const [cambios, setCambios] = useState<Record<string, EstadoLead>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leads = useMemo(
    () => recibidos.map((l) => (cambios[l.id] && cambios[l.id] !== l.estado ? { ...l, estado: cambios[l.id] } : l)),
    [recibidos, cambios],
  );

  async function cambiarEstado(l: LeadDetalle, nuevo: EstadoLead) {
    const anterior = l.estado;
    setCambios((c) => ({ ...c, [l.id]: nuevo }));
    setGuardando(l.id);
    setError(null);
    try {
      await leadsApi.cambiarEstado(l.id, nuevo);
    } catch (err) {
      setCambios((c) => ({ ...c, [l.id]: anterior }));
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado');
    } finally {
      setGuardando(null);
    }
  }

  async function exportarExcel() {
    setDescargando(true);
    setError(null);
    try {
      await leadsApi.exportarExcel(excel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el Excel');
    } finally {
      setDescargando(false);
    }
  }

  const empresas = useMemo(() => {
    const m = new Map<string, string>();
    leads.forEach((l) => l.empresa && m.set(l.empresa.id, l.empresa.nombre));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [leads]);

  const filtrados = useMemo(() => {
    const nq = normalizar(q);
    return leads.filter(
      (l) =>
        (!cal || l.calificacion === cal) &&
        (!estado || l.estado === estado) &&
        (!empresaId || l.empresaId === empresaId) &&
        (!nq ||
          normalizar(
            [l.visitante?.nombre, l.visitante?.email, l.visitante?.empresa, l.visitante?.ciudad, l.empresa?.nombre, l.nota, l.registradoPor].join(' '),
          ).includes(nq)),
    );
  }, [leads, q, cal, estado, empresaId]);

  function exportar() {
    descargarCSV(archivo, [
      [...(mostrarEmpresa ? ['Empresa expositora'] : []), 'Nombre', 'Correo', 'Teléfono', 'Empresa', 'Ciudad', 'Calificación', 'Estado', 'Nota', 'Registrado por', 'Fecha'],
      ...filtrados.map((l) => [
        ...(mostrarEmpresa ? [l.empresa?.nombre ?? ''] : []),
        l.visitante?.nombre ?? '',
        l.visitante?.email ?? '',
        l.visitante?.telefono ?? '',
        l.visitante?.empresa ?? '',
        l.visitante?.ciudad ?? '',
        CALIFICACIONES[l.calificacion].label,
        ESTADOS_LEAD[l.estado]?.label ?? l.estado,
        l.nota,
        l.registradoPor ?? '',
        fechaHora(l.actualizadoEn),
      ]),
    ]);
  }

  return (
    <div className="table-card">
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo, ciudad…" />
        </div>
        {mostrarEmpresa && (
          <select className="input input-sm" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Todas las empresas</option>
            {empresas.map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
        )}
        <div className="seg">
          <button className={!cal ? 'active' : ''} onClick={() => setCal('')}>Todos</button>
          {CALIFICACION_ORDEN.map((c) => (
            <button key={c} className={cal === c ? `active tone-${CALIFICACIONES[c].tone}` : ''} onClick={() => setCal(c)}>
              {CALIFICACIONES[c].label}
            </button>
          ))}
        </div>
        <select
          className="input input-sm"
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoLead | '')}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {ESTADO_LEAD_ORDEN.map((e) => (
            <option key={e} value={e}>
              {ESTADOS_LEAD[e].label}
            </option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={exportar} disabled={!filtrados.length}>
          <Download size={15} /> CSV
        </button>
        {excel && (
          <button className="btn btn-outline btn-sm" onClick={exportarExcel} disabled={descargando || !leads.length}>
            <FileSpreadsheet size={15} /> {descargando ? 'Descargando…' : 'Excel'}
          </button>
        )}
      </div>
      {error && (
        <div className="table-alert">
          <Alert>{error}</Alert>
        </div>
      )}

      {filtrados.length === 0 ? (
        <EmptyState icon={<Inbox />} title={leads.length ? 'Sin resultados' : 'Aún no hay leads'}>
          {leads.length ? 'Prueba con otro filtro.' : 'Los contactos aparecerán aquí cuando se escaneen QR de visitantes.'}
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
                <th>Registrado por</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((l) => (
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
                  <td className="nowrap">{l.registradoPor || <span className="muted">—</span>}</td>
                  <td className="nowrap muted">{fechaHora(l.actualizadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-foot muted small">
        {filtrados.length} de {leads.length} contactos
      </div>
    </div>
  );
}
