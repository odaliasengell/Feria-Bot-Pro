import { Link } from 'react-router-dom';
import { CalendarCheck, ContactRound, Eye, Mail, ScanLine, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { PageHeader, StatCard } from '../../components/ui';
import LeadsTabla from '../../components/LeadsTabla';

export default function EmpresaLeads() {
  const { session } = useAuth();
  const empresaId = session?.refId ?? '';
  const { data: vistas } = useAsync(() => vistasApi.listar({ empresaId }), [empresaId]);
  const nVistas = vistas?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Mis leads"
        subtitle="Contactos que registraste escaneando el QR de los visitantes en tu stand."
        actions={
          <Link to="/empresa/escanear" className="btn btn-accent">
            <ScanLine size={17} /> Escanear visitante
          </Link>
        }
      />
      <LeadsTabla
        alcance={{ empresaId }}
        archivo={`leads-${session?.nombre ?? 'empresa'}.csv`}
        excel={{ empresaId }}
        encabezado={(d) => (
          <div className="stats-grid">
            <StatCard label="Leads totales" value={d.totalSinFiltros} icon={<ContactRound />} tone="navy" />
            <StatCard label="Interesados" value={d.porCalificacion.interesado ?? 0} icon={<Sparkles />} tone="teal" />
            <StatCard label="Visitas por agendar" value={d.porCalificacion.visita ?? 0} icon={<CalendarCheck />} tone="blue" />
            <StatCard
              label="Correos por enviar"
              value={d.porCalificacion.correo ?? 0}
              icon={<Mail />}
              tone="orange"
              hint={`${nVistas} ${nVistas === 1 ? 'visitante vio' : 'visitantes vieron'} tu ficha`}
            />
          </div>
        )}
      />
      {nVistas > 0 && (
        <p className="muted small vistas-note">
          <Eye size={14} /> {nVistas} {nVistas === 1 ? 'visitante abrió' : 'visitantes abrieron'} tu ficha digital desde el QR del stand.
        </p>
      )}
    </>
  );
}
