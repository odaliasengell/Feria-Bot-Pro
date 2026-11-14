import { useEffect, useState, type FormEvent } from 'react';
import { Check, Download, IdCard, Mail, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import type { Feria, Visitante } from '../../types';
import { inscripcionesApi, todasLasPaginas, visitantesApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { descargarCSV, fecha, fechaHora } from '../../lib/utils';
import { useDebounce, usePaginado } from '../../lib/usePaginado';
import Paginacion from '../../components/Paginacion';
import { Alert, Avatar, EmptyState, Loader, Modal, PageHeader } from '../../components/ui';
import { TarjetaVisitante } from '../../components/Credenciales';
import { ConFeria } from '../../components/FeriaSelector';
import FormVisitante, { erroresVisitante, visitanteVacio } from './FormVisitante';
import { useValidacion } from '../../lib/useValidacion';
import { mensajeError, useToast } from '../../context/ToastContext';
import AceptoPolitica from '../../components/AceptoPolitica';
import { useConfirmar } from '../../context/ConfirmarContext';

export default function OrgVisitantes() {
  return <ConFeria>{(feria) => <VisitantesFeria feria={feria} />}</ConFeria>;
}

function VisitantesFeria({ feria }: { feria: Feria }) {
  const [q, setQ] = useState('');
  const [asistio, setAsistio] = useState<'' | 'si' | 'no'>('');
  const busqueda = useDebounce(q.trim());
  const { pagina, setPagina, porPagina, setPorPagina } = usePaginado([feria.id, busqueda, asistio]);
  const filtro = { q: busqueda, asistio: asistio === '' ? undefined : asistio === 'si' };
  const { data, cargando, error, recargar } = useAsync(
    () => visitantesApi.pagina(feria.id, { ...filtro, pagina, porPagina }),
    [feria.id, busqueda, asistio, pagina, porPagina],
  );
  const [nuevo, setNuevo] = useState(false);
  const [tarjeta, setTarjeta] = useState<Visitante | null>(null);
  const [exportando, setExportando] = useState(false);
  const toast = useToast();

  const filas = data?.items ?? [];
  // Si se quitó al último de la última página, volver a la anterior.
  useEffect(() => {
    if (data && !cargando && data.items.length === 0 && data.total > 0 && pagina > 1) setPagina(Math.ceil(data.total / porPagina));
  }, [data, cargando, pagina, porPagina, setPagina]);

  const confirmar = useConfirmar();
  async function eliminar(v: Visitante) {
    const ok = await confirmar({
      titulo: 'Quitar de la feria',
      mensaje: (
        <>
          <p>
            ¿Quitar a <b>{v.nombre}</b> de «{feria.nombre}»?
          </p>
          <p className="muted small">También se borrarán sus leads en esta feria. Su cuenta y su código QR se conservan.</p>
        </>
      ),
      confirmar: 'Quitar de la feria',
      peligro: true,
    });
    if (!ok) return;
    try {
      await inscripcionesApi.quitar(feria.id, v.id);
      toast.exito(`${v.nombre} ya no está inscrito en «${feria.nombre}».`);
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo quitar al visitante.'));
    }
  }

  /** Exporta todo lo que coincide con la búsqueda y el filtro (todas las páginas). */
  async function exportar() {
    setExportando(true);
    try {
      const todos = await todasLasPaginas((p) => visitantesApi.pagina(feria.id, { ...filtro, pagina: p, porPagina: 100 }));
      descargarCSV(`visitantes-${feria.nombre}.csv`, [
        ['Código', 'Nombre', 'Teléfono', 'Correo', 'Empresa', 'Ciudad', 'Registro', 'Asistió', 'Empresas que lo registraron'],
        ...todos.map((v) => [
          v.codigo,
          v.nombre,
          v.telefono,
          v.email,
          v.empresa,
          v.ciudad,
          fecha(v.creadoEn),
          v.asistioEn ? fechaHora(v.asistioEn) : 'No',
          String(v.leads),
        ]),
      ]);
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
        subtitle={`Inscritos en «${feria.nombre}». Registra a los visitantes en la entrada y entrega su tarjeta con QR personal.`}
        actions={
          <button className="btn btn-teal" onClick={() => setNuevo(true)}>
            <Plus size={17} /> Registrar visitante
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
        <div className={`table-card ${cargando ? 'is-cargando' : ''}`}>
          <div className="toolbar">
            <div className="search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código, correo, ciudad…" aria-label="Buscar visitantes" />
            </div>
            <div className="seg" role="group" aria-label="Filtrar por asistencia">
              <button className={asistio === '' ? 'active' : ''} onClick={() => setAsistio('')}>Todos</button>
              <button className={asistio === 'si' ? 'active tone-teal' : ''} onClick={() => setAsistio('si')}>Asistieron</button>
              <button className={asistio === 'no' ? 'active' : ''} onClick={() => setAsistio('no')}>Sin entrada</button>
            </div>
            <button className="btn btn-outline btn-sm" onClick={exportar} disabled={!data?.total || exportando}>
              <Download size={15} /> {exportando ? 'Exportando…' : 'CSV'}
            </button>
          </div>
          {filas.length === 0 ? (
            <EmptyState icon={<Users />} title={data?.totalFeria ? 'Sin resultados' : 'Aún no hay visitantes inscritos'}>
              {data?.totalFeria ? 'Prueba con otra búsqueda o filtro.' : undefined}
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Visitante</th>
                    <th>Código</th>
                    <th>Contacto</th>
                    <th>Asistió</th>
                    <th className="num" title="Empresas que lo registraron">Stands</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filas.map((v) => (
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
                          {v.email && (
                            <a href={`mailto:${v.email}`}>
                              <Mail size={14} /> {v.email}
                            </a>
                          )}
                          {v.telefono && (
                            <a href={`tel:${v.telefono}`}>
                              <Phone size={14} /> {v.telefono}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="nowrap">
                        {v.asistioEn ? (
                          <span className="badge tone-teal" title={`Entró: ${fechaHora(v.asistioEn)}`}>
                            <Check size={13} /> {fechaHora(v.asistioEn)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="num">{v.leads}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => setTarjeta(v)} title="Ver tarjeta con QR">
                            <IdCard size={15} /> <span className="solo-ancho">Tarjeta</span>
                          </button>
                          <button className="icon-btn danger" onClick={() => eliminar(v)} aria-label="Quitar de la feria" title="Quitar de la feria">
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
            <span>
              {data?.totalFeria ?? 0} visitantes inscritos · {data?.asistieron ?? 0} asistieron
            </span>
            <Paginacion
              pagina={pagina}
              porPagina={porPagina}
              total={data?.total ?? 0}
              onPagina={setPagina}
              onPorPagina={setPorPagina}
              etiqueta={busqueda || asistio ? 'resultados' : undefined}
            />
          </div>
        </div>
      )}

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Registrar visitante">
        {nuevo && (
          <NuevoVisitanteForm
            feria={feria}
            onCreado={(v) => {
              setNuevo(false);
              setTarjeta(v);
              recargar();
            }}
          />
        )}
      </Modal>

      <Modal open={tarjeta !== null} onClose={() => setTarjeta(null)} title="Tarjeta del visitante">
        {tarjeta && <TarjetaVisitante visitante={tarjeta} feria={feria} />}
      </Modal>
    </>
  );
}

function NuevoVisitanteForm({ feria, onCreado }: { feria: Feria; onCreado: (v: Visitante) => void }) {
  const [form, setForm] = useState(visitanteVacio);
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const v = useValidacion(erroresVisitante(form));
  const toast = useToast();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.validar()) {
      setError('Revisa los campos marcados en rojo.');
      return;
    }
    if (!acepta) {
      setError('El visitante debe aceptar la política de privacidad y tratamiento de datos.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const creado = await visitantesApi.crear(feria.id, form);
      toast.exito(`${creado.nombre} quedó inscrito en «${feria.nombre}».`);
      onCreado(creado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="stack">
      <FormVisitante value={form} onChange={setForm} error={v.error} tocar={v.tocar} />
      <AceptoPolitica checked={acepta} onChange={setAcepta} porOrganizador />
      <p className="muted small">Si el correo ya tiene cuenta, se inscribe esa cuenta en «{feria.nombre}» con su mismo código.</p>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-teal btn-block" disabled={enviando}>
        {enviando ? 'Generando…' : 'Registrar y generar tarjeta QR'}
      </button>
    </form>
  );
}
