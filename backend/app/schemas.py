"""Esquemas de entrada/salida. Se exponen en camelCase para coincidir con frontend/src/types.ts."""

from datetime import datetime
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator
from pydantic.alias_generators import to_camel

Role = Literal["organizador", "visitante", "empresa"]
Calificacion = Literal["interesado", "visita", "correo", "no_interesado"]
PropositoVisitante = Literal["registro", "ingreso"]
PropositoCodigo = Literal["registro", "ingreso", "recuperar_empresa", "recuperar_organizador"]

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


class TokenOut(CamelModel):
    token: str
    session: Sesion


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
    email: str
    creado_en: Fecha


# ---------- Visitantes ----------


class VisitanteCrear(CamelModel):
    nombre: str = Field(min_length=1, max_length=150)
    telefono: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=150)
    empresa: str = Field(default="", max_length=150)
    ciudad: str = Field(default="", max_length=100)
    # Obligatorio en el registro público con correo (lo envía POST /auth/enviar-codigo).
    codigo_verificacion: str | None = Field(default=None, max_length=10)

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


class VisitanteOut(CamelModel):
    id: str
    codigo: str
    nombre: str
    telefono: str
    email: str
    empresa: str
    ciudad: str
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
