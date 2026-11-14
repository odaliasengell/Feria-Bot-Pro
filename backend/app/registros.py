"""Registros de cumplimiento (LOPDP).

- `registrar_actividad`: qué hizo el equipo de FeriaBot Pro (Super Administrador) y cuándo: cambios en ferias,
  organizadores, planes, solicitudes, borrado de visitantes y consultas de datos personales.
- `registrar_aceptacion`: cada vez que alguien acepta la política de privacidad y el tratamiento de datos (quién,
  versión, desde dónde y la IP).

Las funciones agregan la fila a la sesión; la guarda el `commit` de quien las llama.
"""

from fastapi import Request
from sqlalchemy.orm import Session

from .config import settings
from .models import AceptacionPolitica, Auditoria
from .schemas import Sesion
from .utils import ahora, uid


def ip_de(request: Request | None) -> str:
    if request is None or request.client is None:
        return ""
    return request.client.host[:45]


def registrar_actividad(
    db: Session,
    sesion: Sesion,
    accion: str,
    descripcion: str,
    *,
    entidad: str = "",
    entidad_id: str = "",
    request: Request | None = None,
) -> None:
    db.add(
        Auditoria(
            id=uid("aud-"),
            actor_rol=sesion.role,
            actor_id=sesion.ref_id or "",
            actor_nombre=(sesion.usuario_nombre or sesion.nombre or "")[:150],
            accion=accion,
            descripcion=descripcion[:500],
            entidad=entidad,
            entidad_id=entidad_id,
            ip=ip_de(request),
            creado_en=ahora(),
        )
    )


def registrar_aceptacion(
    db: Session,
    *,
    tipo: str,
    titular_id: str,
    nombre: str,
    email: str | None,
    origen: str,
    request: Request | None = None,
    registrado_por: str = "",
) -> None:
    """`tipo`: visitante | solicitud_plan. `origen`: registro_publico | registro_organizador | contratacion…
    `registrado_por`: si lo marcó el personal de la feria en nombre del visitante."""
    db.add(
        AceptacionPolitica(
            id=uid("acp-"),
            tipo=tipo,
            titular_id=titular_id,
            nombre=nombre[:150],
            email=(email or "")[:150],
            version=settings.politica_version,
            origen=origen,
            registrado_por=registrado_por[:150],
            ip=ip_de(request),
            user_agent=(request.headers.get("user-agent", "") if request else "")[:255],
            creado_en=ahora(),
        )
    )
