import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Building2, CalendarDays, DollarSign, Inbox, Users } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { ESTADO_CUENTA, ORDEN_ESTADOS, PLAN_TONO, cifra, diasHasta, dinero, textoVencimiento } from '../../lib/planes';
import { Alert, Avatar, Card, EmptyState, Loader, PageHeader, StatCard } from '../../components/ui';

/** Resumen del Super Administrador: clientes por estado y por plan, uso de la plataforma y cuentas por vencer. */
export default function AdminResumen() {
  const { data, cargando, error, recargar } = useAsync(() => Promise.all([adminApi.resumen(), adminApi.planes()]), []);
  if (cargando && !data) return <Loader />;
  if (error || !data)
    return (
      <Alert>
        {error}{' '}
        <button type="button" className="link-btn" onClick={recargar}>
          Reintentar
        </button>
      </Alert>
    );
  const [r, planes] = data;

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle="Organizadores de ferias, sus planes y el uso de la plataforma."
        actions={
          <Link to="/admin/organizadores?nuevo=1" className="btn btn-primary">
            <Briefcase size={17} /> Nuevo organizador
          </Link>
        }
      />

      {r.solicitudesPendientes > 0 && (
        <Link to="/admin/solicitudes" className="vf-aviso aviso-solicitudes">
          <Inbox size={18} />
          <span>
            {r.solicitudesPendientes === 1 ? 'Hay 1 solicitud' : `Hay ${r.solicitudesPendientes} solicitudes`} de plan por revisar: confirma
            la transferencia para crear la cuenta.
          </span>
          <b>
            Revisar <ArrowRight size={15} />
          </b>
        </Link>
      )}

      <div className="stats-grid">
        <StatCard label="Organizadores" value={r.organizadores} icon={<Briefcase />} tone="navy" hint={`${r.porEstado.activa + r.porEstado.por_vencer} con el plan vigente`} />
        <StatCard label="Ingreso mensual estimado" value={dinero(r.ingresoMensual)} icon={<DollarSign />} tone="teal" hint="Precio mensual de las cuentas vigentes" />
        <StatCard label="Ferias en curso o próximas" value={cifra(r.feriasActivas)} icon={<CalendarDays />} tone="blue" />
        <StatCard label="Empresas registradas" value={cifra(r.empresas)} icon={<Building2 />} tone="orange" />
        <StatCard label="Inscripciones de visitantes" value={cifra(r.inscripciones)} icon={<Users />} tone="navy" />
      </div>

      <div className="grid-2">
        <Card title="Cuentas por estado">
          <ul className="admin-estados">
            {ORDEN_ESTADOS.map((e) => (
              <li key={e}>
                <span className={`badge tone-${ESTADO_CUENTA[e].tone}`}>{ESTADO_CUENTA[e].label}</span>
                <span className="muted small">{ESTADO_CUENTA[e].detalle}</span>
                <b>{r.porEstado[e] ?? 0}</b>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Clientes por plan"
          action={
            <Link to="/admin/planes" className="link-sm">
              Precios <ArrowRight size={14} />
            </Link>
          }
        >
          <ul className="admin-planes">
            {planes.map((p) => (
              <li key={p.id}>
                <div>
                  <span className={`badge tone-${PLAN_TONO[p.id]}`}>
                    {p.nombre} · {dinero(p.precioMensual)}/mes
                  </span>
                  <span className="muted small">
                    {p.ferias} ferias · {cifra(p.empresasPorFeria)} empresas y {cifra(p.visitantesPorFeria)} visitantes por feria
                  </span>
                </div>
                <b>{r.porPlan[p.id] ?? 0}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Por vencer y vencidas"
        action={
          <Link to="/admin/organizadores" className="link-sm">
            Ver organizadores <ArrowRight size={14} />
          </Link>
        }
      >
        {r.porVencer.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="Ninguna cuenta por vencer">
            Las cuentas que venzan en los próximos 15 días aparecerán aquí.
          </EmptyState>
        ) : (
          <ul className="mini-list">
            {r.porVencer.map((o) => (
              <li key={o.id}>
                <Avatar nombre={o.nombre} size={34} square />
                <div>
                  <strong>{o.nombre}</strong>
                  <span>
                    {o.email} · plan {planes.find((p) => p.id === o.plan)?.nombre ?? o.plan}
                  </span>
                </div>
                <span className={`badge tone-${ESTADO_CUENTA[o.estado].tone}`}>{textoVencimiento(diasHasta(o.planFin))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
