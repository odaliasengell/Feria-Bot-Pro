import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  Building2,
  ShieldCheck,
  Inbox,
  Tags,
  ScrollText,
  CalendarDays,
  ContactRound,
  IdCard,
  LayoutDashboard,
  LogOut,
  ScanLine,
  DoorOpen,
  UserCog,
  UserRound,
  UsersRound,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../types';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Modal } from './ui';
import { usePagina } from '../lib/seo';
import { FeriaSelector } from './FeriaSelector';
import { adminApi } from '../services/api';
import AvisoPlan from './AvisoPlan';

const NAV: Record<Role, { to: string; label: string; icon: LucideIcon; end?: boolean }[]> = {
  organizador: [
    { to: '/organizador', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/organizador/ferias', label: 'Ferias', icon: CalendarDays },
    { to: '/organizador/empresas', label: 'Empresas', icon: Building2 },
    { to: '/organizador/visitantes', label: 'Visitantes', icon: Users },
    { to: '/organizador/acceso', label: 'Acceso', icon: DoorOpen },
    { to: '/organizador/leads', label: 'Leads', icon: BarChart3 },
    { to: '/organizador/perfil', label: 'Perfil', icon: UserRound },
  ],
  empresa: [
    { to: '/empresa', label: 'Mis leads', icon: ContactRound, end: true },
    { to: '/empresa/escanear', label: 'Escanear', icon: ScanLine },
    { to: '/empresa/ficha', label: 'Mi ficha', icon: Store },
    { to: '/empresa/equipo', label: 'Mi equipo', icon: UsersRound },
    { to: '/empresa/perfil', label: 'Perfil', icon: UserRound },
  ],
  superadmin: [
    { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/admin/solicitudes', label: 'Solicitudes', icon: Inbox },
    { to: '/admin/organizadores', label: 'Organizadores', icon: Briefcase },
    { to: '/admin/ferias', label: 'Ferias', icon: CalendarDays },
    { to: '/admin/visitantes', label: 'Visitantes', icon: Users },
    { to: '/admin/planes', label: 'Planes', icon: Tags },
    { to: '/admin/usuarios', label: 'Equipo', icon: ShieldCheck },
    { to: '/admin/registros', label: 'Registros', icon: ScrollText },
    { to: '/admin/perfil', label: 'Perfil', icon: UserRound },
  ],
  visitante: [
    { to: '/visitante', label: 'Mi tarjeta', icon: IdCard, end: true },
    { to: '/visitante/ferias', label: 'Ferias', icon: CalendarDays },
    { to: '/visitante/escanear', label: 'Escanear stand', icon: ScanLine },
    { to: '/visitante/cuenta', label: 'Mi cuenta', icon: UserCog },
  ],
};

const ROL_LABEL: Record<Role, string> = {
  organizador: 'Organizador',
  empresa: 'Empresa participante',
  visitante: 'Visitante',
  superadmin: 'Super Administrador',
};

export default function AppLayout({ role }: { role: Role }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  // Paneles privados: fuera de los buscadores.
  usePagina({ titulo: ROL_LABEL[role], noIndex: true });
  const toast = useToast();
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const { pathname } = useLocation();
  /** Super Administrador: solicitudes por revisar (se actualiza al cambiar de página). */
  const [pendientes, setPendientes] = useState(0);
  useEffect(() => {
    if (role !== 'superadmin') return;
    adminApi.solicitudesPendientes().then(setPendientes).catch(() => {});
  }, [role, pathname]);
  /** Los botones de cerrar sesión primero piden confirmación. */
  const salir = () => setConfirmarSalida(true);
  const cerrarSesion = () => {
    setConfirmarSalida(false);
    logout();
    navigate('/');
    toast.info('Cerraste sesión.');
  };

  return (
    <div className="app" data-role={role}>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <img src="/logo-64.png" alt="" width={34} height={34} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </NavLink>
        <div className="role-pill">{ROL_LABEL[role]}</div>
        <nav className="side-nav">
          {NAV[role]
            // Los vendedores no administran el equipo de la empresa.
            .filter((item) => !(item.to === '/empresa/equipo' && session?.usuarioId))
            .map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="side-link">
              <Icon size={19} />
              {label}
              {to === '/admin/solicitudes' && pendientes > 0 && (
                <span className="nav-contador" aria-label={`${pendientes} pendientes`}>
                  {pendientes}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="side-user">
          <Avatar nombre={session?.nombre ?? '?'} size={36} />
          <div className="side-user-info">
            <strong>{session?.nombre}</strong>
            <span>{ROL_LABEL[role]}</span>
          </div>
          <button className="icon-btn" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/logo-64.png" alt="" width={30} height={30} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </NavLink>
        <button className="icon-btn" onClick={salir} aria-label="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </header>

      <main className="main">
        {role === 'organizador' && <AvisoPlan />}
        {role === 'organizador' && <FeriaSelector />}
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {NAV[role].map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="bottom-link">
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <Modal open={confirmarSalida} onClose={() => setConfirmarSalida(false)} title="¿Cerrar sesión?">
        <div className="stack">
          <p className="muted">
            Saldrás de tu cuenta{session?.nombre ? ` (${session.nombre})` : ''} en este dispositivo. Para volver a entrar
            {role === 'visitante' ? ' necesitarás el código de tu tarjeta o tu correo.' : ' necesitarás tu correo y contraseña.'}
          </p>
          <div className="row-gap">
            <button type="button" className="btn btn-primary" onClick={cerrarSesion}>
              <LogOut size={16} /> Sí, cerrar sesión
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmarSalida(false)} autoFocus>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
