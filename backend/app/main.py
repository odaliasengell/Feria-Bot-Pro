import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from .config import settings
from .errores import traducir
from .database import Base, SessionLocal, engine
from .migraciones import migrar
from .routers import admin, auth, demo, empresas, ferias, leads, legal, sitio, solicitudes, visitantes, vistas
from .planes import crear_planes_iniciales
from .seed import crear_organizador_inicial, crear_superadmin_inicial


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    migrar(engine)
    with SessionLocal() as db:
        crear_planes_iniciales(db)
        crear_superadmin_inicial(db)
        crear_organizador_inicial(db)
    yield


log = logging.getLogger("feriabot")

app = FastAPI(title="FeriaBot Pro API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    # El frontend (otro origen) lee el nombre del archivo en las descargas, como el Excel de leads.
    expose_headers=["Content-Disposition"],
)


_LOCALES = {"localhost", "127.0.0.1", "::1"}


@app.middleware("http")
async def https_y_cabeceras(request: Request, siguiente):
    """Con FORZAR_HTTPS redirige http → https (detrás de un proxy, respetando X-Forwarded-Proto) y envía HSTS.
    Siempre agrega cabeceras de seguridad básicas."""
    if settings.forzar_https and request.url.hostname not in _LOCALES:
        esquema = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
        if esquema == "http":
            return RedirectResponse(str(request.url.replace(scheme="https")), status_code=308)
    respuesta = await siguiente(request)
    respuesta.headers.setdefault("X-Content-Type-Options", "nosniff")
    respuesta.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    respuesta.headers.setdefault("X-Frame-Options", "DENY")
    if settings.forzar_https:
        respuesta.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return respuesta


@app.exception_handler(RequestValidationError)
async def error_validacion(_: Request, exc: RequestValidationError):
    """`detail` en español y legible (el frontend muestra `error.message`); el detalle técnico va en `errors`."""
    partes = list(dict.fromkeys(traducir(e) for e in exc.errors()))
    return JSONResponse(status_code=422, content={"detail": " ".join(partes), "errors": jsonable_encoder(exc.errors())})


@app.exception_handler(Exception)
async def error_inesperado(request: Request, exc: Exception):
    """Cualquier error no previsto: se registra completo en la consola y el usuario recibe un mensaje claro."""
    log.exception("Error inesperado en %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Ocurrió un error inesperado en el servidor. Intenta de nuevo en unos segundos."})


for r in (auth, admin, solicitudes, ferias, empresas, visitantes, leads, vistas, demo, legal, sitio):
    app.include_router(r.router)


@app.get("/politica", tags=["sistema"])
def politica():
    """Versión vigente de la política de privacidad, para mostrarla junto a la casilla de aceptación."""
    return {"version": settings.politica_version}


@app.get("/health", tags=["sistema"])
def health():
    return {"ok": True}
