import { useState } from 'react';
import { Activity, Download, Search, ShieldCheck } from 'lucide-react';
import { adminApi, todasLasPaginas } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { mensajeError, useToast } from '../../context/ToastContext';
import { descargarCSV, fechaHora } from '../../lib/utils';
import { useDebounce, usePaginado } from '../../lib/usePaginado';
import { Alert, EmptyState, Loader, PageHeader } from '../../components/ui';
import Paginacion from '../../components/Paginacion';

export const ORIGEN_ACEPTACION: Record<string, string> = {
  registro_publico: 'Registro en la web',
  registro_organizador: 'Registro en la entrada de la feria',
  contratacion: 'Contratación de un plan',
  historico: 'Registro (anterior a este historial)',
};

const ACCIONES: [string, string][] = [
  ['', 'Todo'],
  ['datos.ver', 'Consultas de datos'],
  ['feria', 'Ferias'],
  ['visitante', 'Visitantes'],
  ['organizador', 'Organizadores'],
  ['solicitud', 'Solicitudes'],
  ['plan', 'Planes'],
  ['equipo', 'Equipo'],
];

/** Constancias de cumplimiento: actividad del equipo y aceptaciones de la política de privacidad. */
export default function AdminRegistros() {
  const [tab, setTab] = useState<'actividad' | 'aceptaciones'>('actividad');
  return (
    <>
      <PageHeader
        title="Registros"
        subtitle="Constancia de lo que hace el equipo de FeriaBot Pro y de cada aceptación de la política de privacidad y tratamiento de datos (LOPDP)."
      />
      <div className="seg registros-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'actividad'} className={tab === 'actividad' ? 'active' : ''} onClick={() => setTab('actividad')}>
          <Activity size={14} /> Actividad del equipo
        </button>
        <button role="tab" aria-selected={tab === 'aceptaciones'} className={tab === 'aceptaciones' ? 'active' : ''} onClick={() => setTab('aceptaciones')}>
          <ShieldCheck size={14} /> Aceptaciones de la política
        </button>
      </div>
      {tab === 'actividad' ? <TablaActividad /> : <TablaAceptaciones />}
    </>
  );
}

function TablaActividad() {
  const [q, setQ] = useState('');
  const [accion, setAccion] = useState('');
  const busqueda = useDebounce(q.trim());
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([busqueda, accion]);
  const { data, cargando, error } = useAsync(() => adminApi.actividad({ q: busqueda, accion: accion || undefined, pagina, porPagina }), [busqueda, accion, pagina, porPagina]);

  if (cargando && !data) return <Loader />;
  if (error && !data) return <Alert>{error}</Alert>;
  return (
    <div className={`table-card ${cargando ? 'is-cargando' : ''}`}>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por persona o detalle…" aria-label="Buscar en la actividad" />
        </div>
        <select className="input input-sm" value={accion} onChange={(e) => setAccion(e.target.value)} aria-label="Filtrar por tipo">
          {ACCIONES.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {!data?.items.length ? (
        <EmptyState icon={<Activity />} title="Sin actividad registrada" />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Quién</th>
                <th>Qué hizo</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap muted">{fechaHora(a.creadoEn)}</td>
                  <td className="nowrap">
                    <strong>{a.actorNombre}</strong>
                  </td>
                  <td>
                    <span className="badge tone-gray reg-accion">{a.accion}</span> {a.descripcion}
                  </td>
                  <td className="nowrap muted small">{a.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-foot muted small">
        <span>{data?.total ?? 0} registros</span>
        <Paginacion pagina={pagina} porPagina={porPagina} total={data?.total ?? 0} onPagina={setPagina} onPorPagina={setPorPagina} />
      </div>
    </div>
  );
}

function TablaAceptaciones() {
  const [q, setQ] = useState('');
  const [origen, setOrigen] = useState('');
  const busqueda = useDebounce(q.trim());
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([busqueda, origen]);
  const { data, cargando, error } = useAsync(() => adminApi.aceptaciones({ q: busqueda, origen: origen || undefined, pagina, porPagina }), [busqueda, origen, pagina, porPagina]);
  const [exportando, setExportando] = useState(false);
  const toast = useToast();

  async function exportar() {
    setExportando(true);
    try {
      const todas = await todasLasPaginas((p) => adminApi.aceptaciones({ q: busqueda, origen: origen || undefined, pagina: p, porPagina: 100 }));
      descargarCSV('aceptaciones-politica.csv', [
        ['Fecha', 'Nombre', 'Correo', 'Tipo', 'Versión', 'Origen', 'Marcada por', 'IP', 'Navegador'],
        ...todas.map((a) => [
          fechaHora(a.creadoEn), a.nombre, a.email, a.tipo === 'visitante' ? 'Visitante' : 'Contratación de plan', a.version,
          ORIGEN_ACEPTACION[a.origen] ?? a.origen, a.registradoPor, a.ip, a.userAgent,
        ]),
      ]);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo exportar.'));
    } finally {
      setExportando(false);
    }
  }

  if (cargando && !data) return <Loader />;
  if (error && !data) return <Alert>{error}</Alert>;
  return (
    <div className={`table-card ${cargando ? 'is-cargando' : ''}`}>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo o IP…" aria-label="Buscar aceptaciones" />
        </div>
        <select className="input input-sm" value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label="Filtrar por origen">
          <option value="">Todos los orígenes</option>
          {Object.entries(ORIGEN_ACEPTACION).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={exportar} disabled={!data?.total || exportando}>
          <Download size={15} /> {exportando ? 'Exportando…' : 'CSV'}
        </button>
      </div>
      {!data?.items.length ? (
        <EmptyState icon={<ShieldCheck />} title="Sin aceptaciones" />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Quién aceptó</th>
                <th>Versión</th>
                <th>Desde dónde</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap muted">{fechaHora(a.creadoEn)}</td>
                  <td>
                    <strong>{a.nombre}</strong>
                    <div className="muted small">{a.email || 'sin correo'}</div>
                  </td>
                  <td className="nowrap">{a.version || '—'}</td>
                  <td>
                    {ORIGEN_ACEPTACION[a.origen] ?? a.origen}
                    {a.registradoPor && <div className="muted small">Marcada por {a.registradoPor}</div>}
                  </td>
                  <td className="nowrap muted small" title={a.userAgent}>
                    {a.ip || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-foot muted small">
        <span>{data?.total ?? 0} aceptaciones</span>
        <Paginacion pagina={pagina} porPagina={porPagina} total={data?.total ?? 0} onPagina={setPagina} onPorPagina={setPorPagina} />
      </div>
    </div>
  );
}
