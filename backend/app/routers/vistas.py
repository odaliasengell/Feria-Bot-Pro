from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..database import DB
from ..models import VistaFicha
from ..schemas import Sesion, VistaDetalleOut, VistaOut, VistaRegistrar
from ..security import requiere, solo_propio
from ..utils import ahora, uid
from .empresas import obtener_empresa
from .leads import alcance
from .visitantes import obtener_visitante

router = APIRouter(prefix="/vistas", tags=["vistas"])


@router.post("", response_model=VistaOut)
def registrar(
    data: VistaRegistrar,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "visitante"))],
):
    """El visitante abrió la ficha de una empresa escaneando el QR del stand."""
    solo_propio(sesion, "visitante", data.visitante_id)
    obtener_visitante(db, data.visitante_id)
    obtener_empresa(db, data.empresa_id)

    vista = db.scalar(
        select(VistaFicha).where(VistaFicha.visitante_id == data.visitante_id, VistaFicha.empresa_id == data.empresa_id)
    )
    if vista:
        vista.creado_en = ahora()
    else:
        vista = VistaFicha(id=uid("vf-"), **data.model_dump())
        db.add(vista)
    db.commit()
    return vista


@router.get("", response_model=list[VistaDetalleOut])
def listar(
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere())],
    visitante_id: Annotated[str | None, Query(alias="visitanteId")] = None,
    empresa_id: Annotated[str | None, Query(alias="empresaId")] = None,
):
    empresa_id, visitante_id = alcance(sesion, empresa_id, visitante_id)
    q = (
        select(VistaFicha)
        .options(selectinload(VistaFicha.empresa), selectinload(VistaFicha.visitante))
        .order_by(VistaFicha.creado_en.desc())
    )
    if visitante_id:
        q = q.where(VistaFicha.visitante_id == visitante_id)
    if empresa_id:
        q = q.where(VistaFicha.empresa_id == empresa_id)
    return db.scalars(q).all()
