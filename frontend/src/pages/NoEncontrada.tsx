import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Compass, UserPlus } from 'lucide-react';
import { usePagina } from '../lib/seo';

/** Página 404: la ruta no existe. */
export default function NoEncontrada() {
  const { pathname } = useLocation();
  usePagina({ titulo: 'Página no encontrada', noIndex: true });

  return (
    <div className="landing">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link to="/" className="brand">
            <img src="/logo-64.png" alt="" width={32} height={32} />
            <span>
              FeriaBot <b>Pro</b>
            </span>
          </Link>
        </div>
      </nav>
      <main className="no-encontrada">
        <span className="no-encontrada-codigo" aria-hidden="true">
          404
        </span>
        <span className="no-encontrada-icono" aria-hidden="true">
          <Compass size={30} />
        </span>
        <h1>Esta página no existe</h1>
        <p className="muted">
          No encontramos <code className="code">{pathname}</code>. Puede que el enlace esté mal escrito o que la página se haya
          movido.
        </p>
        <div className="no-encontrada-acciones">
          <Link to="/ferias" className="btn btn-accent btn-lg">
            <CalendarDays size={18} /> Ver ferias
          </Link>
          <Link to="/" className="btn btn-outline btn-lg">
            <ArrowLeft size={18} /> Ir al inicio
          </Link>
        </div>
        <p className="muted small">
          ¿Vas a una feria? <Link to="/registro">
            <UserPlus size={13} style={{ verticalAlign: -2 }} /> Regístrate y recibe tu tarjeta QR
          </Link>
        </p>
      </main>
    </div>
  );
}
