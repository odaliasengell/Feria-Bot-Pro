"""Carga masiva de empresas desde Excel (POST /empresas/importar) y su plantilla (GET /empresas/plantilla)."""

import io
import unicodedata
import zipfile
from dataclasses import dataclass, field

from email_validator import EmailNotValidError, validate_email
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Empresa, UsuarioEmpresa

MAX_BYTES = 5 * 1024 * 1024
MAX_FILAS = 2000

# campo -> (títulos aceptados en la fila 1, largo máximo, obligatorio, ancho en la plantilla)
COLUMNAS: dict[str, tuple[tuple[str, ...], int, bool, int]] = {
    "nombre": (("nombre", "empresa"), 150, True, 28),
    "rubro": (("rubro",), 100, False, 22),
    "stand": (("stand",), 20, False, 8),
    "contacto": (("contacto", "persona de contacto"), 150, False, 24),
    "email": (("email", "correo", "correo electronico"), 150, True, 30),
    "telefono": (("telefono", "celular", "whatsapp"), 40, False, 18),
    "password": (("password", "contrasena", "clave"), 72, False, 16),
}


class ArchivoInvalido(ValueError):
    """El archivo completo no se puede procesar (no es .xlsx, faltan columnas, demasiado grande)."""


@dataclass
class FilaValida:
    fila: int
    datos: dict[str, str]


@dataclass
class Resultado:
    validas: list[FilaValida] = field(default_factory=list)
    errores: list[tuple[int, str]] = field(default_factory=list)


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.lower().replace("_", " ").split())


def _celda(valor) -> str:
    """Texto de la celda: 12.0 -> '12', 593991234567 -> '593991234567', None -> ''."""
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return str(valor).strip()


def leer(contenido: bytes, db: Session) -> Resultado:
    """Valida todas las filas; las inválidas van a `errores` con su número de fila de Excel."""
    if len(contenido) > MAX_BYTES:
        raise ArchivoInvalido("El archivo supera 5 MB.")
    try:
        wb = load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except (InvalidFileException, zipfile.BadZipFile, KeyError, OSError, ValueError):
        raise ArchivoInvalido("El archivo no es un Excel (.xlsx) válido.")

    filas = wb.active.iter_rows(values_only=True)
    encabezado = next(filas, None)
    if not encabezado:
        raise ArchivoInvalido("El archivo está vacío.")
    posiciones: dict[str, int] = {}
    for i, titulo in enumerate(encabezado):
        nombre = _normalizar(_celda(titulo))
        for campo, (titulos, *_resto) in COLUMNAS.items():
            if nombre in titulos and campo not in posiciones:
                posiciones[campo] = i
    faltan = [c for c, (_t, _l, obligatoria, _a) in COLUMNAS.items() if obligatoria and c not in posiciones]
    if faltan:
        raise ArchivoInvalido(f"Faltan las columnas: {', '.join(faltan)}. Usa la plantilla.")

    resultado = Resultado()
    vistos: set[str] = set()
    for n, fila in enumerate(filas, start=2):
        datos = {c: _celda(fila[i]) if i < len(fila) else "" for c, i in posiciones.items()}
        if not any(datos.values()):
            continue  # fila vacía
        if n - 1 > MAX_FILAS:
            raise ArchivoInvalido(f"El archivo tiene más de {MAX_FILAS} empresas.")
        motivo = _validar(datos, vistos, db)
        if motivo:
            resultado.errores.append((n, motivo))
        else:
            vistos.add(datos["email"])
            resultado.validas.append(FilaValida(n, datos))
    wb.close()
    return resultado


def _validar(datos: dict[str, str], vistos: set[str], db: Session) -> str | None:
    if not datos.get("nombre"):
        return "Falta el nombre."
    if not datos.get("email"):
        return "Falta el correo."
    for campo, (_t, largo, _o, _a) in COLUMNAS.items():
        if len(datos.get(campo, "")) > largo:
            return f"{campo}: máximo {largo} caracteres."
    try:
        datos["email"] = validate_email(datos["email"], check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        return f"Correo no válido: {datos['email']}."
    if datos["email"] in vistos:
        return f"El correo {datos['email']} está repetido en el archivo."
    if db.scalar(select(Empresa.id).where(Empresa.email == datos["email"])) or db.scalar(
        select(UsuarioEmpresa.id).where(UsuarioEmpresa.email == datos["email"])
    ):
        return f"Ya existe una cuenta con el correo {datos['email']}."
    password = datos.get("password", "")
    if password and len(password) < 6:
        return "La contraseña debe tener al menos 6 caracteres."
    return None


def plantilla_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Empresas"
    for col, (campo, (_t, _l, obligatoria, ancho)) in enumerate(COLUMNAS.items(), start=1):
        c = ws.cell(row=1, column=col, value=campo)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0A0E1C" if obligatoria else "475269")
        ws.column_dimensions[get_column_letter(col)].width = ancho
    ws.freeze_panes = "A2"

    ayuda = wb.create_sheet("Instrucciones")
    lineas = [
        "Una empresa por fila, desde la fila 2 de la hoja Empresas. No cambies los títulos de la fila 1.",
        "Obligatorias: nombre y email (columnas oscuras). El correo no puede repetirse.",
        "password (opcional, mínimo 6 caracteres): si la pones, la empresa puede entrar a su panel y recibe un correo con su acceso.",
        "Las filas con errores no se cargan; el resultado indica el número de fila y el motivo. Las demás sí se cargan.",
    ]
    for i, linea in enumerate(lineas, start=1):
        ayuda.cell(row=i, column=1, value=linea)
    ayuda.column_dimensions["A"].width = 110

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
