from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .schemas import Role, Sesion

ALGORITMO = "HS256"
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verificar_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def crear_token(sesion: Sesion) -> str:
    payload = {
        "sub": sesion.ref_id,
        "role": sesion.role,
        "nombre": sesion.nombre,
        "uid": sesion.usuario_id,
        "unombre": sesion.usuario_nombre,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITMO)


def sesion_opcional(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Sesion | None:
    if cred is None:
        return None
    try:
        p = jwt.decode(cred.credentials, settings.jwt_secret, algorithms=[ALGORITMO])
        return Sesion(
            role=p["role"],
            ref_id=p.get("sub"),
            nombre=p.get("nombre", ""),
            usuario_id=p.get("uid"),
            usuario_nombre=p.get("unombre"),
        )
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o vencida. Vuelve a ingresar.")


def requiere(*roles: Role):
    """Dependencia que exige sesión iniciada y, si se indican, uno de los roles."""

    def dep(sesion: Annotated[Sesion | None, Depends(sesion_opcional)]) -> Sesion:
        if sesion is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Debes iniciar sesión.")
        if roles and sesion.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción.")
        return sesion

    return dep


def solo_propio(sesion: Sesion, role: Role, ref_id: str) -> None:
    """Si la sesión es del rol indicado, solo puede actuar sobre su propio registro."""
    if sesion.role == role and sesion.ref_id != ref_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción.")
