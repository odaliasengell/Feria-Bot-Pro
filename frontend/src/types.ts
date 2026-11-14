export type Role = 'organizador' | 'visitante' | 'empresa' | 'superadmin';

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
  /** Última aceptación de la política de privacidad y su versión. */
  politicaAceptadaEn?: string | null;
  politicaVersion?: string | null;
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

/* ---------- Planes y organizadores (Super Administrador) ---------- */

export type PlanId = 'basico' | 'profesional' | 'premium';
/** activa · por_vencer (15 días o menos) · vencida · programada (aún no empieza) · suspendida (no puede ingresar). */
export type EstadoCuenta = 'activa' | 'por_vencer' | 'vencida' | 'programada' | 'suspendida';

export interface Plan {
  id: PlanId;
  nombre: string;
  descripcion: string;
  /** USD. */
  precioMensual: number;
  precioAnual: number;
  /** Se muestra en la página principal. */
  publico: boolean;
  /** Ferias en curso o próximas a la vez (las finalizadas no cuentan). */
  ferias: number;
  empresasPorFeria: number;
  visitantesPorFeria: number;
}

/** GET /admin/planes */
export interface PlanAdmin extends Plan {
  /** Organizadores con este plan. */
  clientes: number;
  actualizadoEn?: string | null;
}

export type CambiosPlan = Partial<Pick<Plan, 'nombre' | 'descripcion' | 'precioMensual' | 'precioAnual' | 'ferias' | 'empresasPorFeria' | 'visitantesPorFeria' | 'publico'>>;

export interface FeriaUso {
  id: string;
  nombre: string;
  estado: EstadoFeria;
  fechaInicio: string;
  fechaFin: string;
  empresas: number;
  visitantes: number;
}

export interface UsoPlan {
  feriasActivas: number;
  feriasTotal: number;
  ferias: FeriaUso[];
}

export interface OrganizadorCuenta {
  id: string;
  nombre: string;
  ruc?: string | null;
  contactoNombre: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  sitioWeb?: string | null;
  email: string;
  plan: PlanId;
  planInicio?: string | null;
  planFin?: string | null;
  activo: boolean;
  estado: EstadoCuenta;
  creadoEn: string;
}

export interface OrganizadorAdmin extends OrganizadorCuenta {
  /** Notas internas del Super Administrador. */
  notas: string;
  uso: UsoPlan;
}

/** Datos para crear o editar un organizador (la contraseña es obligatoria solo al crear). */
export interface DatosOrganizador {
  nombre: string;
  ruc: string;
  contactoNombre: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  sitioWeb: string;
  notas: string;
  email: string;
  password?: string;
  plan: PlanId;
  planInicio: string;
  planFin: string;
  activo: boolean;
}

/** GET /mi-plan */
export interface MiPlan {
  organizador: OrganizadorCuenta;
  plan: Plan;
  uso: UsoPlan;
  puedeOperar: boolean;
  diasRestantes?: number | null;
}

export interface ResumenAdmin {
  organizadores: number;
  porEstado: Record<EstadoCuenta, number>;
  porPlan: Record<PlanId, number>;
  feriasActivas: number;
  empresas: number;
  inscripciones: number;
  /** Suma del precio mensual de las cuentas con el plan vigente. */
  ingresoMensual: number;
  solicitudesPendientes: number;
  /** Cuentas por vencer o vencidas (hasta 10). */
  porVencer: OrganizadorCuenta[];
}

export interface SuperAdminUsuario {
  id: string;
  nombre: string;
  email: string;
  creadoEn: string;
}

/* ---------- Contratar un plan ---------- */

export type Periodo = 'mensual' | 'anual';
/** Por ahora solo transferencia; «tarjeta» queda para la pasarela de pago. */
export type MetodoPago = 'transferencia' | 'tarjeta';
/** pago_pendiente: pago con tarjeta que el cliente no terminó. */
export type EstadoSolicitud = 'pendiente' | 'pago_pendiente' | 'aprobada' | 'rechazada';

/** Cuenta bancaria para transferir (la edita el Super Administrador). */
export interface DatosTransferencia {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  identificacion: string;
  correo: string;
  instrucciones: string;
}

export interface NuevaSolicitud {
  planId: PlanId;
  periodo: Periodo;
  metodoPago: MetodoPago;
  nombre: string;
  ruc: string;
  contactoNombre: string;
  email: string;
  telefono: string;
  ciudad: string;
  mensaje: string;
  referencia: string;
  /** data URL de la imagen o el PDF (solo transferencia). */
  comprobante?: string;
  aceptaPolitica: boolean;
  empresaWeb: string;
}

export interface SolicitudCreada {
  id: string;
  planNombre: string;
  periodo: Periodo;
  monto: number;
  email: string;
  /** Pago con tarjeta: opciones de la Cajita de Pagos de PayPhone (`new PPaymentButtonBox(cajita)`). */
  cajita?: Record<string, unknown> | null;
}

/** Formas de pago activas. */
export interface MetodosPago {
  transferencia: boolean;
  tarjeta: boolean;
  /** La tarjeta funciona en modo demostración (sin PayPhone real). */
  demo: boolean;
}

/** POST /pagos/payphone/confirmar */
export interface ResultadoPago {
  estado: EstadoSolicitud;
  planNombre: string;
  periodo: Periodo;
  monto: number;
  email: string;
  mensaje: string;
  tarjeta: string;
  autorizacion: string;
}

export interface SolicitudPlan {
  id: string;
  planId: PlanId;
  planNombre: string;
  periodo: Periodo;
  monto: number;
  metodoPago: MetodoPago;
  nombre: string;
  ruc: string;
  contactoNombre: string;
  email: string;
  telefono: string;
  ciudad: string;
  mensaje: string;
  referencia: string;
  tieneComprobante: boolean;
  /** Pago con tarjeta (PayPhone). */
  transaccionId: string;
  autorizacion: string;
  tarjeta: string;
  estado: EstadoSolicitud;
  motivoRechazo: string;
  revisadoPor?: string | null;
  revisadoEn?: string | null;
  organizadorId?: string | null;
  creadoEn: string;
}

/* ---------- Super Administrador: ferias, visitantes y registros ---------- */

export interface FeriaAdmin extends Feria {
  organizadorId: string;
  organizadorNombre: string;
}

export interface VisitanteAdminFila extends Visitante {
  /** En cuántas ferias está inscrito. */
  ferias: number;
}

export interface InscripcionAdmin {
  feriaId: string;
  feriaNombre: string;
  organizadorNombre: string;
  estado: EstadoFeria;
  fechaInicio: string;
  fechaFin: string;
  inscritoEn: string;
  asistioEn?: string | null;
  leads: number;
}

/** Constancia de una aceptación de la política de privacidad y tratamiento de datos. */
export interface Aceptacion {
  id: string;
  tipo: 'visitante' | 'solicitud_plan' | string;
  titularId: string;
  nombre: string;
  email: string;
  version: string;
  /** registro_publico · registro_organizador · contratacion · historico */
  origen: string;
  registradoPor: string;
  ip: string;
  userAgent: string;
  creadoEn: string;
}

export interface VisitanteAdminDetalle extends Visitante {
  inscripciones: InscripcionAdmin[];
  aceptaciones: Aceptacion[];
}

/** Acción del equipo de FeriaBot Pro (registro de actividad). */
export interface Actividad {
  id: string;
  actorRol: string;
  actorNombre: string;
  accion: string;
  descripcion: string;
  entidad: string;
  entidadId: string;
  ip: string;
  creadoEn: string;
}
