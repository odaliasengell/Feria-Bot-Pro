"""Pago con tarjeta con la Cajita de Pagos de PayPhone (https://docs.payphone.app/cajita-de-pagos-payphone).

1. El backend arma la configuración de la cajita (`config_cajita`): token, storeId, monto en centavos y
   `clientTransactionId` (= id de la solicitud). El frontend la dibuja dentro de /contratar con `PPaymentButtonBox`.
2. El cliente paga sin salir de la página. PayPhone lo lleva a la «URL de Respuesta» configurada en la aplicación
   WEB de Payphone Developer (FRONTEND_URL/contratar/resultado) con `?id=<int>&clientTransactionId=<nuestro id>`.
3. `confirmar`: POST paymentbox…/api/confirm con `id` y `clientTxId`. Obligatorio y en los 5 minutos siguientes al
   pago; si no, PayPhone revierte la transacción. `statusCode` 3 = aprobada, 2 = cancelada.

Credenciales en `.env`: PAYPHONE_TOKEN y PAYPHONE_STORE_ID. Sin ellas el pago con tarjeta queda desactivado.
La cajita solo funciona en el dominio registrado en Payphone Developer (en desarrollo, http://localhost).
"""

import json
import logging
import urllib.error
import urllib.request

from .config import settings

log = logging.getLogger("feriabot.payphone")


class PayPhoneError(Exception):
    pass


def configurado() -> bool:
    return demo() or bool(settings.payphone_token and settings.payphone_store_id)


def demo() -> bool:
    """Modo demostración: activo con PAYPHONE_DEMO=true y sin credenciales reales (las reales siempre mandan)."""
    return settings.payphone_demo and not (settings.payphone_token and settings.payphone_store_id)


# Pagos simulados del modo demostración: clientTransactionId → respuesta que daría PayPhone al confirmar.
_PAGOS_DEMO: dict[str, dict] = {}


def pagar_demo(client_tx_id: str, monto: float, aprobado: bool, marca: str, ultimos: str) -> int:
    """Simula que el cliente pagó en la cajita; devuelve el `id` que PayPhone pondría en la URL de respuesta."""
    pid = 900000 + len(_PAGOS_DEMO) + 1
    _PAGOS_DEMO[client_tx_id] = {
        "id": pid,
        "statusCode": 3 if aprobado else 2,
        "transactionStatus": "Approved" if aprobado else "Canceled",
        "transactionId": pid,
        "clientTransactionId": client_tx_id,
        "amount": centavos(monto),
        "authorizationCode": f"DEMO{pid % 100000:05d}" if aprobado else None,
        "cardBrand": marca,
        "lastDigits": ultimos,
    }
    return pid


def centavos(monto: float) -> int:
    return int(round(float(monto) * 100))


def config_cajita(*, monto: float, client_tx_id: str, referencia: str, email: str) -> dict:
    """Opciones de `new PPaymentButtonBox({...})`. Todo el monto va como `amountWithoutTax` (sin desglose de IVA).
    El token viaja al navegador: así lo exige la cajita, y solo funciona desde el dominio registrado."""
    total = centavos(monto)
    if demo():
        return {"demo": True, "clientTransactionId": client_tx_id, "amount": total, "reference": referencia[:100], "email": email}
    return {
        "token": settings.payphone_token,
        "storeId": settings.payphone_store_id,
        "clientTransactionId": client_tx_id,
        "amount": total,
        "amountWithoutTax": total,
        "currency": "USD",
        "reference": referencia[:100],
        "email": email,
        "lang": "es",
        "defaultMethod": "card",
        "timeZone": settings.zona_horaria_utc,
    }


def confirmar(payphone_id: int, client_tx_id: str) -> dict:
    """Respuesta de PayPhone: statusCode (3 aprobada, 2 cancelada), transactionStatus, transactionId, amount (centavos),
    authorizationCode, cardBrand, lastDigits, clientTransactionId…"""
    if demo():
        pago = _PAGOS_DEMO.get(client_tx_id)
        if not pago or pago["id"] != int(payphone_id):
            raise PayPhoneError("Pago de demostración no encontrado.")
        return dict(pago)
    req = urllib.request.Request(
        settings.payphone_confirm_url,
        method="POST",
        data=json.dumps({"id": int(payphone_id), "clientTxId": client_tx_id}).encode(),
        headers={"Authorization": f"Bearer {settings.payphone_token}", "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        detalle = e.read().decode(errors="replace")[:500]
        log.error("PayPhone confirm respondió %s: %s", e.code, detalle)
        raise PayPhoneError(f"PayPhone respondió {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        log.error("No se pudo confirmar con PayPhone: %s", e)
        raise PayPhoneError("No se pudo conectar con PayPhone.") from e
