import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from string import Template

from .config import settings

log = logging.getLogger("feriabot.correo")
PLANTILLAS = Path(__file__).parent / "plantillas"


class CorreoError(Exception):
    pass


def enviar_correo(destino: str, asunto: str, texto: str, html: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = formataddr((settings.mail_from_name, settings.smtp_user))
    msg["To"] = destino
    msg.set_content(texto)
    msg.add_alternative(html, subtype="html")

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


if __name__ == "__main__":
    # Vista previa del correo con el código: .\.venv\Scripts\python -m app.correo
    import webbrowser

    destino = Path("vista_previa_correo.html").resolve()
    # Cambia "registro" por "ingreso" o "recuperar" para ver las otras versiones.
    destino.write_text(contenido_codigo("482915", "registro")[1], encoding="utf-8")
    print(f"Vista previa guardada en {destino}")
    webbrowser.open(destino.as_uri())
