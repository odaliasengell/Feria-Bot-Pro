import type { EstadoFeria, Feria } from '../types';
import { hoyISO, type Tone } from './utils';

export const ESTADO_FERIA: Record<EstadoFeria, { label: string; tone: Tone }> = {
  en_curso: { label: 'En curso', tone: 'teal' },
  proxima: { label: 'Próxima', tone: 'blue' },
  finalizada: { label: 'Finalizada', tone: 'gray' },
};

const ORDEN: Record<EstadoFeria, number> = { en_curso: 0, proxima: 1, finalizada: 2 };

/** En curso primero, luego las próximas (la más cercana primero) y al final las finalizadas (la más reciente primero). */
export function ordenarFerias(a: Feria, b: Feria): number {
  if (a.estado !== b.estado) return ORDEN[a.estado] - ORDEN[b.estado];
  return a.estado === 'proxima' ? a.fechaInicio.localeCompare(b.fechaInicio) : b.fechaInicio.localeCompare(a.fechaInicio);
}

function dia(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** «Último día», «Hasta el 30 nov», «Empieza mañana», «Empieza en 5 días», «Terminó el 9 nov». */
export function cuandoFeria(f: Feria): string {
  const corto = (iso: string) => dia(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  if (f.estado === 'finalizada') return `Terminó el ${corto(f.fechaFin)}`;
  if (f.estado === 'en_curso') return f.fechaFin === hoyISO() ? 'Último día' : `Hasta el ${corto(f.fechaFin)}`;
  const dias = Math.round((dia(f.fechaInicio).getTime() - dia(hoyISO()).getTime()) / 86_400_000);
  return dias <= 1 ? 'Empieza mañana' : `Empieza en ${dias} días`;
}

export function mapsUrl(lugar: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;
}
