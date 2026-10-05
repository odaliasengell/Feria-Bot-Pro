import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Eye, Mail, PartyPopper, Phone, ScanLine, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { leadsApi, visitantesApi, vistasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { haceCuanto } from '../../lib/utils';
import { Alert, Avatar, Card, EmptyState, Loader } from '../../components/ui';
import { TarjetaVisitante } from '../../components/Credenciales';

export default function VisitanteTarjeta() {
  const { session } = useAuth();
  const id = session?.refId ?? '';
  const [params] = useSearchParams();
  const { data, cargando } = useAsync(
    () => Promise.all([visitantesApi.obtener(id), leadsApi.listar({ visitanteId: id }), vistasApi.listar({ visitanteId: id })]),
    [id],
  );

  if (cargando && !data) return <Loader />;
  const [visitante, leads, vistas] = data ?? [null, [], []];
  if (!visitante) return <Alert>No encontramos tu registro. Vuelve a ingresar.</Alert>;

  return (
    <>
      <div className="visitor-hero">
        <div>
          <span className="eyebrow dark">Hola,</span>
          <h1>{visitante.nombre.split(' ')[0]} 👋</h1>
          <p className="muted">Presenta tu QR en los stands y escanea el QR de cada stand para conocer a las empresas.</p>
        </div>
        <Link to="/visitante/escanear" className="btn btn-teal">
          <ScanLine size={17} /> Escanear stand
        </Link>
      </div>

      {params.get('nuevo') && (
        <Alert tone="teal">
          <PartyPopper size={18} /> ¡Listo! Esta es tu tarjeta. Guárdala en tu celular o imprímela.
        </Alert>
      )}

      <div className="visitor-layout">
        <TarjetaVisitante visitante={visitante} />

        <div className="stack">
          <Card title="Empresas que registraron tu visita" action={<span className="count-pill">{leads.length}</span>}>
            {leads.length === 0 ? (
              <EmptyState icon={<Store />} title="Aún nadie escaneó tu QR">
                Cuando una empresa escanee tu tarjeta aparecerá aquí con sus datos de contacto.
              </EmptyState>
            ) : (
              <ul className="company-list">
                {leads.map((l) =>
                  l.empresa ? (
                    <li key={l.id}>
                      <Avatar nombre={l.empresa.nombre} src={l.empresa.logo} size={44} square />
                      <div className="grow">
                        <strong>{l.empresa.nombre}</strong>
                        <span className="muted small">
                          Stand {l.empresa.stand} · {haceCuanto(l.creadoEn)}
                        </span>
                        <div className="cell-contact inline">
                          <a href={`mailto:${l.empresa.email}`}>
                            <Mail size={13} /> {l.empresa.email}
                          </a>
                          <a href={`tel:${l.empresa.telefono}`}>
                            <Phone size={13} /> {l.empresa.telefono}
                          </a>
                        </div>
                      </div>
                      <Link to={`/ficha/${l.empresa.id}`} className="icon-btn" aria-label="Ver ficha">
                        <ChevronRight size={18} />
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Card>

          <Card title="Fichas que visitaste" action={<span className="count-pill">{vistas.length}</span>}>
            {vistas.length === 0 ? (
              <EmptyState icon={<Eye />} title="Todavía no escaneaste stands">
                <Link to="/visitante/escanear" className="btn btn-outline btn-sm">Escanear un stand</Link>
              </EmptyState>
            ) : (
              <ul className="company-list">
                {vistas.map((v) =>
                  v.empresa ? (
                    <li key={v.id}>
                      <Avatar nombre={v.empresa.nombre} src={v.empresa.logo} size={40} square />
                      <div className="grow">
                        <strong>{v.empresa.nombre}</strong>
                        <span className="muted small">
                          {v.empresa.rubro} · {haceCuanto(v.creadoEn)}
                        </span>
                      </div>
                      <Link to={`/ficha/${v.empresa.id}`} className="icon-btn" aria-label="Ver ficha">
                        <ChevronRight size={18} />
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
