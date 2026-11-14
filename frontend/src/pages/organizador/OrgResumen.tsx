import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CalendarDays, ContactRound, Eye, Users } from 'lucide-react';
import type { Feria } from '../../types';
import { feriasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { haceCuanto, rangoFechas } from '../../lib/utils';
import { useFeria } from '../../context/FeriaContext';
import { ConFeria } from '../../components/FeriaSelector';
import { Avatar, Card, EmptyState, ErrorCarga, Loader, PageHeader, StatCard } from '../../components/ui';
import DistribucionCalificaciones from '../../components/DistribucionCalificaciones';
import GraficosFeria from '../../components/GraficosFeria';

export default function OrgResumen() {
  const { ferias, cargando } = useFeria();

  if (!cargando && ferias.length === 0)
    return (
      <EmptyState icon={<CalendarDays />} title="Bienvenido a FeriaBot Pro">
        Crea tu primera feria para cargar empresas y abrir el registro de visitantes.
        <div className="row-gap center-row">
          <Link to="/organizador/ferias" className="btn btn-primary">Crear feria</Link>
        </div>
      </EmptyState>
    );
  return <ConFeria>{(feria) => <ResumenFeria feria={feria} />}</ConFeria>;
}

function ResumenFeria({ feria }: { feria: Feria }) {
  // Todo sale de las estadísticas (cifras calculadas en la base), sin descargar las listas completas.
  const { data: stats, cargando, error, recargar } = useAsync(() => feriasApi.estadisticas(feria.id), [feria.id]);

  if (cargando && !stats) return <Loader />;
  if (!stats) return <ErrorCarga error={error ?? 'Intenta de nuevo.'} onReintentar={recargar} titulo="No pudimos cargar el resumen" />;

  const ranking = stats.rankingEmpresas;
  const max = Math.max(1, ...ranking.map((r) => r.leads));

  return (
    <>
      <PageHeader
        title={feria.nombre}
        subtitle={[rangoFechas(feria.fechaInicio, feria.fechaFin), feria.lugar].filter(Boolean).join(' · ')}
      />

      <div className="stats-grid">
        <StatCard label="Empresas" value={stats.totalEmpresas} icon={<Building2 />} tone="blue" />
        <StatCard label="Visitantes inscritos" value={stats.totalInscritos} icon={<Users />} tone="teal" hint={feria.abierta ? 'Inscripciones abiertas' : 'Inscripciones cerradas'} />
        <StatCard label="Leads generados" value={stats.totalLeads} icon={<ContactRound />} tone="orange" />
        <StatCard label="Fichas consultadas" value={stats.totalVistas} icon={<Eye />} tone="navy" />
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
            {ranking.map(({ empresaId, nombre, logo, leads: n, vistas: v }) => (
              <li key={empresaId}>
                <Avatar nombre={nombre} src={logo ?? undefined} size={34} square />
                <div className="rank-body">
                  <div className="rank-top">
                    <strong>{nombre}</strong>
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
            <DistribucionCalificaciones conteo={stats.leadsPorCalificacion} />
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
              {stats.ultimosVisitantes.map((v) => (
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
