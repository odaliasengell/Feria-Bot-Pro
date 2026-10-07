from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import DB
from ..models import Empresa, Inscripcion, Visitante
from ..schemas import Sesion, VisitanteCrear, VisitanteOut
from ..security import requiere, sesion_opcional, solo_propio
from ..utils import generar_codigo, leer_codigo_visitante, uid
from ..verificacion import verificar
from .ferias import exigir_inscripcion, inscribir, obtener_feria

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


@router.get("/{visitante_id}", response_model=VisitanteOut)
def obtener(
    visitante_id: str,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "visitante"))],
):
    solo_propio(sesion, "visitante", visitante_id)
    return obtener_visitante(db, visitante_id)


@router.post("", response_model=VisitanteOut, status_code=status.HTTP_201_CREATED)
def crear(data: VisitanteCrear, db: DB, sesion: Annotated[Sesion | None, Depends(sesion_opcional)]):
    """Registro del visitante en una feria (también lo usa el organizador en la entrada).

    Crea la cuenta del visitante y lo inscribe en `feriaId`. En el registro público con correo se exige el
    código enviado a ese correo; el organizador no lo necesita. Si quien ya tiene cuenta quiere entrar a otra
    feria, debe ingresar e inscribirse (POST /inscripciones); el organizador lo inscribe directamente aquí.
    """
    es_org = sesion is not None and sesion.role == "organizador"
    feria = obtener_feria(db, data.feria_id)
    if not es_org and not feria.abierta:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Las inscripciones para «{feria.nombre}» están cerradas.")

    email = data.email or None
    existente = db.scalar(select(Visitante).where(Visitante.email == email)) if email else None
    if existente:
        if not es_org:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Ya tienes una cuenta con ese correo. Ingresa con tu correo para inscribirte a esta feria.",
            )
        inscribir(db, feria, existente.id, forzar=True)
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
        **data.model_dump(exclude={"email", "codigo_verificacion", "feria_id"}), email=email, id=uid("vis-"), codigo=codigo
    )
    db.add(visitante)
    db.flush()
    inscribir(db, feria, visitante.id, forzar=es_org)
    db.commit()
    return visitante


@router.delete("/{visitante_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requiere("organizador"))])
def eliminar(visitante_id: str, db: DB):
    # Sus leads y vistas se borran por ON DELETE CASCADE.
    db.delete(obtener_visitante(db, visitante_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
