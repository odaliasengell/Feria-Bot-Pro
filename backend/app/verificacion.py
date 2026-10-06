"""Códigos de verificación por correo: generar, enviar y comprobar."""

import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .correo import CorreoError, enviar_codigo_verificacion
from .models import CodigoVerificacion
from .schemas import PropositoCodigo
from .utils import ahora, uid

MAX_INTENTOS = 5
ESPERA_REENVIO = timedelta(seconds=60)


def _hash(email: str, proposito: str, codigo: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"{proposito}:{email}:{codigo}".encode(), hashlib.sha256).hexdigest()


def _buscar(db: Session, email: str, proposito: str) -> CodigoVerificacion | None:
    return db.scalar(
        select(CodigoVerificacion).where(CodigoVerificacion.email == email, CodigoVerificacion.proposito == proposito)
    )


def crear_y_enviar(db: Session, email: str, proposito: PropositoCodigo) -> None:
    """Genera un código nuevo (reemplaza al anterior) y lo envía por correo."""
    t = ahora()
    cv = _buscar(db, email, proposito)
    if cv and t - cv.creado_en < ESPERA_REENVIO:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Espera un minuto antes de pedir otro código.")

    codigo = f"{secrets.randbelow(10**6):06d}"
    if cv is None:
        cv = CodigoVerificacion(id=uid("cv-"), email=email, proposito=proposito)
        db.add(cv)
    cv.codigo_hash = _hash(email, proposito, codigo)
    cv.intentos = 0
    cv.creado_en = t
    cv.expira_en = t + timedelta(minutes=settings.codigo_minutos)
    db.flush()

    try:
        enviar_codigo_verificacion(email, codigo, proposito)
    except CorreoError:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No pudimos enviar el correo. Intenta de nuevo en unos minutos.")
    db.commit()


def verificar(db: Session, email: str, proposito: PropositoCodigo, codigo: str) -> None:
    """Comprueba el código y lo consume. El llamador hace el commit junto con lo que crea."""
    cv = _buscar(db, email, proposito)
    if not cv or cv.expira_en < ahora():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El código venció o no existe. Pide uno nuevo.")
    if cv.intentos >= MAX_INTENTOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Demasiados intentos. Pide un código nuevo.")
    if not hmac.compare_digest(cv.codigo_hash, _hash(email, proposito, codigo.strip())):
        cv.intentos += 1
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Código incorrecto.")
    db.delete(cv)
