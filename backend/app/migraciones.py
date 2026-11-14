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


def _agregar_ruc(engine: Engine) -> None:
    """RUC de la empresa, único dentro de cada feria."""
    columnas = {c["name"] for c in inspect(engine).get_columns("empresas")}
    if "ruc" not in columnas:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE empresas ADD COLUMN ruc VARCHAR(13) NULL AFTER nombre"))
    restricciones = {u["name"] for u in inspect(engine).get_unique_constraints("empresas")}
    if "uq_empresa_feria_ruc" not in restricciones:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE empresas ADD CONSTRAINT uq_empresa_feria_ruc UNIQUE (feria_id, ruc)"))


def _agregar_planes(engine: Engine) -> None:
    """Organizadores como clientes con plan, y cada feria de un organizador.

    Las ferias que ya existían pasan al primer organizador, al que se le da plan Premium por un año para que siga
    funcionando igual.
    """
    columnas = {c["name"] for c in inspect(engine).get_columns("organizadores")}
    nuevas = [
        ("ruc", "VARCHAR(13) NULL UNIQUE"),
        ("contacto_nombre", "VARCHAR(150) NOT NULL DEFAULT ''"),
        ("telefono", "VARCHAR(40) NOT NULL DEFAULT ''"),
        ("direccion", "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("ciudad", "VARCHAR(100) NOT NULL DEFAULT ''"),
        ("sitio_web", "VARCHAR(255) NULL"),
        ("notas", "TEXT NULL"),
        ("plan", "VARCHAR(20) NOT NULL DEFAULT 'basico'"),
        ("plan_inicio", "DATE NULL"),
        ("plan_fin", "DATE NULL"),
        ("activo", "TINYINT(1) NOT NULL DEFAULT 1"),
    ]
    agregadas = [n for n, _ in nuevas if n not in columnas]
    with engine.begin() as conn:
        for nombre, tipo in nuevas:
            if nombre in agregadas:
                conn.execute(text(f"ALTER TABLE organizadores ADD COLUMN {nombre} {tipo}"))
        if "plan" in agregadas:
            # Las cuentas que ya había: Premium por un año desde hoy.
            conn.execute(text(
                "UPDATE organizadores SET plan = 'premium', plan_inicio = CURDATE(), "
                "plan_fin = DATE_ADD(CURDATE(), INTERVAL 1 YEAR), notas = COALESCE(notas, '')"
            ))

    columnas = {c["name"] for c in inspect(engine).get_columns("ferias")}
    if "organizador_id" not in columnas:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE ferias ADD COLUMN organizador_id VARCHAR(40) NULL AFTER id"))
            primero = conn.scalar(text("SELECT id FROM organizadores ORDER BY creado_en LIMIT 1"))
            hay_ferias = conn.scalar(text("SELECT COUNT(*) FROM ferias")) > 0
            if hay_ferias and not primero:
                primero = "org-inicial"
                conn.execute(
                    text(
                        "INSERT INTO organizadores (id, nombre, email, password_hash, plan, plan_inicio, plan_fin, activo, notas, creado_en) "
                        "VALUES (:id, 'Organización', :email, '', 'premium', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR), 1, '', NOW())"
                    ),
                    {"id": primero, "email": "sin-correo@feriabot.local"},
                )
            if primero:
                conn.execute(text("UPDATE ferias SET organizador_id = :id"), {"id": primero})
            conn.execute(text("ALTER TABLE ferias MODIFY organizador_id VARCHAR(40) NOT NULL"))
            conn.execute(text("CREATE INDEX ix_ferias_organizador_id ON ferias (organizador_id)"))
            conn.execute(text(
                "ALTER TABLE ferias ADD CONSTRAINT ferias_ibfk_organizador "
                "FOREIGN KEY (organizador_id) REFERENCES organizadores (id) ON DELETE CASCADE"
            ))


def _historico_aceptaciones(engine: Engine) -> None:
    """La primera vez, copia a `aceptaciones_politica` la aceptación guardada en cada visitante (origen «historico»)."""
    tablas = inspect(engine).get_table_names()
    if "aceptaciones_politica" not in tablas:
        return
    with engine.begin() as conn:
        if conn.scalar(text("SELECT COUNT(*) FROM aceptaciones_politica WHERE origen = 'historico'")):
            return
        conn.execute(text(
            "INSERT INTO aceptaciones_politica (id, tipo, titular_id, nombre, email, version, origen, registrado_por, ip, user_agent, creado_en) "
            "SELECT CONCAT('acp-h-', id), 'visitante', id, nombre, COALESCE(email, ''), COALESCE(politica_version, ''), 'historico', '', '', '', politica_aceptada_en "
            "FROM visitantes WHERE politica_aceptada_en IS NOT NULL"
        ))


def _agregar_pago_tarjeta(engine: Engine) -> None:
    """Datos del pago con tarjeta (PayPhone) en las solicitudes."""
    if "solicitudes_plan" not in inspect(engine).get_table_names():
        return
    columnas = {c["name"] for c in inspect(engine).get_columns("solicitudes_plan")}
    with engine.begin() as conn:
        for nombre, largo in (("pago_id", 40), ("transaccion_id", 40), ("autorizacion", 40), ("tarjeta", 60)):
            if nombre not in columnas:
                conn.execute(text(f"ALTER TABLE solicitudes_plan ADD COLUMN {nombre} VARCHAR({largo}) NOT NULL DEFAULT ''"))


def migrar(engine: Engine) -> None:
    _agregar_ferias(engine)
    _agregar_politica(engine)
    _agregar_recordatorio(engine)
    _agregar_asistencia(engine)
    _agregar_aforo(engine)
    _agregar_registrado_por(engine)
    _agregar_estado_lead(engine)
    _agregar_portada(engine)
    _agregar_ruc(engine)
    _agregar_planes(engine)
    _historico_aceptaciones(engine)
    _agregar_pago_tarjeta(engine)
