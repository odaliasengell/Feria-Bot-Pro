import { colorDe, iniciales } from '../lib/utils';

type Variante = 'tarjeta' | 'detalle' | 'mini';

/**
 * Portada de una feria (16:9). Si no tiene imagen se dibuja una de respaldo con los colores de la marca y las
 * iniciales del nombre, para que ninguna tarjeta quede vacía.
 */
export default function PortadaFeria({
  nombre,
  portada,
  portadaAlt,
  variante = 'tarjeta',
  className = '',
}: {
  nombre: string;
  portada?: string | null;
  portadaAlt?: string;
  variante?: Variante;
  className?: string;
}) {
  const clases = `portada portada-${variante} ${className}`;
  if (portada)
    return (
      <div className={clases}>
        <img src={portada} alt={portadaAlt?.trim() || `Portada de ${nombre}`} loading="lazy" decoding="async" />
      </div>
    );
  return (
    <div className={`${clases} portada-respaldo`} style={{ ['--portada-color' as string]: colorDe(nombre) }} aria-hidden="true">
      <span>{iniciales(nombre) || 'FB'}</span>
    </div>
  );
}
