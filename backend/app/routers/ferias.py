from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, noload, selectinload

from ..correo import enviar_bienvenida_visitante, enviar_sin_fallar, rango_fechas
from ..database import DB
from ..models import Empresa, Feria, Inscripcion, Lead, Organizador, Visitante, VistaFicha
from ..planes import exigir_cupo_ferias, exigir_cupo_visitantes, exigir_operativo
from ..schemas import (
    AsistenciaOut,
    AsistenciaRegistrar,
    EmpresaPublicaOut,
    EstadisticasOut,
    EstadoFeria,
    FeriaActualizar,
    FeriaBase,
    FeriaDuplicar,
    FeriaOut,
    FeriaPublicaOut,
    InscripcionCrear,
    InscripcionOut,
    RecordatorioOut,
    Sesion,
)
from ..registros import registrar_actividad
from ..security import requiere, sesion_opcional, solo_propio
from ..utils import ahora, uid

router = APIRouter(tags=["ferias"])


# ---------- Helpers usados también por otros routers ----------


def obtener_feria(db: Session, feria_id: str) -> Feria:
    feria = db.get(Feria, feria_id)
    if not feria:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feria no encontrada")
    return feria


def feria_de(db: Session, feria_id: str, sesion: Sesion | None) -> Feria:
    """La feria; si la sesión es de un organizador, solo una de las suyas (si no, 404 como si no existiera)."""
    feria = obtener_feria(db, feria_id)
    if sesion is not None and sesion.role == "organizador" and feria.organizador_id != sesion.ref_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feria no encontrada")
    return feria


def ids_ferias_de(organizador_id: str | None):
    """Subconsulta con los ids de las ferias de un organizador."""
    return select(Feria.id).where(Feria.organizador_id == organizador_id)


def organizador_de(db: Session, sesion: Sesion) -> Organizador:
    org = db.get(Organizador, sesion.ref_id)
    if not org:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No encontramos tu cuenta. Vuelve a ingresar.")
    return org


def esta_inscrito(db: Session, feria_id: str, visitante_id: str) -> bool:
    return (
        db.scalar(select(Inscripcion.id).where(Inscripcion.feria_id == feria_id, Inscripcion.visitante_id == visitante_id))
        is not None
    )


def exigir_inscripcion(db: Session, feria: Feria, visitante_id: str, mensaje: str | None = None) -> None:
    if not esta_inscrito(db, feria.id, visitante_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, mensaje or f"El visitante no está inscrito en «{feria.nombre}».")


FERIA_LLENA = "La feria está llena"


def total_inscritos(db: Session, feria_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Inscripcion).where(Inscripcion.feria_id == feria_id)) or 0


def exigir_cupo(db: Session, feria: Feria) -> None:
    """409 si la feria llegó a su aforo (sin aforo no hay límite)."""
    if feria.aforo is not None and total_inscritos(db, feria.id) >= feria.aforo:
        raise HTTPException(status.HTTP_409_CONFLICT, FERIA_LLENA)


def inscribir(db: Session, feria: Feria, visitante_id: str, *, forzar: bool = False) -> Inscripcion:
    """Inscribe al visitante (si ya lo estaba devuelve la inscripción).

    `forzar` (el organizador) ignora el cierre de inscripciones y el aforo.
    """
    actual = db.scalar(
        select(Inscripcion).where(Inscripcion.feria_id == feria.id, Inscripcion.visitante_id == visitante_id)
    )
    if actual:
        return actual
    if not forzar and not feria.abierta:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Las inscripciones para «{feria.nombre}» están cerradas.")
    if not forzar:
        exigir_cupo(db, feria)
    # El límite del plan del organizador vale también para el organizador (el aforo no).
    exigir_cupo_visitantes(db, feria, es_organizador=forzar)
    ins = Inscripcion(id=uid("ins-"), feria_id=feria.id, visitante_id=visitante_id)
    db.add(ins)
    return ins


def avisar_inscripcion(tareas: BackgroundTasks, feria: Feria, visitante: Visitante) -> None:
    """Correo con la tarjeta de esa feria (código, QR y portada), en segundo plano; sin correo no se envía nada."""
    if visitante.email:
        tareas.add_task(
            enviar_sin_fallar, enviar_bienvenida_visitante,
            visitante.email, visitante.nombre, visitante.codigo, feria.nombre,
            rango_fechas(feria.fecha_inicio, feria.fecha_fin),
            portada=feria.portada, portada_alt=feria.portada_alt,
        )


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
        FeriaOut.model_validate(f).model_copy(
            update={
                "total_empresas": emp.get(f.id, 0),
                "total_visitantes": vis.get(f.id, 0),
                "llena": f.aforo is not None and vis.get(f.id, 0) >= f.aforo,
            }
        )
        for f in ferias
    ]


# ---------- Ferias ----------


@router.get("/ferias", response_model=list[FeriaOut])
def listar_ferias(
    db: DB,
    sesion: Annotated[Sesion | None, Depends(sesion_opcional)],
    activas: Annotated[bool, Query(description="Solo las que aceptan inscripciones")] = False,
    estado: Annotated[EstadoFeria | None, Query(description="proxima, en_curso o finalizada")] = None,
    mias: Annotated[bool, Query(description="Organizador: solo sus ferias")] = False,
):
    """Público: la página de ferias y el registro de visitantes (con `activas`) las listan sin sesión.

    Con `mias=true` el organizador obtiene solo las suyas (su panel).
    """
    q = select(Feria).order_by(Feria.fecha_inicio.desc(), Feria.nombre)
    if mias:
        if sesion is None or sesion.role != "organizador":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción.")
        q = q.where(Feria.organizador_id == sesion.ref_id)
    ferias = db.scalars(q).all()
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


SesionOrganizador = Annotated[Sesion, Depends(requiere("organizador"))]
# El Super Administrador también edita y elimina ferias de cualquier organizador (queda en el registro de actividad).
SesionGestor = Annotated[Sesion, Depends(requiere("organizador", "superadmin"))]


@router.post("/ferias", response_model=FeriaOut, status_code=status.HTTP_201_CREATED)
def crear(data: FeriaBase, db: DB, sesion: SesionOrganizador):
    org = organizador_de(db, sesion)
    if data.fecha_fin >= date.today():
        exigir_cupo_ferias(db, org)
    else:
        # Una feria ya terminada (para cargar el historial) no ocupa cupo del plan.
        exigir_operativo(org)
    feria = Feria(**data.model_dump(), id=uid("feria-"), organizador_id=org.id)
    db.add(feria)
    db.commit()
    return _con_totales(db, [feria])[0]


@router.patch("/ferias/{feria_id}", response_model=FeriaOut)
def actualizar(feria_id: str, cambios: FeriaActualizar, db: DB, sesion: SesionGestor, request: Request):
    feria = feria_de(db, feria_id, sesion)
    estaba_finalizada = feria.fecha_fin < date.today()
    campos = sorted(cambios.model_dump(exclude_unset=True))
    for campo, valor in cambios.model_dump(exclude_unset=True).items():
        # aforo y portada: null quita el límite / la imagen; en el resto de campos un null se ignora.
        if valor is not None or campo in ("aforo", "portada"):
            setattr(feria, campo, valor)
    if feria.fecha_fin < feria.fecha_inicio:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La fecha de fin no puede ser anterior a la de inicio")
    if estaba_finalizada and feria.fecha_fin >= date.today():
        # Volver a abrir una feria terminada ocupa un cupo de ferias del plan.
        org = feria.organizador if sesion.role == "superadmin" else organizador_de(db, sesion)
        exigir_cupo_ferias(db, org, excepto=feria.id)
    if sesion.role == "superadmin":
        registrar_actividad(
            db, sesion, "feria.editar", f"Editó «{feria.nombre}» de {feria.organizador.nombre} ({', '.join(campos) or 'sin cambios'})",
            entidad="feria", entidad_id=feria.id, request=request,
        )
    db.commit()
    return _con_totales(db, [feria])[0]


@router.post("/ferias/{feria_id}/duplicar", response_model=FeriaOut, status_code=status.HTTP_201_CREATED)
def duplicar(feria_id: str, data: FeriaDuplicar, db: DB, sesion: SesionOrganizador):
    """Nueva edición de una feria: copia descripción, lugar, aforo y portada con el nombre y las fechas nuevas.

    Las empresas no se copian: cada una entra con su correo, que es único en todo el sistema.
    """
    origen = feria_de(db, feria_id, sesion)
    org = organizador_de(db, sesion)
    if data.fecha_fin >= date.today():
        exigir_cupo_ferias(db, org)
    else:
        exigir_operativo(org)
    nueva = Feria(
        id=uid("feria-"),
        organizador_id=org.id,
        nombre=data.nombre.strip(),
        descripcion=origen.descripcion,
        lugar=origen.lugar,
        portada=origen.portada,
        portada_alt=origen.portada_alt,
        aforo=origen.aforo,
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        inscripciones_abiertas=True,
    )
    db.add(nueva)
    db.commit()
    return _con_totales(db, [nueva])[0]


@router.delete("/ferias/{feria_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(feria_id: str, db: DB, sesion: SesionGestor, request: Request):
    # Borra en cascada sus empresas (con sus leads y vistas) e inscripciones. Las cuentas de visitante quedan.
    feria = feria_de(db, feria_id, sesion)
    if sesion.role == "superadmin":
        registrar_actividad(
            db, sesion, "feria.eliminar", f"Eliminó «{feria.nombre}» de {feria.organizador.nombre}",
            entidad="feria", entidad_id=feria.id, request=request,
        )
    db.delete(feria)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/ferias/{feria_id}/recordatorio", response_model=RecordatorioOut)
def enviar_recordatorio_ahora(feria_id: str, db: DB, sesion: SesionOrganizador):
    """Envía ya el recordatorio a los inscritos con correo (aunque se haya enviado antes) y devuelve cuántos."""
    from ..recordatorios import enviar_recordatorio

    feria = feria_de(db, feria_id, sesion)
    if feria.estado == "finalizada":
        raise HTTPException(status.HTTP_409_CONFLICT, f"«{feria.nombre}» ya terminó.")
    return RecordatorioOut(enviados=enviar_recordatorio(db, feria))


@router.post("/ferias/{feria_id}/asistencia", response_model=AsistenciaOut)
def registrar_asistencia(feria_id: str, data: AsistenciaRegistrar, db: DB, sesion: SesionOrganizador):
    """Control de acceso: el organizador escanea la tarjeta del visitante en la puerta de la feria.

    Si ya había entrado no cambia la hora y responde `yaRegistrada: true`.
    """
    from .visitantes import buscar_por_codigo_o_email

    feria = feria_de(db, feria_id, sesion)
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


@router.get("/ferias/{feria_id}/estadisticas", response_model=EstadisticasOut)
def estadisticas(feria_id: str, db: DB, sesion: SesionGestor):
    """Cifras de la feria para el resumen del organizador. Días y horas en hora local (ZONA_HORARIA_UTC)."""
    from ..estadisticas import calcular

    return calcular(db, feria_de(db, feria_id, sesion))


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
    if sesion.role == "organizador":
        if feria_id:
            feria_de(db, feria_id, sesion)
        # El organizador solo ve las inscripciones a sus ferias.
        q = q.where(Inscripcion.feria_id.in_(ids_ferias_de(sesion.ref_id)))
    if visitante_id:
        q = q.where(Inscripcion.visitante_id == visitante_id)
    if feria_id:
        q = q.where(Inscripcion.feria_id == feria_id)
    if sesion.role == "organizador" and feria_id:
        # El organizador ya tiene la feria: repetirla (con su portada) en cada inscripción pesa megas.
        solo = select(Inscripcion).options(noload(Inscripcion.feria)).where(Inscripcion.feria_id == feria_id).order_by(Inscripcion.creado_en.desc())
        if visitante_id:
            solo = solo.where(Inscripcion.visitante_id == visitante_id)
        return db.scalars(solo).all()
    inscripciones = db.scalars(q).all()
    totales = {f.id: f for f in _con_totales(db, list({i.feria.id: i.feria for i in inscripciones}.values()))}
    return [InscripcionOut.model_validate(i).model_copy(update={"feria": totales.get(i.feria_id)}) for i in inscripciones]


@router.post("/inscripciones", response_model=InscripcionOut, status_code=status.HTTP_201_CREATED)
def crear_inscripcion(
    data: InscripcionCrear,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "visitante"))],
    tareas: BackgroundTasks,
):
    """El visitante se inscribe a otra feria con su misma cuenta (el organizador puede inscribir a cualquiera)."""
    from .visitantes import obtener_visitante

    visitante_id = data.visitante_id if sesion.role == "organizador" else sesion.ref_id
    if not visitante_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Falta visitanteId")
    solo_propio(sesion, "visitante", visitante_id)
    visitante = obtener_visitante(db, visitante_id)
    feria = feria_de(db, data.feria_id, sesion)
    ya_inscrito = esta_inscrito(db, feria.id, visitante_id)
    ins = inscribir(db, feria, visitante_id, forzar=sesion.role == "organizador")
    db.commit()
    if not ya_inscrito:
        avisar_inscripcion(tareas, feria, visitante)
    return InscripcionOut.model_validate(ins).model_copy(update={"feria": _con_totales(db, [feria])[0]})


@router.delete(
    "/inscripciones/{feria_id}/{visitante_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def quitar_inscripcion(
    feria_id: str,
    visitante_id: str,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "visitante"))],
):
    """Quita al visitante de la feria junto con sus leads y vistas en ella. Su cuenta se conserva.

    El organizador quita a cualquiera; el visitante solo cancela su propia inscripción.
    """
    solo_propio(sesion, "visitante", visitante_id)
    feria_de(db, feria_id, sesion)
    if not esta_inscrito(db, feria_id, visitante_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay una inscripción en esa feria.")
    empresas = select(Empresa.id).where(Empresa.feria_id == feria_id)
    db.execute(delete(Lead).where(Lead.visitante_id == visitante_id, Lead.empresa_id.in_(empresas)))
    db.execute(delete(VistaFicha).where(VistaFicha.visitante_id == visitante_id, VistaFicha.empresa_id.in_(empresas)))
    db.execute(delete(Inscripcion).where(Inscripcion.feria_id == feria_id, Inscripcion.visitante_id == visitante_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
