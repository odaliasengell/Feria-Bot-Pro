"""Límite de intentos por IP para los endpoints públicos (inicios de sesión, códigos por correo y registro).

Frena el spam y los ataques de fuerza bruta. Es un contador en memoria: vale para un solo proceso de uvicorn.
Si se publica con varios procesos o servidores, cambiarlo por uno compartido (Redis).

Detrás de un proxy (Render, Railway, nginx) hay que arrancar uvicorn con `--proxy-headers
--forwarded-allow-ips="*"` para que `request.client.host` sea la IP real del visitante y no la del proxy.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from .config import settings

_intentos: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_cerrojo = threading.Lock()


def _ip(request: Request) -> str:
    return request.client.host if request.client else "desconocida"


def registrar_intento(request: Request, nombre: str, maximo: int, ventana: int) -> None:
    """Cuenta un intento de `request` en el grupo `nombre`; 429 si ya hubo `maximo` en los últimos `ventana` s."""
    if not settings.limites_activos:
        return
    clave = (nombre, _ip(request))
    ahora = time.monotonic()
    with _cerrojo:
        cola = _intentos[clave]
        while cola and ahora - cola[0] > ventana:
            cola.popleft()
        if len(cola) >= maximo:
            espera = int(ventana - (ahora - cola[0])) + 1
            minutos = max(1, round(espera / 60))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Demasiados intentos. Vuelve a intentarlo en {minutos} {'minuto' if minutos == 1 else 'minutos'}.",
                headers={"Retry-After": str(espera)},
            )
        cola.append(ahora)


def limite(nombre: str, maximo: int, ventana: int):
    """Dependencia de FastAPI: `dependencies=[Depends(limite("login", 10, 300))]`."""

    def dep(request: Request) -> None:
        registrar_intento(request, nombre, maximo, ventana)

    return dep


def reiniciar() -> None:
    """Para las pruebas."""
    with _cerrojo:
        _intentos.clear()
