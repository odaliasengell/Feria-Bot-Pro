"""Mensajes de error en español para el usuario.

Pydantic valida los datos y escribe sus mensajes en inglés y con el nombre técnico del campo
(«contactoNombre: String should have at least 2 characters»). Aquí se traducen a frases que el frontend puede mostrar
tal cual («La persona de contacto debe tener al menos 2 caracteres»).
"""

import re
from typing import Any

# Nombre legible de cada campo (en camelCase, como llega del frontend).
CAMPOS = {
    "nombre": "El nombre",
    "email": "El correo",
    "password": "La contraseña",
    "passwordActual": "La contraseña actual",
    "passwordNueva": "La nueva contraseña",
    "telefono": "El teléfono",
    "ruc": "El RUC",
    "codigo": "El código",
    "codigoVerificacion": "El código de verificación",
    "contactoNombre": "La persona de contacto",
    "rubro": "El rubro",
    "stand": "El stand",
    "descripcion": "La descripción",
    "servicios": "Los servicios",
    "sitioWeb": "El sitio web",
    "ciudad": "La ciudad",
    "empresa": "La empresa",
    "direccion": "La dirección",
    "notas": "Las notas",
    "lugar": "El lugar",
    "fechaInicio": "La fecha de inicio",
    "fechaFin": "La fecha de fin",
    "planInicio": "La fecha de inicio del plan",
    "planFin": "La fecha de fin del plan",
    "aforo": "El aforo",
    "portada": "La portada",
    "portadaAlt": "El texto de la portada",
    "logo": "El logo",
    "fotos": "Las fotos",
    "feriaId": "La feria",
    "empresaId": "La empresa",
    "visitanteId": "El visitante",
    "planId": "El plan",
    "plan": "El plan",
    "periodo": "El periodo",
    "metodoPago": "La forma de pago",
    "calificacion": "La calificación",
    "estado": "El estado",
    "nota": "La nota",
    "motivo": "El motivo",
    "comprobante": "El comprobante",
    "referencia": "El número de transacción",
    "mensaje": "El comentario",
    "precioMensual": "El precio mensual",
    "precioAnual": "El precio anual",
    "ferias": "El número de ferias",
    "empresasPorFeria": "Las empresas por feria",
    "visitantesPorFeria": "Los visitantes por feria",
    "porPagina": "Las filas por página",
    "pagina": "La página",
    "q": "La búsqueda",
}


def _campo(loc: tuple[Any, ...]) -> str:
    partes = [str(x) for x in loc if x not in ("body", "query", "path")]
    if not partes:
        return ""
    clave = next((p for p in reversed(partes) if not p.isdigit()), partes[-1])
    return CAMPOS.get(clave, f"El campo «{clave}»")


def traducir(error: dict[str, Any]) -> str:
    """Un error de Pydantic → frase en español."""
    tipo = error.get("type", "")
    ctx = error.get("ctx") or {}
    msg = str(error.get("msg", ""))
    campo = _campo(tuple(error.get("loc", ())))
    sujeto = campo or "El dato"

    if tipo == "value_error":
        # Mensajes propios (RUC, fechas…) ya escritos para el usuario. El de un correo inválido viene de email-validator.
        texto = msg.removeprefix("Value error, ")
        if "email address" in texto or "@-sign" in texto:
            return f"{sujeto} no es válido. Escribe un correo como nombre@empresa.com."
        return texto
    if tipo == "missing":
        return f"{sujeto} es obligatorio."
    if tipo in ("string_too_short", "too_short"):
        n = ctx.get("min_length", 1)
        return f"{sujeto} es obligatorio." if n == 1 else f"{sujeto} debe tener al menos {n} caracteres."
    if tipo in ("string_too_long", "too_long"):
        n = ctx.get("max_length")
        return f"{sujeto} admite como máximo {n} {'caracteres' if tipo == 'string_too_long' else 'elementos'}."
    if tipo == "string_pattern_mismatch":
        return f"{sujeto} no tiene el formato correcto."
    for k in ("ge", "gt", "le", "lt"):
        if isinstance(ctx.get(k), float) and ctx[k].is_integer():
            ctx = {**ctx, k: int(ctx[k])}
    if tipo in ("greater_than_equal", "greater_than"):
        return f"{sujeto} debe ser {'mayor o igual a' if tipo == 'greater_than_equal' else 'mayor que'} {ctx.get('ge', ctx.get('gt'))}."
    if tipo in ("less_than_equal", "less_than"):
        return f"{sujeto} debe ser {'menor o igual a' if tipo == 'less_than_equal' else 'menor que'} {ctx.get('le', ctx.get('lt'))}."
    if tipo in ("int_parsing", "int_type", "int_from_float"):
        return f"{sujeto} debe ser un número entero."
    if tipo in ("float_parsing", "float_type", "decimal_parsing"):
        return f"{sujeto} debe ser un número."
    if tipo in ("bool_parsing", "bool_type"):
        return f"{sujeto} debe ser sí o no."
    if tipo.startswith("date") or tipo.startswith("datetime"):
        return f"{sujeto} no es una fecha válida."
    if tipo in ("literal_error", "enum"):
        opciones = re.findall(r"'([^']+)'", str(ctx.get("expected", "")))
        return f"{sujeto} no es válido" + (f" (opciones: {', '.join(opciones)})." if opciones else ".")
    if tipo in ("string_type", "list_type", "dict_type", "model_type", "model_attributes_type"):
        return f"{sujeto} tiene un formato que no es válido."
    if tipo == "json_invalid":
        return "Los datos enviados no son válidos."
    if tipo == "url_parsing" or tipo.startswith("url"):
        return f"{sujeto} no es una dirección web válida."
    return f"{campo}: {msg}" if campo else msg
