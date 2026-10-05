import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff, ScanLine } from 'lucide-react';

interface Props {
  /** Se llama una vez por cada lectura; el escáner se detiene hasta que `activo` vuelva a true. */
  onResult: (texto: string) => void;
  activo: boolean;
}

export default function QRScanner({ onResult, activo }: Props) {
  const elId = 'qr-' + useId().replace(/:/g, '');
  const cb = useRef(onResult);
  cb.current = onResult;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) return;
    setError(null);
    const scanner = new Html5Qrcode(elId, false);
    let leido = false;

    const inicio = scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (w, h) => {
            const s = Math.floor(Math.min(w, h) * 0.72);
            return { width: s, height: s };
          },
        },
        (texto) => {
          if (leido) return;
          leido = true;
          navigator.vibrate?.(60);
          cb.current(texto);
        },
        () => {},
      )
      .then(() => true)
      .catch((e: unknown) => {
        const msg = String(e);
        setError(
          !window.isSecureContext
            ? 'La cámara solo funciona con HTTPS o en localhost.'
            : /NotAllowed|Permission/i.test(msg)
              ? 'Permiso de cámara denegado. Actívalo en el navegador.'
              : 'No se encontró una cámara disponible.',
        );
        return false;
      });

    return () => {
      inicio.then(async (iniciado) => {
        try {
          if (iniciado && scanner.isScanning) await scanner.stop();
          scanner.clear();
        } catch {
          /* ya detenido */
        }
      });
    };
  }, [activo, elId]);

  return (
    <div className="scanner">
      <div id={elId} className="scanner-video" />
      {activo && !error && (
        <div className="scanner-overlay" aria-hidden>
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          <span className="scan-line" />
        </div>
      )}
      {(error || !activo) && (
        <div className="scanner-placeholder">
          {error ? <CameraOff size={36} /> : <ScanLine size={36} />}
          <p>{error ?? 'Escáner en pausa'}</p>
          {error && <small>Puedes ingresar el código manualmente.</small>}
        </div>
      )}
    </div>
  );
}
