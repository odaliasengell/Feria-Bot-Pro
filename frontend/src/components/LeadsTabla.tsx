import { useMemo, useState } from 'react';
import { Download, Mail, Phone, Search, Inbox } from 'lucide-react';
import type { Calificacion, LeadDetalle } from '../types';
import { CALIFICACIONES, CALIFICACION_ORDEN, descargarCSV, fechaHora, normalizar } from '../lib/utils';
import { Avatar, CalificacionBadge, EmptyState } from './ui';

interface Props {
  leads: LeadDetalle[];
  /** Muestra la columna empresa (vista del organizador). */
  mostrarEmpresa?: boolean;
  archivo: string;
  onSelect?: (lead: LeadDetalle) => void;
}

export default function LeadsTabla({ leads, mostrarEmpresa, archivo, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [cal, setCal] = useState<Calificacion | ''>('');
  const [empresaId, setEmpresaId] = useState('');

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
        (!empresaId || l.empresaId === empresaId) &&
        (!nq ||
          normalizar(
            [l.visitante?.nombre, l.visitante?.email, l.visitante?.empresa, l.visitante?.ciudad, l.empresa?.nombre, l.nota, l.registradoPor].join(' '),
          ).includes(nq)),
    );
  }, [leads, q, cal, empresaId]);

  function exportar() {
    descargarCSV(archivo, [
      [...(mostrarEmpresa ? ['Empresa expositora'] : []), 'Nombre', 'Correo', 'Teléfono', 'Empresa', 'Ciudad', 'Calificación', 'Nota', 'Registrado por', 'Fecha'],
      ...filtrados.map((l) => [
        ...(mostrarEmpresa ? [l.empresa?.nombre ?? ''] : []),
        l.visitante?.nombre ?? '',
        l.visitante?.email ?? '',
        l.visitante?.telefono ?? '',
        l.visitante?.empresa ?? '',
        l.visitante?.ciudad ?? '',
        CALIFICACIONES[l.calificacion].label,
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
        <button className="btn btn-outline btn-sm" onClick={exportar} disabled={!filtrados.length}>
          <Download size={15} /> CSV
        </button>
      </div>

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
