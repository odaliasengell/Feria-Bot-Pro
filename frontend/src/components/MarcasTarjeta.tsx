/**
 * Logos de las marcas de tarjeta (marcas de aceptación), dibujados en SVG para no depender de imágenes externas.
 * Cada logo va en una «tarjetita» blanca de 38×24 con borde, como en los formularios de pago.
 */

export type Marca = 'visa' | 'mastercard' | 'diners' | 'discover';

/** Marca a partir del texto que devuelve PayPhone («Visa», «MasterCard», «Diners Club»…) o del número de tarjeta. */
export function marcaDeTexto(texto: string): Marca | null {
  const t = texto.toLowerCase();
  if (t.includes('visa')) return 'visa';
  if (t.includes('master')) return 'mastercard';
  if (t.includes('diners')) return 'diners';
  if (t.includes('discover')) return 'discover';
  return null;
}

export function marcaDeNumero(numero: string): Marca | null {
  const n = numero.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  if (/^3(0[0-5]|[68])/.test(n)) return 'diners';
  if (/^6(011|5)/.test(n)) return 'discover';
  return null;
}

export const NOMBRE_MARCA: Record<Marca, string> = { visa: 'Visa', mastercard: 'MasterCard', diners: 'Diners Club', discover: 'Discover' };

function Visa() {
  return (
    <svg viewBox="0 0 38 24" aria-hidden>
      <text x="19" y="16.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="11.5" fontWeight="900" fontStyle="italic" fill="#1A1F71" letterSpacing="0.3">
        VISA
      </text>
      <rect x="6" y="18.5" width="26" height="1.6" fill="#F7B600" />
    </svg>
  );
}

function Mastercard() {
  return (
    <svg viewBox="0 0 38 24" aria-hidden>
      <circle cx="15" cy="12" r="7" fill="#EB001B" />
      <circle cx="23" cy="12" r="7" fill="#F79E1B" />
      <path d="M19 6.25a7 7 0 0 1 0 11.5a7 7 0 0 1 0-11.5Z" fill="#FF5F00" />
    </svg>
  );
}

function Diners() {
  return (
    <svg viewBox="0 0 38 24" aria-hidden>
      <circle cx="19" cy="12" r="8" fill="#0079BE" />
      <circle cx="19" cy="12" r="5.6" fill="#fff" />
      <path d="M17.6 7.4v9.2a4.8 4.8 0 0 1 0-9.2Zm2.8 0a4.8 4.8 0 0 1 0 9.2Z" fill="#0079BE" />
    </svg>
  );
}

function Discover() {
  return (
    <svg viewBox="0 0 38 24" aria-hidden>
      <text x="16" y="14.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="6.4" fontWeight="800" fill="#231F20" letterSpacing="0.1">
        DISC
      </text>
      <circle cx="26.5" cy="12.3" r="3.2" fill="#F48120" />
      <text x="33" y="14.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="6.4" fontWeight="800" fill="#231F20">
        R
      </text>
    </svg>
  );
}

const LOGOS: Record<Marca, () => JSX.Element> = { visa: Visa, mastercard: Mastercard, diners: Diners, discover: Discover };

/** Logo de una marca dentro de su tarjetita. */
export function LogoTarjeta({ marca, grande }: { marca: Marca; grande?: boolean }) {
  const Logo = LOGOS[marca];
  return (
    <span className={`logo-tarjeta ${grande ? 'is-grande' : ''}`} title={NOMBRE_MARCA[marca]} role="img" aria-label={NOMBRE_MARCA[marca]}>
      <Logo />
    </span>
  );
}

/** Fila con las marcas aceptadas. */
export function MarcasAceptadas() {
  return (
    <span className="marcas-aceptadas" aria-label="Aceptamos Visa, MasterCard, Diners Club y Discover">
      {(['visa', 'mastercard', 'diners', 'discover'] as Marca[]).map((m) => (
        <LogoTarjeta key={m} marca={m} />
      ))}
    </span>
  );
}
