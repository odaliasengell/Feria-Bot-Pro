/**
 * Capa de datos del frontend: llama al backend FastAPI en `VITE_API_URL`.
 *
 * Si `VITE_API_URL` está vacío se usa el mismo host desde el que se abrió la app, puerto 8000.
 * El token de sesión se envía como `Authorization: Bearer <token>`.
 */
import type {
  AsistenciaRespuesta,
  AuthRespuesta,
  Calificacion,
  DocumentoLegal,
  Empresa,
  EstadoFeria,
  EstadisticasFeria,
  Feria,
  FeriaPublica,
  Inscripcion,
  Lead,
  LeadDetalle,
  NuevaEmpresa,
  NuevaFeria,
  NuevoVisitante,
  Session,
  UsuarioEmpresa,
  SlugLegal,
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
  /** Organizador o empresa: cambia la contraseña confirmando la actual (204). */
  cambiarPassword: (passwordActual: string, passwordNueva: string) =>
    pedir<void>('POST', '/auth/cambiar-password', { passwordActual, passwordNueva }),
  /** Organizador o empresa: cambia el correo de ingreso confirmando la contraseña. Devuelve una sesión nueva para `login()`. */
  cambiarCorreo: (email: string, password: string) => pedir<AuthRespuesta>('POST', '/auth/cambiar-correo', { email, password }),
};

export const feriasApi = {
  /**
   * `activas`: solo las que aceptan inscripciones (las que ve el registro de visitantes).
   * `estado`: solo las próximas, en curso o finalizadas (página pública /ferias). Es público, no requiere sesión.
   */
  listar: (activas = false, estado?: EstadoFeria) =>
    pedir<Feria[]>('GET', '/ferias', undefined, { activas: activas ? 'true' : undefined, estado }),

  obtener: (id: string) => oNull(pedir<Feria>('GET', `/ferias/${encodeURIComponent(id)}`)),

  /** Público: la feria con sus empresas (logo, nombre, rubro y stand). `null` si no existe. */
  obtenerPublica: (id: string) => oNull(pedir<FeriaPublica>('GET', `/ferias/${encodeURIComponent(id)}/publica`)),

  crear: (data: NuevaFeria) => pedir<Feria>('POST', '/ferias', data),

  actualizar: (id: string, cambios: Partial<NuevaFeria>) => pedir<Feria>('PATCH', `/ferias/${encodeURIComponent(id)}`, cambios),

  /** Nueva edición: copia descripción, lugar y aforo con otro nombre y fechas (las empresas no se copian). */
  duplicar: (id: string, datos: { nombre: string; fechaInicio: string; fechaFin: string }) =>
    pedir<Feria>('POST', `/ferias/${encodeURIComponent(id)}/duplicar`, datos),

  /** Organizador: cifras de la feria para los gráficos del resumen. */
  estadisticas: (feriaId: string) => pedir<EstadisticasFeria>('GET', `/ferias/${encodeURIComponent(feriaId)}/estadisticas`),

  /** Control de acceso: registra la entrada del visitante (código de la tarjeta o contenido del QR). */
  registrarAsistencia: (feriaId: string, codigo: string) =>
    pedir<AsistenciaRespuesta>('POST', `/ferias/${encodeURIComponent(feriaId)}/asistencia`, { codigo }),

  /** Borra también sus empresas, leads e inscripciones. Las cuentas de visitante se conservan. */
  eliminar: (id: string) => pedir<void>('DELETE', `/ferias/${encodeURIComponent(id)}`),
};

export const inscripcionesApi = {
  /** El visitante recibe solo las suyas. */
  listar: (filtro: { visitanteId?: string; feriaId?: string } = {}) => pedir<Inscripcion[]>('GET', '/inscripciones', undefined, filtro),

  /** El visitante se inscribe a otra feria con su cuenta (el organizador indica `visitanteId`). */
  inscribir: (feriaId: string, visitanteId?: string) => pedir<Inscripcion>('POST', '/inscripciones', { feriaId, visitanteId }),

  /** Organizador: quita al visitante de la feria (y sus leads en ella). */
  quitar: (feriaId: string, visitanteId: string) =>
    pedir<void>('DELETE', `/inscripciones/${encodeURIComponent(feriaId)}/${encodeURIComponent(visitanteId)}`),
};

/** `password` asigna o cambia la contraseña con la que la empresa entra a su panel. */
type ConPassword<T> = T & { password?: string };

export const empresasApi = {
  listar: (feriaId?: string) => pedir<Empresa[]>('GET', '/empresas', undefined, { feriaId }),

  obtener: (id: string) => oNull(pedir<Empresa>('GET', `/empresas/${encodeURIComponent(id)}`)),

  crear: (data: ConPassword<NuevaEmpresa>) => pedir<Empresa>('POST', '/empresas', data),

  actualizar: (id: string, cambios: ConPassword<Partial<Omit<NuevaEmpresa, 'feriaId'>>>) =>
    pedir<Empresa>('PATCH', `/empresas/${encodeURIComponent(id)}`, cambios),

  eliminar: (id: string) => pedir<void>('DELETE', `/empresas/${encodeURIComponent(id)}`),

  /** Equipo de la empresa (solo la cuenta principal o el organizador). */
  usuarios: (empresaId: string) => pedir<UsuarioEmpresa[]>('GET', `/empresas/${encodeURIComponent(empresaId)}/usuarios`),

  agregarUsuario: (empresaId: string, datos: { nombre: string; email: string; password: string }) =>
    pedir<UsuarioEmpresa>('POST', `/empresas/${encodeURIComponent(empresaId)}/usuarios`, datos),

  /** Sus leads se conservan con su nombre en `registradoPor`. */
  quitarUsuario: (empresaId: string, usuarioId: string) =>
    pedir<void>('DELETE', `/empresas/${encodeURIComponent(empresaId)}/usuarios/${encodeURIComponent(usuarioId)}`),
};

export const visitantesApi = {
  /** Con `feriaId`, solo los inscritos en esa feria. */
  listar: (feriaId?: string) => pedir<Visitante[]>('GET', '/visitantes', undefined, { feriaId }),

  obtener: (id: string) => oNull(pedir<Visitante>('GET', `/visitantes/${encodeURIComponent(id)}`)),

  /** Busca por código de tarjeta o por correo. */
  buscar: (codigoOEmail: string) => oNull(pedir<Visitante>('GET', '/visitantes/buscar', undefined, { q: codigoOEmail.trim() })),

  /**
   * Crea la cuenta y la inscribe en `feriaId`. En el registro público con correo hace falta el código enviado con
   * `authApi.enviarCodigo`. Siempre envía `aceptaPolitica: true`: llámalo solo con la casilla de la política
   * de privacidad y tratamiento de datos marcada (el backend responde 400 sin ella). Si el organizador usa un correo que ya tiene cuenta, se inscribe esa cuenta.
   */
  crear: (feriaId: string, data: NuevoVisitante, codigoVerificacion?: string) =>
    pedir<Visitante>('POST', '/visitantes', { ...data, feriaId, aceptaPolitica: true, codigoVerificacion }),

  eliminar: (id: string) => pedir<void>('DELETE', `/visitantes/${encodeURIComponent(id)}`),
};

/** Datos que el visitante puede editar de su cuenta (el correo se cambia aparte, con código). */
export type CambiosMiCuenta = Partial<Pick<Visitante, 'nombre' | 'telefono' | 'empresa' | 'ciudad'>>;

/** «Mi cuenta» del visitante con sesión iniciada. */
export const miCuentaApi = {
  actualizar: (cambios: CambiosMiCuenta) => pedir<Visitante>('PATCH', '/visitantes/me', cambios),

  /** Paso 1 del cambio de correo: envía un código de 6 dígitos al correo nuevo. */
  enviarCodigoCorreo: (email: string) => pedir<void>('POST', '/visitantes/me/correo/enviar-codigo', { email }),

  /** Paso 2: confirma el correo nuevo con el código recibido. */
  cambiarCorreo: (email: string, codigo: string) => pedir<Visitante>('POST', '/visitantes/me/correo', { email, codigo }),

  /** Borra la cuenta con sus inscripciones, leads y vistas. */
  borrar: () => pedir<void>('DELETE', '/visitantes/me'),
};

export const leadsApi = {
  listar: (filtro: { empresaId?: string; visitanteId?: string; feriaId?: string } = {}) =>
    pedir<LeadDetalle[]>('GET', '/leads', undefined, filtro),

  obtener: (empresaId: string, visitanteId: string) =>
    oNull(pedir<Lead>('GET', `/leads/${encodeURIComponent(empresaId)}/${encodeURIComponent(visitanteId)}`)),

  /** Una empresa guarda (o actualiza) la calificación de un visitante escaneado. */
  guardar: (empresaId: string, visitanteId: string, calificacion: Calificacion, nota: string) =>
    pedir<LeadDetalle>('PUT', '/leads', { empresaId, visitanteId, calificacion, nota }),
};

export const vistasApi = {
  /** El visitante abrió la ficha de una empresa escaneando el QR del stand. */
  registrar: (visitanteId: string, empresaId: string) => pedir<VistaFicha>('POST', '/vistas', { visitanteId, empresaId }),

  listar: (filtro: { visitanteId?: string; empresaId?: string; feriaId?: string } = {}) =>
    pedir<VistaDetalle[]>('GET', '/vistas', undefined, filtro),
};

export const demoApi = {
  reiniciar: () => pedir<void>('POST', '/demo/reiniciar'),
};

export const politicaApi = {
  /** Versión vigente de la política de privacidad y tratamiento de datos. */
  version: () => pedir<{ version: string }>('GET', '/politica'),
};

export const legalApi = {
  /** Texto estático de la política de privacidad o del tratamiento de datos (LOPDP). */
  obtener: (slug: SlugLegal) => pedir<DocumentoLegal>('GET', `/legal/${slug}`),
};
