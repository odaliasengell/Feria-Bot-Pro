"""Panel del Super Administrador (FeriaBot Pro): organizadores, sus planes y el equipo interno.

El Super Administrador ve la cuenta, el plan y el uso de cada organizador (cuántas ferias, empresas y visitantes),
pero no los datos personales de los visitantes ni los leads.
"""

from collections import defaultdict
from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..correo import enviar_acceso_organizador, enviar_sin_fallar
from ..database import DB
from ..models import AceptacionPolitica, Auditoria, Empresa, Feria, Inscripcion, Lead, Organizador, Plan, SolicitudPlan, SuperAdmin, Visitante
from ..paginacion import BuscarParam, PaginaParam, PorPaginaParam, coincide, recortar, total
from ..registros import registrar_actividad
from ..planes import PLANES_IDS, estado_cuenta, plan_de, puede_operar
from ..schemas import (
    FeriaUso,
    MiPlanOut,
    OrganizadorActualizar,
    OrganizadorAdminOut,
    OrganizadorCrear,
    OrganizadorOut,
    PlanActualizar,
    PlanAdminOut,
    PlanOut,
    ResumenAdmin,
    Sesion,
    SuperAdminCrear,
    SuperAdminOut,
    UsoPlan,
    AceptacionOut,
    ActividadOut,
    FeriaAdminOut,
    InscripcionAdmin,
    PaginaAceptaciones,
    PaginaActividad,
    PaginaVisitantesAdmin,
    VisitanteAdminDetalle,
    VisitanteAdminFila,
    VisitanteOut,
)
from ..security import hash_password, requiere
from ..utils import uid

router = APIRouter(tags=["superadmin"])

SesionSuper = Annotated[Sesion, Depends(requiere("superadmin"))]


# ---------- Helpers ----------


def _usos(db: Session, organizadores: list[Organizador]) -> dict[str, UsoPlan]:
    """Uso de varios organizadores con tres consultas (no una por organizador)."""
    ids = [o.id for o in organizadores]
    usos = {i: UsoPlan(ferias_activas=0, ferias_total=0, ferias=[]) for i in ids}
    if not ids:
        return usos
    ferias = db.execute(
        select(Feria.id, Feria.organizador_id, Feria.nombre, Feria.fecha_inicio, Feria.fecha_fin)
        .where(Feria.organizador_id.in_(ids))
        .order_by(Feria.fecha_inicio.desc())
    ).all()
    fids = [f.id for f in ferias]
    empresas = dict(
        db.execute(select(Empresa.feria_id, func.count()).where(Empresa.feria_id.in_(fids)).group_by(Empresa.feria_id)).all()
    ) if fids else {}
    inscritos = dict(
        db.execute(select(Inscripcion.feria_id, func.count()).where(Inscripcion.feria_id.in_(fids)).group_by(Inscripcion.feria_id)).all()
    ) if fids else {}
    hoy = date.today()
    for f in ferias:
        estado = "proxima" if hoy < f.fecha_inicio else "en_curso" if hoy <= f.fecha_fin else "finalizada"
        uso = usos[f.organizador_id]
        uso.ferias_total += 1
        if estado != "finalizada":
            uso.ferias_activas += 1
        uso.ferias.append(FeriaUso(
            id=f.id, nombre=f.nombre, estado=estado, fecha_inicio=f.fecha_inicio, fecha_fin=f.fecha_fin,
            empresas=empresas.get(f.id, 0), visitantes=inscritos.get(f.id, 0),
        ))
    return usos


def _out(org: Organizador) -> OrganizadorOut:
    return OrganizadorOut.model_validate(org).model_copy(update={"estado": estado_cuenta(org)})


def _admin_out(org: Organizador, uso: UsoPlan) -> OrganizadorAdminOut:
    return OrganizadorAdminOut.model_validate(
        {**_out(org).model_dump(), "notas": org.notas or "", "uso": uso}
    )


def _obtener(db: Session, organizador_id: str) -> Organizador:
    org = db.get(Organizador, organizador_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organizador no encontrado")
    return org


def _validar_unicos(db: Session, email: str | None, ruc: str | None, excepto: str | None = None) -> None:
    if email:
        otro = db.scalar(select(Organizador.nombre).where(Organizador.email == email, Organizador.id != (excepto or "")))
        if otro:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Ya existe un organizador con ese correo ({otro}).")
    if ruc:
        otro = db.scalar(select(Organizador.nombre).where(Organizador.ruc == ruc, Organizador.id != (excepto or "")))
        if otro:
            raise HTTPException(status.HTTP_409_CONFLICT, f"El RUC {ruc} ya está registrado ({otro}).")


# ---------- Planes ----------


def _planes(db: Session) -> list[Plan]:
    return list(db.scalars(select(Plan).order_by(Plan.orden, Plan.precio_mensual)).all())


@router.get("/planes", response_model=list[PlanOut])
def planes_publicos(db: DB):
    """Público: los planes visibles con sus precios (página principal)."""
    return [p for p in _planes(db) if p.publico]


@router.get("/admin/planes", response_model=list[PlanAdminOut])
def planes(db: DB, _: SesionSuper):
    clientes = dict(db.execute(select(Organizador.plan, func.count()).group_by(Organizador.plan)).all())
    return [PlanAdminOut.model_validate(p).model_copy(update={"clientes": clientes.get(p.id, 0)}) for p in _planes(db)]


@router.patch("/admin/planes/{plan_id}", response_model=PlanAdminOut)
def actualizar_plan(plan_id: str, cambios: PlanActualizar, db: DB, sesion: SesionSuper, request: Request):
    """Cambia precios, límites, descripción o visibilidad. Los límites nuevos rigen de inmediato para todos los
    organizadores con ese plan (lo que ya tienen no se borra; solo no pueden crear más hasta bajar del límite)."""
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan no encontrado")
    datos = cambios.model_dump(exclude_unset=True)
    for campo, valor in datos.items():
        if valor is not None:
            setattr(plan, campo, valor.strip() if isinstance(valor, str) else valor)
    registrar_actividad(
        db, sesion, "plan.editar", f"Cambió el plan {plan.nombre}: " + ", ".join(f"{k}={v}" for k, v in datos.items()),
        entidad="plan", entidad_id=plan.id, request=request,
    )
    db.commit()
    clientes = db.scalar(select(func.count()).select_from(Organizador).where(Organizador.plan == plan.id)) or 0
    return PlanAdminOut.model_validate(plan).model_copy(update={"clientes": clientes})


# ---------- Resumen ----------


@router.get("/admin/resumen", response_model=ResumenAdmin)
def resumen(db: DB, _: SesionSuper):
    orgs = db.scalars(select(Organizador).order_by(Organizador.plan_fin)).all()
    precios = {p.id: float(p.precio_mensual or 0) for p in _planes(db)}
    por_estado: dict[str, int] = defaultdict(int)
    por_plan: dict[str, int] = defaultdict(int)
    ingreso = 0.0
    for o in orgs:
        estado = estado_cuenta(o)
        por_estado[estado] += 1
        por_plan[o.plan] += 1
        if estado in ("activa", "por_vencer"):
            ingreso += precios.get(o.plan, 0)
    return ResumenAdmin(
        organizadores=len(orgs),
        por_estado={e: por_estado.get(e, 0) for e in ("activa", "por_vencer", "vencida", "programada", "suspendida")},
        por_plan={p: por_plan.get(p, 0) for p in PLANES_IDS},
        ingreso_mensual=round(ingreso, 2),
        solicitudes_pendientes=db.scalar(
            select(func.count()).select_from(SolicitudPlan).where(SolicitudPlan.estado == "pendiente")
        ) or 0,
        ferias_activas=db.scalar(select(func.count()).select_from(Feria).where(Feria.fecha_fin >= date.today())) or 0,
        empresas=db.scalar(select(func.count()).select_from(Empresa)) or 0,
        inscripciones=db.scalar(select(func.count()).select_from(Inscripcion)) or 0,
        por_vencer=[_out(o) for o in orgs if estado_cuenta(o) in ("por_vencer", "vencida")][:10],
    )


# ---------- Organizadores ----------


@router.get("/admin/organizadores", response_model=list[OrganizadorAdminOut])
def listar_organizadores(db: DB, _: SesionSuper):
    orgs = list(db.scalars(select(Organizador).order_by(Organizador.nombre)).all())
    usos = _usos(db, orgs)
    return [_admin_out(o, usos[o.id]) for o in orgs]


@router.get("/admin/organizadores/{organizador_id}", response_model=OrganizadorAdminOut)
def obtener_organizador(organizador_id: str, db: DB, _: SesionSuper):
    org = _obtener(db, organizador_id)
    return _admin_out(org, _usos(db, [org])[org.id])


@router.post("/admin/organizadores", response_model=OrganizadorAdminOut, status_code=status.HTTP_201_CREATED)
def crear_organizador(data: OrganizadorCrear, db: DB, sesion: SesionSuper, tareas: BackgroundTasks, request: Request):
    """Crea la cuenta del organizador con su plan y le envía su acceso por correo."""
    email = data.email.lower()
    _validar_unicos(db, email, data.ruc)
    org = Organizador(
        **data.model_dump(exclude={"email", "password"}),
        id=uid("org-"),
        email=email,
        password_hash=hash_password(data.password),
    )
    db.add(org)
    db.flush()
    registrar_actividad(db, sesion, "organizador.crear", f"Creó al organizador {org.nombre} (plan {org.plan})", entidad="organizador", entidad_id=org.id, request=request)
    db.commit()
    plan = plan_de(org)
    tareas.add_task(
        enviar_sin_fallar, enviar_acceso_organizador,
        org.email, org.nombre, data.password, plan.nombre, org.plan_inicio, org.plan_fin,
    )
    return _admin_out(org, _usos(db, [org])[org.id])


@router.patch("/admin/organizadores/{organizador_id}", response_model=OrganizadorAdminOut)
def actualizar_organizador(organizador_id: str, cambios: OrganizadorActualizar, db: DB, sesion: SesionSuper, request: Request):
    """Edita la ficha, cambia el plan o su vigencia, suspende/reactiva o asigna una contraseña nueva."""
    org = _obtener(db, organizador_id)
    datos = cambios.model_dump(exclude_unset=True)
    password = datos.pop("password", None)
    if datos.get("email"):
        datos["email"] = datos["email"].lower()
    _validar_unicos(db, datos.get("email"), datos.get("ruc"), excepto=org.id)
    for campo, valor in datos.items():
        if valor is None and campo != "sitio_web":
            continue
        setattr(org, campo, valor)
    if org.plan_inicio and org.plan_fin and org.plan_fin < org.plan_inicio:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La fecha de fin del plan no puede ser anterior a la de inicio.")
    if password:
        org.password_hash = hash_password(password)
    campos = sorted(datos) + (["contraseña"] if password else [])
    accion = "organizador.suspender" if datos.get("activo") is False else "organizador.reactivar" if datos.get("activo") is True and len(datos) == 1 else "organizador.editar"
    registrar_actividad(db, sesion, accion, f"{org.nombre}: {', '.join(campos)}", entidad="organizador", entidad_id=org.id, request=request)
    db.commit()
    return _admin_out(org, _usos(db, [org])[org.id])


@router.delete("/admin/organizadores/{organizador_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_organizador(organizador_id: str, db: DB, sesion: SesionSuper, request: Request):
    """Solo si no tiene ferias. Con ferias, se suspende la cuenta (los datos se conservan)."""
    org = _obtener(db, organizador_id)
    if db.scalar(select(Feria.id).where(Feria.organizador_id == org.id).limit(1)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{org.nombre} tiene ferias registradas. Suspende la cuenta en lugar de eliminarla.",
        )
    registrar_actividad(db, sesion, "organizador.eliminar", f"Eliminó al organizador {org.nombre}", entidad="organizador", entidad_id=org.id, request=request)
    db.delete(org)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Equipo de FeriaBot Pro (Super Administradores) ----------


@router.get("/admin/usuarios", response_model=list[SuperAdminOut])
def listar_usuarios(db: DB, _: SesionSuper):
    return db.scalars(select(SuperAdmin).order_by(SuperAdmin.nombre)).all()


@router.post("/admin/usuarios", response_model=SuperAdminOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(data: SuperAdminCrear, db: DB, sesion: SesionSuper, request: Request):
    """Otra persona de FeriaBot Pro con acceso completo a este panel."""
    email = data.email.lower()
    if db.scalar(select(SuperAdmin.id).where(SuperAdmin.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un usuario con ese correo.")
    usuario = SuperAdmin(id=uid("sa-"), nombre=data.nombre.strip(), email=email, password_hash=hash_password(data.password))
    db.add(usuario)
    registrar_actividad(db, sesion, "equipo.agregar", f"Dio acceso a {usuario.nombre} ({email})", entidad="superadmin", entidad_id=usuario.id, request=request)
    db.commit()
    return usuario


@router.delete("/admin/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_usuario(usuario_id: str, db: DB, sesion: SesionSuper, request: Request):
    if usuario_id == sesion.ref_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "No puedes eliminar tu propio usuario.")
    usuario = db.get(SuperAdmin, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    registrar_actividad(db, sesion, "equipo.quitar", f"Quitó el acceso de {usuario.nombre} ({usuario.email})", entidad="superadmin", entidad_id=usuario.id, request=request)
    db.delete(usuario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- El organizador ve su plan ----------


@router.get("/mi-plan", response_model=MiPlanOut)
def mi_plan(db: DB, sesion: Annotated[Sesion, Depends(requiere("organizador"))]):
    """Ficha, plan, límites y uso del organizador que inició sesión."""
    org = _obtener(db, sesion.ref_id)
    plan = plan_de(org)
    return MiPlanOut(
        organizador=_out(org),
        plan=PlanOut.model_validate(plan),
        uso=_usos(db, [org])[org.id],
        puede_operar=puede_operar(org),
        dias_restantes=(org.plan_fin - date.today()).days if org.plan_fin else None,
    )


# ---------- Ferias de todos los organizadores ----------


@router.get("/admin/ferias", response_model=list[FeriaAdminOut])
def listar_ferias(db: DB, _: SesionSuper):
    """Todas las ferias con su organizador y totales (sin la portada, que pesa; se pide con GET /ferias/:id)."""
    from .ferias import _con_totales

    ferias = list(db.scalars(select(Feria).order_by(Feria.fecha_inicio.desc(), Feria.nombre)).all())
    nombres = dict(db.execute(select(Organizador.id, Organizador.nombre)).all())
    return [
        FeriaAdminOut.model_validate(
            {**f.model_dump(), "portada": None, "organizador_id": fe.organizador_id, "organizador_nombre": nombres.get(fe.organizador_id, "—")}
        )
        for f, fe in zip(_con_totales(db, ferias), ferias)
    ]


# ---------- Todos los visitantes ----------


@router.get("/admin/visitantes/pagina", response_model=PaginaVisitantesAdmin)
def visitantes(
    db: DB,
    sesion: SesionSuper,
    request: Request,
    q: BuscarParam = "",
    pagina: PaginaParam = 1,
    por_pagina: PorPaginaParam = 25,
):
    """Visitantes de toda la plataforma con en cuántas ferias están inscritos. La consulta queda registrada."""
    ferias = (
        select(func.count()).select_from(Inscripcion).where(Inscripcion.visitante_id == Visitante.id).correlate(Visitante).scalar_subquery()
    )
    base = select(Visitante, ferias.label("ferias"))
    filtro = coincide(q, Visitante.nombre, Visitante.codigo, Visitante.email, Visitante.telefono, Visitante.empresa, Visitante.ciudad)
    if filtro is not None:
        base = base.where(filtro)
    filas = db.execute(recortar(base.order_by(Visitante.creado_en.desc(), Visitante.id), pagina, por_pagina)).all()
    if pagina == 1:
        registrar_actividad(
            db, sesion, "datos.ver", f"Consultó la lista de visitantes{f' (búsqueda: {q.strip()})' if q.strip() else ''}", request=request
        )
        db.commit()
    return PaginaVisitantesAdmin(
        items=[VisitanteAdminFila.model_validate(v).model_copy(update={"ferias": n}) for v, n in filas],
        total=total(db, base),
        pagina=pagina,
        por_pagina=por_pagina,
    )


@router.get("/admin/visitantes/{visitante_id}", response_model=VisitanteAdminDetalle)
def visitante(visitante_id: str, db: DB, sesion: SesionSuper, request: Request):
    """Datos del visitante, sus inscripciones (con cuántas empresas lo registraron) y su historial de aceptaciones."""
    v = db.get(Visitante, visitante_id)
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visitante no encontrado")
    filas = db.execute(
        select(Inscripcion, Feria, Organizador.nombre)
        .join(Feria, Feria.id == Inscripcion.feria_id)
        .join(Organizador, Organizador.id == Feria.organizador_id)
        .where(Inscripcion.visitante_id == v.id)
        .order_by(Feria.fecha_inicio.desc())
    ).all()
    leads = dict(
        db.execute(
            select(Empresa.feria_id, func.count()).join(Lead, Lead.empresa_id == Empresa.id).where(Lead.visitante_id == v.id).group_by(Empresa.feria_id)
        ).all()
    )
    aceptaciones = db.scalars(
        select(AceptacionPolitica).where(AceptacionPolitica.titular_id == v.id).order_by(AceptacionPolitica.creado_en.desc())
    ).all()
    registrar_actividad(db, sesion, "datos.ver", f"Abrió la ficha de {v.nombre} ({v.codigo})", entidad="visitante", entidad_id=v.id, request=request)
    db.commit()
    return VisitanteAdminDetalle(
        **VisitanteOut.model_validate(v).model_dump(),
        inscripciones=[
            InscripcionAdmin(
                feria_id=f.id, feria_nombre=f.nombre, organizador_nombre=org, estado=f.estado, fecha_inicio=f.fecha_inicio,
                fecha_fin=f.fecha_fin, inscrito_en=i.creado_en, asistio_en=i.asistio_en, leads=leads.get(f.id, 0),
            )
            for i, f, org in filas
        ],
        aceptaciones=[AceptacionOut.model_validate(a) for a in aceptaciones],
    )


# ---------- Registros: actividad del equipo y aceptaciones de la política ----------


@router.get("/admin/actividad", response_model=PaginaActividad)
def actividad(
    db: DB,
    _: SesionSuper,
    q: BuscarParam = "",
    accion: Annotated[str | None, Query(max_length=40, description="Prefijo, p. ej. «feria» o «datos.ver»")] = None,
    pagina: PaginaParam = 1,
    por_pagina: PorPaginaParam = 25,
):
    base = select(Auditoria)
    filtro = coincide(q, Auditoria.actor_nombre, Auditoria.descripcion)
    if filtro is not None:
        base = base.where(filtro)
    if accion:
        base = base.where(Auditoria.accion.like(f"{accion}%"))
    filas = db.scalars(recortar(base.order_by(Auditoria.creado_en.desc(), Auditoria.id), pagina, por_pagina)).all()
    return PaginaActividad(items=[ActividadOut.model_validate(a) for a in filas], total=total(db, base), pagina=pagina, por_pagina=por_pagina)


@router.get("/admin/aceptaciones", response_model=PaginaAceptaciones)
def aceptaciones(
    db: DB,
    _: SesionSuper,
    q: BuscarParam = "",
    origen: Annotated[str | None, Query(max_length=30)] = None,
    pagina: PaginaParam = 1,
    por_pagina: PorPaginaParam = 25,
):
    """Constancia de cada aceptación de la política de privacidad y tratamiento de datos."""
    base = select(AceptacionPolitica)
    filtro = coincide(q, AceptacionPolitica.nombre, AceptacionPolitica.email, AceptacionPolitica.ip, AceptacionPolitica.registrado_por)
    if filtro is not None:
        base = base.where(filtro)
    if origen:
        base = base.where(AceptacionPolitica.origen == origen)
    filas = db.scalars(recortar(base.order_by(AceptacionPolitica.creado_en.desc(), AceptacionPolitica.id), pagina, por_pagina)).all()
    return PaginaAceptaciones(items=[AceptacionOut.model_validate(a) for a in filas], total=total(db, base), pagina=pagina, por_pagina=por_pagina)
