from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select

from ..config import settings
from ..database import DB
from ..models import Empresa, Organizador, Visitante
from ..schemas import (
    CambiarCorreo,
    CambiarPassword,
    EnviarCodigo,
    EnviarCodigoOut,
    LoginPassword,
    LoginVisitante,
    LoginVisitanteCorreo,
    RecuperarCambiar,
    RecuperarEnviar,
    Sesion,
    TokenOut,
)
from ..security import crear_token, hash_password, requiere, verificar_password
from ..verificacion import crear_y_enviar, verificar
from .visitantes import buscar_por_codigo_o_email

router = APIRouter(prefix="/auth", tags=["auth"])

CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos."


def _token(sesion: Sesion) -> TokenOut:
    return TokenOut(token=crear_token(sesion), session=sesion)


@router.post("/organizador", response_model=TokenOut)
def login_organizador(data: LoginPassword, db: DB):
    org = db.scalar(select(Organizador).where(Organizador.email == data.email.lower()))
    if not org or not verificar_password(data.password, org.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, CREDENCIALES_INVALIDAS)
    return _token(Sesion(role="organizador", ref_id=org.id, nombre=org.nombre))


@router.post("/empresa", response_model=TokenOut)
def login_empresa(data: LoginPassword, db: DB):
    emp = db.scalar(select(Empresa).where(Empresa.email == data.email.lower()))
    if emp and not emp.password_hash:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Tu empresa aún no tiene contraseña. Pídela a la organización de la feria.",
        )
    if not emp or not verificar_password(data.password, emp.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, CREDENCIALES_INVALIDAS)
    return _token(Sesion(role="empresa", ref_id=emp.id, nombre=emp.nombre))


@router.post("/visitante", response_model=TokenOut)
def login_visitante(data: LoginVisitante, db: DB):
    """Ingreso con el código de la tarjeta o el contenido del QR. Con correo se usa /auth/visitante/correo."""
    if "@" in data.codigo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Para ingresar con tu correo primero pide un código de verificación.")
    v = buscar_por_codigo_o_email(db, data.codigo)
    if not v:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "No encontramos ese código. ¿Ya te registraste?",
        )
    return _token(Sesion(role="visitante", ref_id=v.id, nombre=v.nombre))


@router.post("/enviar-codigo", response_model=EnviarCodigoOut)
def enviar_codigo(data: EnviarCodigo, db: DB):
    """Envía un código de 6 dígitos al correo, para registrarse (`registro`) o ingresar (`ingreso`)."""
    email = data.email.lower()
    existe = db.scalar(select(Visitante.id).where(Visitante.email == email)) is not None
    if data.proposito == "registro" and existe:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya tienes una cuenta con ese correo. Ingresa con tu correo para inscribirte a esta feria.")
    if data.proposito == "ingreso" and not existe:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay un visitante registrado con ese correo. ¿Ya te registraste?")
    crear_y_enviar(db, email, data.proposito)
    return EnviarCodigoOut(email=email, minutos=settings.codigo_minutos)


@router.post("/visitante/correo", response_model=TokenOut)
def login_visitante_correo(data: LoginVisitanteCorreo, db: DB):
    email = data.email.lower()
    v = db.scalar(select(Visitante).where(Visitante.email == email))
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay un visitante registrado con ese correo.")
    verificar(db, email, "ingreso", data.codigo)
    db.commit()
    return _token(Sesion(role="visitante", ref_id=v.id, nombre=v.nombre))


def _cuenta_con_password(db: DB, role: str, email: str) -> Empresa | Organizador | None:
    modelo = Empresa if role == "empresa" else Organizador
    return db.scalar(select(modelo).where(modelo.email == email))


@router.post("/recuperar/enviar-codigo", response_model=EnviarCodigoOut)
def recuperar_enviar_codigo(data: RecuperarEnviar, db: DB):
    """Olvidé mi contraseña (empresa u organizador): envía un código al correo de la cuenta."""
    email = data.email.lower()
    if _cuenta_con_password(db, data.role, email):
        crear_y_enviar(db, email, f"recuperar_{data.role}")
    # Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados.
    return EnviarCodigoOut(email=email, minutos=settings.codigo_minutos)


@router.post("/recuperar/cambiar", response_model=TokenOut)
def recuperar_cambiar(data: RecuperarCambiar, db: DB):
    """Cambia la contraseña con el código recibido e inicia sesión."""
    email = data.email.lower()
    cuenta = _cuenta_con_password(db, data.role, email)
    if not cuenta:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El código venció o no existe. Pide uno nuevo.")
    verificar(db, email, f"recuperar_{data.role}", data.codigo)
    cuenta.password_hash = hash_password(data.password)
    db.commit()
    return _token(Sesion(role=data.role, ref_id=cuenta.id, nombre=cuenta.nombre))


# ---------- Cuenta propia del organizador o la empresa ----------

SesionConPassword = Annotated[Sesion, Depends(requiere("organizador", "empresa"))]


def _cuenta_de_sesion(db: DB, sesion: Sesion) -> Empresa | Organizador:
    modelo = Empresa if sesion.role == "empresa" else Organizador
    cuenta = db.get(modelo, sesion.ref_id)
    if not cuenta:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos tu cuenta. Vuelve a ingresar.")
    return cuenta


def _confirmar_password(cuenta: Empresa | Organizador, password: str) -> None:
    if not cuenta.password_hash or not verificar_password(password, cuenta.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no es correcta.")


@router.post("/cambiar-password", status_code=status.HTTP_204_NO_CONTENT)
def cambiar_password(data: CambiarPassword, db: DB, sesion: SesionConPassword):
    """El organizador o la empresa cambia su contraseña confirmando la actual."""
    cuenta = _cuenta_de_sesion(db, sesion)
    _confirmar_password(cuenta, data.password_actual)
    if data.password_nueva == data.password_actual:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La nueva contraseña debe ser distinta de la actual.")
    cuenta.password_hash = hash_password(data.password_nueva)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/cambiar-correo", response_model=TokenOut)
def cambiar_correo(data: CambiarCorreo, db: DB, sesion: SesionConPassword):
    """El organizador o la empresa cambia el correo con el que ingresa, confirmando su contraseña."""
    cuenta = _cuenta_de_sesion(db, sesion)
    _confirmar_password(cuenta, data.password)
    email = data.email.lower()
    if email != cuenta.email:
        modelo = type(cuenta)
        otro = db.scalar(select(modelo.id).where(modelo.email == email))
        if otro and otro != cuenta.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo.")
        cuenta.email = email
        db.commit()
    return _token(Sesion(role=sesion.role, ref_id=cuenta.id, nombre=cuenta.nombre))


@router.get("/me", response_model=Sesion)
def yo(sesion: Annotated[Sesion, Depends(requiere())]):
    return sesion
