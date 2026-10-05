import { QRCodeSVG } from 'qrcode.react';
import { Building2, MapPin, Printer } from 'lucide-react';
import type { Empresa, Visitante } from '../types';
import { qrStand, qrVisitante } from '../lib/utils';
import { Avatar } from './ui';

/** Tarjeta de credencial del visitante con su QR personal. */
export function TarjetaVisitante({ visitante, imprimible = true }: { visitante: Visitante; imprimible?: boolean }) {
  return (
    <div className="credencial-wrap">
      <article className="credencial printable">
        <div className="credencial-top">
          <span className="brand-mini">FeriaBot Pro</span>
          <span className="credencial-tag">VISITANTE</span>
        </div>
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
        <button className="btn btn-outline no-print" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir tarjeta
        </button>
      )}
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
