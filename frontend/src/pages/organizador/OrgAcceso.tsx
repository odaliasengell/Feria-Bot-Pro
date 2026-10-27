import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Keyboard, RotateCcw, ShieldAlert } from 'lucide-react';
import type { AsistenciaRespuesta, Feria } from '../../types';
import { feriasApi } from '../../services/api';
import { fechaHora, leerQrVisitante } from '../../lib/utils';
import { Avatar, PageHeader } from '../../components/ui';
import QRScanner from '../../components/QRScanner';
import { ConFeria } from '../../components/FeriaSelector';

/** Segundos que se muestra el resultado antes de volver a escanear al siguiente visitante. */
const SIGUIENTE_EN = 4;

type Estado =
  | { paso: 'escaneando' }
  | { paso: 'registrando' }
  | { paso: 'ok'; r: AsistenciaRespuesta }
  | { paso: 'error'; mensaje: string };

export default function OrgAcceso() {
  return <ConFeria>{(feria) => <AccesoFeria key={feria.id} feria={feria} />}</ConFeria>;
}

/** Control de acceso en la puerta: escanea la tarjeta del visitante y registra su entrada a la feria. */
function AccesoFeria({ feria }: { feria: Feria }) {
  const [estado, setEstado] = useState<Estado>({ paso: 'escaneando' });
  const [manual, setManual] = useState('');
  const [recientes, setRecientes] = useState<AsistenciaRespuesta[]>([]);
  const manualRef = useRef<HTMLInputElement>(null);

  // Tras mostrar el resultado se vuelve a escanear solo, para que la fila avance sin tocar la pantalla.
  useEffect(() => {
    if (estado.paso !== 'ok') return;
    const t = setTimeout(() => setEstado({ paso: 'escaneando' }), SIGUIENTE_EN * 1000);
    return () => clearTimeout(t);
  }, [estado]);

  async function registrar(texto: string) {
    const codigo = leerQrVisitante(texto) ?? texto.trim();
    if (!codigo) return;
    setEstado({ paso: 'registrando' });
    try {
      const r = await feriasApi.registrarAsistencia(feria.id, codigo);
      setRecientes((prev) => [r, ...prev.filter((x) => x.visitante.id !== r.visitante.id)].slice(0, 8));
      setManual('');
      setEstado({ paso: 'ok', r });
    } catch (err) {
      setEstado({ paso: 'error', mensaje: err instanceof Error ? err.message : 'No se pudo registrar la entrada' });
    }
  }

  function enviarManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim()) registrar(manual);
  }

  function siguiente() {
    setEstado({ paso: 'escaneando' });
    manualRef.current?.focus();
  }

  return (
    <>
      <PageHeader title="Acceso" subtitle={`Registra la entrada de los visitantes a «${feria.nombre}» escaneando su tarjeta.`} />

      <div className={`scan-layout ${estado.paso !== 'escaneando' ? 'is-result' : ''}`}>
        <div className="scan-col">
          <QRScanner activo={estado.paso === 'escaneando'} onResult={registrar} />
          <form className="manual" onSubmit={enviarManual}>
            <Keyboard size={18} className="muted" />
            <input
              ref={manualRef}
              className="input"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="O escribe el código: FB-XXXXXX"
              aria-label="Código de la tarjeta"
            />
            <button className="btn btn-primary" disabled={!manual.trim() || estado.paso === 'registrando'}>
              Registrar
            </button>
          </form>
        </div>

        <div className="scan-col">
          {estado.paso === 'escaneando' && (
            <div className="card scan-hint">
              <h3>Listo para escanear</h3>
              <p className="muted small">Apunta la cámara al QR de la tarjeta o escribe el código. Solo entran visitantes inscritos en esta feria.</p>
            </div>
          )}

          {estado.paso === 'registrando' && <div className="card center muted">Registrando entrada…</div>}

          {estado.paso === 'ok' && (
            <div className="card acceso-ok" role="status">
              <CheckCircle2 size={44} />
              <h2>{estado.r.yaRegistrada ? 'Ya había entrado' : 'Entrada registrada'}</h2>
              <div className="acceso-persona">
                <Avatar nombre={estado.r.visitante.nombre} size={44} />
                <div>
                  <strong>{estado.r.visitante.nombre}</strong>
                  <span>
                    <code className="code">{estado.r.visitante.codigo}</code>
                    {estado.r.visitante.empresa && ` · ${estado.r.visitante.empresa}`}
                  </span>
                </div>
              </div>
              <p className="small">
                {estado.r.yaRegistrada ? 'Primera entrada: ' : 'Hora de entrada: '}
                {fechaHora(estado.r.asistioEn)}
              </p>
              <button type="button" className="btn btn-primary" onClick={siguiente}>
                <RotateCcw size={16} /> Siguiente visitante
              </button>
            </div>
          )}

          {estado.paso === 'error' && (
            <div className="card acceso-error" role="alert">
              <ShieldAlert size={40} />
              <h2>No se registró la entrada</h2>
              <p>{estado.mensaje}</p>
              <button type="button" className="btn btn-primary" onClick={siguiente}>
                <RotateCcw size={16} /> Escanear de nuevo
              </button>
            </div>
          )}

          {recientes.length > 0 && (
            <div className="card">
              <h3 className="acceso-rec-title">Últimas entradas</h3>
              <ul className="acceso-rec">
                {recientes.map((r) => (
                  <li key={r.visitante.id}>
                    <span className="grow">{r.visitante.nombre}</span>
                    <span className="muted small">{fechaHora(r.asistioEn)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
