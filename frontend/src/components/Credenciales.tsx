import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toPng } from 'html-to-image';
import { Building2, Download, MapPin, Printer } from 'lucide-react';
import type { Empresa, Feria, Visitante } from '../types';
import { qrStand, qrVisitante, rangoFechas } from '../lib/utils';
import { Avatar } from './ui';

/** Tarjeta de credencial del visitante con su QR personal para una feria. */
export function TarjetaVisitante({ visitante, feria, imprimible = true }: { visitante: Visitante; feria?: Feria; imprimible?: boolean }) {
  const tarjetaRef = useRef<HTMLElement>(null);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Guarda la tarjeta como PNG (al doble de resolución para que el QR se lea bien al imprimirlo). */
  async function descargar() {
    if (!tarjetaRef.current) return;
    setDescargando(true);
    setError(null);
    try {
      const dataUrl = await toPng(tarjetaRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `tarjeta-${visitante.codigo}.png`;
      a.click();
    } catch {
      setError('No se pudo generar la imagen. Intenta de nuevo o usa Imprimir.');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="credencial-wrap">
      <article ref={tarjetaRef} className="credencial printable">
        <div className="credencial-top">
          <span className="brand-mini">FeriaBot Pro</span>
          <span className="credencial-tag">VISITANTE</span>
        </div>
        {feria && (
          <div className="credencial-feria">
            <strong>{feria.nombre}</strong>
            <span>{rangoFechas(feria.fechaInicio, feria.fechaFin)}</span>
          </div>
        )}
        <div className="credencial-qr">
          <QRCodeSVG value={qrVisitante(visitante.codigo)} size={196} level="M" marginSize={0} fgColor="#13304a" />
        </div>
        <div className="credencial-code">{visitante.codigo}</div>
        <h3 className="credencial-nombre">{visitante.nombre}</h3>
        <div className="credencial-meta">
          {visitante.empresa && (
            <span>
              <Building2 size={14} /> {visitante.empresa}
            </span>
          )}
          {visitante.ciudad && (
            <span>
              <MapPin size={14} /> {visitante.ciudad}
            </span>
          )}
        </div>
        <p className="credencial-foot">Presenta este código en los stands</p>
      </article>
      {imprimible && (
        <div className="row-gap no-print credencial-acciones">
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> Imprimir tarjeta
          </button>
          <button type="button" className="btn btn-outline" onClick={descargar} disabled={descargando}>
            <Download size={16} /> {descargando ? 'Generando…' : 'Descargar'}
          </button>
        </div>
      )}
      {error && <p className="small no-print credencial-error">{error}</p>}
    </div>
  );
}

/** Cartel con el QR del stand que abre la ficha digital de la empresa. */
export function CartelStand({ empresa }: { empresa: Empresa }) {
  return (
    <div className="credencial-wrap">
      <article className="cartel printable">
        <div className="cartel-head">
          <Avatar nombre={empresa.nombre} src={empresa.logo} size={44} square />
          <div>
            <strong>{empresa.nombre}</strong>
            <span>Stand {empresa.stand}</span>
          </div>
        </div>
        <p className="cartel-cta">ESCANÉAME</p>
        <div className="credencial-qr">
          <QRCodeSVG value={qrStand(empresa.id)} size={196} level="M" marginSize={0} fgColor="#13304a" />
        </div>
        <p className="cartel-foot">Ficha digital · servicios, fotos y contacto</p>
      </article>
      <button className="btn btn-outline no-print" onClick={() => window.print()}>
        <Printer size={16} /> Imprimir cartel
      </button>
    </div>
  );
}
