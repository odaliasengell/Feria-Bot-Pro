"""Estadísticas de una feria para el resumen del organizador (GET /ferias/:id/estadisticas).

Las fechas se guardan en UTC; los días y las horas se agrupan en hora local (settings.zona_horaria_utc).
"""

from collections import Counter
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import Empresa, Feria, Inscripcion, Lead, Visitante, VistaFicha
from .schemas import CiudadTotal, EmpresaRanking, EscaneosHora, EstadisticasOut, InscritosDia

SIN_CIUDAD = "Sin ciudad"


def _local(t: datetime) -> datetime:
    return t + timedelta(hours=settings.zona_horaria_utc)


def _inscritos_por_dia(fechas: list[datetime]) -> list[InscritosDia]:
    """Un punto por día, del primero al último con inscripciones; los días sin inscripciones van en 0."""
    if not fechas:
        return []
    por_dia = Counter(_local(t).date() for t in fechas)
    dia, fin = min(por_dia), max(por_dia)
    serie: list[InscritosDia] = []
    while dia <= fin:
        serie.append(InscritosDia(fecha=dia, total=por_dia.get(dia, 0)))
        dia += timedelta(days=1)
    return serie


def _escaneos_por_hora(fechas: list[datetime]) -> list[EscaneosHora]:
    """Leads por hora del día (sumando todos los días), de la primera a la última hora con escaneos."""
    if not fechas:
        return []
    por_hora = Counter(_local(t).hour for t in fechas)
    return [EscaneosHora(hora=h, total=por_hora.get(h, 0)) for h in range(min(por_hora), max(por_hora) + 1)]


def _ciudades(nombres: list[str]) -> list[CiudadTotal]:
    """Agrupa sin distinguir mayúsculas ni espacios; muestra la forma más usada de cada ciudad."""
    totales: Counter[str] = Counter()
    formas: dict[str, Counter[str]] = {}
    for nombre in nombres:
        limpio = " ".join(nombre.split()) or SIN_CIUDAD
        clave = limpio.casefold()
        totales[clave] += 1
        formas.setdefault(clave, Counter())[limpio] += 1
    filas = [CiudadTotal(ciudad=formas[c].most_common(1)[0][0], total=n) for c, n in totales.items()]
    return sorted(filas, key=lambda f: (f.ciudad == SIN_CIUDAD, -f.total, f.ciudad.casefold()))


def calcular(db: Session, feria: Feria) -> EstadisticasOut:
    inscripciones = db.execute(
        select(Inscripcion.creado_en, Inscripcion.asistio_en, Visitante.ciudad)
        .join(Visitante, Visitante.id == Inscripcion.visitante_id)
        .where(Inscripcion.feria_id == feria.id)
    ).all()

    empresas = db.execute(select(Empresa.id, Empresa.nombre).where(Empresa.feria_id == feria.id)).all()
    ids = [e.id for e in empresas]
    leads = dict(
        db.execute(select(Lead.empresa_id, func.count()).where(Lead.empresa_id.in_(ids)).group_by(Lead.empresa_id)).all()
    ) if ids else {}
    vistas = dict(
        db.execute(
            select(VistaFicha.empresa_id, func.count()).where(VistaFicha.empresa_id.in_(ids)).group_by(VistaFicha.empresa_id)
        ).all()
    ) if ids else {}
    escaneos = db.scalars(select(Lead.creado_en).where(Lead.empresa_id.in_(ids))).all() if ids else []

    ranking = sorted(
        (EmpresaRanking(empresa_id=e.id, nombre=e.nombre, leads=leads.get(e.id, 0), vistas=vistas.get(e.id, 0)) for e in empresas),
        key=lambda r: (-r.leads, -r.vistas, r.nombre.casefold()),
    )

    return EstadisticasOut(
        total_inscritos=len(inscripciones),
        asistentes=sum(1 for i in inscripciones if i.asistio_en is not None),
        inscritos_por_dia=_inscritos_por_dia([i.creado_en for i in inscripciones]),
        escaneos_por_hora=_escaneos_por_hora(list(escaneos)),
        ranking_empresas=ranking,
        ciudades=_ciudades([i.ciudad or "" for i in inscripciones]),
    )
