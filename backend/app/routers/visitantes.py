from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..correo import enviar_bienvenida_visitante, enviar_sin_fallar, rango_fechas
from ..database import DB
from ..limites import limite, registrar_intento
from ..models import CodigoVerificacion, Empresa, Inscripcion, Lead, Visitante
from ..paginacion import BuscarParam, PaginaParam, PorPaginaParam, coincide, recortar, total
from ..schemas import (
    CambioCorreo,
    CambioCorreoEnviar,
    PaginaVisitantes,
    Sesion,
    VisitanteActualizar,
    VisitanteCrear,
    VisitanteFila,
    VisitanteOut,
)
from ..security import requiere, sesion_opcional, solo_propio
from ..utils import ahora, generar_codigo, leer_codigo_visitante, uid
from ..verificacion import crear_y_enviar, verificar
from ..planes import exigir_cupo_visitantes
from ..registros import registrar_aceptacion, registrar_actividad
from .ferias import avisar_inscripcion, esta_inscrito, exigir_cupo, exigir_inscripcion, feria_de, ids_ferias_de, inscribir

router = APIRouter(prefix="/visitantes", tags=["visitantes"])


def obtener_visitante(db: Session, visitante_id: str) -> Visitante:
    visitante = db.get(Visitante, visitante_id)
    if not visitante:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visitante no encontrado")
    return visitante


def inscrito_con_organizador(db: Session, visitante_id: str, organizador_id: str | None) -> bool:
    """¿El visitante está inscrito en alguna feria de ese organizador?"""
    return db.scalar(
        select(Inscripcion.id)
        .where(Inscripcion.visitante_id == visitante_id, Inscripcion.feria_id.in_(ids_ferias_de(organizador_id)))
        .limit(1)
    ) is not None


def buscar_por_codigo_o_email(db: Session, texto: str) -> Visitante | None:
    """Acepta el código de la tarjeta, el contenido del QR (FERIABOT:V:...) o el correo."""
    t = texto.strip()
    if "@" in t:
        return db.scalar(select(Visitante).where(Visitante.email == t.lower()))
    codigo = leer_codigo_visitante(t)
    return db.scalar(select(Visitante).where(Visitante.codigo == codigo)) if codigo else None


@router.get("", response_model=list[VisitanteOut])
def listar(
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador"))],
    feria_id: Annotated[str | None, Query(alias="feriaId")] = None,
):
    """Con `feriaId`, solo los inscritos en esa feria (ordenados por fecha de inscripción). Sin ella, los inscritos
    en cualquiera de las ferias del organizador."""
    if feria_id:
        feria_de(db, feria_id, sesion)
        q = (
            select(Visitante)
            .join(Inscripcion, Inscripcion.visitante_id == Visitante.id)
            .where(Inscripcion.feria_id == feria_id)
            .order_by(Inscripcion.creado_en.desc())
        )
    else:
        inscritos = select(Inscripcion.visitante_id).where(Inscripcion.feria_id.in_(ids_ferias_de(sesion.ref_id)))
        q = select(Visitante).where(Visitante.id.in_(inscritos)).order_by(Visitante.creado_en.desc())
    return db.scalars(q).all()


@router.get("/pagina", response_model=PaginaVisitantes)
def listar_pagina(
    request: Request,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "superadmin"))],
    feria_id: Annotated[str, Query(alias="feriaId")],
    q: BuscarParam = "",
    asistio: Annotated[bool | None, Query(description="true: solo los que entraron; false: los que no")] = None,
    pagina: PaginaParam = 1,
    por_pagina: PorPaginaParam = 25,
):
    """Inscritos en una feria, de a una página, con su hora de entrada y cuántas empresas los registraron.

    La búsqueda (nombre, código, correo, teléfono, empresa o ciudad) y el filtro de asistencia se hacen en la base.
    """
    feria = feria_de(db, feria_id, sesion)
    if sesion.role == "superadmin" and pagina == 1:
        registrar_actividad(db, sesion, "datos.ver", f"Consultó los visitantes de «{feria.nombre}»", entidad="feria", entidad_id=feria.id, request=request)
        db.commit()
    leads = (
        select(func.count())
        .select_from(Lead)
        .join(Empresa, Empresa.id == Lead.empresa_id)
        .where(Lead.visitante_id == Visitante.id, Empresa.feria_id == feria_id)
        .correlate(Visitante)
        .scalar_subquery()
    )
    base = (
        select(Visitante, Inscripcion.asistio_en, leads.label("leads"))
        .join(Inscripcion, Inscripcion.visitante_id == Visitante.id)
        .where(Inscripcion.feria_id == feria_id)
    )
    resumen = db.execute(
        select(func.count(), func.count(Inscripcion.asistio_en)).where(Inscripcion.feria_id == feria_id)
    ).one()
    filtro = coincide(q, Visitante.nombre, Visitante.codigo, Visitante.email, Visitante.empresa, Visitante.ciudad)
    if filtro is not None:
        base = base.where(filtro)
    if asistio is not None:
        base = base.where(Inscripcion.asistio_en.is_not(None) if asistio else Inscripcion.asistio_en.is_(None))
    filas = db.execute(recortar(base.order_by(Inscripcion.creado_en.desc(), Visitante.id), pagina, por_pagina)).all()
    return PaginaVisitantes(
        items=[
            VisitanteFila.model_validate(v).model_copy(update={"asistio_en": asistio_en, "leads": n})
            for v, asistio_en, n in filas
        ],
        total=total(db, base),
        pagina=pagina,
        por_pagina=por_pagina,
        total_feria=resumen[0],
        asistieron=resumen[1],
    )


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
    elif not inscrito_con_organizador(db, visitante.id, sesion.ref_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos un visitante con ese código o correo.")
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


@router.post("/me/correo/enviar-codigo", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(limite("codigos", 5, 600))])
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
    if sesion.role == "organizador" and not inscrito_con_organizador(db, visitante_id, sesion.ref_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visitante no encontrado")
    return obtener_visitante(db, visitante_id)


@router.post("", response_model=VisitanteOut, status_code=status.HTTP_201_CREATED)
def crear(
    data: VisitanteCrear,
    db: DB,
    sesion: Annotated[Sesion | None, Depends(sesion_opcional)],
    tareas: BackgroundTasks,
    request: Request,
):
    """Registro del visitante en una feria (también lo usa el organizador en la entrada).

    Crea la cuenta del visitante y lo inscribe en `feriaId`. En el registro público con correo se exige el
    código enviado a ese correo; el organizador no lo necesita. Si quien ya tiene cuenta quiere entrar a otra
    feria, debe ingresar e inscribirse (POST /inscripciones); el organizador lo inscribe directamente aquí.
    """
    if not (sesion is not None and sesion.role == "organizador"):
        # Registro público: campo trampa y máximo 10 registros cada 10 minutos por IP (el organizador en la
        # entrada registra a muchos desde el mismo equipo y no tiene límite).
        if data.empresa_web.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se pudo completar el registro.")
        registrar_intento(request, "registro", 10, 600)
    if not data.acepta_politica:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Debes aceptar la política de privacidad y tratamiento de datos."
        )
    es_org = sesion is not None and sesion.role == "organizador"
    feria = feria_de(db, data.feria_id, sesion if es_org else None)
    if not es_org and not feria.abierta:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Las inscripciones para «{feria.nombre}» están cerradas.")
    if not es_org:
        # Antes de crear la cuenta y de gastar el código de verificación.
        exigir_cupo(db, feria)
        exigir_cupo_visitantes(db, feria, es_organizador=False)

    email = data.email or None
    existente = db.scalar(select(Visitante).where(Visitante.email == email)) if email else None
    if existente:
        if not es_org:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Ya tienes una cuenta con ese correo. Ingresa con tu correo para inscribirte a esta feria.",
            )
        ya_inscrito = esta_inscrito(db, feria.id, existente.id)
        inscribir(db, feria, existente.id, forzar=True)
        _registrar_aceptacion(existente)
        registrar_aceptacion(
            db, tipo="visitante", titular_id=existente.id, nombre=existente.nombre, email=existente.email,
            origen="registro_organizador", request=request, registrado_por=sesion.nombre if sesion else "",
        )
        db.commit()
        if not ya_inscrito:
            avisar_inscripcion(tareas, feria, existente)
        return existente
    if email and not es_org:
        if not data.codigo_verificacion:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta el código de verificación enviado a tu correo.")
        verificar(db, email, "registro", data.codigo_verificacion)

    codigo = generar_codigo()
    while db.scalar(select(Visitante.id).where(Visitante.codigo == codigo)):
        codigo = generar_codigo()

    visitante = Visitante(
        **data.model_dump(exclude={"email", "codigo_verificacion", "feria_id", "acepta_politica", "empresa_web"}), email=email, id=uid("vis-"), codigo=codigo
    )
    _registrar_aceptacion(visitante)
    db.add(visitante)
    db.flush()
    registrar_aceptacion(
        db, tipo="visitante", titular_id=visitante.id, nombre=visitante.nombre, email=visitante.email,
        origen="registro_organizador" if es_org else "registro_publico", request=request,
        registrado_por=sesion.nombre if es_org and sesion else "",
    )
    inscribir(db, feria, visitante.id, forzar=es_org)
    db.commit()
    if email:
        # En segundo plano: el registro responde de inmediato y un correo fallido no lo afecta.
        tareas.add_task(
            enviar_sin_fallar, enviar_bienvenida_visitante,
            email, visitante.nombre, visitante.codigo, feria.nombre, rango_fechas(feria.fecha_inicio, feria.fecha_fin),
            portada=feria.portada, portada_alt=feria.portada_alt,
        )
    return visitante


def _registrar_aceptacion(visitante: Visitante) -> None:
    """Guarda cuándo y qué versión de la política aceptó (se actualiza si acepta una versión nueva)."""
    if visitante.politica_version != settings.politica_version:
        visitante.politica_aceptada_en = ahora()
        visitante.politica_version = settings.politica_version


@router.delete("/{visitante_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(visitante_id: str, db: DB, request: Request, sesion: Annotated[Sesion, Depends(requiere("superadmin"))]):
    """Borra la cuenta del visitante en toda la plataforma. Un organizador solo lo quita de su feria
    (DELETE /inscripciones/...); el visitante borra su cuenta con DELETE /visitantes/me."""
    # Sus leads y vistas se borran por ON DELETE CASCADE.
    v = obtener_visitante(db, visitante_id)
    registrar_actividad(db, sesion, "visitante.eliminar", f"Eliminó la cuenta de {v.nombre} ({v.codigo})", entidad="visitante", entidad_id=v.id, request=request)
    db.delete(v)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
