"""Planes que el Super Administrador vende a los organizadores y sus límites.

- Ferias: cuentan solo las no finalizadas (fecha de fin >= hoy). Las finalizadas quedan como historial.
- Empresas y visitantes: el límite es por feria.
- Vigencia: el plan rige de `plan_inicio` a `plan_fin`. Fuera de esas fechas (o con la cuenta suspendida) el
  organizador no crea ferias, empresas ni inscripciones nuevas. Con la cuenta suspendida tampoco puede ingresar.
"""

from datetime import date
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, object_session

from .models import Empresa, Feria, Inscripcion, Organizador, Plan

PlanId = Literal["basico", "profesional", "premium"]
EstadoCuenta = Literal["activa", "por_vencer", "vencida", "programada", "suspendida"]

# Días antes del vencimiento en que la cuenta se marca «por vencer».
DIAS_AVISO = 15


# Planes que se crean la primera vez (luego el Super Administrador cambia precios y límites desde su panel).
PLANES_INICIALES = [
    dict(id="basico", nombre="Básico", orden=1, precio_mensual=49, precio_anual=490, ferias=2, empresas_por_feria=200,
         visitantes_por_feria=1000, descripcion="Para organizar tus primeras ferias."),
    dict(id="profesional", nombre="Profesional", orden=2, precio_mensual=99, precio_anual=990, ferias=5, empresas_por_feria=200,
         visitantes_por_feria=5000, descripcion="Para organizadores con varias ferias al año."),
    dict(id="premium", nombre="Premium", orden=3, precio_mensual=199, precio_anual=1990, ferias=20, empresas_por_feria=400,
         visitantes_por_feria=10000, descripcion="Para grandes eventos y muchas ferias a la vez."),
]
PLANES_IDS = [p["id"] for p in PLANES_INICIALES]


def crear_planes_iniciales(db: Session) -> None:
    """Crea los planes que falten (no toca los que el Super Administrador ya editó)."""
    faltan = [p for p in PLANES_INICIALES if db.get(Plan, p["id"]) is None]
    for datos in faltan:
        db.add(Plan(**datos, publico=True))
    if faltan:
        db.commit()


def plan_de(org: Organizador) -> Plan:
    db = object_session(org)
    plan = db.get(Plan, org.plan) if db else None
    if plan is None and db is not None:
        plan = db.get(Plan, "basico")
    if plan is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No hay planes configurados.")
    return plan


def estado_cuenta(org: Organizador, hoy: date | None = None) -> EstadoCuenta:
    hoy = hoy or date.today()
    if not org.activo:
        return "suspendida"
    if org.plan_inicio and hoy < org.plan_inicio:
        return "programada"
    if org.plan_fin and hoy > org.plan_fin:
        return "vencida"
    if org.plan_fin and (org.plan_fin - hoy).days <= DIAS_AVISO:
        return "por_vencer"
    return "activa"


def puede_operar(org: Organizador) -> bool:
    return estado_cuenta(org) in ("activa", "por_vencer")


MOTIVO_NO_OPERA = {
    "suspendida": "Tu cuenta está suspendida.",
    "vencida": "Tu plan venció.",
    "programada": "Tu plan todavía no empieza.",
}


def exigir_operativo(org: Organizador | None) -> None:
    """403 si el organizador no puede crear cosas nuevas (plan vencido, programado o cuenta suspendida)."""
    if org is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción.")
    estado = estado_cuenta(org)
    if estado not in ("activa", "por_vencer"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"{MOTIVO_NO_OPERA[estado]} Puedes ver tus datos, pero para crear ferias, empresas o inscripciones "
            "comunícate con FeriaBot Pro para renovarlo.",
        )


# ---------- Uso ----------


# Los conteos que deciden un límite son lecturas con bloqueo (LOCK IN SHARE MODE): en MySQL (REPEATABLE READ) una
# lectura normal ve la «foto» tomada al inicio de la petición y no lo que otra petición simultánea acaba de crear.


def ferias_activas(db: Session, organizador_id: str, excepto: str | None = None) -> int:
    q = select(func.count()).select_from(Feria).where(Feria.organizador_id == organizador_id, Feria.fecha_fin >= date.today())
    if excepto:
        q = q.where(Feria.id != excepto)
    return db.scalar(q.with_for_update(read=True)) or 0


def empresas_en(db: Session, feria_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Empresa).where(Empresa.feria_id == feria_id).with_for_update(read=True)) or 0


def inscritos_en(db: Session, feria_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Inscripcion).where(Inscripcion.feria_id == feria_id).with_for_update(read=True)) or 0


# ---------- Comprobaciones al crear ----------


def bloquear_organizador(db: Session, organizador_id: str) -> None:
    """SELECT … FOR UPDATE sobre el organizador: si llegan varias peticiones a la vez (p. ej. 8 «crear feria»
    simultáneas), la segunda espera a que la primera termine y ya cuenta lo que esta creó. Sin esto, todas contaban
    «0 de 2» y todas pasaban el límite del plan. El bloqueo dura hasta el commit de la petición."""
    db.execute(select(Organizador.id).where(Organizador.id == organizador_id).with_for_update())


def bloquear_feria(db: Session, feria_id: str) -> None:
    """Igual que `bloquear_organizador`, para los límites por feria (empresas, visitantes y aforo)."""
    db.execute(select(Feria.id).where(Feria.id == feria_id).with_for_update())


def exigir_cupo_ferias(db: Session, org: Organizador, excepto: str | None = None) -> None:
    """Antes de crear (o reactivar) una feria: el plan admite N ferias no finalizadas a la vez."""
    bloquear_organizador(db, org.id)
    exigir_operativo(org)
    plan = plan_de(org)
    if ferias_activas(db, org.id, excepto) >= plan.ferias:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Tu plan {plan.nombre} permite {plan.ferias} ferias en curso o próximas a la vez. "
            "Espera a que termine una, elimina alguna o mejora tu plan.",
        )


def exigir_cupo_empresas(db: Session, feria: Feria) -> int:
    """Antes de agregar empresas a la feria. Devuelve cuántas caben todavía."""
    bloquear_feria(db, feria.id)
    org = feria.organizador
    exigir_operativo(org)
    plan = plan_de(org)
    libres = plan.empresas_por_feria - empresas_en(db, feria.id)
    if libres <= 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"«{feria.nombre}» llegó al límite de tu plan {plan.nombre}: {plan.empresas_por_feria} empresas por feria.",
        )
    return libres


def exigir_cupo_visitantes(db: Session, feria: Feria, *, es_organizador: bool) -> None:
    """Antes de inscribir a un visitante. El público ve un mensaje genérico; el organizador, el de su plan."""
    bloquear_feria(db, feria.id)
    org = feria.organizador
    if org is None or not puede_operar(org):
        if es_organizador:
            exigir_operativo(org)
        raise HTTPException(status.HTTP_409_CONFLICT, f"Las inscripciones para «{feria.nombre}» no están disponibles.")
    plan = plan_de(org)
    if inscritos_en(db, feria.id) >= plan.visitantes_por_feria:
        if es_organizador:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"«{feria.nombre}» llegó al límite de tu plan {plan.nombre}: {plan.visitantes_por_feria} visitantes por feria.",
            )
        raise HTTPException(status.HTTP_409_CONFLICT, "La feria está llena")
