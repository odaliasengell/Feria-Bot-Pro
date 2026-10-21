"""Esquemas de entrada/salida. Se exponen en camelCase para coincidir con frontend/src/types.ts."""

from datetime import date, datetime
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator, model_validator
from pydantic.alias_generators import to_camel

Role = Literal["organizador", "visitante", "empresa"]
Calificacion = Literal["interesado", "visita", "correo", "no_interesado"]
PropositoVisitante = Literal["registro", "ingreso"]
PropositoCodigo = Literal["registro", "ingreso", "recuperar_empresa", "recuperar_organizador", "cambio_correo"]
EstadoFeria = Literal["proxima", "en_curso", "finalizada"]

# Las fechas se guardan en UTC y se devuelven como ISO 8601 con "Z", igual que Date.toISOString().
Fecha = Annotated[
    datetime,
    PlainSerializer(lambda d: d.replace(tzinfo=None).isoformat(timespec="milliseconds") + "Z", return_type=str),
]
Password = Annotated[str, Field(min_length=6, max_length=72)]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- Sesión ----------


class Sesion(CamelModel):
    role: Role
    ref_id: str | None = None
    nombre: str


class LoginPassword(CamelModel):
    email: EmailStr
    password: str = Field(max_length=72)


class LoginVisitante(CamelModel):
    codigo: str = Field(min_length=1, max_length=150, description="Código de la tarjeta o contenido del QR")


class EnviarCodigo(CamelModel):
    email: EmailStr
    proposito: PropositoVisitante


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
    fecha_inicio: date
    fecha_fin: date
    inscripciones_abiertas: bool = True

    @model_validator(mode="after")
    def _fechas(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self


class FeriaActualizar(CamelModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    descripcion: str | None = Field(default=None, max_length=5000)
    lugar: str | None = Field(default=None, max_length=255)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    inscripciones_abiertas: bool | None = None


class FeriaOut(FeriaBase):
    id: str
    # inscripciones_abiertas y la feria aún no termina
    abierta: bool
    estado: EstadoFeria
    recordatorio_enviado_en: Fecha | None = None
    total_empresas: int = 0
    total_visitantes: int = 0
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
    feria: FeriaOut | None = None


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
    password: Password | None = None


class EmpresaActualizar(CamelModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
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
    email: str
    creado_en: Fecha


# ---------- Visitantes ----------


class VisitanteCrear(CamelModel):
    # Feria a la que se inscribe al registrarse.
    feria_id: str
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
    nota: str
    creado_en: Fecha
    actualizado_en: Fecha


class LeadDetalleOut(LeadOut):
    visitante: VisitanteOut | None = None
    empresa: EmpresaOut | None = None


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
    empresa: EmpresaOut | None = None
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
    slug: Literal["privacidad", "tratamiento-datos"]
    titulo: str
    resumen: str
    version: str
    actualizado: date
    responsable: ResponsableLegal
    secciones: list[SeccionLegal]
