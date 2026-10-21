import base64
import html as html_lib
import io
import logging
import smtplib
import ssl
from collections.abc import Callable
from datetime import date
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from string import Template

import qrcode
from qrcode.image.pure import PyPNGImage

from .config import settings

log = logging.getLogger("feriabot.correo")
PLANTILLAS = Path(__file__).parent / "plantillas"


class CorreoError(Exception):
    pass


def enviar_correo(destino: str, asunto: str, texto: str, html: str, imagenes: dict[str, bytes] | None = None) -> None:
    """`imagenes` = {cid: png}: se adjuntan junto al HTML, que las muestra con src="cid:<cid>"."""
    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = formataddr((settings.mail_from_name, settings.smtp_user))
    msg["To"] = destino
    msg.set_content(texto)
    msg.add_alternative(html, subtype="html")
    if imagenes:
        parte_html = msg.get_payload()[1]
        for cid, png in imagenes.items():
            parte_html.add_related(png, maintype="image", subtype="png", cid=f"<{cid}>", filename=f"{cid}.png")

    contexto = ssl.create_default_context()
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=contexto) as s:
                s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                s.starttls(context=contexto)
                s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        log.exception("No se pudo enviar el correo a %s", destino)
        raise CorreoError(str(e)) from e


# Título y mensaje del correo según para qué es el código (registro, ingreso, recuperar_* o cambio_correo).
TEXTOS_CODIGO = {
    "registro": ("Confirma tu correo", "Escribe este código en la app para confirmar tu correo:"),
    "ingreso": ("Tu código para ingresar", "Escribe este código en la app para entrar:"),
    "recuperar": (
        "Restablece tu contraseña",
        "Recibimos una solicitud para cambiar tu contraseña. Escribe este código en la app:",
    ),
    "cambio": ("Confirma tu nuevo correo", "Escribe este código en la app para usar este correo en tu cuenta:"),
}


def enviar_codigo_verificacion(destino: str, codigo: str, proposito: str = "registro") -> None:
    if not settings.smtp_user:
        # Desarrollo: sin SMTP configurado el código solo se muestra en la consola del backend.
        print(f"[correo no configurado] Código ({proposito}) para {destino}: {codigo}", flush=True)
        return

    texto, html = contenido_codigo(codigo, proposito)
    enviar_correo(destino, f"{codigo} es tu código de {settings.mail_from_name}", texto, html)


def contenido_codigo(codigo: str, proposito: str = "registro") -> tuple[str, str]:
    """Versión en texto plano y en HTML (plantillas/codigo_verificacion.html) del correo con el código."""
    titulo, mensaje = TEXTOS_CODIGO[proposito.split("_")[0]]
    variables = {
        "codigo": codigo,
        "minutos": settings.codigo_minutos,
        "app": settings.mail_from_name,
        "titulo": titulo,
        "mensaje": mensaje,
    }
    texto = (
        f"{titulo}\n\n{mensaje} {codigo}\n\n"
        f"Vence en {variables['minutos']} minutos y solo se puede usar una vez. "
        "Si no lo pediste, ignora este correo."
    )
    html = Template((PLANTILLAS / "codigo_verificacion.html").read_text(encoding="utf-8")).safe_substitute(variables)
    return texto, html


# ---------- Correos de bienvenida ----------

_MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def rango_fechas(inicio: date, fin: date) -> str:
    """"6 – 8 nov 2026" o "6 nov 2026"."""
    largo = f"{fin.day} {_MESES[fin.month - 1]} {fin.year}"
    if inicio == fin:
        return largo
    if (inicio.month, inicio.year) == (fin.month, fin.year):
        return f"{inicio.day} – {largo}"
    return f"{inicio.day} {_MESES[inicio.month - 1]} – {largo}"


def qr_png(contenido: str) -> bytes:
    """PNG del código QR (blanco y negro, sin depender de Pillow)."""
    buf = io.BytesIO()
    qrcode.make(contenido, image_factory=PyPNGImage, box_size=10, border=2).save(buf)
    return buf.getvalue()


def _plantilla(nombre: str, variables: dict[str, str]) -> str:
    seguras = {k: html_lib.escape(str(v)) for k, v in variables.items()}
    return Template((PLANTILLAS / nombre).read_text(encoding="utf-8")).safe_substitute(seguras)


def contenido_bienvenida_visitante(nombre: str, codigo: str, feria: str, fechas: str, qr_src: str = "cid:qr") -> tuple[str, str]:
    url = f"{settings.frontend_url.rstrip('/')}/ingresar?rol=visitante"
    texto = (
        f"Hola, {nombre}\n\nYa estás inscrito en {feria} ({fechas}).\n"
        f"Tu código de visitante es {codigo}. Preséntalo (o el QR adjunto) en los stands.\n\n"
        f"Ver tu tarjeta en la app: {url}"
    )
    html = _plantilla(
        "bienvenida_visitante.html",
        {"nombre": nombre, "codigo": codigo, "feria": feria, "fechas": fechas, "qr_src": qr_src,
         "url_ingresar": url, "app": settings.mail_from_name},
    )
    return texto, html


def enviar_bienvenida_visitante(destino: str, nombre: str, codigo: str, feria: str, fechas: str) -> None:
    """Correo con el código FB-XXXXXX y la imagen del QR (contenido FERIABOT:V:<codigo>)."""
    if not settings.smtp_user:
        print(f"[correo no configurado] Bienvenida para {destino}: tarjeta {codigo} ({feria})", flush=True)
        return
    from .utils import PREFIJO_QR_VISITANTE

    texto, html = contenido_bienvenida_visitante(nombre, codigo, feria, fechas)
    enviar_correo(
        destino, f"Tu tarjeta para {feria}: {codigo}", texto, html, imagenes={"qr": qr_png(PREFIJO_QR_VISITANTE + codigo)}
    )


def contenido_acceso_empresa(empresa: str, email: str, password: str, feria: str, fechas: str) -> tuple[str, str]:
    url = f"{settings.frontend_url.rstrip('/')}/ingresar?rol=empresa"
    texto = (
        f"{empresa} participa en {feria} ({fechas}).\n\n"
        f"Entra a tu panel en {url}\nCorreo: {email}\nContraseña: {password}\n\n"
        "Te recomendamos cambiar la contraseña en Perfil después de entrar."
    )
    html = _plantilla(
        "acceso_empresa.html",
        {"empresa": empresa, "email": email, "password": password, "feria": feria, "fechas": fechas,
         "url_ingresar": url, "app": settings.mail_from_name},
    )
    return texto, html


def enviar_acceso_empresa(destino: str, empresa: str, password: str, feria: str, fechas: str) -> None:
    """Correo a la empresa con su correo de acceso y la contraseña que le asignó el organizador."""
    if not settings.smtp_user:
        print(f"[correo no configurado] Acceso de empresa para {destino} ({empresa}, {feria})", flush=True)
        return
    texto, html = contenido_acceso_empresa(empresa, destino, password, feria, fechas)
    enviar_correo(destino, f"Tu acceso a {settings.mail_from_name} para {feria}", texto, html)


def contenido_recordatorio(
    nombre: str, codigo: str, feria: str, fechas: str, lugar: str, qr_src: str = "cid:qr"
) -> tuple[str, str]:
    url = f"{settings.frontend_url.rstrip('/')}/ingresar?rol=visitante"
    lugar = lugar or "Por confirmar"
    texto = (
        f"Hola, {nombre}\n\nMañana empieza {feria}.\nCuándo: {fechas}\nDónde: {lugar}\n\n"
        f"Lleva tu código {codigo} (o el QR adjunto) para que las empresas registren tu visita.\n\n"
        f"Ver tu tarjeta en la app: {url}"
    )
    html = _plantilla(
        "recordatorio_feria.html",
        {"nombre": nombre, "codigo": codigo, "feria": feria, "fechas": fechas, "lugar": lugar, "qr_src": qr_src,
         "url_ingresar": url, "app": settings.mail_from_name},
    )
    return texto, html


def enviar_recordatorio_feria(destino: str, nombre: str, codigo: str, feria: str, fechas: str, lugar: str) -> None:
    """Recordatorio un día antes de la feria, con la tarjeta del visitante (código y QR)."""
    if not settings.smtp_user:
        print(f"[correo no configurado] Recordatorio de {feria} para {destino} ({codigo})", flush=True)
        return
    from .utils import PREFIJO_QR_VISITANTE

    texto, html = contenido_recordatorio(nombre, codigo, feria, fechas, lugar)
    enviar_correo(destino, f"Mañana empieza {feria}", texto, html, imagenes={"qr": qr_png(PREFIJO_QR_VISITANTE + codigo)})


def enviar_sin_fallar(funcion: Callable[..., None], *args) -> None:
    """Para tareas en segundo plano: un correo que falla se registra en el log y no afecta al registro."""
    try:
        funcion(*args)
    except Exception:  # noqa: BLE001 — cualquier fallo del correo se ignora a propósito
        log.exception("No se pudo enviar el correo (%s)", funcion.__name__)


if __name__ == "__main__":
    # Vista previa sin enviar nada:
    #   .\.venv\Scripts\python -m app.correo            (código de verificación)
    #   .\.venv\Scripts\python -m app.correo visitante  (bienvenida con QR)
    #   .\.venv\Scripts\python -m app.correo empresa    (acceso de empresa)
    #   .\.venv\Scripts\python -m app.correo recordatorio (un día antes de la feria)
    import sys
    import webbrowser

    tipo = sys.argv[1] if len(sys.argv) > 1 else "codigo"
    fechas = rango_fechas(date(2026, 10, 20), date(2026, 10, 22))
    if tipo == "visitante":
        qr = "data:image/png;base64," + base64.b64encode(qr_png("FERIABOT:V:FB-7K3PQX")).decode()
        html = contenido_bienvenida_visitante("María José", "FB-7K3PQX", "Expo Negocios 2026", fechas, qr)[1]
    elif tipo == "recordatorio":
        qr = "data:image/png;base64," + base64.b64encode(qr_png("FERIABOT:V:FB-7K3PQX")).decode()
        html = contenido_recordatorio(
            "María José", "FB-7K3PQX", "Expo Negocios 2026", fechas, "Centro de Convenciones, Quito", qr
        )[1]
    elif tipo == "empresa":
        html = contenido_acceso_empresa("Café Andino", "ventas@cafeandino.com", "cafe2026", "Expo Negocios 2026", fechas)[1]
    else:
        # Cambia "registro" por "ingreso" o "recuperar" para ver las otras versiones.
        html = contenido_codigo("482915", "registro")[1]
    destino = Path("vista_previa_correo.html").resolve()
    destino.write_text(html, encoding="utf-8")
    print(f"Vista previa guardada en {destino}")
    webbrowser.open(destino.as_uri())
