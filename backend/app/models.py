from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import DATETIME, LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .cifrado import TextoCifrado, TextoCifradoLargo
from .database import Base
from .utils import ahora

Fecha = DATETIME(fsp=6)
CALIFICACIONES = ("interesado", "visita", "correo", "no_interesado")
ESTADOS_LEAD = ("nuevo", "contactado", "cotizado", "cerrado")


class SuperAdmin(Base):
    """Usuario de FeriaBot Pro (la empresa dueña de la plataforma): crea organizadores y les asigna un plan."""

    __tablename__ = "super_admins"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)


class Plan(Base):
    """Plan que FeriaBot Pro vende a los organizadores. El Super Administrador cambia precios y límites."""

    __tablename__ = "planes"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # basico, profesional, premium
    nombre: Mapped[str] = mapped_column(String(60))
    descripcion: Mapped[str] = mapped_column(String(300), default="")
    # En dólares (USD). El anual suele tener descuento.
    precio_mensual: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    precio_anual: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    ferias: Mapped[int] = mapped_column(Integer)
    empresas_por_feria: Mapped[int] = mapped_column(Integer)
    visitantes_por_feria: Mapped[int] = mapped_column(Integer)
    # Se muestra en la página pública de planes.
    publico: Mapped[bool] = mapped_column(Boolean, default=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    actualizado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, onupdate=ahora)


class Organizador(Base):
    """Cliente de FeriaBot Pro que organiza ferias. Tiene un plan (ver app.planes) con vigencia."""

    __tablename__ = "organizadores"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150))
    # RUC de Ecuador (13 dígitos). NULL solo en cuentas creadas antes de pedirlo.
    ruc: Mapped[str | None] = mapped_column(String(13), unique=True)
    contacto_nombre: Mapped[str] = mapped_column(String(150), default="", server_default="")
    telefono: Mapped[str] = mapped_column(TextoCifrado, default="")
    direccion: Mapped[str] = mapped_column(String(255), default="", server_default="")
    ciudad: Mapped[str] = mapped_column(String(100), default="", server_default="")
    sitio_web: Mapped[str | None] = mapped_column(String(255))
    # Notas internas del Super Administrador (forma de pago, acuerdos…); el organizador no las ve.
    notas: Mapped[str] = mapped_column(Text, default="")
    email: Mapped[str] = mapped_column(String(150), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    plan: Mapped[str] = mapped_column(String(20), default="basico", server_default="basico")
    plan_inicio: Mapped[date | None] = mapped_column(Date)
    plan_fin: Mapped[date | None] = mapped_column(Date)
    # Suspendida a mano por el Super Administrador: no puede ingresar.
    activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)


class Feria(Base):
    """Feria creada por el organizador. Empresas, inscripciones, leads y vistas pertenecen a una feria."""

    __tablename__ = "ferias"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    organizador_id: Mapped[str] = mapped_column(ForeignKey("organizadores.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(150))
    descripcion: Mapped[str] = mapped_column(Text)
    lugar: Mapped[str] = mapped_column(String(255), default="")
    # Imagen de portada opcional (data URL JPEG/PNG/WebP o URL https) y su texto alternativo.
    portada: Mapped[str | None] = mapped_column(LONGTEXT)
    portada_alt: Mapped[str] = mapped_column(String(200), default="", server_default="")
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date, index=True)
    # Interruptor manual del organizador; además la inscripción se cierra sola después de fecha_fin.
    inscripciones_abiertas: Mapped[bool] = mapped_column(Boolean, default=True)
    # Máximo de inscritos; NULL = sin límite. El organizador puede inscribir aunque esté llena.
    aforo: Mapped[int | None] = mapped_column(Integer)
    # Cuándo se envió el recordatorio a los inscritos (app.recordatorios); NULL = aún no.
    recordatorio_enviado_en: Mapped[datetime | None] = mapped_column(Fecha)
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)

    organizador: Mapped[Organizador] = relationship()

    @property
    def abierta(self) -> bool:
        """Acepta inscripciones: interruptor encendido y la feria no ha terminado."""
        return bool(self.inscripciones_abiertas) and date.today() <= self.fecha_fin

    @property
    def estado(self) -> str:
        """`proxima` (aún no empieza), `en_curso` o `finalizada`, según la fecha de hoy."""
        hoy = date.today()
        if hoy < self.fecha_inicio:
            return "proxima"
        return "en_curso" if hoy <= self.fecha_fin else "finalizada"


class Empresa(Base):
    __tablename__ = "empresas"
    # Una empresa no se repite (mismo RUC) dentro de una feria; sí puede estar en varias ferias.
    __table_args__ = (UniqueConstraint("feria_id", "ruc", name="uq_empresa_feria_ruc"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    feria_id: Mapped[str] = mapped_column(ForeignKey("ferias.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(150), index=True)
    # RUC de Ecuador (13 dígitos). NULL solo en empresas creadas antes de pedirlo.
    ruc: Mapped[str | None] = mapped_column(String(13))
    rubro: Mapped[str] = mapped_column(String(100), default="")
    descripcion: Mapped[str] = mapped_column(Text)
    servicios: Mapped[list[str]] = mapped_column(JSON)
    contacto_nombre: Mapped[str] = mapped_column(String(150), default="")
    email: Mapped[str] = mapped_column(String(150), unique=True)
    telefono: Mapped[str] = mapped_column(TextoCifrado, default="")
    sitio_web: Mapped[str | None] = mapped_column(String(255))
    stand: Mapped[str] = mapped_column(String(20), default="")
    logo: Mapped[str | None] = mapped_column(LONGTEXT)  # data URL o URL
    fotos: Mapped[list[str]] = mapped_column(JSON)  # 2–3 fotos (data URL o URL)
    # Contraseña con la que la empresa entra a su panel; None = aún no puede ingresar.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)

    feria: Mapped[Feria] = relationship()


class UsuarioEmpresa(Base):
    """Vendedor de una empresa con su propio acceso al panel (la sesión sigue siendo de la empresa)."""

    __tablename__ = "usuarios_empresa"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    empresa_id: Mapped[str] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)

    empresa: Mapped[Empresa] = relationship()


class Visitante(Base):
    __tablename__ = "visitantes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)  # impreso en la tarjeta QR
    nombre: Mapped[str] = mapped_column(String(150))
    telefono: Mapped[str] = mapped_column(TextoCifrado, default="")
    # NULL cuando no dejó correo, para que el índice único permita varios sin correo.
    email: Mapped[str | None] = mapped_column(String(150), unique=True)
    empresa: Mapped[str] = mapped_column(String(150), default="")
    ciudad: Mapped[str] = mapped_column(String(100), default="")
    # Aceptación de la política de privacidad y tratamiento de datos (LOPDP).
    # NULL en cuentas creadas antes de que se pidiera.
    politica_aceptada_en: Mapped[datetime | None] = mapped_column(Fecha)
    politica_version: Mapped[str | None] = mapped_column(String(20))
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)


class Inscripcion(Base):
    """Un visitante (una sola cuenta) inscrito a una feria. Puede estar inscrito en varias."""

    __tablename__ = "inscripciones"
    __table_args__ = (UniqueConstraint("feria_id", "visitante_id", name="uq_inscripcion_feria_visitante"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    feria_id: Mapped[str] = mapped_column(ForeignKey("ferias.id", ondelete="CASCADE"))
    visitante_id: Mapped[str] = mapped_column(ForeignKey("visitantes.id", ondelete="CASCADE"), index=True)
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)
    # Entrada a la feria registrada en la puerta (POST /ferias/:id/asistencia); NULL = aún no llegó.
    asistio_en: Mapped[datetime | None] = mapped_column(Fecha)

    feria: Mapped[Feria] = relationship()
    visitante: Mapped[Visitante] = relationship()


class CodigoVerificacion(Base):
    """Código de 6 dígitos enviado por correo para registrarse o ingresar como visitante."""

    __tablename__ = "codigos_verificacion"
    __table_args__ = (UniqueConstraint("email", "proposito", name="uq_codigo_email_proposito"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(150))
    proposito: Mapped[str] = mapped_column(String(30))  # ver PropositoCodigo en schemas.py
    codigo_hash: Mapped[str] = mapped_column(String(64))
    intentos: Mapped[int] = mapped_column(default=0)
    expira_en: Mapped[datetime] = mapped_column(Fecha)
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)


class Lead(Base):
    """Contacto que una empresa registra al escanear el QR de un visitante."""

    __tablename__ = "leads"
    __table_args__ = (UniqueConstraint("empresa_id", "visitante_id", name="uq_lead_empresa_visitante"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    empresa_id: Mapped[str] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"))
    visitante_id: Mapped[str] = mapped_column(ForeignKey("visitantes.id", ondelete="CASCADE"), index=True)
    calificacion: Mapped[str] = mapped_column(Enum(*CALIFICACIONES, name="calificacion"))
    # Seguimiento comercial del contacto: uno de ESTADOS_LEAD (ver EstadoLead en schemas.py).
    estado: Mapped[str] = mapped_column(String(20), default="nuevo", server_default="nuevo")
    nota: Mapped[str] = mapped_column(Text)
    # Quién escaneó al visitante: el vendedor, o la empresa / el organizador si fue su cuenta principal.
    registrado_por: Mapped[str | None] = mapped_column(String(150))
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)
    actualizado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)

    empresa: Mapped[Empresa] = relationship()
    visitante: Mapped[Visitante] = relationship()


class VistaFicha(Base):
    """Un visitante abrió la ficha digital de una empresa (QR del stand)."""

    __tablename__ = "vistas_ficha"
    __table_args__ = (UniqueConstraint("visitante_id", "empresa_id", name="uq_vista_visitante_empresa"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    visitante_id: Mapped[str] = mapped_column(ForeignKey("visitantes.id", ondelete="CASCADE"))
    empresa_id: Mapped[str] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"), index=True)
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)

    empresa: Mapped[Empresa] = relationship()
    visitante: Mapped[Visitante] = relationship()


class Ajuste(Base):
    """Configuración que edita el Super Administrador (p. ej. «transferencia»: datos de la cuenta bancaria)."""

    __tablename__ = "ajustes"

    clave: Mapped[str] = mapped_column(String(50), primary_key=True)
    valor: Mapped[dict] = mapped_column(JSON)
    actualizado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, onupdate=ahora)


class SolicitudPlan(Base):
    """Alguien quiere contratar un plan. Con transferencia, un encargado revisa el pago y aprueba (se crea la cuenta)
    o rechaza. `metodo_pago` queda listo para la pasarela de pago con tarjeta."""

    __tablename__ = "solicitudes_plan"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    plan_id: Mapped[str] = mapped_column(String(20))
    periodo: Mapped[str] = mapped_column(String(10))  # mensual | anual
    # Precio del plan al momento de la solicitud (USD).
    monto: Mapped[float] = mapped_column(Numeric(10, 2))
    metodo_pago: Mapped[str] = mapped_column(String(20), default="transferencia")
    nombre: Mapped[str] = mapped_column(String(150))
    ruc: Mapped[str] = mapped_column(String(13))
    contacto_nombre: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150), index=True)
    telefono: Mapped[str] = mapped_column(TextoCifrado)
    ciudad: Mapped[str] = mapped_column(String(100), default="")
    mensaje: Mapped[str] = mapped_column(Text, default="")
    # Comprobante de la transferencia: data URL (imagen o PDF) y número de la transacción.
    comprobante: Mapped[str | None] = mapped_column(TextoCifradoLargo)
    referencia: Mapped[str] = mapped_column(String(100), default="")
    # pendiente (transferencia por revisar) | pago_pendiente (tarjeta sin completar) | aprobada | rechazada
    estado: Mapped[str] = mapped_column(String(15), default="pendiente", index=True)
    # Pago con tarjeta (PayPhone): id del pago preparado, transacción, código de autorización y tarjeta.
    pago_id: Mapped[str] = mapped_column(String(40), default="", server_default="")
    transaccion_id: Mapped[str] = mapped_column(String(40), default="", server_default="")
    autorizacion: Mapped[str] = mapped_column(String(40), default="", server_default="")
    tarjeta: Mapped[str] = mapped_column(String(60), default="", server_default="")
    motivo_rechazo: Mapped[str] = mapped_column(Text, default="")
    revisado_por: Mapped[str | None] = mapped_column(String(150))
    revisado_en: Mapped[datetime | None] = mapped_column(Fecha)
    # Cuenta creada al aprobarla (sin llave foránea: la solicitud se conserva aunque se elimine la cuenta).
    organizador_id: Mapped[str | None] = mapped_column(String(40))
    politica_aceptada_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)


class Auditoria(Base):
    """Actividad del equipo de FeriaBot Pro sobre datos de otros (no se borra desde la app)."""

    __tablename__ = "auditoria"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    actor_rol: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[str] = mapped_column(String(40), index=True)
    actor_nombre: Mapped[str] = mapped_column(String(150))
    # p. ej. feria.editar, visitante.eliminar, datos.ver, organizador.crear, solicitud.aprobar
    accion: Mapped[str] = mapped_column(String(40), index=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    entidad: Mapped[str] = mapped_column(String(30), default="")
    entidad_id: Mapped[str] = mapped_column(String(40), default="")
    ip: Mapped[str] = mapped_column(TextoCifrado, default="")
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)


class AceptacionPolitica(Base):
    """Cada aceptación de la política de privacidad y tratamiento de datos (constancia del consentimiento)."""

    __tablename__ = "aceptaciones_politica"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(20))  # visitante | solicitud_plan
    titular_id: Mapped[str] = mapped_column(String(40), index=True)
    nombre: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150), default="", index=True)
    version: Mapped[str] = mapped_column(String(20))
    # registro_publico | registro_organizador | contratacion | historico
    origen: Mapped[str] = mapped_column(String(30))
    # Si lo marcó el personal de la feria en nombre del visitante.
    registrado_por: Mapped[str] = mapped_column(String(150), default="")
    ip: Mapped[str] = mapped_column(TextoCifrado, default="")
    user_agent: Mapped[str] = mapped_column(TextoCifrado, default="")
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)
