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
  DoorOpen,
  UserCog,
  UserRound,
  UsersRound,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../types';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Modal } from './ui';
import { usePagina } from '../lib/seo';
import { FeriaSelector } from './FeriaSelector';

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
  visitante: [
    { to: '/visitante', label: 'Mi tarjeta', icon: IdCard, end: true },
    { to: '/visitante/escanear', label: 'Escanear stand', icon: ScanLine },
    { to: '/visitante/cuenta', label: 'Mi cuenta', icon: UserCog },
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
  // Paneles privados: fuera de los buscadores.
  usePagina({ titulo: ROL_LABEL[role], noIndex: true });
  const toast = useToast();
  const [confirmarSalida, setConfirmarSalida] = useState(false);
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
