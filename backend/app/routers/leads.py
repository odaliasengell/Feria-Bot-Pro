from typing import Annotated

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from ..database import DB
from ..exportar import MIME_XLSX, generar_xlsx, nombre_archivo
from ..models import Empresa, Feria, Lead
from ..schemas import LeadDetalleOut, LeadEstado, LeadGuardar, LeadOut, Sesion
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


def consulta_leads(
    sesion: Sesion, empresa_id: str | None, visitante_id: str | None, feria_id: str | None
) -> Select[tuple[Lead]]:
    """Leads con empresa y visitante, con el alcance de la sesión. La usan el listado y la exportación."""
    empresa_id, visitante_id = alcance(sesion, empresa_id, visitante_id)
    q = select(Lead).options(selectinload(Lead.empresa), selectinload(Lead.visitante)).order_by(Lead.actualizado_en.desc())
    if empresa_id:
        q = q.where(Lead.empresa_id == empresa_id)
    if visitante_id:
        q = q.where(Lead.visitante_id == visitante_id)
    if feria_id:
        q = q.where(Lead.empresa_id.in_(select(Empresa.id).where(Empresa.feria_id == feria_id)))
    return q


@router.get("", response_model=list[LeadDetalleOut])
def listar(
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere())],
    empresa_id: Annotated[str | None, Query(alias="empresaId")] = None,
    visitante_id: Annotated[str | None, Query(alias="visitanteId")] = None,
    feria_id: Annotated[str | None, Query(alias="feriaId")] = None,
):
    return db.scalars(consulta_leads(sesion, empresa_id, visitante_id, feria_id)).all()


@router.get(
    "/exportar",
    response_class=Response,
    responses={200: {"content": {MIME_XLSX: {}}, "description": "Archivo .xlsx"}},
)
def exportar(
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere())],
    feria_id: Annotated[str | None, Query(alias="feriaId")] = None,
    empresa_id: Annotated[str | None, Query(alias="empresaId")] = None,
):
    """Los mismos leads que GET /leads (mismo alcance por rol) en un archivo de Excel."""
    leads = db.scalars(consulta_leads(sesion, empresa_id, None, feria_id)).all()
    if sesion.role == "empresa":
        empresa = db.get(Empresa, sesion.ref_id)
        base = empresa.nombre if empresa else "empresa"
    elif empresa_id and (empresa := db.get(Empresa, empresa_id)):
        base = empresa.nombre
    elif feria_id and (feria := db.get(Feria, feria_id)):
        base = feria.nombre
    else:
        base = "todos"
    archivo = nombre_archivo(base)
    return Response(
        content=generar_xlsx(list(leads)),
        media_type=MIME_XLSX,
        headers={"Content-Disposition": f"attachment; filename=\"{archivo}\"; filename*=UTF-8''{quote(archivo)}"},
    )


@router.patch("/{lead_id}/estado", response_model=LeadDetalleOut)
def cambiar_estado(
    lead_id: str,
    data: LeadEstado,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "empresa"))],
):
    """Seguimiento del contacto: nuevo, contactado, cotizado o cerrado."""
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead no encontrado")
    solo_propio(sesion, "empresa", lead.empresa_id)
    if lead.estado != data.estado:
        lead.estado = data.estado
        lead.actualizado_en = ahora()
        db.commit()
    return lead


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
        # Quien lo escanea primero: el vendedor, o la empresa / la organización si fue su cuenta principal.
        registrado_por = sesion.usuario_nombre or (empresa.nombre if sesion.role == "empresa" else "Organización")
        lead = Lead(id=uid("lead-"), **data.model_dump(), registrado_por=registrado_por, creado_en=t, actualizado_en=t)
        db.add(lead)
    db.commit()
    return lead
