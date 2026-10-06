/**
 * Capa de datos del frontend: llama al backend FastAPI en `VITE_API_URL`.
 *
 * Si `VITE_API_URL` está vacío se usa el mismo host desde el que se abrió la app, puerto 8000.
 * El token de sesión se envía como `Authorization: Bearer <token>`.
 */
import type {
  AuthRespuesta,
  Calificacion,
  Empresa,
  Lead,
  LeadDetalle,
  NuevaEmpresa,
  NuevoVisitante,
  Session,
  Visitante,
  VistaDetalle,
  VistaFicha,
} from '../types';

const API_URL = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`).replace(/\/$/, '');

let token: string | null = null;
let alExpirar: (() => void) | null = null;

export function setToken(t: string | null): void {
  token = t;
}

/** Se llama cuando el backend rechaza el token (vencido o inválido). */
export function alExpirarSesion(fn: () => void): () => void {
  alExpirar = fn;
  return () => {
    if (alExpirar === fn) alExpirar = null;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Query = Record<string, string | undefined>;

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, query?: Query): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) params.set(k, v);
  const qs = params.toString();
  const url = API_URL + ruta + (qs ? `?${qs}` : '');

  const headers: Record<string, string> = {};
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisa que el backend esté encendido.', 0);
  }

  if (res.status === 204) return undefined as T;
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) alExpirar?.();
    const detalle = datos?.detail;
    throw new ApiError(typeof detalle === 'string' ? detalle : `Error ${res.status}`, res.status);
  }
  return datos as T;
}

/** Para los `obtener`/`buscar`: un 404 se devuelve como `null`, igual que antes. */
async function oNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/* ------------------------------------------------------------------ */

export const authApi = {
  organizador: (email: string, password: string) => pedir<AuthRespuesta>('POST', '/auth/organizador', { email, password }),
  empresa: (email: string, password: string) => pedir<AuthRespuesta>('POST', '/auth/empresa', { email, password }),
  /** Ingreso con el código de la tarjeta o el contenido del QR. */
  visitante: (codigo: string) => pedir<AuthRespuesta>('POST', '/auth/visitante', { codigo }),
  /** Envía un código de 6 dígitos al correo, para registrarse o para ingresar. */
  enviarCodigo: (email: string, proposito: 'registro' | 'ingreso') =>
    pedir<{ email: string; minutos: number }>('POST', '/auth/enviar-codigo', { email, proposito }),
  /** Ingreso del visitante con su correo y el código recibido. */
  visitanteCorreo: (email: string, codigo: string) => pedir<AuthRespuesta>('POST', '/auth/visitante/correo', { email, codigo }),
  /** Olvidé mi contraseña: envía un código al correo (responde igual aunque la cuenta no exista). */
  recuperarEnviarCodigo: (email: string, role: 'empresa' | 'organizador') =>
    pedir<{ email: string; minutos: number }>('POST', '/auth/recuperar/enviar-codigo', { email, role }),
  /** Cambia la contraseña con el código recibido y devuelve la sesión iniciada. */
  recuperarCambiar: (email: string, role: 'empresa' | 'organizador', codigo: string, password: string) =>
    pedir<AuthRespuesta>('POST', '/auth/recuperar/cambiar', { email, role, codigo, password }),
  yo: () => pedir<Session>('GET', '/auth/me'),
};

/** `password` asigna o cambia la contraseña con la que la empresa entra a su panel. */
type ConPassword<T> = T & { password?: string };

export const empresasApi = {
  listar: () => pedir<Empresa[]>('GET', '/empresas'),

  obtener: (id: string) => oNull(pedir<Empresa>('GET', `/empresas/${encodeURIComponent(id)}`)),

  crear: (data: ConPassword<NuevaEmpresa>) => pedir<Empresa>('POST', '/empresas', data),

  actualizar: (id: string, cambios: ConPassword<Partial<NuevaEmpresa>>) =>
    pedir<Empresa>('PATCH', `/empresas/${encodeURIComponent(id)}`, cambios),

  eliminar: (id: string) => pedir<void>('DELETE', `/empresas/${encodeURIComponent(id)}`),
};

export const visitantesApi = {
  listar: () => pedir<Visitante[]>('GET', '/visitantes'),

  obtener: (id: string) => oNull(pedir<Visitante>('GET', `/visitantes/${encodeURIComponent(id)}`)),

  /** Busca por código de tarjeta o por correo. */
  buscar: (codigoOEmail: string) => oNull(pedir<Visitante>('GET', '/visitantes/buscar', undefined, { q: codigoOEmail.trim() })),

  /** En el registro público con correo hace falta el código enviado con `authApi.enviarCodigo`. */
  crear: (data: NuevoVisitante, codigoVerificacion?: string) => pedir<Visitante>('POST', '/visitantes', { ...data, codigoVerificacion }),

  eliminar: (id: string) => pedir<void>('DELETE', `/visitantes/${encodeURIComponent(id)}`),
};

export const leadsApi = {
  listar: (filtro: { empresaId?: string; visitanteId?: string } = {}) => pedir<LeadDetalle[]>('GET', '/leads', undefined, filtro),

  obtener: (empresaId: string, visitanteId: string) =>
    oNull(pedir<Lead>('GET', `/leads/${encodeURIComponent(empresaId)}/${encodeURIComponent(visitanteId)}`)),

  /** Una empresa guarda (o actualiza) la calificación de un visitante escaneado. */
  guardar: (empresaId: string, visitanteId: string, calificacion: Calificacion, nota: string) =>
    pedir<LeadDetalle>('PUT', '/leads', { empresaId, visitanteId, calificacion, nota }),
};

export const vistasApi = {
  /** El visitante abrió la ficha de una empresa escaneando el QR del stand. */
  registrar: (visitanteId: string, empresaId: string) => pedir<VistaFicha>('POST', '/vistas', { visitanteId, empresaId }),

  listar: (filtro: { visitanteId?: string; empresaId?: string } = {}) => pedir<VistaDetalle[]>('GET', '/vistas', undefined, filtro),
};

export const demoApi = {
  reiniciar: () => pedir<void>('POST', '/demo/reiniciar'),
};
