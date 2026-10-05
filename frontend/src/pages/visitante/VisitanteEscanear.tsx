import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import { empresasApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { leerQrStand, normalizar } from '../../lib/utils';
import { Alert, Avatar, Card, PageHeader } from '../../components/ui';
import QRScanner from '../../components/QRScanner';

export default function VisitanteEscanear() {
  const navigate = useNavigate();
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const { data: empresas } = useAsync(() => empresasApi.listar(), []);

  const filtradas = useMemo(() => {
    const nq = normalizar(q);
    return (empresas ?? []).filter((e) => !nq || normalizar([e.nombre, e.rubro, e.stand, ...e.servicios].join(' ')).includes(nq));
  }, [empresas, q]);

  function onResult(texto: string) {
    const id = leerQrStand(texto);
    if (id) {
      navigate(`/ficha/${id}`);
    } else {
      setActivo(false);
      setError('Este QR no es de un stand de la feria.');
    }
  }

  return (
    <>
      <PageHeader title="Escanear stand" subtitle="Escanea el QR del stand para abrir la ficha digital de la empresa." />
      <div className="scan-layout">
        <div className="scan-col">
          <QRScanner activo={activo} onResult={onResult} />
          {error && (
            <Alert>
              {error}{' '}
              <button
                className="link-btn"
                onClick={() => {
                  setError(null);
                  setActivo(true);
                }}
              >
                Volver a escanear
              </button>
            </Alert>
          )}
        </div>
        <Card title="Directorio de empresas" className="scan-col">
          <div className="search mb">
            <Search size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa, rubro o servicio" />
          </div>
          <ul className="company-list">
            {filtradas.map((e) => (
              <li key={e.id} className="clickable" onClick={() => navigate(`/ficha/${e.id}`)}>
                <Avatar nombre={e.nombre} src={e.logo} size={42} square />
                <div className="grow">
                  <strong>{e.nombre}</strong>
                  <span className="muted small">{e.rubro}</span>
                </div>
                <span className="stand-tag">
                  <MapPin size={12} /> {e.stand}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
