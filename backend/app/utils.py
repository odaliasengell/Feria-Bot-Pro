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
