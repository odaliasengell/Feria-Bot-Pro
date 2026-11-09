import { useMemo, useState, type FormEvent } from 'react';
import { Download, IdCard, Plus, Search, Trash2, Users } from 'lucide-react';
import type { Feria, Visitante } from '../../types';
import { inscripcionesApi, leadsApi, visitantesApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { descargarCSV, fecha, normalizar } from '../../lib/utils';
import { Alert, Avatar, EmptyState, Loader, Modal, PageHeader } from '../../components/ui';
import { TarjetaVisitante } from '../../components/Credenciales';
import { ConFeria } from '../../components/FeriaSelector';
import FormVisitante, { visitanteVacio } from './FormVisitante';

export default function OrgVisitantes() {
  return <ConFeria>{(feria) => <VisitantesFeria feria={feria} />}</ConFeria>;
}

function VisitantesFeria({ feria }: { feria: Feria }) {
  const { data, cargando, recargar } = useAsync(
    () => Promise.all([visitantesApi.listar(feria.id), leadsApi.listar({ feriaId: feria.id })]),
    [feria.id],
  );
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [tarjeta, setTarjeta] = useState<Visitante | null>(null);

  const [visitantes, leads] = data ?? [[], []];
  const filtrados = useMemo(() => {
    const nq = normalizar(q);
    return visitantes.filter((v) => !nq || normalizar([v.nombre, v.email, v.codigo, v.empresa, v.ciudad, v.telefono].join(' ')).includes(nq));
  }, [visitantes, q]);

  async function eliminar(v: Visitante) {
    if (!confirm(`¿Quitar a ${v.nombre} de «${feria.nombre}»? También se borrarán sus leads en esta feria. Su cuenta se conserva.`)) return;
    await inscripcionesApi.quitar(feria.id, v.id);
    recargar();
  }

  function exportar() {
    descargarCSV(`visitantes-${feria.nombre}.csv`, [
      ['Código', 'Nombre', 'Teléfono', 'Correo', 'Empresa', 'Ciudad', 'Registro'],
      ...filtrados.map((v) => [v.codigo, v.nombre, v.telefono, v.email, v.empresa, v.ciudad, fecha(v.creadoEn)]),
    ]);
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
      ) : (
        <div className="table-card">
          <div className="toolbar">
            <div className="search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código, correo, ciudad…" />
            </div>
            <button className="btn btn-outline btn-sm" onClick={exportar} disabled={!filtrados.length}>
              <Download size={15} /> CSV
            </button>
          </div>
          {filtrados.length === 0 ? (
            <EmptyState icon={<Users />} title={visitantes.length ? 'Sin resultados' : 'Aún no hay visitantes inscritos'} />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Visitante</th>
                    <th>Código</th>
                    <th>Teléfono</th>
                    <th>Correo</th>
                    <th>Ciudad</th>
                    <th className="num">Stands</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div className="cell-person">
                          <Avatar nombre={v.nombre} size={34} />
                          <div>
                            <strong>{v.nombre}</strong>
                            <span>{v.empresa || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code className="code">{v.codigo}</code>
                      </td>
                      <td className="nowrap">{v.telefono}</td>
                      <td>{v.email}</td>
                      <td>{v.ciudad}</td>
                      <td className="num">{leads.filter((l) => l.visitanteId === v.id).length}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => setTarjeta(v)}>
                            <IdCard size={15} /> Tarjeta
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
            {filtrados.length} de {visitantes.length} visitantes inscritos
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
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      onCreado(await visitantesApi.crear(feria.id, form));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="stack">
      <FormVisitante value={form} onChange={setForm} />
      <p className="muted small">Si el correo ya tiene cuenta, se inscribe esa cuenta en «{feria.nombre}» con su mismo código.</p>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-teal btn-block" disabled={enviando}>
        {enviando ? 'Generando…' : 'Registrar y generar tarjeta QR'}
      </button>
    </form>
  );
}
