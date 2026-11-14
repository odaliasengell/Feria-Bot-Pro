"""Contratar un plan desde la página principal.

Por ahora el pago es por **transferencia**: el cliente sube el comprobante, la solicitud queda pendiente y un encargado
de FeriaBot Pro (Super Administrador) la aprueba —se crea la cuenta del organizador y le llega su acceso— o la rechaza
con un motivo. El pago con tarjeta (pasarela) queda para más adelante: `metodo_pago="tarjeta"` responde 400.
"""

import secrets
from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..correo import (
    enviar_acceso_organizador,
    enviar_aviso_solicitud,
    enviar_sin_fallar,
    enviar_solicitud_rechazada,
    enviar_solicitud_recibida,
)
from .. import payphone
from ..config import settings
from ..database import DB
from ..limites import registrar_intento
from ..models import Ajuste, Organizador, Plan, SolicitudPlan, SuperAdmin
from ..schemas import (
    ComprobanteOut,
    ConfirmarPago,
    MetodosPagoOut,
    PagoDemo,
    PagoDemoOut,
    ResultadoPago,
    DatosTransferencia,
    EstadoSolicitud,
    OrganizadorAdminOut,
    Sesion,
    SolicitudCrear,
    SolicitudCreadaOut,
    SolicitudOut,
    SolicitudRechazar,
)
from ..registros import registrar_aceptacion, registrar_actividad
from ..security import hash_password, requiere
from ..utils import ahora, uid
from .admin import _admin_out, _usos, _validar_unicos

router = APIRouter(tags=["solicitudes"])

SesionSuper = Annotated[Sesion, Depends(requiere("superadmin"))]
CLAVE_TRANSFERENCIA = "transferencia"
PERIODO = {"mensual": "Mensual", "anual": "Anual"}


def _sumar_meses(d: date, meses: int) -> date:
    m = d.month - 1 + meses
    y, m = d.year + m // 12, m % 12 + 1
    dias = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return date(y, m, min(d.day, dias[m - 1]))


def _datos_transferencia(db: Session) -> DatosTransferencia:
    ajuste = db.get(Ajuste, CLAVE_TRANSFERENCIA)
    return DatosTransferencia(**(ajuste.valor if ajuste else {}))


def _out(s: SolicitudPlan, planes: dict[str, str]) -> SolicitudOut:
    return SolicitudOut.model_validate(s).model_copy(
        update={"plan_nombre": planes.get(s.plan_id, s.plan_id), "tiene_comprobante": bool(s.comprobante)}
    )


def _nombres_planes(db: Session) -> dict[str, str]:
    return dict(db.execute(select(Plan.id, Plan.nombre)).all())


def _pendiente(db: Session, solicitud_id: str) -> SolicitudPlan:
    s = db.get(SolicitudPlan, solicitud_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Solicitud no encontrada")
    if s.estado == "pago_pendiente":
        raise HTTPException(status.HTTP_409_CONFLICT, "Este pago con tarjeta no se completó: no hay nada que aprobar.")
    if s.estado != "pendiente":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Esta solicitud ya fue {s.estado}.")
    return s


# ---------- Público ----------


@router.get("/pago/metodos", response_model=MetodosPagoOut)
def metodos_pago(db: DB):
    """Qué formas de pago están activas: transferencia (con datos bancarios) y tarjeta (PayPhone configurado)."""
    d = _datos_transferencia(db)
    return MetodosPagoOut(transferencia=bool(d.banco and d.numero_cuenta), tarjeta=payphone.configurado(), demo=payphone.demo())


@router.post("/pagos/demo/pagar", response_model=PagoDemoOut)
def pagar_demo(data: PagoDemo, db: DB):
    """Solo en modo demostración: simula el pago en la cajita y devuelve lo que PayPhone pondría en la URL de respuesta.
    Después el frontend sigue el flujo real (`/contratar/resultado` → `POST /pagos/payphone/confirmar`)."""
    if not payphone.demo():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No disponible.")
    s = db.get(SolicitudPlan, data.client_transaction_id)
    if not s or s.metodo_pago != "tarjeta" or s.estado != "pago_pendiente":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos ese pago pendiente.")
    pid = payphone.pagar_demo(s.id, float(s.monto), data.aprobado, data.marca, data.ultimos)
    return PagoDemoOut(id=pid, client_transaction_id=s.id)


@router.post("/pagos/payphone/confirmar", response_model=ResultadoPago)
def confirmar_payphone(data: ConfirmarPago, db: DB, tareas: BackgroundTasks):
    """El cliente volvió de PayPhone: se confirma el pago con PayPhone (no con lo que diga el navegador). Si está
    aprobado y el monto coincide, se crea la cuenta. Se puede llamar más de una vez: responde el mismo resultado."""
    # Bloquea la fila: si llegan dos confirmaciones a la vez, la segunda espera y ve el resultado de la primera.
    s = db.scalar(select(SolicitudPlan).where(SolicitudPlan.id == data.client_transaction_id).with_for_update())
    if not s or s.metodo_pago != "tarjeta":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No encontramos ese pago.")
    plan = db.get(Plan, s.plan_id)
    plan_nombre = plan.nombre if plan else s.plan_id

    def resultado(mensaje: str) -> ResultadoPago:
        return ResultadoPago(
            estado=s.estado, plan_nombre=plan_nombre, periodo=s.periodo, monto=float(s.monto), email=s.email,
            mensaje=mensaje, tarjeta=s.tarjeta, autorizacion=s.autorizacion,
        )

    if s.estado == "aprobada":
        return resultado("Tu pago ya fue confirmado. Te enviamos el acceso a tu correo.")
    if s.estado == "rechazada":
        return resultado(s.motivo_rechazo or "El pago no se completó.")
    try:
        r = payphone.confirmar(data.id, s.id)
    except payphone.PayPhoneError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No pudimos confirmar el pago con PayPhone. Recarga esta página en unos segundos.")

    s.transaccion_id = str(r.get("transactionId", data.id))[:40]
    s.autorizacion = str(r.get("authorizationCode") or "")[:40]
    s.tarjeta = " ".join(x for x in [str(r.get("cardBrand") or ""), f"**** {r.get('lastDigits')}" if r.get("lastDigits") else ""] if x)[:60]
    s.referencia = f"PayPhone {s.transaccion_id}"[:100]
    aprobado = r.get("statusCode") == 3 or r.get("transactionStatus") == "Approved"
    monto_ok = r.get("amount") in (None, payphone.centavos(s.monto))
    if not aprobado or not monto_ok or r.get("clientTransactionId", s.id) != s.id:
        s.estado = "rechazada"
        s.motivo_rechazo = (
            "El pago fue cancelado o rechazado por la tarjeta." if not aprobado else "El monto pagado no coincide con el del plan; revisaremos tu caso."
        )
        s.revisado_por = "PayPhone"
        s.revisado_en = ahora()
        db.commit()
        return resultado(s.motivo_rechazo)
    try:
        _crear_cuenta(db, s, revisor="PayPhone (automático)", tareas=tareas)
    except HTTPException as e:
        # Pagó, pero ya existe una cuenta con su correo o RUC: queda pendiente para que un encargado lo resuelva.
        s.estado = "pendiente"
        s.mensaje = (s.mensaje + f" [Pago aprobado; no se creó la cuenta: {e.detail}]").strip()[:1000]
        db.commit()
        return resultado("Recibimos tu pago. Un encargado terminará de activar tu cuenta y te escribiremos.")
    db.commit()
    return resultado("¡Pago aprobado! Tu cuenta está lista: te enviamos el acceso a tu correo.")



@router.get("/pago/transferencia", response_model=DatosTransferencia)
def datos_transferencia(db: DB):
    """Cuenta bancaria para transferir (la muestra el formulario de contratación)."""
    return _datos_transferencia(db)


@router.post("/solicitudes", response_model=SolicitudCreadaOut, status_code=status.HTTP_201_CREATED)
def crear_solicitud(data: SolicitudCrear, db: DB, request: Request, tareas: BackgroundTasks):
    """Solicitud de un plan con el comprobante de la transferencia. Máximo 5 por hora desde la misma IP."""
    if data.empresa_web.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se pudo enviar la solicitud.")
    registrar_intento(request, "solicitud", 5, 3600)
    if not data.acepta_politica:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Debes aceptar la política de privacidad y tratamiento de datos.")
    tarjeta = data.metodo_pago == "tarjeta"
    if tarjeta and not payphone.configurado():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El pago con tarjeta estará disponible pronto. Por ahora paga por transferencia.")
    if not tarjeta and not data.comprobante:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sube el comprobante de la transferencia.")
    plan = db.get(Plan, data.plan_id)
    if not plan or not plan.publico:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese plan no está disponible.")
    email = data.email.lower()
    if db.scalar(select(Organizador.id).where((Organizador.email == email) | (Organizador.ruc == data.ruc))):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ya existe una cuenta de organizador con ese correo o RUC. Ingresa a tu panel o comunícate con nosotros para renovar.",
        )
    if db.scalar(select(SolicitudPlan.id).where(SolicitudPlan.email == email, SolicitudPlan.estado == "pendiente")):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ya tienes una solicitud pendiente con ese correo. Te escribiremos cuando confirmemos el pago.",
        )

    monto = float(plan.precio_anual if data.periodo == "anual" else plan.precio_mensual)
    s = SolicitudPlan(
        id=uid("sol-"),
        plan_id=plan.id,
        periodo=data.periodo,
        monto=monto,
        metodo_pago=data.metodo_pago,
        nombre=data.nombre.strip(),
        ruc=data.ruc,
        contacto_nombre=data.contacto_nombre.strip(),
        email=email,
        telefono=data.telefono.strip(),
        ciudad=data.ciudad.strip(),
        mensaje=data.mensaje.strip(),
        referencia="" if tarjeta else data.referencia.strip(),
        comprobante=None if tarjeta else data.comprobante,
        estado="pago_pendiente" if tarjeta else "pendiente",
    )
    db.add(s)
    registrar_aceptacion(db, tipo="solicitud_plan", titular_id=s.id, nombre=f"{s.contacto_nombre} ({s.nombre})", email=email, origen="contratacion", request=request)
    if tarjeta:
        # El cliente paga en la Cajita de PayPhone dentro de /contratar; la cuenta se crea al confirmar el pago.
        db.commit()
        cajita = payphone.config_cajita(
            monto=monto, client_tx_id=s.id, referencia=f"FeriaBot Pro · Plan {plan.nombre} {PERIODO[data.periodo].lower()}", email=email
        )
        return SolicitudCreadaOut(id=s.id, plan_nombre=plan.nombre, periodo=data.periodo, monto=monto, email=email, cajita=cajita)
    db.commit()
    periodo = PERIODO[data.periodo].lower()
    tareas.add_task(enviar_sin_fallar, enviar_solicitud_recibida, email, s.contacto_nombre, plan.nombre, periodo, monto)
    for correo in db.scalars(select(SuperAdmin.email)).all():
        tareas.add_task(enviar_sin_fallar, enviar_aviso_solicitud, correo, s.nombre, plan.nombre, periodo, monto)
    return SolicitudCreadaOut(id=s.id, plan_nombre=plan.nombre, periodo=data.periodo, monto=monto, email=email)


# ---------- Super Administrador ----------


@router.put("/admin/pago/transferencia", response_model=DatosTransferencia)
def guardar_transferencia(data: DatosTransferencia, db: DB, sesion: SesionSuper, request: Request):
    ajuste = db.get(Ajuste, CLAVE_TRANSFERENCIA)
    valor = {k: v.strip() for k, v in data.model_dump().items()}
    if ajuste:
        ajuste.valor = valor
    else:
        db.add(Ajuste(clave=CLAVE_TRANSFERENCIA, valor=valor))
    registrar_actividad(db, sesion, "pago.editar", f"Cambió los datos bancarios ({valor['banco']} {valor['numero_cuenta']})", request=request)
    db.commit()
    return DatosTransferencia(**valor)


@router.get("/admin/solicitudes", response_model=list[SolicitudOut])
def listar_solicitudes(
    db: DB,
    _: SesionSuper,
    estado: Annotated[EstadoSolicitud | None, Query()] = None,
):
    # Sin el comprobante (pesa); se pide aparte con GET /admin/solicitudes/:id/comprobante.
    columnas = [c for c in SolicitudPlan.__table__.columns if c.name != "comprobante"]
    q = select(*columnas, (SolicitudPlan.comprobante.is_not(None)).label("tiene")).order_by(SolicitudPlan.creado_en.desc())
    if estado:
        q = q.where(SolicitudPlan.estado == estado)
    planes = _nombres_planes(db)
    filas = db.execute(q).mappings().all()
    return [
        SolicitudOut.model_validate({**f, "plan_nombre": planes.get(f["plan_id"], f["plan_id"]), "tiene_comprobante": bool(f["tiene"])})
        for f in filas
    ]


@router.get("/admin/solicitudes/pendientes", response_model=int)
def contar_pendientes(db: DB, _: SesionSuper):
    return db.scalar(select(func.count()).select_from(SolicitudPlan).where(SolicitudPlan.estado == "pendiente")) or 0


@router.get("/admin/solicitudes/{solicitud_id}/comprobante", response_model=ComprobanteOut)
def comprobante(solicitud_id: str, db: DB, _: SesionSuper):
    s = db.get(SolicitudPlan, solicitud_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Solicitud no encontrada")
    return ComprobanteOut(comprobante=s.comprobante)


@router.post("/admin/solicitudes/{solicitud_id}/aprobar", response_model=OrganizadorAdminOut)
def aprobar(solicitud_id: str, db: DB, sesion: SesionSuper, tareas: BackgroundTasks, request: Request):
    """El pago está confirmado: se crea la cuenta del organizador con el plan (1 mes o 1 año desde hoy) y se le envía
    su acceso con una contraseña temporal."""
    s = _pendiente(db, solicitud_id)
    org = _crear_cuenta(db, s, revisor=sesion.nombre, tareas=tareas)
    plan = db.get(Plan, s.plan_id)
    registrar_actividad(db, sesion, "solicitud.aprobar", f"Aprobó el pago de {s.nombre} ({plan.nombre} {s.periodo}, ${float(s.monto):.2f}) y creó su cuenta", entidad="organizador", entidad_id=org.id, request=request)
    db.commit()
    return _admin_out(org, _usos(db, [org])[org.id])


def _crear_cuenta(db: Session, s: SolicitudPlan, *, revisor: str, tareas: BackgroundTasks) -> Organizador:
    """Crea el organizador de una solicitud pagada (plan por 1 mes o 1 año desde hoy) y le envía su acceso.
    Marca la solicitud como aprobada. No hace commit."""
    _validar_unicos(db, s.email, s.ruc)
    plan = db.get(Plan, s.plan_id)
    if not plan:
        raise HTTPException(status.HTTP_409_CONFLICT, "El plan de esta solicitud ya no existe.")
    hoy = date.today()
    password = secrets.token_urlsafe(8)
    org = Organizador(
        id=uid("org-"),
        nombre=s.nombre,
        ruc=s.ruc,
        contacto_nombre=s.contacto_nombre,
        telefono=s.telefono,
        ciudad=s.ciudad,
        direccion="",
        email=s.email,
        password_hash=hash_password(password),
        plan=plan.id,
        plan_inicio=hoy,
        plan_fin=_sumar_meses(hoy, 12 if s.periodo == "anual" else 1),
        activo=True,
        notas=(
            f"Pagó con tarjeta por PayPhone ({s.periodo}, ${float(s.monto):.2f}). Transacción {s.transaccion_id}, autorización {s.autorizacion}, {s.tarjeta}."
            if s.metodo_pago == "tarjeta"
            else f"Contrató por transferencia ({s.periodo}, ${float(s.monto):.2f}). Ref.: {s.referencia or '—'}. Aprobó: {revisor}."
        ),
    )
    db.add(org)
    s.estado = "aprobada"
    s.revisado_por = revisor
    s.revisado_en = ahora()
    s.organizador_id = org.id
    tareas.add_task(enviar_sin_fallar, enviar_acceso_organizador, org.email, org.nombre, password, plan.nombre, org.plan_inicio, org.plan_fin)
    return org


@router.post("/admin/solicitudes/{solicitud_id}/rechazar", response_model=SolicitudOut)
def rechazar(solicitud_id: str, data: SolicitudRechazar, db: DB, sesion: SesionSuper, tareas: BackgroundTasks, request: Request):
    s = _pendiente(db, solicitud_id)
    s.estado = "rechazada"
    s.motivo_rechazo = data.motivo.strip()
    s.revisado_por = sesion.nombre
    s.revisado_en = ahora()
    registrar_actividad(db, sesion, "solicitud.rechazar", f"Rechazó la solicitud de {s.nombre}: {s.motivo_rechazo}", entidad="solicitud", entidad_id=s.id, request=request)
    db.commit()
    planes = _nombres_planes(db)
    tareas.add_task(enviar_sin_fallar, enviar_solicitud_rechazada, s.email, s.contacto_nombre, planes.get(s.plan_id, s.plan_id), s.motivo_rechazo)
    return _out(s, planes)
