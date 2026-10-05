import { Link } from 'react-router-dom';
import { ArrowRight, Building2, ContactRound, Eye, RotateCcw, Users } from 'lucide-react';
import { demoApi, empresasApi, leadsApi, visitantesApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { haceCuanto } from '../../lib/utils';
import { Avatar, Card, Loader, PageHeader, StatCard } from '../../components/ui';
import DistribucionCalificaciones from '../../components/DistribucionCalificaciones';

export default function OrgResumen() {
  const { data, cargando, recargar } = useAsync(
    () => Promise.all([empresasApi.listar(), visitantesApi.listar(), leadsApi.listar(), vistasApi.listar()]),
    [],
  );

  if (cargando && !data) return <Loader />;
  if (!data) return null;
  const [empresas, visitantes, leads, vistas] = data;

  const ranking = empresas
    .map((e) => ({ e, n: leads.filter((l) => l.empresaId === e.id).length, v: vistas.filter((x) => x.empresaId === e.id).length }))
    .sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...ranking.map((r) => r.n));

  async function reiniciar() {
    if (!confirm('¿Restaurar los datos de demostración? Se perderán los cambios.')) return;
    await demoApi.reiniciar();
    recargar();
  }

  return (
    <>
      <PageHeader
        title="Resumen de la feria"
        subtitle="Empresas participantes, visitantes y contactos generados en tiempo real."
        actions={
          <button className="btn btn-ghost btn-sm" onClick={reiniciar}>
            <RotateCcw size={15} /> Datos demo
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard label="Empresas" value={empresas.length} icon={<Building2 />} tone="blue" />
        <StatCard label="Visitantes registrados" value={visitantes.length} icon={<Users />} tone="teal" />
        <StatCard label="Leads generados" value={leads.length} icon={<ContactRound />} tone="orange" />
        <StatCard label="Fichas consultadas" value={vistas.length} icon={<Eye />} tone="navy" />
      </div>

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
