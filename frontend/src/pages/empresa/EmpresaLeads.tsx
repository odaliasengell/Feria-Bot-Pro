import { Link } from 'react-router-dom';
import { CalendarCheck, ContactRound, Eye, Mail, ScanLine, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { leadsApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { Loader, PageHeader, StatCard } from '../../components/ui';
import LeadsTabla from '../../components/LeadsTabla';

export default function EmpresaLeads() {
  const { session } = useAuth();
  const empresaId = session?.refId ?? '';
  const { data, cargando } = useAsync(() => Promise.all([leadsApi.listar({ empresaId }), vistasApi.listar({ empresaId })]), [empresaId]);

  if (cargando && !data) return <Loader />;
  const [leads, vistas] = data ?? [[], []];
  const cuenta = (c: string) => leads.filter((l) => l.calificacion === c).length;

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
      <div className="stats-grid">
        <StatCard label="Leads totales" value={leads.length} icon={<ContactRound />} tone="navy" />
        <StatCard label="Interesados" value={cuenta('interesado')} icon={<Sparkles />} tone="teal" />
        <StatCard label="Visitas por agendar" value={cuenta('visita')} icon={<CalendarCheck />} tone="blue" />
        <StatCard label="Correos por enviar" value={cuenta('correo')} icon={<Mail />} tone="orange" hint={`${vistas.length} ${vistas.length === 1 ? 'visitante vio' : 'visitantes vieron'} tu ficha`} />
      </div>
      <LeadsTabla leads={leads} archivo={`leads-${session?.nombre ?? 'empresa'}.csv`} />
      {vistas.length > 0 && (
        <p className="muted small vistas-note">
          <Eye size={14} /> {vistas.length} {vistas.length === 1 ? 'visitante abrió' : 'visitantes abrieron'} tu ficha digital desde el QR del stand.
        </p>
      )}
    </>
  );
}
