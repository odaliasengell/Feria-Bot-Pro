/**
 * Analítica sin cookies (Umami o Plausible): no guarda datos personales, por eso no necesita consentimiento.
 * Se activa solo si están las variables en frontend/.env:
 *
 *   VITE_ANALITICA=umami        VITE_ANALITICA_ID=<website id de Umami>
 *   VITE_ANALITICA=plausible    VITE_ANALITICA_ID=<dominio registrado en Plausible, ej. feriabot.ec>
 *   VITE_ANALITICA_SRC=<opcional: URL del script si lo alojan ustedes>
 *
 * Ambos registran solos los cambios de página de la app (historial del navegador).
 */
export function iniciarAnalitica(): void {
  const servicio = import.meta.env.VITE_ANALITICA as string | undefined;
  const id = import.meta.env.VITE_ANALITICA_ID as string | undefined;
  if (!servicio || !id || import.meta.env.DEV) return;

  const s = document.createElement('script');
  s.defer = true;
  if (servicio === 'umami') {
    s.src = (import.meta.env.VITE_ANALITICA_SRC as string | undefined) || 'https://cloud.umami.is/script.js';
    s.dataset.websiteId = id;
    s.dataset.doNotTrack = 'true';
    // No se registran los parámetros de la URL (?feria=…, ?email=…): solo la página visitada.
    s.dataset.excludeSearch = 'true';
  } else if (servicio === 'plausible') {
    s.src = (import.meta.env.VITE_ANALITICA_SRC as string | undefined) || 'https://plausible.io/js/script.js';
    s.dataset.domain = id;
  } else {
    return;
  }
  document.head.appendChild(s);
}
