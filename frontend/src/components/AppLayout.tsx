import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ContactRound,
  IdCard,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';
import { FeriaSelector } from './FeriaSelector';

const NAV: Record<Role, { to: string; label: string; icon: LucideIcon; end?: boolean }[]> = {
  organizador: [
    { to: '/organizador', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/organizador/ferias', label: 'Ferias', icon: CalendarDays },
    { to: '/organizador/empresas', label: 'Empresas', icon: Building2 },
    { to: '/organizador/visitantes', label: 'Visitantes', icon: Users },
    { to: '/organizador/leads', label: 'Leads', icon: BarChart3 },
  ],
  empresa: [
    { to: '/empresa', label: 'Mis leads', icon: ContactRound, end: true },
    { to: '/empresa/escanear', label: 'Escanear', icon: ScanLine },
    { to: '/empresa/ficha', label: 'Mi ficha', icon: Store },
  ],
  visitante: [
    { to: '/visitante', label: 'Mi tarjeta', icon: IdCard, end: true },
    { to: '/visitante/escanear', label: 'Escanear stand', icon: ScanLine },
  ],
};

const ROL_LABEL: Record<Role, string> = {
  organizador: 'Organizador',
  empresa: 'Empresa participante',
  visitante: 'Visitante',
};

export default function AppLayout({ role }: { role: Role }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const salir = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="app" data-role={role}>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <img src="/favicon.png" alt="" width={34} height={34} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </NavLink>
        <div className="role-pill">{ROL_LABEL[role]}</div>
        <nav className="side-nav">
          {NAV[role].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="side-link">
              <Icon size={19} />
              {label}
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
          <img src="/favicon.png" alt="" width={30} height={30} />
          <span>
            FeriaBot <b>Pro</b>
          </span>
        </NavLink>
        <button className="icon-btn" onClick={salir} aria-label="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </header>

      <main className="main">
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
    </div>
  );
}
