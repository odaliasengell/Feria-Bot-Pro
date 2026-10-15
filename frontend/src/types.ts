export type Role = 'organizador' | 'visitante' | 'empresa';

/** Feria creada por el organizador. Empresas, visitantes inscritos y leads pertenecen a una feria. */
/** Calculado por el backend según las fechas: antes del inicio, entre inicio y fin, o después del fin. */
export type EstadoFeria = 'proxima' | 'en_curso' | 'finalizada';

export interface Feria {
  id: string;
  nombre: string;
  descripcion: string;
  lugar: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  /** Interruptor manual del organizador. */
  inscripcionesAbiertas: boolean;
  /** Acepta inscripciones: interruptor encendido y la feria no terminó. */
  abierta: boolean;
  estado: EstadoFeria;
  totalEmpresas: number;
  totalVisitantes: number;
  creadoEn: string;
}

/** Un visitante (una sola cuenta) inscrito a una feria. */
export interface Inscripcion {
  id: string;
  feriaId: string;
  visitanteId: string;
  creadoEn: string;
  feria?: Feria;
}

export interface Empresa {
  id: string;
  feriaId: string;
  nombre: string;
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
export interface Lead {
  id: string;
  empresaId: string;
  visitanteId: string;
  calificacion: Calificacion;
  nota: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface LeadDetalle extends Lead {
  visitante?: Visitante;
  empresa?: Empresa;
}

/** Registro de que un visitante abrió la ficha digital de una empresa (QR del stand). */
export interface VistaFicha {
  id: string;
  visitanteId: string;
  empresaId: string;
  creadoEn: string;
}

export interface VistaDetalle extends VistaFicha {
  empresa?: Empresa;
  visitante?: Visitante;
}

export interface Session {
  role: Role;
  refId?: string;
  nombre: string;
}

export interface AuthRespuesta {
  token: string;
  session: Session;
}

export type NuevaFeria = Pick<Feria, 'nombre' | 'descripcion' | 'lugar' | 'fechaInicio' | 'fechaFin' | 'inscripcionesAbiertas'>;
export type NuevaEmpresa = Omit<Empresa, 'id' | 'creadoEn'>;
export type NuevoVisitante = Omit<Visitante, 'id' | 'codigo' | 'creadoEn'>;

/** Textos legales estáticos servidos por el backend (GET /legal/:slug). */
export type SlugLegal = 'privacidad' | 'tratamiento-datos';

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
