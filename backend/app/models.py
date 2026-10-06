from datetime import datetime

from sqlalchemy import JSON, Enum, ForeignKey, String, Text, UniqueConstraint
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


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
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
    creado_en: Mapped[datetime] = mapped_column(Fecha, default=ahora, index=True)


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
