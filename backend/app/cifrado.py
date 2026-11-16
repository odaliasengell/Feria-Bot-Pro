"""Cifrado de datos personales sensibles con AES-256-GCM.

Se cifran solo los datos que no hace falta buscar ni filtrar: teléfonos, comprobantes de transferencia e IP y
navegador de las constancias. Nombres, correos, ciudades y RUC quedan en claro porque se buscan y deben ser únicos.

- Clave: CLAVE_CIFRADO en `.env` (32 bytes en base64 url). Generarla con:
      py -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
  ¡Respáldala! Si se pierde, los datos cifrados no se pueden recuperar.
- Formato guardado: «enc:v1:» + base64url(nonce de 12 bytes + texto cifrado + etiqueta GCM de 16 bytes). La versión
  permite cambiar de clave más adelante. Los textos sin ese prefijo se leen tal cual (datos de antes del cifrado).
- `TextoCifrado` es un tipo de columna de SQLAlchemy: cifra al guardar y descifra al leer, sin tocar el resto del código.
"""

import base64
import binascii
import logging
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.types import Text, TypeDecorator

from .config import settings

log = logging.getLogger("feriabot.cifrado")
PREFIJO = "enc:v1:"


class ClaveInvalida(RuntimeError):
    pass


def _clave() -> bytes | None:
    if not settings.clave_cifrado:
        return None
    try:
        clave = base64.urlsafe_b64decode(settings.clave_cifrado.encode() + b"=" * (-len(settings.clave_cifrado) % 4))
    except (binascii.Error, ValueError) as e:
        raise ClaveInvalida("CLAVE_CIFRADO no es base64 válido.") from e
    if len(clave) != 32:
        raise ClaveInvalida("CLAVE_CIFRADO debe tener 32 bytes (AES-256).")
    return clave


def activo() -> bool:
    return _clave() is not None


def cifrar(texto: str | None) -> str | None:
    """Cifra el texto; vacío o None se guardan igual. Sin clave configurada se guarda en claro (solo desarrollo)."""
    if texto is None or texto == "" or texto.startswith(PREFIJO):
        return texto
    clave = _clave()
    if clave is None:
        return texto
    nonce = os.urandom(12)  # único por cifrado: GCM nunca debe repetir nonce con la misma clave
    datos = AESGCM(clave).encrypt(nonce, texto.encode("utf-8"), None)
    return PREFIJO + base64.urlsafe_b64encode(nonce + datos).decode()


def descifrar(valor: str | None) -> str | None:
    if not valor or not valor.startswith(PREFIJO):
        return valor
    clave = _clave()
    if clave is None:
        log.error("Hay datos cifrados pero falta CLAVE_CIFRADO en .env")
        return ""
    try:
        bruto = base64.urlsafe_b64decode(valor[len(PREFIJO):].encode())
        return AESGCM(clave).decrypt(bruto[:12], bruto[12:], None).decode("utf-8")
    except (InvalidTag, binascii.Error, ValueError):
        # Clave distinta o dato alterado: GCM lo detecta. No se muestra basura.
        log.error("No se pudo descifrar un dato (¿cambió CLAVE_CIFRADO o el dato fue alterado?)")
        return ""


class TextoCifrado(TypeDecorator):
    """Columna de texto cifrada con AES-256-GCM (transparente para el resto del código)."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return cifrar(value)

    def process_result_value(self, value, dialect):
        return descifrar(value)


class TextoCifradoLargo(TextoCifrado):
    """Igual que TextoCifrado, pero LONGTEXT en MySQL (comprobantes: imágenes o PDF en base64)."""

    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            from sqlalchemy.dialects.mysql import LONGTEXT

            return dialect.type_descriptor(LONGTEXT())
        return dialect.type_descriptor(Text())


def revisar_clave() -> str | None:
    """Aviso si falta la clave (en producción, con FORZAR_HTTPS, el servidor no arranca)."""
    _clave()  # lanza ClaveInvalida si está mal formada
    if not settings.clave_cifrado:
        mensaje = (
            "Falta CLAVE_CIFRADO en .env: los teléfonos y comprobantes se guardan sin cifrar. Genérala con:\n"
            '    py -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"'
        )
        if settings.es_produccion:
            raise ClaveInvalida(mensaje)
        return mensaje
    return None
