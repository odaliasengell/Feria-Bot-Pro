from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from ..database import DB
from ..models import Empresa, Feria, Inscripcion, Lead, VistaFicha
from ..schemas import (
    AsistenciaOut,
    AsistenciaRegistrar,
    EmpresaPublicaOut,
    EstadisticasOut,
    EstadoFeria,
    FeriaActualizar,
    FeriaBase,
    FeriaOut,
    FeriaPublicaOut,
    InscripcionCrear,
    InscripcionOut,
    RecordatorioOut,
    Sesion,
)
from ..security import requiere, solo_propio
from ..utils import ahora, uid

router = APIRouter(tags=["ferias"])


# ---------- Helpers usados también por otros routers ----------


def obtener_feria(db: Session, feria_id: str) -> Feria:
    feria = db.get(Feria, feria_id)
    if not feria:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feria no encontrada")
    return feria


def esta_inscrito(db: Session, feria_id: str, visitante_id: str) -> bool:
    return (
        db.scalar(select(Inscripcion.id).where(Inscripcion.feria_id == feria_id, Inscripcion.visitante_id == visitante_id))
        is not None
    )


def exigir_inscripcion(db: Session, feria: Feria, visitante_id: str, mensaje: str | None = None) -> None:
    if not esta_inscrito(db, feria.id, visitante_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, mensaje or f"El visitante no está inscrito en «{feria.nombre}».")


def inscribir(db: Session, feria: Feria, visitante_id: str, *, forzar: bool = False) -> Inscripcion:
    """Inscribe al visitante (si ya lo estaba devuelve la inscripción). `forzar` ignora el cierre de inscripciones."""
    actual = db.scalar(
        select(Inscripcion).where(Inscripcion.feria_id == feria.id, Inscripcion.visitante_id == visitante_id)
    )
    if actual:
        return actual
    if not forzar and not feria.abierta:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Las inscripciones para «{feria.nombre}» están cerradas.")
    ins = Inscripcion(id=uid("ins-"), feria_id=feria.id, visitante_id=visitante_id)
    db.add(ins)
    return ins


def _con_totales(db: Session, ferias: list[Feria]) -> list[FeriaOut]:
    ids = [f.id for f in ferias]
    if not ids:
        return []
    emp = dict(db.execute(select(Empresa.feria_id, func.count()).where(Empresa.feria_id.in_(ids)).group_by(Empresa.feria_id)).all())
    vis = dict(
        db.execute(
            select(Inscripcion.feria_id, func.count()).where(Inscripcion.feria_id.in_(ids)).group_by(Inscripcion.feria_id)
        ).all()
    )
    return [
        FeriaOut.model_validate(f).model_copy(update={"total_empresas": emp.get(f.id, 0), "total_visitantes": vis.get(f.id, 0)})
        for f in ferias
    ]


# ---------- Ferias ----------


@router.get("/ferias", response_model=list[FeriaOut])
def listar_ferias(
    db: DB,
    activas: Annotated[bool, Query(description="Solo las que aceptan inscripciones")] = False,
    estado: Annotated[EstadoFeria | None, Query(description="proxima, en_curso o finalizada")] = None,
):
    """Público: la página de ferias y el registro de visitantes (con `activas`) las listan sin sesión."""
    ferias = db.scalars(select(Feria).order_by(Feria.fecha_inicio.desc(), Feria.nombre)).all()
    if activas:
        ferias = [f for f in ferias if f.abierta]
    if estado:
        ferias = [f for f in ferias if f.estado == estado]
    return _con_totales(db, list(ferias))


@router.get("/ferias/{feria_id}", response_model=FeriaOut)
def obtener(feria_id: str, db: DB):
    return _con_totales(db, [obtener_feria(db, feria_id)])[0]


@router.get("/ferias/{feria_id}/publica", response_model=FeriaPublicaOut)
def obtener_publica(feria_id: str, db: DB):
    """Detalle público de la feria con sus empresas (logo, nombre, rubro y stand; sin datos de contacto)."""
    feria = _con_totales(db, [obtener_feria(db, feria_id)])[0]
    empresas = db.scalars(select(Empresa).where(Empresa.feria_id == feria_id).order_by(Empresa.stand, Empresa.nombre)).all()
    return FeriaPublicaOut(
        **feria.model_dump(), empresas=[EmpresaPublicaOut.model_validate(e) for e in empresas]
    )


@router.post(
    "/ferias", response_model=FeriaOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(requiere("organizador"))]
)
def crear(data: FeriaBase, db: DB):
    feria = Feria(**data.model_dump(), id=uid("feria-"))
    db.add(feria)
    db.commit()
    return _con_totales(db, [feria])[0]


@router.patch("/ferias/{feria_id}", response_model=FeriaOut, dependencies=[Depends(requiere("organizador"))])
def actualizar(feria_id: str, cambios: FeriaActualizar, db: DB):
    feria = obtener_feria(db, feria_id)
    for campo, valor in cambios.model_dump(exclude_unset=True).items():
        if valor is not None:
            setattr(feria, campo, valor)
    if feria.fecha_fin < feria.fecha_inicio:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La fecha de fin no puede ser anterior a la de inicio")
    db.commit()
    return _con_totales(db, [feria])[0]


@router.delete("/ferias/{feria_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requiere("organizador"))])
def eliminar(feria_id: str, db: DB):
    # Borra en cascada sus empresas (con sus leads y vistas) e inscripciones. Las cuentas de visitante quedan.
    db.delete(obtener_feria(db, feria_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/ferias/{feria_id}/recordatorio", response_model=RecordatorioOut, dependencies=[Depends(requiere("organizador"))])
def enviar_recordatorio_ahora(feria_id: str, db: DB):
    """Envía ya el recordatorio a los inscritos con correo (aunque se haya enviado antes) y devuelve cuántos."""
    from ..recordatorios import enviar_recordatorio

    feria = obtener_feria(db, feria_id)
    if feria.estado == "finalizada":
        raise HTTPException(status.HTTP_409_CONFLICT, f"«{feria.nombre}» ya terminó.")
    return RecordatorioOut(enviados=enviar_recordatorio(db, feria))


@router.post("/ferias/{feria_id}/asistencia", response_model=AsistenciaOut, dependencies=[Depends(requiere("organizador"))])
def registrar_asistencia(feria_id: str, data: AsistenciaRegistrar, db: DB):
    """Control de acceso: el organizador escanea la tarjeta del visitante en la puerta de la feria.

    Si ya había entrado no cambia la hora y responde `yaRegistrada: true`.
    """
    from .visitantes import buscar_por_codigo_o_email

    feria = obtener_feria(db, feria_id)
    visitante = buscar_por_codigo_o_email(db, data.codigo)
    if not visitante:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos un visitante con ese código.")
    ins = db.scalar(select(Inscripcion).where(Inscripcion.feria_id == feria.id, Inscripcion.visitante_id == visitante.id))
    if not ins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"{visitante.nombre} no está inscrito en «{feria.nombre}».")
    ya = ins.asistio_en is not None
    if not ya:
        ins.asistio_en = ahora()
        db.commit()
    return AsistenciaOut(visitante=visitante, asistio_en=ins.asistio_en, ya_registrada=ya)


@router.get("/ferias/{feria_id}/estadisticas", response_model=EstadisticasOut, dependencies=[Depends(requiere("organizador"))])
def estadisticas(feria_id: str, db: DB):
    """Cifras de la feria para el resumen del organizador. Días y horas en hora local (ZONA_HORARIA_UTC)."""
    from ..estadisticas import calcular

    return calcular(db, obtener_feria(db, feria_id))


# ---------- Inscripciones ----------


@router.get("/inscripciones", response_model=list[InscripcionOut])
def listar_inscripciones(
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "visitante"))],
    visitante_id: Annotated[str | None, Query(alias="visitanteId")] = None,
    feria_id: Annotated[str | None, Query(alias="feriaId")] = None,
):
    """El visitante ve las suyas; el organizador puede filtrar por visitante o feria."""
    if sesion.role == "visitante":
        visitante_id = sesion.ref_id
    q = select(Inscripcion).options(selectinload(Inscripcion.feria)).order_by(Inscripcion.creado_en.desc())
    if visitante_id:
        q = q.where(Inscripcion.visitante_id == visitante_id)
    if feria_id:
        q = q.where(Inscripcion.feria_id == feria_id)
    inscripciones = db.scalars(q).all()
    totales = {f.id: f for f in _con_totales(db, list({i.feria.id: i.feria for i in inscripciones}.values()))}
    return [InscripcionOut.model_validate(i).model_copy(update={"feria": totales.get(i.feria_id)}) for i in inscripciones]


@router.post("/inscripciones", response_model=InscripcionOut, status_code=status.HTTP_201_CREATED)
def crear_inscripcion(
    data: InscripcionCrear,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "visitante"))],
):
    """El visitante se inscribe a otra feria con su misma cuenta (el organizador puede inscribir a cualquiera)."""
    from .visitantes import obtener_visitante

    visitante_id = data.visitante_id if sesion.role == "organizador" else sesion.ref_id
    if not visitante_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Falta visitanteId")
    solo_propio(sesion, "visitante", visitante_id)
    obtener_visitante(db, visitante_id)
    feria = obtener_feria(db, data.feria_id)
    ins = inscribir(db, feria, visitante_id, forzar=sesion.role == "organizador")
    db.commit()
    return InscripcionOut.model_validate(ins).model_copy(update={"feria": _con_totales(db, [feria])[0]})


@router.delete(
    "/inscripciones/{feria_id}/{visitante_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(requiere("organizador"))],
)
def quitar_inscripcion(feria_id: str, visitante_id: str, db: DB):
    """Quita al visitante de la feria junto con sus leads y vistas en ella. Su cuenta se conserva."""
    empresas = select(Empresa.id).where(Empresa.feria_id == feria_id)
    db.execute(delete(Lead).where(Lead.visitante_id == visitante_id, Lead.empresa_id.in_(empresas)))
    db.execute(delete(VistaFicha).where(VistaFicha.visitante_id == visitante_id, VistaFicha.empresa_id.in_(empresas)))
    db.execute(delete(Inscripcion).where(Inscripcion.feria_id == feria_id, Inscripcion.visitante_id == visitante_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
