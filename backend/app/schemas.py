"""Esquemas de entrada/salida. Se exponen en camelCase para coincidir con frontend/src/types.ts."""

from datetime import date, datetime
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, PlainSerializer, field_validator, model_validator
from pydantic.alias_generators import to_camel

from .utils import error_ruc, normalizar_ruc

Role = Literal["organizador", "visitante", "empresa"]
Calificacion = Literal["interesado", "visita", "correo", "no_interesado"]
EstadoLead = Literal["nuevo", "contactado", "cotizado", "cerrado"]
PropositoVisitante = Literal["registro", "ingreso"]
PropositoCodigo = Literal["registro", "ingreso", "recuperar_empresa", "recuperar_organizador", "cambio_correo"]
EstadoFeria = Literal["proxima", "en_curso", "finalizada"]

# Las fechas se guardan en UTC y se devuelven como ISO 8601 con "Z", igual que Date.toISOString().
Fecha = Annotated[
    datetime,
    PlainSerializer(lambda d: d.replace(tzinfo=None).isoformat(timespec="milliseconds") + "Z", return_type=str),
]
Password = Annotated[str, Field(min_length=6, max_length=72)]


def _validar_ruc(v: object) -> str:
    ruc = normalizar_ruc(str(v or ""))
    motivo = error_ruc(ruc)
    if motivo:
        raise ValueError(motivo)
    return ruc


# RUC de Ecuador: se limpia (espacios, guiones) y se valida.
Ruc = Annotated[str, BeforeValidator(_validar_ruc)]

# ~1,5 MB en base64: una portada de 1200 px en JPEG pesa bastante menos.
MAX_PORTADA = 2_000_000


def _validar_portada(v: str | None) -> str | None:
    """Data URL de imagen (jpeg, png o webp) o una URL https; vacío = sin portada."""
    if v is None or not v.strip():
        return None
    v = v.strip()
    if len(v) > MAX_PORTADA:
        raise ValueError("La imagen de portada es demasiado grande (máximo 1,5 MB).")
    if v.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,", "https://")):
        return v
    raise ValueError("La portada debe ser una imagen JPG, PNG o WebP.")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- Sesión ----------


class Sesion(CamelModel):
    role: Role
    ref_id: str | None = None
    nombre: str
    # Solo cuando entra un vendedor de la empresa: ref_id sigue siendo la empresa y nombre, el de la empresa.
    usuario_id: str | None = None
    usuario_nombre: str | None = None


class LoginPassword(CamelModel):
    email: EmailStr
    password: str = Field(max_length=72)


class LoginVisitante(CamelModel):
    codigo: str = Field(min_length=1, max_length=150, description="Código de la tarjeta o contenido del QR")


class EnviarCodigo(CamelModel):
    email: EmailStr
    proposito: PropositoVisitante
    # Campo trampa (oculto en el formulario): una persona lo deja vacío; un bot suele llenarlo.
    empresa_web: str = Field(default="", max_length=200)


class EnviarCodigoOut(CamelModel):
    email: str
    minutos: int


class RecuperarEnviar(CamelModel):
    email: EmailStr
    role: Literal["empresa", "organizador"]


class RecuperarCambiar(RecuperarEnviar):
    codigo: str = Field(min_length=1, max_length=10)
    password: Password


class LoginVisitanteCorreo(CamelModel):
    email: EmailStr
    codigo: str = Field(min_length=1, max_length=10, description="Código de 6 dígitos recibido por correo")


class CambiarPassword(CamelModel):
    password_actual: str = Field(max_length=72)
    password_nueva: Password


class CambiarCorreo(CamelModel):
    email: EmailStr = Field(max_length=150)
    password: str = Field(max_length=72, description="Contraseña actual, para confirmar el cambio")


class TokenOut(CamelModel):
    token: str
    session: Sesion


# ---------- Ferias ----------


class FeriaBase(CamelModel):
    nombre: str = Field(min_length=1, max_length=150)
    descripcion: str = Field(default="", max_length=5000)
    lugar: str = Field(default="", max_length=255)
    portada: str | None = None
    portada_alt: str = Field(default="", max_length=200)
    fecha_inicio: date
    fecha_fin: date
    inscripciones_abiertas: bool = True
    # Máximo de inscritos; null = sin límite.
    aforo: int | None = Field(default=None, ge=1, le=1_000_000)

    @model_validator(mode="after")
    def _fechas(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self

    @field_validator("portada")
    @classmethod
    def _portada(cls, v: str | None) -> str | None:
        return _validar_portada(v)


class FeriaActualizar(CamelModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    descripcion: str | None = Field(default=None, max_length=5000)
    lugar: str | None = Field(default=None, max_length=255)
    # Enviar null (o "") quita la portada.
    portada: str | None = None
    portada_alt: str | None = Field(default=None, max_length=200)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    inscripciones_abiertas: bool | None = None
    # Enviar null quita el límite.
    aforo: int | None = Field(default=None, ge=1, le=1_000_000)

    @field_validator("portada")
    @classmethod
    def _portada(cls, v: str | None) -> str | None:
        return _validar_portada(v)


class FeriaDuplicar(CamelModel):
    nombre: str = Field(min_length=1, max_length=150)
    fecha_inicio: date
    fecha_fin: date

    @model_validator(mode="after")
    def _fechas(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self


class FeriaOut(FeriaBase):
    # Ya validada al guardarla; al leer no se vuelve a revisar.
    @field_validator("portada")
    @classmethod
    def _portada(cls, v: str | None) -> str | None:
        return v

    id: str
    # inscripciones_abiertas y la feria aún no termina
    abierta: bool
    estado: EstadoFeria
    recordatorio_enviado_en: Fecha | None = None
    total_empresas: int = 0
    total_visitantes: int = 0
    # Llegó al aforo: no se aceptan más inscripciones (salvo las del organizador).
    llena: bool = False
    creado_en: Fecha

    # Al leer de la base no se vuelve a validar el orden de las fechas.
    @model_validator(mode="after")
    def _fechas(self):
        return self


class EmpresaPublicaOut(CamelModel):
    """Empresa vista desde la página pública de la feria: sin correo ni teléfono."""

    id: str
    nombre: str
    rubro: str
    stand: str
    logo: str | None = None


class FeriaPublicaOut(FeriaOut):
    empresas: list[EmpresaPublicaOut] = []


class InscritosDia(CamelModel):
    fecha: date
    total: int


class EscaneosHora(CamelModel):
    hora: int = Field(ge=0, le=23)
    total: int


class EmpresaRanking(CamelModel):
    empresa_id: str
    nombre: str
    logo: str | None = None
    leads: int
    vistas: int


class CiudadTotal(CamelModel):
    ciudad: str
    total: int


class EstadisticasOut(CamelModel):
    total_inscritos: int
    asistentes: int
    inscritos_por_dia: list[InscritosDia]
    escaneos_por_hora: list[EscaneosHora]
    ranking_empresas: list[EmpresaRanking]
    ciudades: list[CiudadTotal]
    # Totales del resumen: así el panel no descarga las listas completas para contarlas.
    total_empresas: int = 0
    total_leads: int = 0
    total_vistas: int = 0
    leads_por_calificacion: dict[str, int] = {}
    ultimos_visitantes: list["VisitanteOut"] = []


class RecordatorioOut(CamelModel):
    enviados: int


class InscripcionCrear(CamelModel):
    feria_id: str
    # Solo el organizador lo indica; el visitante se inscribe a sí mismo.
    visitante_id: str | None = None


class InscripcionOut(CamelModel):
    id: str
    feria_id: str
    visitante_id: str
    creado_en: Fecha
    # Hora de entrada registrada en la puerta; null si aún no llegó.
    asistio_en: Fecha | None = None
    feria: FeriaOut | None = None


class AsistenciaRegistrar(CamelModel):
    codigo: str = Field(min_length=1, max_length=150, description="Código de la tarjeta (FB-XXXXXX) o contenido del QR")


# ---------- Empresas ----------


class EmpresaBase(CamelModel):
    nombre: str = Field(min_length=1, max_length=150)
    rubro: str = Field(default="", max_length=100)
    descripcion: str = ""
    servicios: list[str] = []
    contacto_nombre: str = Field(default="", max_length=150)
    email: EmailStr = Field(max_length=150)
    telefono: str = Field(default="", max_length=40)
    sitio_web: str | None = Field(default=None, max_length=255)
    stand: str = Field(default="", max_length=20)
    logo: str | None = None
    fotos: list[str] = Field(default=[], max_length=3)


class EmpresaCrear(EmpresaBase):
    feria_id: str
    ruc: Ruc
    password: Password | None = None


class EmpresaActualizar(CamelModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    # Solo el organizador lo cambia.
    ruc: Ruc | None = None
    rubro: str | None = Field(default=None, max_length=100)
    descripcion: str | None = None
    servicios: list[str] | None = None
    contacto_nombre: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = Field(default=None, max_length=150)
    telefono: str | None = Field(default=None, max_length=40)
    sitio_web: str | None = Field(default=None, max_length=255)
    stand: str | None = Field(default=None, max_length=20)
    logo: str | None = None
    fotos: list[str] | None = Field(default=None, max_length=3)
    password: Password | None = None


class EmpresaOut(EmpresaBase):
    id: str
    feria_id: str
    ruc: str | None = None
    email: str
    creado_en: Fecha


class UsuarioEmpresaCrear(CamelModel):
    nombre: str = Field(min_length=1, max_length=150)
    email: EmailStr = Field(max_length=150)
    password: Password


class UsuarioEmpresaOut(CamelModel):
    id: str
    empresa_id: str
    nombre: str
    email: str
    creado_en: Fecha


class ErrorImportacion(CamelModel):
    fila: int
    motivo: str


class ImportacionOut(CamelModel):
    creadas: int
    errores: list[ErrorImportacion]


# ---------- Visitantes ----------


class VisitanteCrear(CamelModel):
    # Feria a la que se inscribe al registrarse.
    feria_id: str
    # Campo trampa (oculto en el formulario): una persona lo deja vacío; un bot suele llenarlo.
    empresa_web: str = Field(default="", max_length=200)
    nombre: str = Field(min_length=1, max_length=150)
    telefono: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=150)
    empresa: str = Field(default="", max_length=150)
    ciudad: str = Field(default="", max_length=100)
    # Obligatorio en el registro público con correo (lo envía POST /auth/enviar-codigo).
    codigo_verificacion: str | None = Field(default=None, max_length=10)
    # Debe ser true: el visitante acepta la política de privacidad y tratamiento de datos.
    acepta_politica: bool = False

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if v:
            try:
                validate_email(v, check_deliverability=False)
            except EmailNotValidError:
                raise ValueError("Correo no válido")
        return v


class VisitanteActualizar(CamelModel):
    """Cambios que el visitante hace en sus propios datos (el correo se cambia aparte, con código)."""

    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    telefono: str | None = Field(default=None, max_length=40)
    empresa: str | None = Field(default=None, max_length=150)
    ciudad: str | None = Field(default=None, max_length=100)


class CambioCorreoEnviar(CamelModel):
    email: EmailStr


class CambioCorreo(CambioCorreoEnviar):
    codigo: str = Field(min_length=1, max_length=10, description="Código de 6 dígitos enviado al correo nuevo")


class VisitanteOut(CamelModel):
    id: str
    codigo: str
    nombre: str
    telefono: str
    email: str
    empresa: str
    ciudad: str
    politica_aceptada_en: Fecha | None = None
    politica_version: str | None = None
    creado_en: Fecha

    @field_validator("email", mode="before")
    @classmethod
    def _sin_email(cls, v: str | None) -> str:
        return v or ""


class VisitanteFila(VisitanteOut):
    """Fila del listado paginado de visitantes de una feria."""

    asistio_en: Fecha | None = None
    # Empresas de la feria que lo registraron (leads).
    leads: int = 0


class PaginaVisitantes(CamelModel):
    items: list[VisitanteFila]
    total: int
    pagina: int
    por_pagina: int
    # De toda la feria, sin el filtro de búsqueda.
    total_feria: int
    asistieron: int


class AsistenciaOut(CamelModel):
    visitante: VisitanteOut
    asistio_en: Fecha
    # true si ya había entrado antes: asistioEn es la hora de esa primera entrada.
    ya_registrada: bool


# ---------- Leads ----------


class LeadGuardar(CamelModel):
    empresa_id: str
    visitante_id: str
    calificacion: Calificacion
    nota: str = Field(default="", max_length=2000)


class LeadOut(CamelModel):
    id: str
    empresa_id: str
    visitante_id: str
    calificacion: Calificacion
    estado: EstadoLead = "nuevo"
    nota: str
    # Nombre de quien escaneó (null en los leads anteriores a esta función).
    registrado_por: str | None = None
    creado_en: Fecha
    actualizado_en: Fecha


class LeadEstado(CamelModel):
    estado: EstadoLead


class EmpresaBreveOut(CamelModel):
    """Empresa dentro de un lead o una vista: sin fotos, descripción ni servicios (pesan y no se usan ahí)."""

    id: str
    feria_id: str
    nombre: str
    rubro: str
    stand: str
    email: str
    telefono: str
    logo: str | None = None


class LeadDetalleOut(LeadOut):
    visitante: VisitanteOut | None = None
    empresa: EmpresaBreveOut | None = None


class EmpresaOpcion(CamelModel):
    id: str
    nombre: str


class PaginaLeads(CamelModel):
    items: list[LeadDetalleOut]
    total: int
    pagina: int
    por_pagina: int
    # Del alcance completo (feria o empresa), sin búsqueda ni filtros: para las tarjetas y la barra de interés.
    total_sin_filtros: int
    por_calificacion: dict[str, int]
    # Empresas con leads, para el filtro del organizador.
    empresas: list[EmpresaOpcion]


# ---------- Vistas de ficha ----------


class VistaRegistrar(CamelModel):
    visitante_id: str
    empresa_id: str


class VistaOut(CamelModel):
    id: str
    visitante_id: str
    empresa_id: str
    creado_en: Fecha


class VistaDetalleOut(VistaOut):
    empresa: EmpresaBreveOut | None = None
    visitante: VisitanteOut | None = None


# ---------- Textos legales (LOPDP) ----------


class SeccionLegal(CamelModel):
    titulo: str
    parrafos: list[str] = []
    lista: list[str] = []


class ResponsableLegal(CamelModel):
    nombre: str
    ruc: str
    direccion: str
    email: str
    telefono: str


class DocumentoLegal(CamelModel):
    slug: Literal["privacidad", "tratamiento-datos", "aviso-legal", "cookies"]
    titulo: str
    resumen: str
    version: str
    actualizado: date
    responsable: ResponsableLegal
    secciones: list[SeccionLegal]


EstadisticasOut.model_rebuild()
