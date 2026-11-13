import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

const CLAVE = 'feriabot.avisoCookies';
const VERSION = '1';

function yaVisto(): boolean {
  try {
    return localStorage.getItem(CLAVE) === VERSION;
  } catch {
    return false;
  }
}

/**
 * Aviso informativo: la plataforma solo usa almacenamiento técnico (sesión, preferencias, tarjeta sin conexión) y
 * analítica sin cookies, así que no hace falta pedir consentimiento; basta con informar y enlazar la política.
 */
export default function AvisoCookies() {
  const [visible, setVisible] = useState(() => !yaVisto());
  if (!visible) return null;

  function cerrar() {
    try {
      localStorage.setItem(CLAVE, VERSION);
    } catch {
      /* sin almacenamiento: el aviso vuelve a aparecer la próxima vez */
    }
    setVisible(false);
  }

  return (
    <div className="aviso-cookies no-print" role="region" aria-label="Aviso de cookies">
      <Cookie size={20} className="aviso-cookies-icono" />
      <p>
        Solo guardamos en tu navegador lo necesario para que la plataforma funcione (tu sesión y preferencias) y medimos
        visitas de forma anónima, <b>sin cookies de seguimiento</b>. <Link to="/cookies">Más información</Link>
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={cerrar}>
        Entendido
      </button>
    </div>
  );
}
