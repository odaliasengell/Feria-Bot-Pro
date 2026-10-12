from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import DATETIME, LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .utils import ahora

Fecha = DATETIME(fsp=6)
CALIFICACIONES = ("interesado", "visita", "correo", "no_interesado")


class Organizador(Base):
    __tablename__ = "organizadores"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)


class Feria(Base):
    """Feria creada por el organizador. Empresas, inscripciones, leads y vistas pertenecen a una feria."""

    __tablename__ = "ferias"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150))
    descripcion: Mapped[str] = mapped_column(Text)
    lugar: Mapped[str] = mapped_column(String(255), default="")
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date, index=True)
    # Interruptor manual del organizador; además la inscripción se cierra sola después de fecha_fin.
    inscripciones_abiertas: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)

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

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    feria_id: Mapped[str] = mapped_column(ForeignKey("ferias.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(150), index=True)
    rubro: Mapped[str] = mapped_column(String(100), default="")
    descripcion: Mapped[str] = mapped_column(Text)
    servicios: Mapped[list[str]] = mapped_column(JSON)
    contacto_nombre: Mapped[str] = mapped_column(String(150), default="")
    email: Mapped[str] = mapped_column(String(150), unique=True)
    telefono: Mapped[str] = mapped_column(String(40), default="")
    sitio_web: Mapped[str | None] = mapped_column(String(255))
    stand: Mapped[str] = mapped_column(String(20), default="")
    logo: Mapped[str | None] = mapped_column(LONGTEXT)  # data URL o URL
    fotos: Mapped[list[str]] = mapped_column(JSON)  # 2–3 fotos (data URL o URL)
    # Contraseña con la que la empresa entra a su panel; None = aún no puede ingresar.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora)

    feria: Mapped[Feria] = relationship()


class Visitante(Base):
    __tablename__ = "visitantes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)  # impreso en la tarjeta QR
    nombre: Mapped[str] = mapped_column(String(150))
    telefono: Mapped[str] = mapped_column(String(40), default="")
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
    nota: Mapped[str] = mapped_column(Text)
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
