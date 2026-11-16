import type { Calificacion, EstadoLead } from '../types';

export const CALIFICACIONES: Record<Calificacion, { label: string; desc: string; tone: Tone }> = {
  interesado: { label: 'Interesado', desc: 'Quiere saber más', tone: 'teal' },
  visita: { label: 'Agendar visita', desc: 'Coordinar una reunión', tone: 'blue' },
  correo: { label: 'Enviar correo', desc: 'Mandar información', tone: 'orange' },
  no_interesado: { label: 'No interesado', desc: 'Solo de paso', tone: 'gray' },
};

export const CALIFICACION_ORDEN: Calificacion[] = ['interesado', 'visita', 'correo', 'no_interesado'];

export type Tone = 'teal' | 'blue' | 'orange' | 'gray' | 'navy' | 'red';

export const ESTADOS_LEAD: Record<EstadoLead, { label: string; tone: Tone }> = {
  nuevo: { label: 'Nuevo', tone: 'gray' },
  contactado: { label: 'Contactado', tone: 'blue' },
  cotizado: { label: 'Cotizado', tone: 'orange' },
  cerrado: { label: 'Cerrado', tone: 'teal' },
};

export const ESTADO_LEAD_ORDEN: EstadoLead[] = ['nuevo', 'contactado', 'cotizado', 'cerrado'];

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

/** "2026-11-06" como fecha local (sin desfase por zona horaria). */
function diaLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Rango de fechas de una feria: "6 – 8 nov 2026" o "6 nov 2026". */
export function rangoFechas(inicio: string, fin: string): string {
  const a = diaLocal(inicio);
  const b = diaLocal(fin);
  const largo: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  if (inicio === fin) return a.toLocaleDateString('es', largo);
  const mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const ini = a.toLocaleDateString('es', mismoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${ini} – ${b.toLocaleDateString('es', largo)}`;
}

/** Fecha de hoy como "YYYY-MM-DD" (para inputs de tipo date). */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

/** Reduce una imagen a `max` px de lado para no llenar el almacenamiento. */
/**
 * Portada de feria: recorta la imagen al centro en 16:9 y la deja en 1200×675 JPEG (unos 150–300 KB),
 * para que quepa holgada en la base de datos.
 */
export function portadaDesdeArchivo(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error('Usa una imagen JPG, PNG o WebP.'));
  if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error('La imagen supera 15 MB. Elige una más liviana.'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < 480 || img.height < 270) {
        reject(new Error('La imagen es muy pequeña: usa una de al menos 480×270 px.'));
        return;
      }
      const ancho = 1200;
      const alto = 675;
      // Recorte centrado con la proporción 16:9.
      const proporcion = ancho / alto;
      let sw = img.width;
      let sh = sw / proporcion;
      if (sh > img.height) {
        sh = img.height;
        sw = sh * proporcion;
      }
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      // Nunca se agranda: si el recorte mide menos de 1200 px de ancho, se conserva su tamaño.
      const destino = sw < ancho ? { w: Math.round(sw), h: Math.round(sh) } : { w: ancho, h: alto };
      const canvas = document.createElement('canvas');
      canvas.width = destino.w;
      canvas.height = destino.h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; // fondo para PNG con transparencia
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}

/** `jpeg`: fuerza JPEG (más liviano que PNG para capturas y fotos). */
export function redimensionarImagen(file: File, max = 900, jpeg = false): Promise<string> {
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
        const png = !jpeg && (file.type === 'image/png' || file.type === 'image/svg+xml');
        resolve(canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
