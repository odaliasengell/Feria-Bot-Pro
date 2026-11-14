"""Esquemas de entrada/salida. Se exponen en camelCase para coincidir con frontend/src/types.ts."""

from datetime import date, datetime
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, PlainSerializer, field_validator, model_validator
from pydantic.alias_generators import to_camel

from .utils import error_ruc, normalizar_ruc

Role = Literal["organizador", "visitante", "empresa", "superadmin"]
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
    role: Literal["empresa", "organizador", "superadmin"]


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



# ---------- Planes y organizadores (Super Administrador) ----------

PlanId = Literal["basico", "profesional", "premium"]
EstadoCuenta = Literal["activa", "por_vencer", "vencida", "programada", "suspendida"]


class PlanOut(CamelModel):
    id: PlanId
    nombre: str
    descripcion: str = ""
    precio_mensual: float
    precio_anual: float
    ferias: int
    empresas_por_feria: int
    visitantes_por_feria: int
    publico: bool = True


class PlanAdminOut(PlanOut):
    # Organizadores con este plan.
    clientes: int = 0
    actualizado_en: Fecha | None = None


class PlanActualizar(CamelModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=60)
    descripcion: str | None = Field(default=None, max_length=300)
    precio_mensual: float | None = Field(default=None, ge=0, le=100000)
    precio_anual: float | None = Field(default=None, ge=0, le=1000000)
    ferias: int | None = Field(default=None, ge=1, le=1000)
    empresas_por_feria: int | None = Field(default=None, ge=1, le=100000)
    visitantes_por_feria: int | None = Field(default=None, ge=1, le=10000000)
    publico: bool | None = None


class OrganizadorFicha(CamelModel):
    """Datos del cliente que el Super Administrador llena."""

    nombre: str = Field(min_length=2, max_length=150)
    ruc: Ruc
    contacto_nombre: str = Field(default="", max_length=150)
    telefono: str = Field(default="", max_length=40)
    direccion: str = Field(default="", max_length=255)
    ciudad: str = Field(default="", max_length=100)
    sitio_web: str | None = Field(default=None, max_length=255)
    notas: str = Field(default="", max_length=2000)


class OrganizadorCrear(OrganizadorFicha):
    email: EmailStr = Field(max_length=150)
    password: Password
    plan: PlanId
    plan_inicio: date
    plan_fin: date
    activo: bool = True

    @model_validator(mode="after")
    def _fechas(self):
        if self.plan_fin < self.plan_inicio:
            raise ValueError("La fecha de fin del plan no puede ser anterior a la de inicio.")
        return self


class OrganizadorActualizar(CamelModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=150)
    ruc: Ruc | None = None
    contacto_nombre: str | None = Field(default=None, max_length=150)
    telefono: str | None = Field(default=None, max_length=40)
    direccion: str | None = Field(default=None, max_length=255)
    ciudad: str | None = Field(default=None, max_length=100)
    sitio_web: str | None = Field(default=None, max_length=255)
    notas: str | None = Field(default=None, max_length=2000)
    email: EmailStr | None = Field(default=None, max_length=150)
    password: Password | None = None
    plan: PlanId | None = None
    plan_inicio: date | None = None
    plan_fin: date | None = None
    activo: bool | None = None


class FeriaUso(CamelModel):
    """Uso de una feria frente al plan: solo cifras, sin datos de visitantes ni de leads."""

    id: str
    nombre: str
    estado: EstadoFeria
    fecha_inicio: date
    fecha_fin: date
    empresas: int
    visitantes: int


class UsoPlan(CamelModel):
    ferias_activas: int
    ferias_total: int
    ferias: list[FeriaUso]


class OrganizadorOut(CamelModel):
    id: str
    nombre: str
    ruc: str | None = None
    contacto_nombre: str
    telefono: str
    direccion: str
    ciudad: str
    sitio_web: str | None = None
    email: str
    plan: PlanId
    plan_inicio: date | None = None
    plan_fin: date | None = None
    activo: bool
    # Calculado con app.planes.estado_cuenta.
    estado: EstadoCuenta = "activa"
    creado_en: Fecha


class OrganizadorAdminOut(OrganizadorOut):
    notas: str = ""
    uso: UsoPlan

    @field_validator("notas", mode="before")
    @classmethod
    def _notas(cls, v: str | None) -> str:
        return v or ""


class MiPlanOut(CamelModel):
    """Lo que el organizador ve de su cuenta: su ficha, su plan, sus límites y cuánto usa."""

    organizador: OrganizadorOut
    plan: PlanOut
    uso: UsoPlan
    puede_operar: bool
    dias_restantes: int | None = None


class ResumenAdmin(CamelModel):
    organizadores: int
    por_estado: dict[str, int]
    por_plan: dict[str, int]
    ferias_activas: int
    empresas: int
    inscripciones: int
    # Suma del precio mensual de las cuentas con el plan vigente (activas y por vencer).
    ingreso_mensual: float = 0
    solicitudes_pendientes: int = 0
    por_vencer: list[OrganizadorOut]


class SuperAdminOut(CamelModel):
    id: str
    nombre: str
    email: str
    creado_en: Fecha


class SuperAdminCrear(CamelModel):
    nombre: str = Field(min_length=2, max_length=150)
    email: EmailStr = Field(max_length=150)
    password: Password




# ---------- Contratar un plan (solicitudes y pago por transferencia) ----------

Periodo = Literal["mensual", "anual"]
MetodoPago = Literal["transferencia", "tarjeta"]
EstadoSolicitud = Literal["pendiente", "pago_pendiente", "aprobada", "rechazada"]
MAX_COMPROBANTE = 5_000_000
_TIPOS_COMPROBANTE = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,", "data:application/pdf;base64,")


def _validar_comprobante(v: str | None) -> str | None:
    if not v:
        return None
    if len(v) > MAX_COMPROBANTE:
        raise ValueError("El comprobante pesa demasiado (máximo 3,5 MB).")
    if not v.startswith(_TIPOS_COMPROBANTE):
        raise ValueError("El comprobante debe ser una imagen (JPG, PNG o WebP) o un PDF.")
    return v


class SolicitudCrear(CamelModel):
    plan_id: PlanId
    periodo: Periodo
    metodo_pago: MetodoPago = "transferencia"
    nombre: str = Field(min_length=2, max_length=150)
    ruc: Ruc
    contacto_nombre: str = Field(min_length=2, max_length=150)
    email: EmailStr = Field(max_length=150)
    telefono: str = Field(min_length=7, max_length=40)
    ciudad: str = Field(default="", max_length=100)
    mensaje: str = Field(default="", max_length=1000)
    referencia: str = Field(default="", max_length=100)
    comprobante: Annotated[str | None, BeforeValidator(_validar_comprobante)] = None
    acepta_politica: bool = False
    # Campo trampa (oculto en el formulario).
    empresa_web: str = Field(default="", max_length=200)


class SolicitudCreadaOut(CamelModel):
    id: str
    plan_nombre: str
    periodo: Periodo
    monto: float
    email: str
    # Pago con tarjeta: opciones de la Cajita de Pagos de PayPhone (`new PPaymentButtonBox(cajita)`).
    cajita: dict | None = None


class MetodosPagoOut(CamelModel):
    transferencia: bool
    tarjeta: bool
    # La tarjeta funciona en modo demostración (sin PayPhone real).
    demo: bool = False


class ConfirmarPago(CamelModel):
    """Lo que PayPhone envía en la URL de respuesta."""

    id: int
    client_transaction_id: str = Field(min_length=1, max_length=50)


class PagoDemo(CamelModel):
    """Modo demostración: lo que «enviaría» la cajita de prueba (solo los últimos dígitos, nunca la tarjeta)."""

    client_transaction_id: str = Field(min_length=1, max_length=50)
    aprobado: bool = True
    marca: str = Field(default="Visa", max_length=20)
    ultimos: str = Field(default="4242", pattern=r"^\d{4}$")


class PagoDemoOut(CamelModel):
    id: int
    client_transaction_id: str


class ResultadoPago(CamelModel):
    estado: EstadoSolicitud
    plan_nombre: str
    periodo: Periodo
    monto: float
    email: str
    mensaje: str
    tarjeta: str = ""
    autorizacion: str = ""


class SolicitudOut(CamelModel):
    id: str
    plan_id: PlanId
    plan_nombre: str = ""
    periodo: Periodo
    monto: float
    metodo_pago: MetodoPago
    nombre: str
    ruc: str
    contacto_nombre: str
    email: str
    telefono: str
    ciudad: str
    mensaje: str
    referencia: str
    tiene_comprobante: bool = False
    transaccion_id: str = ""
    autorizacion: str = ""
    tarjeta: str = ""
    estado: EstadoSolicitud
    motivo_rechazo: str = ""
    revisado_por: str | None = None
    revisado_en: Fecha | None = None
    organizador_id: str | None = None
    creado_en: Fecha


class ComprobanteOut(CamelModel):
    comprobante: str | None


class SolicitudRechazar(CamelModel):
    motivo: str = Field(min_length=5, max_length=500)


class DatosTransferencia(CamelModel):
    """Cuenta bancaria donde los clientes transfieren (la edita el Super Administrador)."""

    banco: str = Field(default="", max_length=100)
    tipo_cuenta: str = Field(default="", max_length=40)
    numero_cuenta: str = Field(default="", max_length=40)
    titular: str = Field(default="", max_length=150)
    identificacion: str = Field(default="", max_length=20)
    correo: str = Field(default="", max_length=150)
    instrucciones: str = Field(default="", max_length=500)




# ---------- Super Administrador: ferias, visitantes y registros ----------


class FeriaAdminOut(FeriaOut):
    organizador_id: str
    organizador_nombre: str


class VisitanteAdminFila(VisitanteOut):
    ferias: int = 0


class PaginaVisitantesAdmin(CamelModel):
    items: list[VisitanteAdminFila]
    total: int
    pagina: int
    por_pagina: int


class InscripcionAdmin(CamelModel):
    feria_id: str
    feria_nombre: str
    organizador_nombre: str
    estado: EstadoFeria
    fecha_inicio: date
    fecha_fin: date
    inscrito_en: Fecha
    asistio_en: Fecha | None = None
    leads: int = 0


class AceptacionOut(CamelModel):
    id: str
    tipo: str
    titular_id: str
    nombre: str
    email: str
    version: str
    origen: str
    registrado_por: str
    ip: str
    user_agent: str
    creado_en: Fecha


class VisitanteAdminDetalle(VisitanteOut):
    inscripciones: list[InscripcionAdmin]
    aceptaciones: list[AceptacionOut]


class ActividadOut(CamelModel):
    id: str
    actor_rol: str
    actor_nombre: str
    accion: str
    descripcion: str
    entidad: str
    entidad_id: str
    ip: str
    creado_en: Fecha


class PaginaActividad(CamelModel):
    items: list[ActividadOut]
    total: int
    pagina: int
    por_pagina: int


class PaginaAceptaciones(CamelModel):
    items: list[AceptacionOut]
    total: int
    pagina: int
    por_pagina: int


EstadisticasOut.model_rebuild()
