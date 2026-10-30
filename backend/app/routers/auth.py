from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select

from ..config import settings
from ..database import DB
from ..models import Empresa, Organizador, UsuarioEmpresa, Visitante
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
from .empresas import correo_libre
from .visitantes import buscar_por_codigo_o_email

router = APIRouter(prefix="/auth", tags=["auth"])

CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos."


def _token(sesion: Sesion) -> TokenOut:
    return TokenOut(token=crear_token(sesion), session=sesion)


Cuenta = Empresa | Organizador | UsuarioEmpresa


def _sesion_de(cuenta: Cuenta) -> Sesion:
    """Sesión de una cuenta con contraseña. Un vendedor entra como su empresa, con usuarioId y usuarioNombre."""
    if isinstance(cuenta, UsuarioEmpresa):
        return Sesion(
            role="empresa",
            ref_id=cuenta.empresa_id,
            nombre=cuenta.empresa.nombre,
            usuario_id=cuenta.id,
            usuario_nombre=cuenta.nombre,
        )
    role = "empresa" if isinstance(cuenta, Empresa) else "organizador"
    return Sesion(role=role, ref_id=cuenta.id, nombre=cuenta.nombre)


@router.post("/organizador", response_model=TokenOut)
def login_organizador(data: LoginPassword, db: DB):
    org = db.scalar(select(Organizador).where(Organizador.email == data.email.lower()))
    if not org or not verificar_password(data.password, org.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, CREDENCIALES_INVALIDAS)
    return _token(Sesion(role="organizador", ref_id=org.id, nombre=org.nombre))


@router.post("/empresa", response_model=TokenOut)
def login_empresa(data: LoginPassword, db: DB):
    """La empresa con su correo principal o uno de sus vendedores con el suyo."""
    email = data.email.lower()
    cuenta: Empresa | UsuarioEmpresa | None = db.scalar(select(Empresa).where(Empresa.email == email))
    if cuenta is None:
        cuenta = db.scalar(select(UsuarioEmpresa).where(UsuarioEmpresa.email == email))
    if isinstance(cuenta, Empresa) and not cuenta.password_hash:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Tu empresa aún no tiene contraseña. Pídela a la organización de la feria.",
        )
    if not cuenta or not verificar_password(data.password, cuenta.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, CREDENCIALES_INVALIDAS)
    return _token(_sesion_de(cuenta))


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


def _cuenta_con_password(db: DB, role: str, email: str) -> Cuenta | None:
    if role == "organizador":
        return db.scalar(select(Organizador).where(Organizador.email == email))
    return db.scalar(select(Empresa).where(Empresa.email == email)) or db.scalar(
        select(UsuarioEmpresa).where(UsuarioEmpresa.email == email)
    )


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
    return _token(_sesion_de(cuenta))


# ---------- Cuenta propia del organizador o la empresa ----------

SesionConPassword = Annotated[Sesion, Depends(requiere("organizador", "empresa"))]


def _cuenta_de_sesion(db: DB, sesion: Sesion) -> Cuenta:
    """La cuenta que inició la sesión: el vendedor si lo hay, si no la empresa o el organizador."""
    if sesion.role == "empresa" and sesion.usuario_id:
        cuenta = db.get(UsuarioEmpresa, sesion.usuario_id)
    else:
        cuenta = db.get(Empresa if sesion.role == "empresa" else Organizador, sesion.ref_id)
    if not cuenta:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos tu cuenta. Vuelve a ingresar.")
    return cuenta


def _confirmar_password(cuenta: Cuenta, password: str) -> None:
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
        if isinstance(cuenta, Organizador):
            otro = db.scalar(select(Organizador.id).where(Organizador.email == email))
            if otro and otro != cuenta.id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo.")
        else:
            correo_libre(
                db,
                email,
                excepto_empresa=cuenta.id if isinstance(cuenta, Empresa) else None,
                excepto_usuario=cuenta.id if isinstance(cuenta, UsuarioEmpresa) else None,
            )
        cuenta.email = email
        db.commit()
    return _token(_sesion_de(cuenta))


@router.get("/me", response_model=Sesion)
def yo(sesion: Annotated[Sesion, Depends(requiere())]):
    return sesion
