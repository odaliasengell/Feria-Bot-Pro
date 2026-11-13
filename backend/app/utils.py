import re
import secrets
from datetime import datetime, timezone

_ALFABETO_ID = "abcdefghijklmnopqrstuvwxyz0123456789"
# Sin 0/O/1/I para que el código impreso en la tarjeta no se confunda.
_ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PREFIJO_QR_VISITANTE = "FERIABOT:V:"


def ahora() -> datetime:
    """Fecha y hora actual en UTC (sin tzinfo, así se guarda en MySQL)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def uid(prefijo: str = "") -> str:
    return prefijo + "".join(secrets.choice(_ALFABETO_ID) for _ in range(12))


def generar_codigo() -> str:
    return "FB-" + "".join(secrets.choice(_ALFABETO_CODIGO) for _ in range(6))


def leer_codigo_visitante(texto: str) -> str | None:
    """Código del visitante a partir del contenido de su QR o de lo que tecleó (igual que el frontend)."""
    t = texto.strip().upper()
    if t.startswith(PREFIJO_QR_VISITANTE):
        return t[len(PREFIJO_QR_VISITANTE):]
    if re.fullmatch(r"FB-[A-Z0-9]{4,}", t):
        return t
    if re.fullmatch(r"[A-Z0-9]{6}", t):
        return f"FB-{t}"
    return None


def digito_cedula(nueve: str) -> int:
    """Dígito verificador de una cédula ecuatoriana (módulo 10) a partir de sus 9 primeros dígitos."""
    total = 0
    for i, c in enumerate(nueve):
        n = int(c) * (2 if i % 2 == 0 else 1)
        total += n - 9 if n > 9 else n
    return (10 - total % 10) % 10


def error_ruc(ruc: str) -> str | None:
    """Revisa un RUC de Ecuador; devuelve el motivo si no es válido.

    13 dígitos, provincia 01-24 (o 30, exterior), tercer dígito 0-5 (persona natural), 6 (sector público) o
    9 (sociedad) y establecimiento distinto de 000. En personas naturales también se revisa el dígito verificador
    de la cédula; en sociedades y entidades públicas no, porque el SRI emite RUC nuevos que ya no lo cumplen.
    """
    if not ruc.isdigit() or len(ruc) != 13:
        return "El RUC debe tener 13 dígitos."
    provincia, tercero = int(ruc[:2]), int(ruc[2])
    if not (1 <= provincia <= 24 or provincia == 30):
        return "Los dos primeros dígitos del RUC (provincia) no son válidos."
    if tercero in (7, 8):
        return "El tercer dígito del RUC no es válido."
    if ruc[10:] == "000":
        return "El RUC debe terminar en el número de establecimiento (por ejemplo 001)."
    if tercero < 6 and digito_cedula(ruc[:9]) != int(ruc[9]):
        return "El RUC no es válido: la cédula de los 10 primeros dígitos no coincide."
    return None


def normalizar_ruc(texto: str) -> str:
    """Quita espacios y guiones; si Excel perdió el 0 inicial (quedan 12 dígitos), lo repone."""
    limpio = "".join(c for c in str(texto) if c.isdigit())
    return "0" + limpio if len(limpio) == 12 else limpio


def ruc_persona_natural(nueve: str, establecimiento: str = "001") -> str:
    """RUC válido de persona natural a partir de los 9 primeros dígitos de la cédula (para datos de prueba)."""
    return f"{nueve}{digito_cedula(nueve)}{establecimiento}"
