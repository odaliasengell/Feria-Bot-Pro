import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from './types';
import { useAuth } from './context/AuthContext';
import { FeriaProvider } from './context/FeriaContext';
import { Loader } from './components/ui';
import AvisoCookies from './components/AvisoCookies';
import AppLayout from './components/AppLayout';
import Landing from './pages/Landing';
const Ingresar = lazy(() => import('./pages/Ingresar'));
const RegistroVisitante = lazy(() => import('./pages/RegistroVisitante'));
const RecuperarPassword = lazy(() => import('./pages/RecuperarPassword'));
const FichaPublica = lazy(() => import('./pages/FichaPublica'));
const Legal = lazy(() => import('./pages/Legal'));
const NoEncontrada = lazy(() => import('./pages/NoEncontrada'));
const Perfil = lazy(() => import('./pages/Perfil'));
const Nosotros = lazy(() => import('./pages/Nosotros'));
const Ferias = lazy(() => import('./pages/Ferias'));
const FeriaDetalle = lazy(() => import('./pages/FeriaDetalle'));
const OrgFerias = lazy(() => import('./pages/organizador/OrgFerias'));
const OrgResumen = lazy(() => import('./pages/organizador/OrgResumen'));
const OrgEmpresas = lazy(() => import('./pages/organizador/OrgEmpresas'));
const OrgVisitantes = lazy(() => import('./pages/organizador/OrgVisitantes'));
const OrgLeads = lazy(() => import('./pages/organizador/OrgLeads'));
const OrgAcceso = lazy(() => import('./pages/organizador/OrgAcceso'));
const EmpresaLeads = lazy(() => import('./pages/empresa/EmpresaLeads'));
const EmpresaEscanear = lazy(() => import('./pages/empresa/EmpresaEscanear'));
const EmpresaFicha = lazy(() => import('./pages/empresa/EmpresaFicha'));
const EmpresaEquipo = lazy(() => import('./pages/empresa/EmpresaEquipo'));
const VisitanteTarjeta = lazy(() => import('./pages/visitante/VisitanteTarjeta'));
const VisitanteEscanear = lazy(() => import('./pages/visitante/VisitanteEscanear'));
const VisitanteCuenta = lazy(() => import('./pages/visitante/VisitanteCuenta'));
const VisitanteFerias = lazy(() => import('./pages/visitante/VisitanteFerias'));
const AdminResumen = lazy(() => import('./pages/admin/AdminResumen'));
const AdminOrganizadores = lazy(() => import('./pages/admin/AdminOrganizadores'));
const AdminUsuarios = lazy(() => import('./pages/admin/AdminUsuarios'));
const AdminPlanes = lazy(() => import('./pages/admin/AdminPlanes'));
const AdminSolicitudes = lazy(() => import('./pages/admin/AdminSolicitudes'));
const AdminFerias = lazy(() => import('./pages/admin/AdminFerias'));
const AdminVisitantes = lazy(() => import('./pages/admin/AdminVisitantes'));
const AdminRegistros = lazy(() => import('./pages/admin/AdminRegistros'));
const Contratar = lazy(() => import('./pages/Contratar'));
const ResultadoPago = lazy(() => import('./pages/ResultadoPago'));

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session } = useAuth();
  if (!session || session.role !== role) return <Navigate to={`/ingresar?rol=${role}`} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
    <Suspense fallback={<Loader />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/registro" element={<RegistroVisitante />} />
      <Route path="/registro/:feriaId" element={<RegistroVisitante />} />
      <Route path="/recuperar" element={<RecuperarPassword />} />
      <Route path="/ficha/:id" element={<FichaPublica />} />
      <Route path="/ferias" element={<Ferias />} />
      <Route path="/ferias/:id" element={<FeriaDetalle />} />
      <Route path="/nosotros" element={<Nosotros />} />
      <Route path="/contratar" element={<Contratar />} />
      <Route path="/contratar/resultado" element={<ResultadoPago />} />
      <Route path="/privacidad" element={<Legal slug="privacidad" />} />
      <Route path="/tratamiento-datos" element={<Legal slug="tratamiento-datos" />} />
      <Route path="/aviso-legal" element={<Legal slug="aviso-legal" />} />
      <Route path="/cookies" element={<Legal slug="cookies" />} />

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
        <Route path="acceso" element={<OrgAcceso />} />
        <Route path="leads" element={<OrgLeads />} />
        <Route path="perfil" element={<Perfil />} />
      </Route>

      <Route path="/empresa" element={<RequireRole role="empresa"><AppLayout role="empresa" /></RequireRole>}>
        <Route index element={<EmpresaLeads />} />
        <Route path="escanear" element={<EmpresaEscanear />} />
        <Route path="ficha" element={<EmpresaFicha />} />
        <Route path="equipo" element={<EmpresaEquipo />} />
        <Route path="perfil" element={<Perfil />} />
      </Route>

      <Route path="/admin" element={<RequireRole role="superadmin"><AppLayout role="superadmin" /></RequireRole>}>
        <Route index element={<AdminResumen />} />
        <Route path="organizadores" element={<AdminOrganizadores />} />
        <Route path="solicitudes" element={<AdminSolicitudes />} />
        <Route path="ferias" element={<AdminFerias />} />
        <Route path="visitantes" element={<AdminVisitantes />} />
        <Route path="registros" element={<AdminRegistros />} />
        <Route path="planes" element={<AdminPlanes />} />
        <Route path="usuarios" element={<AdminUsuarios />} />
        <Route path="perfil" element={<Perfil />} />
      </Route>

      <Route path="/visitante" element={<RequireRole role="visitante"><AppLayout role="visitante" /></RequireRole>}>
        <Route index element={<VisitanteTarjeta />} />
        <Route path="ferias" element={<VisitanteFerias />} />
        <Route path="escanear" element={<VisitanteEscanear />} />
        <Route path="cuenta" element={<VisitanteCuenta />} />
      </Route>

      <Route path="*" element={<NoEncontrada />} />
    </Routes>
    </Suspense>
    <AvisoCookies />
    </>
  );
}
