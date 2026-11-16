import { useState } from 'react';
import { Eye, FileSpreadsheet, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import type { VisitanteAdminFila } from '../../types';
import { adminApi, todasLasPaginas, visitantesApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { mensajeError, useToast } from '../../context/ToastContext';
import { useConfirmar } from '../../context/ConfirmarContext';
import { ESTADO_FERIA } from '../../lib/ferias';
import { fecha, fechaHora, rangoFechas } from '../../lib/utils';
import { descargarExcel } from '../../lib/excel';
import { useDebounce, usePaginado } from '../../lib/usePaginado';
import { Alert, Avatar, EmptyState, Loader, Modal, PageHeader } from '../../components/ui';
import Paginacion from '../../components/Paginacion';
import { ORIGEN_ACEPTACION } from './AdminRegistros';

/** Todos los visitantes de la plataforma. Cada consulta queda en el registro de actividad. */
export default function AdminVisitantes() {
  const [q, setQ] = useState('');
  const busqueda = useDebounce(q.trim());
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([busqueda]);
  const { data, cargando, error, recargar } = useAsync(() => adminApi.visitantes({ q: busqueda, pagina, porPagina }), [busqueda, pagina, porPagina]);
  const [viendo, setViendo] = useState<VisitanteAdminFila | null>(null);
  const [exportando, setExportando] = useState(false);
  const toast = useToast();
  const confirmar = useConfirmar();

  async function eliminar(v: VisitanteAdminFila) {
    const ok = await confirmar({
      titulo: 'Eliminar cuenta de visitante',
      mensaje: (
        <>
          <p>
            ¿Eliminar la cuenta de <b>{v.nombre}</b> ({v.codigo})?
          </p>
          <p className="muted small">
            Se borra de las {v.ferias} {v.ferias === 1 ? 'feria' : 'ferias'} en que está inscrito, con sus leads y fichas vistas. No se puede deshacer y
            queda en el registro de actividad.
          </p>
        </>
      ),
      confirmar: 'Eliminar cuenta',
      peligro: true,
    });
    if (!ok) return;
    try {
      await visitantesApi.eliminar(v.id);
      toast.exito(`Cuenta de ${v.nombre} eliminada.`);
      setViendo(null);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar.'));
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const todos = await todasLasPaginas((p) => adminApi.visitantes({ q: busqueda, pagina: p, porPagina: 100 }));
      descargarExcel('visitantes-feriabot', [
        ['Código', 'Nombre', 'Correo', 'Teléfono', 'Empresa', 'Ciudad', 'Ferias', 'Registro', 'Política aceptada', 'Versión'],
        ...todos.map((v) => [
          v.codigo, v.nombre, v.email, v.telefono, v.empresa, v.ciudad, String(v.ferias), fecha(v.creadoEn),
          v.politicaAceptadaEn ? fechaHora(v.politicaAceptadaEn) : '', v.politicaVersion ?? '',
        ]),
      ], { hoja: 'Visitantes' });
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo exportar.'));
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Visitantes"
        subtitle="Todos los visitantes registrados en la plataforma, con sus ferias y la constancia de su consentimiento."
      />
      <p className="aviso-datos small">
        <ShieldCheck size={15} /> Datos personales protegidos por la LOPDP: úsalos solo para administrar la plataforma y dar soporte. Cada consulta queda
        registrada.
      </p>
      {cargando && !data ? (
        <Loader />
      ) : error && !data ? (
        <Alert>{error}</Alert>
      ) : (
        <div className={`table-card ${cargando ? 'is-cargando' : ''}`}>
          <div className="toolbar">
            <div className="search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código, correo, teléfono, ciudad…" aria-label="Buscar visitantes" />
            </div>
            <button className="btn btn-outline btn-sm" onClick={exportar} disabled={!data?.total || exportando}>
              <FileSpreadsheet size={15} /> {exportando ? 'Exportando…' : 'Excel'}
            </button>
          </div>
          {!data?.items.length ? (
            <EmptyState icon={<Users />} title={busqueda ? 'Sin resultados' : 'Aún no hay visitantes'} />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Visitante</th>
                    <th>Código</th>
                    <th>Contacto</th>
                    <th className="num">Ferias</th>
                    <th>Consentimiento</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div className="cell-person">
                          <Avatar nombre={v.nombre} size={34} />
                          <div>
                            <strong>{v.nombre}</strong>
                            <span>{[v.empresa, v.ciudad].filter(Boolean).join(' · ') || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="nowrap">
                        <code className="code">{v.codigo}</code>
                      </td>
                      <td>
                        <div className="cell-contact">
                          {v.email && <span>{v.email}</span>}
                          {v.telefono && <span>{v.telefono}</span>}
                        </div>
                      </td>
                      <td className="num">{v.ferias}</td>
                      <td className="nowrap small">
                        {v.politicaAceptadaEn ? (
                          <>
                            {fecha(v.politicaAceptadaEn)} <span className="muted">· v{v.politicaVersion}</span>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => setViendo(v)}>
                            <Eye size={15} /> Ver
                          </button>
                          <button className="icon-btn danger" onClick={() => eliminar(v)} aria-label={`Eliminar a ${v.nombre}`} title="Eliminar cuenta">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-foot muted small">
            <span>{data?.total ?? 0} visitantes</span>
            <Paginacion pagina={pagina} porPagina={porPagina} total={data?.total ?? 0} onPagina={setPagina} onPorPagina={setPorPagina} />
          </div>
        </div>
      )}

      <Modal open={viendo !== null} onClose={() => setViendo(null)} title={viendo?.nombre ?? ''} wide>
        {viendo && <DetalleVisitante id={viendo.id} onEliminar={() => eliminar(viendo)} />}
      </Modal>
    </>
  );
}

function DetalleVisitante({ id, onEliminar }: { id: string; onEliminar: () => void }) {
  const { data: v, cargando, error } = useAsync(() => adminApi.visitante(id), [id]);
  if (cargando && !v) return <Loader />;
  if (error || !v) return <Alert>{error ?? 'No se pudo cargar.'}</Alert>;
  return (
    <div className="stack">
      <div className="av-datos">
        <div>
          <span className="muted small">Código</span>
          <code className="code">{v.codigo}</code>
        </div>
        <div>
          <span className="muted small">Correo</span>
          <b>{v.email || '—'}</b>
        </div>
        <div>
          <span className="muted small">Teléfono</span>
          <b>{v.telefono || '—'}</b>
        </div>
        <div>
          <span className="muted small">Empresa · Ciudad</span>
          <b>{[v.empresa, v.ciudad].filter(Boolean).join(' · ') || '—'}</b>
        </div>
        <div>
          <span className="muted small">Registro</span>
          <b>{fechaHora(v.creadoEn)}</b>
        </div>
      </div>

      <h3 className="av-titulo">Ferias ({v.inscripciones.length})</h3>
      {v.inscripciones.length === 0 ? (
        <p className="muted small">No está inscrito en ninguna feria.</p>
      ) : (
        <ul className="company-list af-lista">
          {v.inscripciones.map((i) => (
            <li key={i.feriaId}>
              <div className="grow">
                <strong>{i.feriaNombre}</strong>
                <span className="muted small">
                  {i.organizadorNombre} · {rangoFechas(i.fechaInicio, i.fechaFin)} · inscrito el {fecha(i.inscritoEn)}
                </span>
              </div>
              <span className={`badge tone-${ESTADO_FERIA[i.estado].tone}`}>{ESTADO_FERIA[i.estado].label}</span>
              <span className="small muted">
                {i.asistioEn ? `Entró ${fechaHora(i.asistioEn)}` : 'Sin entrada'} · {i.leads} {i.leads === 1 ? 'contacto' : 'contactos'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="av-titulo">Aceptaciones de la política ({v.aceptaciones.length})</h3>
      {v.aceptaciones.length === 0 ? (
        <p className="muted small">Sin constancia registrada.</p>
      ) : (
        <ul className="av-aceptaciones">
          {v.aceptaciones.map((a) => (
            <li key={a.id}>
              <ShieldCheck size={15} />
              <span>
                <b>{fechaHora(a.creadoEn)}</b> · versión {a.version || '—'} · {ORIGEN_ACEPTACION[a.origen] ?? a.origen}
                {a.registradoPor && ` (marcada por ${a.registradoPor})`}
                {a.ip && <span className="muted"> · IP {a.ip}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="row-gap">
        <button className="btn btn-danger btn-sm" onClick={onEliminar}>
          <Trash2 size={15} /> Eliminar cuenta
        </button>
      </div>
    </div>
  );
}
