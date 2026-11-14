import type { EstadoCuenta, PlanId } from '../types';
import type { Tone } from './utils';

export const ESTADO_CUENTA: Record<EstadoCuenta, { label: string; tone: Tone; detalle: string }> = {
  activa: { label: 'Activa', tone: 'teal', detalle: 'Puede crear ferias, empresas e inscripciones.' },
  por_vencer: { label: 'Por vencer', tone: 'orange', detalle: 'El plan vence en 15 días o menos.' },
  vencida: { label: 'Vencida', tone: 'red', detalle: 'Ve sus datos, pero no crea ferias, empresas ni inscripciones.' },
  programada: { label: 'Programada', tone: 'blue', detalle: 'El plan todavía no empieza.' },
  suspendida: { label: 'Suspendida', tone: 'gray', detalle: 'No puede ingresar. Sus datos se conservan.' },
};

export const ORDEN_ESTADOS: EstadoCuenta[] = ['activa', 'por_vencer', 'vencida', 'programada', 'suspendida'];

export const PLAN_TONO: Record<PlanId, Tone> = { basico: 'gray', profesional: 'blue', premium: 'navy' };

/** 10000 → «10.000». */
export function cifra(n: number): string {
  return n.toLocaleString('es-EC');
}

/** Tono de una barra de uso: verde, naranja desde el 80 % y rojo al llegar al límite. */
export function tonoUso(usado: number, limite: number): Tone {
  if (limite <= 0) return 'gray';
  const r = usado / limite;
  return r >= 1 ? 'red' : r >= 0.8 ? 'orange' : 'teal';
}

/** «Vence en 12 días», «Venció hace 3 días», «Vence hoy». */
export function textoVencimiento(dias: number | null | undefined): string {
  if (dias == null) return 'Sin fecha de fin';
  if (dias === 0) return 'Vence hoy';
  if (dias > 0) return `Vence en ${cifra(dias)} ${dias === 1 ? 'día' : 'días'}`;
  return `Venció hace ${cifra(-dias)} ${dias === -1 ? 'día' : 'días'}`;
}

/** Días desde hoy hasta la fecha ISO (negativo si ya pasó). */
export function diasHasta(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const hoy = new Date();
  const a = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((Date.UTC(y!, m! - 1, d!) - a) / 86_400_000);
}

/** 49 → «$49», 39.9 → «$39,90». */
export function dinero(n: number): string {
  return n.toLocaleString('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}
