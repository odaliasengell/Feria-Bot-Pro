"""Exportación de leads a Excel (.xlsx) para GET /leads/exportar."""

import io
import re
import unicodedata
from datetime import datetime, timedelta

from openpyxl import Workbook
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .config import settings
from .models import Lead
from .utils import ahora

CALIFICACIONES = {
    "interesado": "Interesado",
    "visita": "Agendar visita",
    "correo": "Enviar correo",
    "no_interesado": "No interesado",
}
ESTADOS = {"nuevo": "Nuevo", "contactado": "Contactado", "cotizado": "Cotizado", "cerrado": "Cerrado"}

# (título, ancho)
COLUMNAS = [
    ("Fecha", 18),
    ("Empresa", 24),
    ("Stand", 8),
    ("Visitante", 26),
    ("Código", 12),
    ("Correo", 30),
    ("Teléfono", 18),
    ("Empresa del visitante", 24),
    ("Ciudad", 14),
    ("Calificación", 16),
    ("Estado", 12),
    ("Nota", 40),
    ("Registrado por", 22),
]

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _local(t: datetime) -> datetime:
    return t + timedelta(hours=settings.zona_horaria_utc)


def _texto(celda: Cell, valor: str | None) -> None:
    """Siempre como texto: una nota que empieza con '=' no debe convertirse en fórmula al abrir el archivo."""
    celda.value = valor or ""
    celda.data_type = "s"


def generar_xlsx(leads: list[Lead]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"

    negrita = Font(bold=True, color="FFFFFF")
    fondo = PatternFill("solid", fgColor="0A0E1C")
    for col, (titulo, ancho) in enumerate(COLUMNAS, start=1):
        c = ws.cell(row=1, column=col, value=titulo)
        c.font = negrita
        c.fill = fondo
        c.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(col)].width = ancho

    for fila, lead in enumerate(leads, start=2):
        v, e = lead.visitante, lead.empresa
        fecha = ws.cell(row=fila, column=1, value=_local(lead.creado_en).replace(microsecond=0))
        fecha.number_format = "yyyy-mm-dd hh:mm"
        textos = [
            e.nombre if e else "",
            e.stand if e else "",
            v.nombre if v else "",
            v.codigo if v else "",
            (v.email or "") if v else "",
            v.telefono if v else "",
            v.empresa if v else "",
            v.ciudad if v else "",
            CALIFICACIONES.get(lead.calificacion, lead.calificacion),
            ESTADOS.get(lead.estado, lead.estado),
            lead.nota,
            lead.registrado_por,
        ]
        for col, valor in enumerate(textos, start=2):
            celda = ws.cell(row=fila, column=col)
            _texto(celda, valor)
            if COLUMNAS[col - 1][0] == "Nota":
                celda.alignment = Alignment(wrap_text=True, vertical="top")

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNAS))}{max(1, len(leads) + 1)}"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def nombre_archivo(base: str) -> str:
    """'leads-expo-negocios-2026-2026-11-01.xlsx' (solo ASCII, para la cabecera Content-Disposition)."""
    ascii_ = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_).strip("-").lower() or "todos"
    hoy = _local(ahora()).date().isoformat()
    return f"leads-{slug[:60]}-{hoy}.xlsx"
