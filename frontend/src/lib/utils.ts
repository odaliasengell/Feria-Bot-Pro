import type { Calificacion } from '../types';

export const CALIFICACIONES: Record<Calificacion, { label: string; desc: string; tone: Tone }> = {
  interesado: { label: 'Interesado', desc: 'Quiere saber más', tone: 'teal' },
  visita: { label: 'Agendar visita', desc: 'Coordinar una reunión', tone: 'blue' },
  correo: { label: 'Enviar correo', desc: 'Mandar información', tone: 'orange' },
  no_interesado: { label: 'No interesado', desc: 'Solo de paso', tone: 'gray' },
};

export const CALIFICACION_ORDEN: Calificacion[] = ['interesado', 'visita', 'correo', 'no_interesado'];

export type Tone = 'teal' | 'blue' | 'orange' | 'gray' | 'navy';

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generarCodigo(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return `FB-${s}`;
}

/* ---------- Contenido de los códigos QR ---------- */

const PREFIJO_VISITANTE = 'FERIABOT:V:';

export function qrVisitante(codigo: string): string {
  return PREFIJO_VISITANTE + codigo;
}

/** Devuelve el código del visitante leído en un QR (o tecleado a mano). */
export function leerQrVisitante(texto: string): string | null {
  const t = texto.trim().toUpperCase();
  if (t.startsWith(PREFIJO_VISITANTE)) return t.slice(PREFIJO_VISITANTE.length);
  if (/^FB-[A-Z0-9]{4,}$/.test(t)) return t;
  if (/^[A-Z0-9]{6}$/.test(t)) return `FB-${t}`;
  return null;
}

/** El QR del stand es una URL normal: cualquier cámara del celular la abre. */
export function qrStand(empresaId: string): string {
  return `${window.location.origin}/ficha/${empresaId}`;
}

export function leerQrStand(texto: string): string | null {
  const m = texto.trim().match(/\/ficha\/([\w-]+)/);
  return m ? m[1] : null;
}

/* ---------- Formato ---------- */

export function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function haceCuanto(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return fecha(iso);
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const PALETA = ['#0550ae', '#116329', '#6639ba', '#475269', '#0a0e1c', '#0b6e75'];
export function colorDe(texto: string): string {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length]!;
}

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* ---------- Archivos ---------- */

export function descargarCSV(nombreArchivo: string, filas: (string | number)[][]): void {
  const csv = filas
    .map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/** Reduce una imagen a `max` px de lado para no llenar el almacenamiento. */
export function redimensionarImagen(file: File, max = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no válido'));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const png = file.type === 'image/png' || file.type === 'image/svg+xml';
        resolve(canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
