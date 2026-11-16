import type { Feria } from '../../types';
import { PageHeader } from '../../components/ui';
import LeadsTabla from '../../components/LeadsTabla';
import DistribucionCalificaciones from '../../components/DistribucionCalificaciones';
import { ConFeria } from '../../components/FeriaSelector';

export default function OrgLeads() {
  // key: al cambiar de feria se limpian la búsqueda y los filtros.
  return <ConFeria>{(feria) => <LeadsFeria key={feria.id} feria={feria} />}</ConFeria>;
}

function LeadsFeria({ feria }: { feria: Feria }) {
  return (
    <>
      <PageHeader title="Leads de la feria" subtitle={`Contactos que las empresas de «${feria.nombre}» registraron al escanear el QR de los visitantes.`} />
      <LeadsTabla
        alcance={{ feriaId: feria.id }}
        mostrarEmpresa
        archivo={`leads-${feria.nombre}`}
        encabezado={(d) => (
          <div className="card card-slim">
            <DistribucionCalificaciones conteo={d.porCalificacion} />
          </div>
        )}
      />
    </>
  );
}
