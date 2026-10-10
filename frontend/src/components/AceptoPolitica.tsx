import { Link } from 'react-router-dom';

/**
 * Casilla obligatoria de aceptación de la política de privacidad y el tratamiento de datos (LOPDP).
 * El backend rechaza el registro si `aceptaPolitica` no llega en true y guarda la fecha y versión aceptadas.
 * `porOrganizador`: el personal de la feria confirma que informó al visitante y que este aceptó.
 */
export default function AceptoPolitica({
  checked,
  onChange,
  porOrganizador = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  porOrganizador?: boolean;
}) {
  const enlaces = (
    <>
      <Link to="/privacidad" target="_blank" rel="noopener">
        Política de privacidad
      </Link>{' '}
      y el{' '}
      <Link to="/tratamiento-datos" target="_blank" rel="noopener">
        Tratamiento de datos personales
      </Link>
    </>
  );
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <span>
        {porOrganizador ? (
          <>El visitante fue informado y acepta la {enlaces}.</>
        ) : (
          <>
            He leído y acepto la {enlaces}, y autorizo que mis datos de contacto se compartan con las empresas que escaneen mi QR.
          </>
        )}
      </span>
    </label>
  );
}
