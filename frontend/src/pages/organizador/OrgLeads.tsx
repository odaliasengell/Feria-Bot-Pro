import { leadsApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { Loader, PageHeader } from '../../components/ui';
import LeadsTabla from '../../components/LeadsTabla';
import DistribucionCalificaciones from '../../components/DistribucionCalificaciones';

export default function OrgLeads() {
  const { data, cargando } = useAsync(() => leadsApi.listar(), []);
  return (
    <>
      <PageHeader title="Leads de la feria" subtitle="Todos los contactos que las empresas registraron al escanear el QR de los visitantes." />
      {cargando && !data ? (
        <Loader />
      ) : (
        <>
          <div className="card card-slim">
            <DistribucionCalificaciones leads={data ?? []} />
          </div>
          <LeadsTabla leads={data ?? []} mostrarEmpresa archivo="leads-feria.csv" />
        </>
      )}
    </>
  );
}
