from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from .config import settings
from .database import Base, SessionLocal, engine
from .migraciones import migrar
from .routers import auth, demo, empresas, ferias, leads, legal, sitio, visitantes, vistas
from .seed import crear_organizador_inicial


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    migrar(engine)
    with SessionLocal() as db:
        crear_organizador_inicial(db)
    yield


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
    """`detail` como texto legible (el frontend muestra `error.message`); el detalle completo va en `errors`."""
    partes = []
    for e in exc.errors():
        campo = ".".join(str(x) for x in e["loc"] if x not in ("body", "query", "path"))
        if e["type"] == "value_error":
            # Mensajes propios (RUC, etc.): ya están escritos para el usuario.
            partes.append(e["msg"].removeprefix("Value error, "))
        else:
            partes.append(f"{campo}: {e['msg']}" if campo else e["msg"])
    return JSONResponse(status_code=422, content={"detail": "; ".join(partes), "errors": jsonable_encoder(exc.errors())})


for r in (auth, ferias, empresas, visitantes, leads, vistas, demo, legal, sitio):
    app.include_router(r.router)


@app.get("/politica", tags=["sistema"])
def politica():
    """Versión vigente de la política de privacidad, para mostrarla junto a la casilla de aceptación."""
    return {"version": settings.politica_version}


@app.get("/health", tags=["sistema"])
def health():
    return {"ok": True}
