import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from .cifrado import revisar_clave as revisar_clave_cifrado
from .config import revisar_clave_jwt, settings
from .errores import traducir
from .limites import permitir_peticion
from .database import Base, SessionLocal, engine
from .migraciones import migrar
from .routers import admin, auth, demo, empresas, ferias, leads, legal, sitio, solicitudes, visitantes, vistas
from .planes import crear_planes_iniciales
from .seed import crear_organizador_inicial, crear_superadmin_inicial


@asynccontextmanager
async def lifespan(_: FastAPI):
    aviso = revisar_clave_jwt()
    if aviso:
        log.warning("ATENCIÓN: %s", aviso)
    aviso = revisar_clave_cifrado()
    if aviso:
        log.warning("ATENCIÓN: %s", aviso)
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
async def limite_general(request: Request, siguiente):
    """Demasiadas peticiones seguidas desde la misma IP → 429 (frena scripts y recargas en bucle)."""
    if request.method != "OPTIONS" and request.url.path != "/health":
        ok, espera = permitir_peticion(request)
        if not ok:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Demasiadas solicitudes seguidas. Espera {espera} segundos y vuelve a intentarlo."},
                headers={"Retry-After": str(espera)},
            )
    return await siguiente(request)


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
    # La API solo devuelve datos: nada de scripts, estilos ni marcos si alguien abre una respuesta en el navegador.
    if respuesta.headers.get("content-type", "").startswith("application/json"):
        respuesta.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    respuesta.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), payment=()")
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
    texto = str(exc)
    if "max_allowed_packet" in texto or "(1153" in texto or "(1301" in texto:
        # MySQL rechazó el dato por tamaño (max_allowed_packet): el archivo es más grande de lo que acepta el servidor.
        log.error("MySQL rechazó un dato por tamaño en %s: sube max_allowed_packet (my.ini) a 16M", request.url.path)
        return JSONResponse(
            status_code=413,
            content={"detail": "El archivo es demasiado grande para el servidor. Prueba con una imagen más liviana o una captura de pantalla."},
        )
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
