from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..correo import enviar_bienvenida_visitante, enviar_sin_fallar, rango_fechas
from ..database import DB
from ..models import CodigoVerificacion, Empresa, Inscripcion, Visitante
from ..schemas import CambioCorreo, CambioCorreoEnviar, Sesion, VisitanteActualizar, VisitanteCrear, VisitanteOut
from ..security import requiere, sesion_opcional, solo_propio
from ..utils import ahora, generar_codigo, leer_codigo_visitante, uid
from ..verificacion import crear_y_enviar, verificar
from .ferias import exigir_cupo, exigir_inscripcion, inscribir, obtener_feria

router = APIRouter(prefix="/visitantes", tags=["visitantes"])


def obtener_visitante(db: Session, visitante_id: str) -> Visitante:
    visitante = db.get(Visitante, visitante_id)
    if not visitante:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visitante no encontrado")
    return visitante


def buscar_por_codigo_o_email(db: Session, texto: str) -> Visitante | None:
    """Acepta el código de la tarjeta, el contenido del QR (FERIABOT:V:...) o el correo."""
    t = texto.strip()
    if "@" in t:
        return db.scalar(select(Visitante).where(Visitante.email == t.lower()))
    codigo = leer_codigo_visitante(t)
    return db.scalar(select(Visitante).where(Visitante.codigo == codigo)) if codigo else None


@router.get("", response_model=list[VisitanteOut], dependencies=[Depends(requiere("organizador"))])
def listar(db: DB, feria_id: Annotated[str | None, Query(alias="feriaId")] = None):
    """Con `feriaId`, solo los inscritos en esa feria (ordenados por fecha de inscripción)."""
    if feria_id:
        q = (
            select(Visitante)
            .join(Inscripcion, Inscripcion.visitante_id == Visitante.id)
            .where(Inscripcion.feria_id == feria_id)
            .order_by(Inscripcion.creado_en.desc())
        )
    else:
        q = select(Visitante).order_by(Visitante.creado_en.desc())
    return db.scalars(q).all()


@router.get("/buscar", response_model=VisitanteOut)
def buscar(
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "empresa"))],
    q: Annotated[str, Query(min_length=1, max_length=150)],
):
    """La empresa solo encuentra visitantes inscritos en su feria."""
    visitante = buscar_por_codigo_o_email(db, q)
    if not visitante:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos un visitante con ese código o correo.")
    if sesion.role == "empresa":
        empresa = db.get(Empresa, sesion.ref_id)
        if empresa:
            exigir_inscripcion(
                db, empresa.feria, visitante.id, f"{visitante.nombre} no está inscrito en «{empresa.feria.nombre}»."
            )
    return visitante


# ---------- Mi cuenta (el visitante sobre su propia cuenta) ----------
# Van antes de las rutas /{visitante_id} para que "me" no se tome como un id.

SesionVisitante = Annotated[Sesion, Depends(requiere("visitante"))]


def _correo_libre(db: Session, email: str, visitante: Visitante) -> None:
    if email == visitante.email:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese ya es el correo de tu cuenta.")
    if db.scalar(select(Visitante.id).where(Visitante.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo.")


def _proposito_cambio(visitante: Visitante) -> str:
    """El código queda atado al correo nuevo Y a la cuenta que lo pidió (otra cuenta no puede usarlo)."""
    return f"cambio_correo:{visitante.id}"  # cabe en los 30 caracteres de la columna


@router.patch("/me", response_model=VisitanteOut)
def actualizar_mi_cuenta(cambios: VisitanteActualizar, db: DB, sesion: SesionVisitante):
    """El visitante edita sus datos. Los campos que no se envían (o llegan en null) no cambian."""
    visitante = obtener_visitante(db, sesion.ref_id)
    for campo, valor in cambios.model_dump(exclude_unset=True).items():
        if valor is not None:
            setattr(visitante, campo, valor.strip() if isinstance(valor, str) else valor)
    if not visitante.nombre:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "nombre: no puede quedar vacío")
    db.commit()
    return visitante


@router.post("/me/correo/enviar-codigo", status_code=status.HTTP_204_NO_CONTENT)
def enviar_codigo_cambio_correo(data: CambioCorreoEnviar, db: DB, sesion: SesionVisitante):
    """Envía un código de 6 dígitos al correo nuevo para confirmar que es del visitante."""
    visitante = obtener_visitante(db, sesion.ref_id)
    email = data.email.lower()
    _correo_libre(db, email, visitante)
    crear_y_enviar(db, email, _proposito_cambio(visitante))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/correo", response_model=VisitanteOut)
def cambiar_correo(data: CambioCorreo, db: DB, sesion: SesionVisitante):
    """Cambia el correo de la cuenta con el código recibido en el correo nuevo."""
    visitante = obtener_visitante(db, sesion.ref_id)
    email = data.email.lower()
    _correo_libre(db, email, visitante)
    verificar(db, email, _proposito_cambio(visitante), data.codigo)
    visitante.email = email
    db.commit()
    return visitante


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def borrar_mi_cuenta(db: DB, sesion: SesionVisitante):
    """Borra la cuenta del visitante. Sus inscripciones, leads y vistas se borran por ON DELETE CASCADE."""
    visitante = obtener_visitante(db, sesion.ref_id)
    db.execute(delete(CodigoVerificacion).where(CodigoVerificacion.proposito == _proposito_cambio(visitante)))
    if visitante.email:
        db.execute(delete(CodigoVerificacion).where(CodigoVerificacion.email == visitante.email))
    db.delete(visitante)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Por id ----------


@router.get("/{visitante_id}", response_model=VisitanteOut)
def obtener(
    visitante_id: str,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "visitante"))],
):
    solo_propio(sesion, "visitante", visitante_id)
    return obtener_visitante(db, visitante_id)


@router.post("", response_model=VisitanteOut, status_code=status.HTTP_201_CREATED)
def crear(
    data: VisitanteCrear,
    db: DB,
    sesion: Annotated[Sesion | None, Depends(sesion_opcional)],
    tareas: BackgroundTasks,
):
    """Registro del visitante en una feria (también lo usa el organizador en la entrada).

    Crea la cuenta del visitante y lo inscribe en `feriaId`. En el registro público con correo se exige el
    código enviado a ese correo; el organizador no lo necesita. Si quien ya tiene cuenta quiere entrar a otra
    feria, debe ingresar e inscribirse (POST /inscripciones); el organizador lo inscribe directamente aquí.
    """
    if not data.acepta_politica:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Debes aceptar la política de privacidad y tratamiento de datos."
        )
    es_org = sesion is not None and sesion.role == "organizador"
    feria = obtener_feria(db, data.feria_id)
    if not es_org and not feria.abierta:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Las inscripciones para «{feria.nombre}» están cerradas.")
    if not es_org:
        # Antes de crear la cuenta y de gastar el código de verificación.
        exigir_cupo(db, feria)

    email = data.email or None
    existente = db.scalar(select(Visitante).where(Visitante.email == email)) if email else None
    if existente:
        if not es_org:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Ya tienes una cuenta con ese correo. Ingresa con tu correo para inscribirte a esta feria.",
            )
        inscribir(db, feria, existente.id, forzar=True)
        _registrar_aceptacion(existente)
        db.commit()
        return existente
    if email and not es_org:
        if not data.codigo_verificacion:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta el código de verificación enviado a tu correo.")
        verificar(db, email, "registro", data.codigo_verificacion)

    codigo = generar_codigo()
    while db.scalar(select(Visitante.id).where(Visitante.codigo == codigo)):
        codigo = generar_codigo()

    visitante = Visitante(
        **data.model_dump(exclude={"email", "codigo_verificacion", "feria_id", "acepta_politica"}), email=email, id=uid("vis-"), codigo=codigo
    )
    _registrar_aceptacion(visitante)
    db.add(visitante)
    db.flush()
    inscribir(db, feria, visitante.id, forzar=es_org)
    db.commit()
    if email:
        # En segundo plano: el registro responde de inmediato y un correo fallido no lo afecta.
        tareas.add_task(
            enviar_sin_fallar, enviar_bienvenida_visitante,
            email, visitante.nombre, visitante.codigo, feria.nombre, rango_fechas(feria.fecha_inicio, feria.fecha_fin),
        )
    return visitante


def _registrar_aceptacion(visitante: Visitante) -> None:
    """Guarda cuándo y qué versión de la política aceptó (se actualiza si acepta una versión nueva)."""
    if visitante.politica_version != settings.politica_version:
        visitante.politica_aceptada_en = ahora()
        visitante.politica_version = settings.politica_version


@router.delete("/{visitante_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requiere("organizador"))])
def eliminar(visitante_id: str, db: DB):
    # Sus leads y vistas se borran por ON DELETE CASCADE.
    db.delete(obtener_visitante(db, visitante_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
