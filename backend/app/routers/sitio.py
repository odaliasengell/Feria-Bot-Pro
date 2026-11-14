"""robots.txt y sitemap.xml para los buscadores, con las páginas públicas y las ferias publicadas.

Usan FRONTEND_URL como dominio. En producción el hosting del frontend debe reenviar /robots.txt y
/sitemap.xml a la API (en desarrollo lo hace el proxy de Vite).
"""

from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from sqlalchemy import select

from ..config import settings
from ..database import DB
from ..models import Empresa, Feria

router = APIRouter(tags=["sistema"], include_in_schema=False)

PAGINAS = [
    ("/", "weekly", "1.0"),
    ("/ferias", "daily", "0.9"),
    ("/registro", "weekly", "0.8"),
    ("/contratar", "monthly", "0.7"),
    ("/nosotros", "monthly", "0.6"),
    ("/privacidad", "yearly", "0.3"),
    ("/tratamiento-datos", "yearly", "0.3"),
    ("/aviso-legal", "yearly", "0.3"),
    ("/cookies", "yearly", "0.3"),
]

# Zonas privadas o sin valor para un buscador.
PRIVADAS = ["/organizador", "/empresa", "/visitante", "/ingresar", "/recuperar", "/api/"]


def _base() -> str:
    return settings.frontend_url.rstrip("/")


@router.get("/robots.txt", response_class=Response)
def robots():
    lineas = ["User-agent: *", "Allow: /", *(f"Disallow: {p}" for p in PRIVADAS), "", f"Sitemap: {_base()}/sitemap.xml", ""]
    return Response("\n".join(lineas), media_type="text/plain; charset=utf-8")


@router.get("/sitemap.xml", response_class=Response)
def sitemap(db: DB):
    base = _base()
    urls: list[str] = []

    def url(ruta: str, frecuencia: str, prioridad: str, modificado: str | None = None) -> None:
        partes = [f"<loc>{escape(base + ruta)}</loc>"]
        if modificado:
            partes.append(f"<lastmod>{modificado}</lastmod>")
        partes += [f"<changefreq>{frecuencia}</changefreq>", f"<priority>{prioridad}</priority>"]
        urls.append("  <url>" + "".join(partes) + "</url>")

    for ruta, frecuencia, prioridad in PAGINAS:
        url(ruta, frecuencia, prioridad)
    for f in db.scalars(select(Feria).order_by(Feria.fecha_inicio.desc())):
        vigente = f.estado != "finalizada"
        url(f"/ferias/{f.id}", "daily" if vigente else "yearly", "0.8" if vigente else "0.4", f.creado_en.date().isoformat())
    for e in db.scalars(select(Empresa).order_by(Empresa.nombre)):
        url(f"/ficha/{e.id}", "weekly", "0.5")

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n"
    )
    return Response(xml, media_type="application/xml; charset=utf-8")
