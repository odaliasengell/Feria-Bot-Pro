from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import DB
from ..models import Visitante
from ..schemas import Sesion, VisitanteCrear, VisitanteOut
from ..security import requiere, sesion_opcional, solo_propio
from ..utils import generar_codigo, leer_codigo_visitante, uid
from ..verificacion import verificar

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
def listar(db: DB):
    return db.scalars(select(Visitante).order_by(Visitante.creado_en.desc())).all()


@router.get("/buscar", response_model=VisitanteOut, dependencies=[Depends(requiere("organizador", "empresa"))])
def buscar(db: DB, q: Annotated[str, Query(min_length=1, max_length=150)]):
    visitante = buscar_por_codigo_o_email(db, q)
    if not visitante:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos un visitante con ese código o correo.")
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
    """Registro público del visitante al ingresar a la feria (también lo usa el organizador).

    En el registro público con correo se exige el código enviado a ese correo; el organizador no lo necesita.
    """
    email = data.email or None
    if email and db.scalar(select(Visitante.id).where(Visitante.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un visitante registrado con ese correo.")
    if email and (sesion is None or sesion.role != "organizador"):
        if not data.codigo_verificacion:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta el código de verificación enviado a tu correo.")
        verificar(db, email, "registro", data.codigo_verificacion)

    codigo = generar_codigo()
    while db.scalar(select(Visitante.id).where(Visitante.codigo == codigo)):
        codigo = generar_codigo()

    visitante = Visitante(
        **data.model_dump(exclude={"email", "codigo_verificacion"}), email=email, id=uid("vis-"), codigo=codigo
    )
    db.add(visitante)
    db.commit()
    return visitante


@router.delete("/{visitante_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requiere("organizador"))])
def eliminar(visitante_id: str, db: DB):
    # Sus leads y vistas se borran por ON DELETE CASCADE.
    db.delete(obtener_visitante(db, visitante_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
