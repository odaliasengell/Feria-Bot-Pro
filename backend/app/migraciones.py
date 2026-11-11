"""Cambios de esquema que `create_all` no aplica sobre tablas que ya existen.

Se ejecuta al arrancar, después de `create_all`, y no hace nada si ya se aplicó.
"""

from datetime import date, timedelta

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .utils import ahora, uid


def _agregar_ferias(engine: Engine) -> None:
    """Ferias: `empresas.feria_id` y una "Feria principal" para los datos que ya existían."""
    columnas = {c["name"] for c in inspect(engine).get_columns("empresas")}
    if "feria_id" in columnas:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE empresas ADD COLUMN feria_id VARCHAR(40) NULL AFTER id"))
        hay_empresas = conn.scalar(text("SELECT COUNT(*) FROM empresas")) > 0
        hay_visitantes = conn.scalar(text("SELECT COUNT(*) FROM visitantes")) > 0
        if hay_empresas or hay_visitantes:
            feria_id = uid("feria-")
            hoy = date.today()
            conn.execute(
                text(
                    "INSERT INTO ferias (id, nombre, descripcion, lugar, fecha_inicio, fecha_fin, inscripciones_abiertas, creado_en) "
                    "VALUES (:id, 'Feria principal', 'Feria creada automáticamente con los datos existentes.', '', :ini, :fin, 1, :t)"
                ),
                {"id": feria_id, "ini": hoy, "fin": hoy + timedelta(days=30), "t": ahora()},
            )
            conn.execute(text("UPDATE empresas SET feria_id = :id"), {"id": feria_id})
            conn.execute(
                text(
                    "INSERT INTO inscripciones (id, feria_id, visitante_id, creado_en) "
                    "SELECT CONCAT('ins-', id), :id, id, creado_en FROM visitantes"
                ),
                {"id": feria_id},
            )
        conn.execute(text("ALTER TABLE empresas MODIFY feria_id VARCHAR(40) NOT NULL"))
        conn.execute(text("CREATE INDEX ix_empresas_feria_id ON empresas (feria_id)"))
        conn.execute(
            text(
                "ALTER TABLE empresas ADD CONSTRAINT empresas_ibfk_feria "
                "FOREIGN KEY (feria_id) REFERENCES ferias (id) ON DELETE CASCADE"
            )
        )
    print("Migración: se agregaron las ferias (los datos existentes quedaron en «Feria principal»).")


def _agregar_politica(engine: Engine) -> None:
    """Aceptación de la política de privacidad en visitantes (NULL en las cuentas que ya existían)."""
    columnas = {c["name"] for c in inspect(engine).get_columns("visitantes")}
    with engine.begin() as conn:
        if "politica_aceptada_en" not in columnas:
            conn.execute(text("ALTER TABLE visitantes ADD COLUMN politica_aceptada_en DATETIME(6) NULL AFTER ciudad"))
        if "politica_version" not in columnas:
            conn.execute(text("ALTER TABLE visitantes ADD COLUMN politica_version VARCHAR(20) NULL AFTER politica_aceptada_en"))


def _agregar_recordatorio(engine: Engine) -> None:
    """Marca del recordatorio enviado a los inscritos un día antes de la feria."""
    columnas = {c["name"] for c in inspect(engine).get_columns("ferias")}
    if "recordatorio_enviado_en" not in columnas:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE ferias ADD COLUMN recordatorio_enviado_en DATETIME(6) NULL AFTER inscripciones_abiertas")
            )


def _agregar_asistencia(engine: Engine) -> None:
    """Hora de entrada del visitante a la feria, registrada en la puerta."""
    columnas = {c["name"] for c in inspect(engine).get_columns("inscripciones")}
    if "asistio_en" not in columnas:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE inscripciones ADD COLUMN asistio_en DATETIME(6) NULL AFTER creado_en"))


def _agregar_aforo(engine: Engine) -> None:
    """Máximo de inscritos por feria (NULL = sin límite)."""
    columnas = {c["name"] for c in inspect(engine).get_columns("ferias")}
    if "aforo" not in columnas:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE ferias ADD COLUMN aforo INT NULL AFTER inscripciones_abiertas"))


def _agregar_registrado_por(engine: Engine) -> None:
    """Quién escaneó al visitante (la tabla usuarios_empresa la crea create_all)."""
    columnas = {c["name"] for c in inspect(engine).get_columns("leads")}
    if "registrado_por" not in columnas:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE leads ADD COLUMN registrado_por VARCHAR(150) NULL AFTER nota"))


def _agregar_estado_lead(engine: Engine) -> None:
    """Seguimiento del lead (nuevo, contactado, cotizado, cerrado); los existentes quedan en «nuevo»."""
    columnas = {c["name"] for c in inspect(engine).get_columns("leads")}
    if "estado" not in columnas:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE leads ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'nuevo' AFTER calificacion"))


def _agregar_portada(engine: Engine) -> None:
    """Imagen de portada opcional de la feria y su texto alternativo."""
    columnas = {c["name"] for c in inspect(engine).get_columns("ferias")}
    with engine.begin() as conn:
        if "portada" not in columnas:
            conn.execute(text("ALTER TABLE ferias ADD COLUMN portada LONGTEXT NULL AFTER lugar"))
        if "portada_alt" not in columnas:
            conn.execute(text("ALTER TABLE ferias ADD COLUMN portada_alt VARCHAR(200) NOT NULL DEFAULT '' AFTER portada"))


def migrar(engine: Engine) -> None:
    _agregar_ferias(engine)
    _agregar_politica(engine)
    _agregar_recordatorio(engine)
    _agregar_asistencia(engine)
    _agregar_aforo(engine)
    _agregar_registrado_por(engine)
    _agregar_estado_lead(engine)
    _agregar_portada(engine)
