import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from './types';
import { useAuth } from './context/AuthContext';
import { FeriaProvider } from './context/FeriaContext';
import AppLayout from './components/AppLayout';
import Landing from './pages/Landing';
import Ingresar from './pages/Ingresar';
import RegistroVisitante from './pages/RegistroVisitante';
import RecuperarPassword from './pages/RecuperarPassword';
import FichaPublica from './pages/FichaPublica';
import Legal from './pages/Legal';
import Nosotros from './pages/Nosotros';
import OrgFerias from './pages/organizador/OrgFerias';
import OrgResumen from './pages/organizador/OrgResumen';
import OrgEmpresas from './pages/organizador/OrgEmpresas';
import OrgVisitantes from './pages/organizador/OrgVisitantes';
import OrgLeads from './pages/organizador/OrgLeads';
import EmpresaLeads from './pages/empresa/EmpresaLeads';
import EmpresaEscanear from './pages/empresa/EmpresaEscanear';
import EmpresaFicha from './pages/empresa/EmpresaFicha';
import VisitanteTarjeta from './pages/visitante/VisitanteTarjeta';
import VisitanteEscanear from './pages/visitante/VisitanteEscanear';

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session } = useAuth();
  if (!session || session.role !== role) return <Navigate to={`/ingresar?rol=${role}`} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/registro" element={<RegistroVisitante />} />
      <Route path="/registro/:feriaId" element={<RegistroVisitante />} />
      <Route path="/recuperar" element={<RecuperarPassword />} />
      <Route path="/ficha/:id" element={<FichaPublica />} />
      <Route path="/nosotros" element={<Nosotros />} />
      <Route path="/privacidad" element={<Legal slug="privacidad" />} />
      <Route path="/tratamiento-datos" element={<Legal slug="tratamiento-datos" />} />

      <Route
        path="/organizador"
        element={
          <RequireRole role="organizador">
            <FeriaProvider>
              <AppLayout role="organizador" />
            </FeriaProvider>
          </RequireRole>
        }
      >
        <Route index element={<OrgResumen />} />
        <Route path="ferias" element={<OrgFerias />} />
        <Route path="empresas" element={<OrgEmpresas />} />
        <Route path="visitantes" element={<OrgVisitantes />} />
        <Route path="leads" element={<OrgLeads />} />
      </Route>

      <Route path="/empresa" element={<RequireRole role="empresa"><AppLayout role="empresa" /></RequireRole>}>
        <Route index element={<EmpresaLeads />} />
        <Route path="escanear" element={<EmpresaEscanear />} />
        <Route path="ficha" element={<EmpresaFicha />} />
      </Route>

      <Route path="/visitante" element={<RequireRole role="visitante"><AppLayout role="visitante" /></RequireRole>}>
        <Route index element={<VisitanteTarjeta />} />
        <Route path="escanear" element={<VisitanteEscanear />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
