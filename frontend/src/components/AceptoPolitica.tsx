import { Link } from 'react-router-dom';
import { politicaApi } from '../services/api';
import { useAsync } from '../lib/useAsync';

/**
 * Casilla obligatoria «Acepto la política de privacidad y tratamiento de datos» (LOPDP).
 * Muestra la versión vigente (GET /politica). El formulario no debe llamar a `visitantesApi.crear`
 * (que envía `aceptaPolitica: true`) mientras la casilla no esté marcada.
 * `porOrganizador`: el personal de la feria confirma que el visitante fue informado y aceptó.
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
  const { data } = useAsync(() => politicaApi.version(), []);

  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <span>
        {porOrganizador && 'El visitante indica: '}
        Acepto la{' '}
        <Link to="/privacidad" target="_blank" rel="noopener">
          política de privacidad
        </Link>{' '}
        y{' '}
        <Link to="/tratamiento-datos" target="_blank" rel="noopener">
          tratamiento de datos
        </Link>
        .
        {data?.version && <span className="check-version">Versión {data.version}</span>}
      </span>
    </label>
  );
}
