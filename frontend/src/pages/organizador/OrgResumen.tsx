import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CalendarDays, ContactRound, Eye, RotateCcw, Users } from 'lucide-react';
import type { Feria } from '../../types';
import { demoApi, empresasApi, feriasApi, leadsApi, visitantesApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { haceCuanto, rangoFechas } from '../../lib/utils';
import { useFeria } from '../../context/FeriaContext';
import { ConFeria } from '../../components/FeriaSelector';
import { Avatar, Card, EmptyState, Loader, PageHeader, StatCard } from '../../components/ui';
import DistribucionCalificaciones from '../../components/DistribucionCalificaciones';
import GraficosFeria from '../../components/GraficosFeria';

export default function OrgResumen() {
  const { ferias, cargando, recargar } = useFeria();

  async function reiniciar() {
    if (!confirm('¿Restaurar los datos de demostración? Se borrarán todas las ferias y sus datos.')) return;
    await demoApi.reiniciar();
    await recargar();
  }

  if (!cargando && ferias.length === 0)
    return (
      <EmptyState icon={<CalendarDays />} title="Bienvenido a FeriaBot Pro">
        Crea tu primera feria para cargar empresas y abrir el registro de visitantes.
        <div className="row-gap center-row">
          <Link to="/organizador/ferias" className="btn btn-primary">Crear feria</Link>
          <button className="btn btn-ghost" onClick={reiniciar}>
            <RotateCcw size={15} /> Cargar datos demo
          </button>
        </div>
      </EmptyState>
    );
  return <ConFeria>{(feria) => <ResumenFeria feria={feria} onReiniciar={reiniciar} />}</ConFeria>;
}

function ResumenFeria({ feria, onReiniciar }: { feria: Feria; onReiniciar: () => Promise<void> }) {
  const { data, cargando, recargar } = useAsync(
    () =>
      Promise.all([
        empresasApi.listar(feria.id),
        visitantesApi.listar(feria.id),
        leadsApi.listar({ feriaId: feria.id }),
        vistasApi.listar({ feriaId: feria.id }),
        feriasApi.estadisticas(feria.id),
      ]),
    [feria.id],
  );

  if (cargando && !data) return <Loader />;
  if (!data) return null;
  const [empresas, visitantes, leads, vistas, stats] = data;

  const ranking = empresas
    .map((e) => ({ e, n: leads.filter((l) => l.empresaId === e.id).length, v: vistas.filter((x) => x.empresaId === e.id).length }))
    .sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...ranking.map((r) => r.n));

  async function reiniciar() {
    await onReiniciar();
    recargar();
  }

  return (
    <>
      <PageHeader
        title={feria.nombre}
        subtitle={[rangoFechas(feria.fechaInicio, feria.fechaFin), feria.lugar].filter(Boolean).join(' · ')}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={reiniciar}>
            <RotateCcw size={15} /> Datos demo
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard label="Empresas" value={empresas.length} icon={<Building2 />} tone="blue" />
        <StatCard label="Visitantes inscritos" value={visitantes.length} icon={<Users />} tone="teal" hint={feria.abierta ? 'Inscripciones abiertas' : 'Inscripciones cerradas'} />
        <StatCard label="Leads generados" value={leads.length} icon={<ContactRound />} tone="orange" />
        <StatCard label="Fichas consultadas" value={vistas.length} icon={<Eye />} tone="navy" />
      </div>

      <GraficosFeria stats={stats} />

      <div className="grid-2">
        <Card
          title="Leads por empresa"
          action={
            <Link to="/organizador/empresas" className="link-sm">
              Ver empresas <ArrowRight size={14} />
            </Link>
          }
        >
          <ul className="rank">
            {ranking.map(({ e, n, v }) => (
              <li key={e.id}>
                <Avatar nombre={e.nombre} src={e.logo} size={34} square />
                <div className="rank-body">
                  <div className="rank-top">
                    <strong>{e.nombre}</strong>
                    <span className="muted small">{v} {v === 1 ? 'ficha vista' : 'fichas vistas'}</span>
                    <b>{n}</b>
                  </div>
                  <div className="rank-bar">
                    <span style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="stack">
          <Card title="Nivel de interés">
            <DistribucionCalificaciones leads={leads} />
          </Card>
          <Card
            title="Últimos visitantes"
            action={
              <Link to="/organizador/visitantes" className="link-sm">
                Ver todos <ArrowRight size={14} />
              </Link>
            }
          >
            <ul className="mini-list">
              {visitantes.slice(0, 5).map((v) => (
                <li key={v.id}>
                  <Avatar nombre={v.nombre} size={34} />
                  <div>
                    <strong>{v.nombre}</strong>
                    <span>{[v.empresa, v.ciudad].filter(Boolean).join(' · ')}</span>
                  </div>
                  <small className="muted">{haceCuanto(v.creadoEn)}</small>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
