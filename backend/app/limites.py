"""Límites contra spam y fuerza bruta.

- `limite` / `registrar_intento`: máximo de intentos por IP en endpoints públicos (inicios de sesión, códigos por
  correo, registro, solicitudes de plan).
- `exigir_cuenta_libre` / `registrar_fallo` / `registrar_exito`: bloqueo de una CUENTA tras varias contraseñas
  incorrectas, aunque los intentos vengan de IPs distintas.
- `permitir_peticion`: límite general de peticiones por minuto por IP (lo usa un middleware).

Almacenamiento:
- Con `REDIS_URL` en `.env` (y `pip install redis`) los contadores viven en Redis: los comparten todos los procesos y
  servidores y sobreviven a un reinicio del backend. Es lo recomendado en producción.
- Sin `REDIS_URL` (o si Redis no responde) se usan contadores en memoria: valen para un solo proceso de uvicorn.

Detrás de un proxy (Render, Railway, nginx) arranca uvicorn con `--proxy-headers --forwarded-allow-ips="*"` para que
`request.client.host` sea la IP real del visitante y no la del proxy.
"""

import logging
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from .config import settings

log = logging.getLogger("feriabot.limites")

FALLOS_MAX = 5
VENTANA_FALLOS = 15 * 60
BLOQUEO = 15 * 60
PETICIONES_POR_MINUTO = 300


def _ip(request: Request) -> str:
    return request.client.host if request.client else "desconocida"


def _texto_minutos(segundos: float) -> str:
    minutos = max(1, int(segundos // 60) + (1 if segundos % 60 else 0))
    return f"{minutos} {'minuto' if minutos == 1 else 'minutos'}"


# ---------------------------------------------------------------- almacenes


class Memoria:
    """Ventana deslizante exacta en memoria (un solo proceso)."""

    def __init__(self) -> None:
        self._colas: dict[str, deque[float]] = defaultdict(deque)
        self._hasta: dict[str, float] = {}
        self._cerrojo = threading.Lock()

    def contar(self, clave: str, ventana: int, maximo: int) -> tuple[bool, int]:
        """Registra un intento si cabe. (permitido, segundos de espera si no)."""
        ahora = time.monotonic()
        with self._cerrojo:
            cola = self._colas[clave]
            while cola and ahora - cola[0] > ventana:
                cola.popleft()
            if len(cola) >= maximo:
                return False, int(ventana - (ahora - cola[0])) + 1
            cola.append(ahora)
            return True, 0

    def sumar_fallo(self, clave: str, ventana: int) -> int:
        ahora = time.monotonic()
        with self._cerrojo:
            cola = self._colas[clave]
            while cola and ahora - cola[0] > ventana:
                cola.popleft()
            cola.append(ahora)
            return len(cola)

    def bloquear(self, clave: str, segundos: int) -> None:
        with self._cerrojo:
            self._hasta[clave] = time.monotonic() + segundos

    def bloqueo_restante(self, clave: str) -> float:
        with self._cerrojo:
            hasta = self._hasta.get(clave, 0)
            restante = hasta - time.monotonic()
            if restante <= 0:
                self._hasta.pop(clave, None)
                return 0
            return restante

    def borrar(self, *claves: str) -> None:
        with self._cerrojo:
            for c in claves:
                self._colas.pop(c, None)
                self._hasta.pop(c, None)

    def vaciar(self) -> None:
        with self._cerrojo:
            self._colas.clear()
            self._hasta.clear()


class AlmacenRedis:
    """Contadores en Redis (compartidos entre procesos). Usa INCR + EXPIRE por ventana."""

    PREFIJO = "feriabot:lim:"

    def __init__(self, cliente) -> None:
        self.r = cliente

    def _k(self, clave: str) -> str:
        return self.PREFIJO + clave

    def contar(self, clave: str, ventana: int, maximo: int) -> tuple[bool, int]:
        k = self._k(clave)
        n = self.r.incr(k)
        if n == 1:
            self.r.expire(k, ventana)
        if n > maximo:
            ttl = self.r.ttl(k)
            return False, max(1, int(ttl) if ttl and ttl > 0 else ventana)
        return True, 0

    def sumar_fallo(self, clave: str, ventana: int) -> int:
        k = self._k("fallos:" + clave)
        n = self.r.incr(k)
        if n == 1:
            self.r.expire(k, ventana)
        return int(n)

    def bloquear(self, clave: str, segundos: int) -> None:
        self.r.set(self._k("bloqueo:" + clave), "1", ex=segundos)

    def bloqueo_restante(self, clave: str) -> float:
        ttl = self.r.ttl(self._k("bloqueo:" + clave))
        return float(ttl) if ttl and ttl > 0 else 0

    def borrar(self, *claves: str) -> None:
        for c in claves:
            self.r.delete(self._k(c), self._k("fallos:" + c), self._k("bloqueo:" + c))

    def vaciar(self) -> None:
        for k in self.r.scan_iter(self.PREFIJO + "*"):
            self.r.delete(k)


_memoria = Memoria()
_redis: AlmacenRedis | None = None
_redis_intentado = False


def _almacen():
    """Redis si está configurado y responde; si no, memoria (con un aviso en la consola)."""
    global _redis, _redis_intentado
    if settings.redis_url and not _redis_intentado:
        _redis_intentado = True
        try:
            import redis  # opcional: pip install redis

            cliente = redis.Redis.from_url(settings.redis_url, socket_timeout=1, socket_connect_timeout=1, decode_responses=True)
            cliente.ping()
            _redis = AlmacenRedis(cliente)
            log.info("Límites de intentos guardados en Redis")
        except Exception as e:  # sin la librería o sin servidor: se sigue en memoria
            log.warning("No se pudo usar Redis (%s); los límites quedan en memoria.", e)
    return _redis or _memoria


def _con_respaldo(operacion):
    """Ejecuta en el almacén; si Redis falla en mitad del uso, sigue en memoria para no tumbar el login."""
    almacen = _almacen()
    try:
        return operacion(almacen)
    except Exception as e:
        if almacen is _memoria:
            raise
        log.warning("Redis falló (%s); se usa el contador en memoria.", e)
        return operacion(_memoria)


# ---------------------------------------------------------------- límite por IP


def registrar_intento(request: Request, nombre: str, maximo: int, ventana: int) -> None:
    """Cuenta un intento de `request` en el grupo `nombre`; 429 si ya hubo `maximo` en los últimos `ventana` s."""
    if not settings.limites_activos:
        return
    ok, espera = _con_respaldo(lambda a: a.contar(f"ip:{nombre}:{_ip(request)}", ventana, maximo))
    if not ok:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Demasiados intentos. Vuelve a intentarlo en {_texto_minutos(espera)}.",
            headers={"Retry-After": str(espera)},
        )


def limite(nombre: str, maximo: int, ventana: int):
    """Dependencia de FastAPI: `dependencies=[Depends(limite("login", 10, 300))]`."""

    def dep(request: Request) -> None:
        registrar_intento(request, nombre, maximo, ventana)

    return dep


# ---------------------------------------------------------------- bloqueo de cuenta


def exigir_cuenta_libre(clave: str) -> None:
    """429 si la cuenta está bloqueada por intentos fallidos."""
    if not settings.limites_activos:
        return
    restante = _con_respaldo(lambda a: a.bloqueo_restante(f"cuenta:{clave}"))
    if restante > 0:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Por seguridad bloqueamos el ingreso a esta cuenta por demasiados intentos fallidos. "
            f"Vuelve a intentarlo en {_texto_minutos(restante)} o recupera tu contraseña.",
            headers={"Retry-After": str(int(restante) + 1)},
        )


def registrar_fallo(clave: str) -> int:
    """Cuenta una contraseña incorrecta; devuelve cuántos intentos quedan (0 = la cuenta quedó bloqueada)."""
    if not settings.limites_activos:
        return FALLOS_MAX
    k = f"cuenta:{clave}"

    def fallar(a) -> int:
        n = a.sumar_fallo(k, VENTANA_FALLOS)
        if n >= FALLOS_MAX:
            a.bloquear(k, BLOQUEO)
            return 0
        return FALLOS_MAX - n

    quedan = _con_respaldo(fallar)
    if quedan == 0:
        # Reinicia el conteo de fallos (el bloqueo sigue vigente).
        _con_respaldo(lambda a: _reiniciar_fallos(a, k))
    return quedan


def _reiniciar_fallos(almacen, clave: str) -> None:
    if isinstance(almacen, Memoria):
        with almacen._cerrojo:
            almacen._colas.pop(clave, None)
    else:
        almacen.r.delete(almacen._k("fallos:" + clave))


def registrar_exito(clave: str) -> None:
    _con_respaldo(lambda a: a.borrar(f"cuenta:{clave}"))


# ---------------------------------------------------------------- límite general


def permitir_peticion(request: Request) -> tuple[bool, int]:
    """(permitida, segundos a esperar). La llama el middleware en cada petición a la API."""
    if not settings.limites_activos:
        return True, 0
    return _con_respaldo(lambda a: a.contar(f"req:{_ip(request)}", 60, PETICIONES_POR_MINUTO))


def reiniciar() -> None:
    """Para las pruebas."""
    _memoria.vaciar()
    if _redis:
        _redis.vaciar()
