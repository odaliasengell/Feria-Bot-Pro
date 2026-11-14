import base64
import binascii
import html as html_lib
import io
import logging
import re
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


# Imagen adjunta: PNG en bytes, o (bytes, subtipo) para otros formatos ("jpeg", "webp").
Imagen = bytes | tuple[bytes, str]


def enviar_correo(destino: str, asunto: str, texto: str, html: str, imagenes: dict[str, Imagen] | None = None) -> None:
    """`imagenes` = {cid: imagen}: se adjuntan junto al HTML, que las muestra con src="cid:<cid>"."""
    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = formataddr((settings.mail_from_name, settings.smtp_user))
    msg["To"] = destino
    msg.set_content(texto)
    msg.add_alternative(html, subtype="html")
    if imagenes:
        parte_html = msg.get_payload()[1]
        for cid, imagen in imagenes.items():
            datos, subtipo = (imagen, "png") if isinstance(imagen, bytes) else imagen
            extension = "jpg" if subtipo == "jpeg" else subtipo
            parte_html.add_related(datos, maintype="image", subtype=subtipo, cid=f"<{cid}>", filename=f"{cid}.{extension}")

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


_BLOQUE_PORTADA = re.compile(r"[ \t]*<!--PORTADA.*?<!--/PORTADA-->\n?", re.S)
_DATA_URL = re.compile(r"data:image/(jpeg|png|webp);base64,(.+)", re.S)


def _plantilla(nombre: str, variables: dict[str, str]) -> str:
    """Rellena la plantilla escapando los valores. Sin `portada_src` se quita el bloque de la portada."""
    texto = (PLANTILLAS / nombre).read_text(encoding="utf-8")
    if not variables.get("portada_src"):
        texto = _BLOQUE_PORTADA.sub("", texto)
    seguras = {k: html_lib.escape(str(v)) for k, v in variables.items()}
    return Template(texto).safe_substitute(seguras)


def portada_para_correo(portada: str | None) -> tuple[str | None, dict[str, Imagen]]:
    """(src para el <img>, imágenes a adjuntar). Las data URL se adjuntan (los clientes de correo bloquean
    `data:` en el HTML); una URL https se enlaza tal cual. Sin portada (o inválida): (None, {})."""
    if not portada:
        return None, {}
    if portada.startswith("https://"):
        return portada, {}
    m = _DATA_URL.fullmatch(portada.strip())
    if not m:
        return None, {}
    try:
        datos = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        return None, {}
    return "cid:portada", {"portada": (datos, m.group(1))}


def _vars_portada(portada_src: str | None, portada_alt: str, feria: str) -> dict[str, str]:
    return {"portada_src": portada_src or "", "portada_alt": portada_alt.strip() or f"Portada de {feria}"}


def contenido_bienvenida_visitante(
    nombre: str, codigo: str, feria: str, fechas: str, qr_src: str = "cid:qr", portada_src: str | None = None, portada_alt: str = ""
) -> tuple[str, str]:
    url = f"{settings.frontend_url.rstrip('/')}/ingresar?rol=visitante"
    texto = (
        f"Hola, {nombre}\n\nYa estás inscrito en {feria} ({fechas}).\n"
        f"Tu código de visitante es {codigo}. Preséntalo (o el QR adjunto) en los stands.\n\n"
        f"Ver tu tarjeta en la app: {url}"
    )
    html = _plantilla(
        "bienvenida_visitante.html",
        {"nombre": nombre, "codigo": codigo, "feria": feria, "fechas": fechas, "qr_src": qr_src,
         "url_ingresar": url, "app": settings.mail_from_name, **_vars_portada(portada_src, portada_alt, feria)},
    )
    return texto, html


def enviar_bienvenida_visitante(
    destino: str, nombre: str, codigo: str, feria: str, fechas: str, portada: str | None = None, portada_alt: str = ""
) -> None:
    """Correo con el código FB-XXXXXX y la imagen del QR (contenido FERIABOT:V:<codigo>)."""
    if not settings.smtp_user:
        print(f"[correo no configurado] Bienvenida para {destino}: tarjeta {codigo} ({feria})", flush=True)
        return
    from .utils import PREFIJO_QR_VISITANTE

    portada_src, imagenes = portada_para_correo(portada)
    texto, html = contenido_bienvenida_visitante(nombre, codigo, feria, fechas, portada_src=portada_src, portada_alt=portada_alt)
    imagenes["qr"] = qr_png(PREFIJO_QR_VISITANTE + codigo)
    enviar_correo(destino, f"Tu tarjeta para {feria}: {codigo}", texto, html, imagenes=imagenes)


def contenido_acceso_empresa(
    empresa: str, email: str, password: str, feria: str, fechas: str, portada_src: str | None = None, portada_alt: str = ""
) -> tuple[str, str]:
    url = f"{settings.frontend_url.rstrip('/')}/ingresar?rol=empresa"
    texto = (
        f"{empresa} participa en {feria} ({fechas}).\n\n"
        f"Entra a tu panel en {url}\nCorreo: {email}\nContraseña: {password}\n\n"
        "Te recomendamos cambiar la contraseña en Perfil después de entrar."
    )
    html = _plantilla(
        "acceso_empresa.html",
        {"empresa": empresa, "email": email, "password": password, "feria": feria, "fechas": fechas,
         "url_ingresar": url, "app": settings.mail_from_name, **_vars_portada(portada_src, portada_alt, feria)},
    )
    return texto, html


def enviar_acceso_empresa(
    destino: str, empresa: str, password: str, feria: str, fechas: str, portada: str | None = None, portada_alt: str = ""
) -> None:
    """Correo a la empresa con su correo de acceso y la contraseña que le asignó el organizador."""
    if not settings.smtp_user:
        print(f"[correo no configurado] Acceso de empresa para {destino} ({empresa}, {feria})", flush=True)
        return
    portada_src, imagenes = portada_para_correo(portada)
    texto, html = contenido_acceso_empresa(empresa, destino, password, feria, fechas, portada_src, portada_alt)
    enviar_correo(destino, f"Tu acceso a {settings.mail_from_name} para {feria}", texto, html, imagenes=imagenes)


def _vigencia(inicio: date | None, fin: date | None) -> str:
    if inicio and fin:
        return f"del {inicio.strftime('%d/%m/%Y')} al {fin.strftime('%d/%m/%Y')}"
    return f"hasta el {fin.strftime('%d/%m/%Y')}" if fin else "sin fecha de fin"


def contenido_acceso_organizador(
    organizador: str, email: str, password: str, plan: str, inicio: date | None, fin: date | None
) -> tuple[str, str]:
    url = f"{settings.frontend_url.rstrip('/')}/ingresar?rol=organizador"
    vigencia = _vigencia(inicio, fin)
    texto = (
        f"Bienvenido, {organizador}. Tu plan {plan} está activo ({vigencia}).\n\n"
        f"Entra a tu panel en {url}\nCorreo: {email}\nContraseña: {password}\n\n"
        "Te recomendamos cambiar la contraseña en Perfil después de entrar."
    )
    html = _plantilla(
        "acceso_organizador.html",
        {"organizador": organizador, "email": email, "password": password, "plan": plan, "vigencia": vigencia,
         "url_ingresar": url, "app": settings.mail_from_name},
    )
    return texto, html


def enviar_acceso_organizador(
    destino: str, organizador: str, password: str, plan: str, inicio: date | None, fin: date | None
) -> None:
    """Correo al organizador nuevo con su acceso y su plan."""
    if not settings.smtp_user:
        print(f"[correo no configurado] Acceso de organizador para {destino} ({organizador}, plan {plan})", flush=True)
        return
    texto, html = contenido_acceso_organizador(organizador, destino, password, plan, inicio, fin)
    enviar_correo(destino, f"Tu cuenta de organizador en {settings.mail_from_name}", texto, html)


def _html_simple(titulo: str, parrafos: list[str], boton: tuple[str, str] | None = None) -> str:
    """Correo sencillo con la marca (para avisos de solicitudes). Los párrafos ya vienen escapados."""
    fuente = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
    cuerpo = "".join(f'<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475269;">{p}</p>' for p in parrafos)
    if boton:
        cuerpo += (
            f'<p style="margin:20px 0 0;"><a href="{html_lib.escape(boton[1])}" style="display:inline-block;background-color:#0a0e1c;'
            f'color:#ffffff;{fuente}font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">'
            f"{html_lib.escape(boton[0])}</a></p>"
        )
    return (
        '<!doctype html><html lang="es"><body style="margin:0;padding:0;background-color:#f8f9fc;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;"><tr>'
        '<td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="max-width:480px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">'
        f'<tr><td style="background-color:#0a0e1c;padding:22px 32px;{fuente}font-size:20px;font-weight:700;color:#ffffff;">'
        'FeriaBot <span style="color:#70ffaf;">Pro</span></td></tr>'
        '<tr><td style="height:4px;line-height:4px;font-size:0;background-color:#70ffaf;">&nbsp;</td></tr>'
        f'<tr><td style="padding:32px;{fuente}"><h1 style="margin:0 0 14px;font-size:21px;color:#0a0e1c;">{html_lib.escape(titulo)}</h1>'
        f"{cuerpo}</td></tr></table></td></tr></table></body></html>"
    )


def _enviar_simple(destino: str, asunto: str, titulo: str, parrafos: list[str], boton: tuple[str, str] | None = None) -> None:
    if not settings.smtp_user:
        print(f"[correo no configurado] {asunto} para {destino}", flush=True)
        return
    texto = "\n\n".join(re.sub(r"<[^>]+>", "", p) for p in [titulo, *parrafos])
    if boton:
        texto += f"\n\n{boton[0]}: {boton[1]}"
    enviar_correo(destino, asunto, texto, _html_simple(titulo, parrafos, boton))


def _usd(monto: float) -> str:
    return f"${monto:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def enviar_solicitud_recibida(destino: str, nombre: str, plan: str, periodo: str, monto: float) -> None:
    """Al cliente: recibimos su solicitud y el comprobante; un encargado confirmará el pago."""
    e = html_lib.escape
    _enviar_simple(
        destino, f"Recibimos tu solicitud del plan {plan}", "Recibimos tu solicitud",
        [
            f"Hola, <strong>{e(nombre)}</strong>. Recibimos tu solicitud del plan <strong>{e(plan)}</strong> "
            f"({e(periodo)}, {e(_usd(monto))}) y tu comprobante de transferencia.",
            "Un encargado de FeriaBot Pro confirmará el pago y te enviaremos por correo el acceso a tu panel de organizador.",
        ],
    )


def enviar_aviso_solicitud(destino: str, nombre: str, plan: str, periodo: str, monto: float) -> None:
    """Al equipo de FeriaBot Pro: hay una solicitud nueva por revisar."""
    e = html_lib.escape
    _enviar_simple(
        destino, f"Nueva solicitud: {nombre} · plan {plan}", "Nueva solicitud por revisar",
        [f"<strong>{e(nombre)}</strong> solicitó el plan <strong>{e(plan)}</strong> ({e(periodo)}, {e(_usd(monto))}) y subió su comprobante."],
        ("Revisar solicitudes", f"{settings.frontend_url.rstrip('/')}/admin/solicitudes"),
    )


def enviar_solicitud_rechazada(destino: str, nombre: str, plan: str, motivo: str) -> None:
    e = html_lib.escape
    _enviar_simple(
        destino, f"Tu solicitud del plan {plan}", "No pudimos confirmar tu pago",
        [
            f"Hola, <strong>{e(nombre)}</strong>. Revisamos tu solicitud del plan <strong>{e(plan)}</strong> y no pudimos aprobarla.",
            f"Motivo: {e(motivo)}",
            "Si crees que es un error, responde a este correo o envía una nueva solicitud con el comprobante correcto.",
        ],
        ("Ver planes", f"{settings.frontend_url.rstrip('/')}/#planes"),
    )


def contenido_recordatorio(
    nombre: str,
    codigo: str,
    feria: str,
    fechas: str,
    lugar: str,
    qr_src: str = "cid:qr",
    portada_src: str | None = None,
    portada_alt: str = "",
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
         "url_ingresar": url, "app": settings.mail_from_name, **_vars_portada(portada_src, portada_alt, feria)},
    )
    return texto, html


def enviar_recordatorio_feria(
    destino: str,
    nombre: str,
    codigo: str,
    feria: str,
    fechas: str,
    lugar: str,
    portada: str | None = None,
    portada_alt: str = "",
) -> None:
    """Recordatorio un día antes de la feria, con la tarjeta del visitante (código y QR)."""
    if not settings.smtp_user:
        print(f"[correo no configurado] Recordatorio de {feria} para {destino} ({codigo})", flush=True)
        return
    from .utils import PREFIJO_QR_VISITANTE

    portada_src, imagenes = portada_para_correo(portada)
    texto, html = contenido_recordatorio(nombre, codigo, feria, fechas, lugar, portada_src=portada_src, portada_alt=portada_alt)
    imagenes["qr"] = qr_png(PREFIJO_QR_VISITANTE + codigo)
    enviar_correo(destino, f"Mañana empieza {feria}", texto, html, imagenes=imagenes)


def enviar_sin_fallar(funcion: Callable[..., None], *args, **kwargs) -> None:
    """Para tareas en segundo plano: un correo que falla se registra en el log y no afecta al registro."""
    try:
        funcion(*args, **kwargs)
    except Exception:  # noqa: BLE001 — cualquier fallo del correo se ignora a propósito
        log.exception("No se pudo enviar el correo (%s)", funcion.__name__)


if __name__ == "__main__":
    # Vista previa sin enviar nada:
    #   .\.venv\Scripts\python -m app.correo            (código de verificación)
    #   .\.venv\Scripts\python -m app.correo visitante  (bienvenida con QR)
    #   .\.venv\Scripts\python -m app.correo empresa    (acceso de empresa)
    #   .\.venv\Scripts\python -m app.correo recordatorio (un día antes de la feria)
    # Con portada: agrega el id de una feria (usa su nombre, fechas, lugar y portada de la base) o la ruta de
    # una imagen, por ejemplo:  ... app.correo recordatorio feria-abc123   o   ... app.correo visitante foto.jpg
    import mimetypes
    import sys
    import webbrowser

    tipo = sys.argv[1] if len(sys.argv) > 1 else "codigo"
    extra = sys.argv[2] if len(sys.argv) > 2 else None
    nombre_feria, lugar = "Expo Negocios 2026", "Centro de Convenciones, Quito"
    fechas = rango_fechas(date(2026, 10, 20), date(2026, 10, 22))
    portada, alt = None, ""
    if extra and Path(extra).is_file():
        mime = mimetypes.guess_type(extra)[0] or "image/jpeg"
        portada = f"data:{mime};base64," + base64.b64encode(Path(extra).read_bytes()).decode()
    elif extra:
        from .database import SessionLocal
        from .models import Feria

        with SessionLocal() as db:
            f = db.get(Feria, extra)
            if not f:
                sys.exit(f"No existe la feria «{extra}».")
            nombre_feria, lugar, portada, alt = f.nombre, f.lugar, f.portada, f.portada_alt
            fechas = rango_fechas(f.fecha_inicio, f.fecha_fin)
        if not portada:
            print("Esa feria no tiene portada: el correo se ve sin imagen.")
    # En la vista previa el navegador sí muestra data URL; en el correo real la portada va adjunta.
    vista_portada = portada if portada and (portada.startswith("https://") or _DATA_URL.fullmatch(portada)) else None
    qr = "data:image/png;base64," + base64.b64encode(qr_png("FERIABOT:V:FB-7K3PQX")).decode()
    if tipo == "visitante":
        html = contenido_bienvenida_visitante("María José", "FB-7K3PQX", nombre_feria, fechas, qr, vista_portada, alt)[1]
    elif tipo == "recordatorio":
        html = contenido_recordatorio("María José", "FB-7K3PQX", nombre_feria, fechas, lugar, qr, vista_portada, alt)[1]
    elif tipo == "empresa":
        html = contenido_acceso_empresa(
            "Café Andino", "ventas@cafeandino.com", "cafe2026", nombre_feria, fechas, vista_portada, alt
        )[1]
    else:
        # Cambia "registro" por "ingreso" o "recuperar" para ver las otras versiones.
        html = contenido_codigo("482915", "registro")[1]
    destino = Path("vista_previa_correo.html").resolve()
    destino.write_text(html, encoding="utf-8")
    print(f"Vista previa guardada en {destino}")
    webbrowser.open(destino.as_uri())
