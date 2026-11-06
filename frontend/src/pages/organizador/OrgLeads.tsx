import type { Feria } from '../../types';
import { leadsApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { Loader, PageHeader } from '../../components/ui';
import LeadsTabla from '../../components/LeadsTabla';
import DistribucionCalificaciones from '../../components/DistribucionCalificaciones';
import { ConFeria } from '../../components/FeriaSelector';

export default function OrgLeads() {
  return <ConFeria>{(feria) => <LeadsFeria feria={feria} />}</ConFeria>;
}

function LeadsFeria({ feria }: { feria: Feria }) {
  const { data, cargando } = useAsync(() => leadsApi.listar({ feriaId: feria.id }), [feria.id]);
  return (
    <>
      <PageHeader title="Leads de la feria" subtitle={`Contactos que las empresas de «${feria.nombre}» registraron al escanear el QR de los visitantes.`} />
      {cargando && !data ? (
        <Loader />
      ) : (
        <>
          <div className="card card-slim">
            <DistribucionCalificaciones leads={data ?? []} />
          </div>
          <LeadsTabla leads={data ?? []} mostrarEmpresa archivo={`leads-${feria.nombre}.csv`} excel={{ feriaId: feria.id }} />
        </>
      )}
    </>
  );
}
