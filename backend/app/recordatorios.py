"""Recordatorio por correo a los inscritos un día antes de que empiece la feria.

Uso (programarlo una vez al día, por ejemplo con el Programador de tareas de Windows o cron):
    .\\.venv\\Scripts\\python -m app.recordatorios

Envía el recordatorio de las ferias que empiezan mañana y que aún no lo recibieron, y las marca en
`ferias.recordatorio_enviado_en` para no repetirlo. El organizador también puede enviarlo a mano con
POST /ferias/:id/recordatorio.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .correo import enviar_recordatorio_feria, rango_fechas
from .models import Feria, Inscripcion, Visitante
from .utils import ahora

log = logging.getLogger("feriabot.recordatorios")


def enviar_recordatorio(db: Session, feria: Feria) -> int:
    """Envía el recordatorio a los inscritos con correo, marca la feria y devuelve cuántos se enviaron.

    Un correo que falla no detiene a los demás: se registra en el log y no se cuenta.
    """
    visitantes = db.scalars(
        select(Visitante)
        .join(Inscripcion, Inscripcion.visitante_id == Visitante.id)
        .where(Inscripcion.feria_id == feria.id, Visitante.email.is_not(None))
        .order_by(Visitante.nombre)
    ).all()
    fechas = rango_fechas(feria.fecha_inicio, feria.fecha_fin)
    enviados = 0
    for v in visitantes:
        try:
            enviar_recordatorio_feria(v.email, v.nombre, v.codigo, feria.nombre, fechas, feria.lugar)
            enviados += 1
        except Exception:  # noqa: BLE001 — un correo fallido no debe cortar el envío a los demás
            log.exception("No se pudo enviar el recordatorio de %s a %s", feria.id, v.email)
    feria.recordatorio_enviado_en = ahora()
    db.commit()
    return enviados


def ferias_de_manana(db: Session, hoy: date | None = None) -> list[Feria]:
    """Ferias que empiezan mañana y todavía no recibieron el recordatorio."""
    manana = (hoy or date.today()) + timedelta(days=1)
    return list(
        db.scalars(
            select(Feria).where(Feria.fecha_inicio == manana, Feria.recordatorio_enviado_en.is_(None)).order_by(Feria.nombre)
        ).all()
    )


def main() -> None:
    from .database import Base, SessionLocal, engine
    from .migraciones import migrar

    Base.metadata.create_all(engine)
    migrar(engine)
    with SessionLocal() as db:
        ferias = ferias_de_manana(db)
        if not ferias:
            print("No hay ferias que empiecen mañana con recordatorio pendiente.")
        for feria in ferias:
            n = enviar_recordatorio(db, feria)
            print(f"«{feria.nombre}»: recordatorio enviado a {n} inscritos.")


if __name__ == "__main__":
    main()
