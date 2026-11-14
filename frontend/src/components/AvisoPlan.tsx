import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Info } from 'lucide-react';
import type { MiPlan } from '../types';
import { miPlanApi } from '../services/api';
import { useFeria } from '../context/FeriaContext';
import { textoVencimiento } from '../lib/planes';
import { rangoFechas } from '../lib/utils';

/**
 * Aviso del plan en el panel del organizador: vencido, por vencer, aún no empieza o con todas las ferias del plan
 * ocupadas. Si todo está en orden no muestra nada.
 */
export default function AvisoPlan() {
  const { ferias } = useFeria();
  const [plan, setPlan] = useState<MiPlan | null>(null);

  // Se vuelve a pedir cuando cambian las ferias (crear o eliminar cambia el uso).
  useEffect(() => {
    let vivo = true;
    miPlanApi
      .obtener()
      .then((p) => vivo && setPlan(p))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ferias.length]);

  if (!plan) return null;
  const { estado } = plan.organizador;
  const nombre = plan.plan.nombre;

  let tono = '';
  let icono = <Info size={18} />;
  let texto = '';
  if (estado === 'vencida') {
    tono = 'aviso-plan-rojo';
    icono = <AlertTriangle size={18} />;
    texto = `Tu plan ${nombre} venció. Puedes ver tus datos, pero no crear ferias, empresas ni inscripciones. Comunícate con FeriaBot Pro para renovarlo.`;
  } else if (estado === 'programada') {
    tono = 'aviso-plan-azul';
    texto = `Tu plan ${nombre} empieza el ${plan.organizador.planInicio ? rangoFechas(plan.organizador.planInicio, plan.organizador.planInicio) : 'pronto'}. Hasta entonces solo puedes ver tus datos.`;
  } else if (estado === 'por_vencer') {
    tono = 'aviso-plan-naranja';
    icono = <Clock size={18} />;
    texto = `${textoVencimiento(plan.diasRestantes)}: tu plan ${nombre}. Comunícate con FeriaBot Pro para renovarlo a tiempo.`;
  } else if (plan.uso.feriasActivas >= plan.plan.ferias) {
    tono = 'aviso-plan-azul';
    texto = `Usas las ${plan.plan.ferias} ferias de tu plan ${nombre}. Cuando una termine podrás crear otra, o mejora tu plan.`;
  } else {
    return null;
  }

  return (
    <div className={`aviso-plan no-print ${tono}`} role="status">
      {icono}
      <span>{texto}</span>
      <Link to="/organizador/perfil" className="aviso-plan-link">
        Ver mi plan
      </Link>
    </div>
  );
}
