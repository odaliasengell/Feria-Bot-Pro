export type Role = 'organizador' | 'visitante' | 'empresa';

/** Feria creada por el organizador. Empresas, visitantes inscritos y leads pertenecen a una feria. */
/** Calculado por el backend según las fechas: antes del inicio, entre inicio y fin, o después del fin. */
export type EstadoFeria = 'proxima' | 'en_curso' | 'finalizada';

export interface Feria {
  id: string;
  nombre: string;
  descripcion: string;
  lugar: string;
  /** Imagen de portada (data URL o URL https); null = se muestra la portada de respaldo. */
  portada: string | null;
  /** Texto alternativo de la portada. */
  portadaAlt: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  /** Interruptor manual del organizador. */
  inscripcionesAbiertas: boolean;
  /** Acepta inscripciones: interruptor encendido y la feria no terminó. */
  abierta: boolean;
  estado: EstadoFeria;
  /** Máximo de inscritos; null = sin límite. */
  aforo: number | null;
  /** Llegó al aforo: no acepta más inscripciones de visitantes (el organizador sí puede inscribir). */
  llena: boolean;
  totalEmpresas: number;
  totalVisitantes: number;
  creadoEn: string;
}

/** Empresa vista en la página pública de la feria (sin datos de contacto). */
export interface EmpresaPublica {
  id: string;
  nombre: string;
  rubro: string;
  stand: string;
  logo?: string | null;
}

/** GET /ferias/:id/publica: la feria más sus empresas participantes. */
export interface FeriaPublica extends Feria {
  empresas: EmpresaPublica[];
}

/** Un visitante (una sola cuenta) inscrito a una feria. */
export interface Inscripcion {
  id: string;
  feriaId: string;
  visitanteId: string;
  creadoEn: string;
  /** Hora en que entró a la feria (control de acceso); null si aún no asiste. */
  asistioEn?: string | null;
  feria?: Feria;
}

/** POST /ferias/:id/asistencia */
export interface AsistenciaRespuesta {
  visitante: Visitante;
  asistioEn: string;
  /** true si ya había entrado: `asistioEn` es la hora de esa primera entrada. */
  yaRegistrada: boolean;
}

export interface Empresa {
  id: string;
  feriaId: string;
  nombre: string;
  /** RUC de Ecuador (13 dígitos). null en empresas creadas antes de pedirlo. */
  ruc?: string | null;
  rubro: string;
  descripcion: string;
  servicios: string[];
  contactoNombre: string;
  email: string;
  telefono: string;
  sitioWeb?: string;
  stand: string;
  logo?: string; // data URL o URL
  fotos: string[]; // 2–3 fotos
  creadoEn: string;
}

export interface Visitante {
  id: string;
  codigo: string; // código impreso en la tarjeta QR
  nombre: string;
  telefono: string;
  email: string;
  empresa: string;
  ciudad: string;
  creadoEn: string;
}

export type Calificacion = 'interesado' | 'visita' | 'correo' | 'no_interesado';

/** Contacto que una empresa registra al escanear el QR de un visitante. */
/** Seguimiento comercial del lead después de la feria. */
export type EstadoLead = 'nuevo' | 'contactado' | 'cotizado' | 'cerrado';

export interface Lead {
  id: string;
  empresaId: string;
  visitanteId: string;
  calificacion: Calificacion;
  estado: EstadoLead;
  nota: string;
  /** Quién escaneó al visitante: el vendedor, o la empresa / la organización si fue su cuenta principal. */
  registradoPor?: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Empresa dentro de un lead o una vista: sin fotos, descripción ni servicios. */
export type EmpresaBreve = Pick<Empresa, 'id' | 'feriaId' | 'nombre' | 'rubro' | 'stand' | 'email' | 'telefono' | 'logo'>;

export interface LeadDetalle extends Lead {
  visitante?: Visitante;
  empresa?: EmpresaBreve;
}

/** Respuesta paginada del servidor. */
export interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** GET /visitantes/pagina: inscritos de una feria con su entrada y cuántas empresas los registraron. */
export interface VisitanteFila extends Visitante {
  asistioEn?: string | null;
  leads: number;
}

export interface PaginaVisitantes extends Pagina<VisitanteFila> {
  /** De toda la feria, sin la búsqueda. */
  totalFeria: number;
  asistieron: number;
}

/** GET /leads/pagina. Las cifras y `empresas` son del alcance completo, sin los filtros. */
export interface PaginaLeads extends Pagina<LeadDetalle> {
  totalSinFiltros: number;
  porCalificacion: Partial<Record<Calificacion, number>>;
  empresas: { id: string; nombre: string }[];
}

/** Registro de que un visitante abrió la ficha digital de una empresa (QR del stand). */
export interface VistaFicha {
  id: string;
  visitanteId: string;
  empresaId: string;
  creadoEn: string;
}

export interface VistaDetalle extends VistaFicha {
  empresa?: EmpresaBreve;
  visitante?: Visitante;
}

export interface Session {
  role: Role;
  refId?: string;
  nombre: string;
  /** Solo si entró un vendedor de la empresa (refId sigue siendo la empresa). */
  usuarioId?: string | null;
  usuarioNombre?: string | null;
}

/** POST /empresas/importar: empresas creadas y filas del Excel que no se pudieron cargar. */
export interface ResultadoImportacion {
  creadas: number;
  errores: { fila: number; motivo: string }[];
}

/** Vendedor de una empresa: entra con su propio correo y contraseña. */
export interface UsuarioEmpresa {
  id: string;
  empresaId: string;
  nombre: string;
  email: string;
  creadoEn: string;
}

export interface AuthRespuesta {
  token: string;
  session: Session;
}

export type NuevaFeria = Pick<
  Feria,
  'nombre' | 'descripcion' | 'lugar' | 'portada' | 'portadaAlt' | 'fechaInicio' | 'fechaFin' | 'inscripcionesAbiertas' | 'aforo'
>;
export type NuevaEmpresa = Omit<Empresa, 'id' | 'creadoEn'>;
export type NuevoVisitante = Omit<Visitante, 'id' | 'codigo' | 'creadoEn'>;

/** Textos legales estáticos servidos por el backend (GET /legal/:slug). */
export type SlugLegal = 'privacidad' | 'tratamiento-datos' | 'aviso-legal' | 'cookies';

export interface DocumentoLegal {
  slug: SlugLegal;
  titulo: string;
  resumen: string;
  version: string;
  /** Fecha de actualización, YYYY-MM-DD. */
  actualizado: string;
  responsable: { nombre: string; ruc: string; direccion: string; email: string; telefono: string };
  secciones: { titulo: string; parrafos: string[]; lista: string[] }[];
}

/** GET /ferias/:id/estadisticas (días y horas en hora local del servidor). */
export interface EstadisticasFeria {
  totalInscritos: number;
  asistentes: number;
  /** Un punto por día, del primero al último con inscripciones (días sin inscripciones en 0). */
  inscritosPorDia: { fecha: string; total: number }[];
  /** Leads por hora del día (0–23), de la primera a la última hora con escaneos. */
  escaneosPorHora: { hora: number; total: number }[];
  rankingEmpresas: { empresaId: string; nombre: string; logo?: string | null; leads: number; vistas: number }[];
  /** Ordenadas de más a menos visitantes; «Sin ciudad» al final. */
  ciudades: { ciudad: string; total: number }[];
  totalEmpresas: number;
  totalLeads: number;
  totalVistas: number;
  leadsPorCalificacion: Partial<Record<Calificacion, number>>;
  /** Los 5 inscritos más recientes. */
  ultimosVisitantes: Visitante[];
}
