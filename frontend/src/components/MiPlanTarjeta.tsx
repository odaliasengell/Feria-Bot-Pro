import { CalendarRange, Crown } from 'lucide-react';
import { miPlanApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { ESTADO_CUENTA, cifra, textoVencimiento } from '../lib/planes';
import { rangoFechas } from '../lib/utils';
import { ESTADO_FERIA } from '../lib/ferias';
import { Alert, Card, Loader } from './ui';
import UsoBarra from './UsoBarra';

/** Perfil del organizador: su plan, vigencia, límites y cuánto usa de cada feria en curso o próxima. */
export default function MiPlanTarjeta() {
  const { data, cargando, error } = useAsync(() => miPlanApi.obtener(), []);
  if (cargando && !data) return <Loader />;
  if (error || !data) return <Alert>{error ?? 'No se pudo cargar tu plan.'}</Alert>;

  const { organizador: o, plan, uso } = data;
  const est = ESTADO_CUENTA[o.estado];
  const vigentes = uso.ferias.filter((f) => f.estado !== 'finalizada');

  return (
    <Card className="mi-plan">
      <div className="mi-plan-cabecera">
        <span className="mi-plan-icono" aria-hidden>
          <Crown size={22} />
        </span>
        <div>
          <span className="muted small">Tu plan</span>
          <h2>{plan.nombre}</h2>
        </div>
        <span className={`badge tone-${est.tone}`}>{est.label}</span>
      </div>

      <div className="mi-plan-vigencia">
        <CalendarRange size={16} />
        {o.planInicio && o.planFin ? rangoFechas(o.planInicio, o.planFin) : 'Sin fechas'}
        <span className="muted">· {textoVencimiento(data.diasRestantes)}</span>
      </div>

      <ul className="mi-plan-limites">
        <li>
          <b>{plan.ferias}</b> ferias en curso o próximas a la vez
        </li>
        <li>
          <b>{cifra(plan.empresasPorFeria)}</b> empresas por feria
        </li>
        <li>
          <b>{cifra(plan.visitantesPorFeria)}</b> visitantes por feria
        </li>
      </ul>

      <UsoBarra etiqueta="Ferias en curso o próximas" usado={uso.feriasActivas} limite={plan.ferias} />
      {vigentes.length > 0 && (
        <div className="mi-plan-ferias">
          {vigentes.map((f) => (
            <div key={f.id} className="mi-plan-feria">
              <div className="mi-plan-feria-titulo">
                <strong>{f.nombre}</strong>
                <span className={`badge tone-${ESTADO_FERIA[f.estado].tone}`}>{ESTADO_FERIA[f.estado].label}</span>
              </div>
              <UsoBarra etiqueta="Empresas" usado={f.empresas} limite={plan.empresasPorFeria} compacta />
              <UsoBarra etiqueta="Visitantes" usado={f.visitantes} limite={plan.visitantesPorFeria} compacta />
            </div>
          ))}
        </div>
      )}

      <p className="muted small">
        Datos de tu cuenta: {o.nombre}
        {o.ruc ? ` · RUC ${o.ruc}` : ''}. Para cambiar de plan, renovarlo o corregir estos datos, comunícate con FeriaBot Pro.
      </p>
    </Card>
  );
}
