/**
 * Reglas de validación de los formularios. Cada función devuelve el mensaje de error o `null` si el valor es válido.
 * Los mensajes se muestran debajo del campo (ver `Field` con `error` y el hook `useValidacion`).
 */

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_TELEFONO = /^\+?[\d\s().-]+$/;
const RE_CODIGO_TARJETA = /^(FERIABOT:V:)?(FB-)?[A-Z0-9]{6}$/i;

export function errorRequerido(v: string, campo: string): string | null {
  return v.trim() ? null : `${campo} es obligatorio.`;
}

export function errorNombre(v: string, { campo = 'El nombre', requerido = true, max = 150 } = {}): string | null {
  const t = v.trim();
  if (!t) return requerido ? `${campo} es obligatorio.` : null;
  if (t.length < 2) return `${campo} es muy corto.`;
  if (t.length > max) return `${campo} admite hasta ${max} caracteres.`;
  return null;
}

export function errorEmail(v: string, requerido = true): string | null {
  const t = v.trim();
  if (!t) return requerido ? 'El correo es obligatorio.' : null;
  if (t.length > 150) return 'El correo admite hasta 150 caracteres.';
  if (!RE_EMAIL.test(t)) return 'Escribe un correo válido, por ejemplo nombre@empresa.com.';
  return null;
}

/** Teléfono con 7 a 15 dígitos; acepta +, espacios, guiones y paréntesis. */
export function errorTelefono(v: string, requerido = true): string | null {
  const t = v.trim();
  if (!t) return requerido ? 'El teléfono es obligatorio.' : null;
  if (!RE_TELEFONO.test(t)) return 'Usa solo números, espacios, + o guiones.';
  const digitos = t.replace(/\D/g, '').length;
  if (digitos < 7) return 'El teléfono está incompleto (mínimo 7 dígitos).';
  if (digitos > 15) return 'El teléfono tiene demasiados dígitos.';
  return null;
}

export function errorUrl(v: string, requerido = false): string | null {
  const t = v.trim();
  if (!t) return requerido ? 'La dirección es obligatoria.' : null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    if (!u.hostname.includes('.')) throw new Error();
    return null;
  } catch {
    return 'Escribe la dirección completa, por ejemplo https://miempresa.com.';
  }
}

export function errorPassword(v: string, requerido = true): string | null {
  if (!v) return requerido ? 'La contraseña es obligatoria.' : null;
  if (v.length < MIN_PASSWORD) return `Mínimo ${MIN_PASSWORD} caracteres.`;
  if (new TextEncoder().encode(v).length > MAX_PASSWORD) return `Máximo ${MAX_PASSWORD} caracteres.`;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v) || !/\d/.test(v)) return 'Combina letras y números.';
  if (v.trim() !== v) return 'No empieces ni termines la contraseña con espacios.';
  return null;
}

export function errorConfirmacion(password: string, repetida: string): string | null {
  if (!repetida) return 'Repite la contraseña.';
  return password === repetida ? null : 'Las contraseñas no coinciden.';
}

export function errorCodigoTarjeta(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Escribe el código de tu tarjeta o tu correo.';
  if (t.includes('@')) return errorEmail(t);
  return RE_CODIGO_TARJETA.test(t.replace(/\s/g, '')) ? null : 'El código tiene el formato FB-XXXXXX (6 letras o números).';
}

/* ---------- Fuerza de la contraseña ---------- */

export interface FuerzaPassword {
  /** 0 = muy débil … 4 = fuerte */
  nivel: 0 | 1 | 2 | 3 | 4;
  etiqueta: string;
  requisitos: { texto: string; ok: boolean }[];
  consejo?: string;
}

const COMUNES = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', 'password', 'contrasena', 'contraseña', 'qwerty',
  'qwerty123', 'abc123', '111111', '000000', 'admin', 'admin123', 'empresa123', 'feriabot', 'iloveyou', 'ecuador',
]);

const ETIQUETAS = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'] as const;

export function fuerzaPassword(p: string): FuerzaPassword {
  const requisitos = [
    { texto: 'Al menos 8 caracteres', ok: p.length >= 8 },
    { texto: 'Mayúsculas y minúsculas', ok: /[a-zà-ÿñ]/.test(p) && /[A-ZÀ-ÝÑ]/.test(p) },
    { texto: 'Al menos un número', ok: /\d/.test(p) },
    { texto: 'Al menos un símbolo (!, #, $…)', ok: /[^A-Za-z0-9À-ÿñÑ]/.test(p) },
  ];
  let nivel = requisitos.filter((r) => r.ok).length + (p.length >= 12 ? 1 : 0);
  let consejo: string | undefined;
  if (p.length < MIN_PASSWORD) {
    nivel = 0;
  } else if (COMUNES.has(p.toLowerCase())) {
    nivel = Math.min(nivel, 1);
    consejo = 'Es una contraseña muy común: elige otra.';
  } else if (/^(.)\1+$/.test(p)) {
    nivel = Math.min(nivel, 1);
    consejo = 'Evita repetir el mismo carácter.';
  }
  const n = Math.max(0, Math.min(4, nivel)) as FuerzaPassword['nivel'];
  return { nivel: n, etiqueta: ETIQUETAS[n], requisitos, consejo };
}

/** Dígito verificador de la cédula ecuatoriana (módulo 10) a partir de sus 9 primeros dígitos. */
function digitoCedula(nueve: string): number {
  let total = 0;
  for (let i = 0; i < 9; i++) {
    const n = Number(nueve[i]) * (i % 2 === 0 ? 2 : 1);
    total += n > 9 ? n - 9 : n;
  }
  return (10 - (total % 10)) % 10;
}

/** Deja solo los dígitos del RUC (quita espacios y guiones). */
export function limpiarRuc(v: string): string {
  return v.replace(/\D/g, '');
}

/**
 * RUC de Ecuador: 13 dígitos, provincia 01-24 o 30, tercer dígito 0-6 o 9 y establecimiento distinto de 000.
 * En personas naturales (tercer dígito 0-5) también se revisa la cédula. Igual que el backend.
 */
export function errorRuc(v: string, requerido = true): string | null {
  const t = limpiarRuc(v);
  if (!t) return requerido ? 'El RUC es obligatorio.' : null;
  if (t.length !== 13) return `El RUC debe tener 13 dígitos (tiene ${t.length}).`;
  const provincia = Number(t.slice(0, 2));
  const tercero = Number(t[2]);
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) return 'Los dos primeros dígitos (provincia) no son válidos.';
  if (tercero === 7 || tercero === 8) return 'El tercer dígito del RUC no es válido.';
  if (t.slice(10) === '000') return 'Debe terminar en el número de establecimiento, por ejemplo 001.';
  if (tercero < 6 && digitoCedula(t.slice(0, 9)) !== Number(t[9])) return 'El RUC no es válido: revisa los 10 primeros dígitos (cédula).';
  return null;
}
