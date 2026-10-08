from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import Base, SessionLocal, engine
from .migraciones import migrar
from .routers import auth, demo, empresas, ferias, leads, visitantes, vistas
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
)


@app.exception_handler(RequestValidationError)
async def error_validacion(_: Request, exc: RequestValidationError):
    """`detail` como texto legible (el frontend muestra `error.message`); el detalle completo va en `errors`."""
    partes = []
    for e in exc.errors():
        campo = ".".join(str(x) for x in e["loc"] if x not in ("body", "query", "path"))
        partes.append(f"{campo}: {e['msg']}" if campo else e["msg"])
    return JSONResponse(status_code=422, content={"detail": "; ".join(partes), "errors": jsonable_encoder(exc.errors())})


for r in (auth, ferias, empresas, visitantes, leads, vistas, demo):
    app.include_router(r.router)


@app.get("/politica", tags=["sistema"])
def politica():
    """Versión vigente de la política de privacidad, para mostrarla junto a la casilla de aceptación."""
    return {"version": settings.politica_version}


@app.get("/health", tags=["sistema"])
def health():
    return {"ok": True}
