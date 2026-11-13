"""Paginación y búsqueda en el servidor para los listados grandes (visitantes y leads)."""

from typing import Annotated, Any

from fastapi import Query
from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session

POR_PAGINA_MAX = 100

PaginaParam = Annotated[int, Query(ge=1, description="Página, desde 1")]
PorPaginaParam = Annotated[int, Query(alias="porPagina", ge=1, le=POR_PAGINA_MAX, description="Filas por página")]
BuscarParam = Annotated[str, Query(max_length=100, description="Texto a buscar")]


def total(db: Session, q: Select[Any]) -> int:
    """Cantidad de filas de la consulta (sin su orden ni límite)."""
    return db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0


def recortar(q: Select[Any], pagina: int, por_pagina: int) -> Select[Any]:
    return q.limit(por_pagina).offset((pagina - 1) * por_pagina)


def _escapar(texto: str) -> str:
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def coincide(texto: str, *columnas: ColumnElement[Any]) -> ColumnElement[bool] | None:
    """Cada palabra del texto debe aparecer en alguna de las columnas. Mayúsculas y tildes no importan (lo
    resuelve la collation de MySQL). Devuelve None si no hay nada que buscar."""
    palabras = texto.split()[:6]
    if not palabras:
        return None
    return and_(*(or_(*(func.coalesce(c, "").like(f"%{_escapar(p)}%") for c in columnas)) for p in palabras))
