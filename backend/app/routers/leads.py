from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..database import DB
from ..models import Empresa, Lead
from ..schemas import LeadDetalleOut, LeadGuardar, LeadOut, Sesion
from ..security import requiere, solo_propio
from ..utils import ahora, uid
from .empresas import obtener_empresa
from .ferias import exigir_inscripcion
from .visitantes import obtener_visitante

router = APIRouter(prefix="/leads", tags=["leads"])


def alcance(sesion: Sesion, empresa_id: str | None, visitante_id: str | None) -> tuple[str | None, str | None]:
    """Una empresa solo ve lo suyo y un visitante solo lo propio; el organizador ve todo."""
    if sesion.role == "empresa":
        empresa_id = sesion.ref_id
    elif sesion.role == "visitante":
        visitante_id = sesion.ref_id
    return empresa_id, visitante_id


@router.get("", response_model=list[LeadDetalleOut])
def listar(
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere())],
    empresa_id: Annotated[str | None, Query(alias="empresaId")] = None,
    visitante_id: Annotated[str | None, Query(alias="visitanteId")] = None,
    feria_id: Annotated[str | None, Query(alias="feriaId")] = None,
):
    empresa_id, visitante_id = alcance(sesion, empresa_id, visitante_id)
    q = select(Lead).options(selectinload(Lead.empresa), selectinload(Lead.visitante)).order_by(Lead.actualizado_en.desc())
    if empresa_id:
        q = q.where(Lead.empresa_id == empresa_id)
    if visitante_id:
        q = q.where(Lead.visitante_id == visitante_id)
    if feria_id:
        q = q.where(Lead.empresa_id.in_(select(Empresa.id).where(Empresa.feria_id == feria_id)))
    return db.scalars(q).all()


@router.get("/{empresa_id}/{visitante_id}", response_model=LeadOut)
def obtener(
    empresa_id: str,
    visitante_id: str,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "empresa"))],
):
    solo_propio(sesion, "empresa", empresa_id)
    lead = db.scalar(select(Lead).where(Lead.empresa_id == empresa_id, Lead.visitante_id == visitante_id))
    if not lead:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead no encontrado")
    return lead


@router.put("", response_model=LeadDetalleOut)
def guardar(
    data: LeadGuardar,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "empresa"))],
):
    """La empresa guarda (o actualiza) la calificación de un visitante escaneado."""
    solo_propio(sesion, "empresa", data.empresa_id)
    empresa = obtener_empresa(db, data.empresa_id)
    obtener_visitante(db, data.visitante_id)
    exigir_inscripcion(db, empresa.feria, data.visitante_id)

    t = ahora()
    lead = db.scalar(select(Lead).where(Lead.empresa_id == data.empresa_id, Lead.visitante_id == data.visitante_id))
    if lead:
        lead.calificacion = data.calificacion
        lead.nota = data.nota
        lead.actualizado_en = t
    else:
        lead = Lead(id=uid("lead-"), **data.model_dump(), creado_en=t, actualizado_en=t)
        db.add(lead)
    db.commit()
    return lead
