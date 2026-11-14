from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..correo import enviar_acceso_empresa, enviar_sin_fallar, rango_fechas
from ..database import DB
from ..exportar import MIME_XLSX
from ..importar import ArchivoInvalido, leer, plantilla_xlsx
from ..models import Empresa, UsuarioEmpresa
from ..schemas import (
    EmpresaActualizar,
    EmpresaCrear,
    EmpresaOut,
    ErrorImportacion,
    ImportacionOut,
    Sesion,
    UsuarioEmpresaCrear,
    UsuarioEmpresaOut,
)
from ..security import hash_password, requiere, sesion_opcional, solo_propio
from ..utils import uid
from ..planes import exigir_cupo_empresas
from .ferias import feria_de, ids_ferias_de

router = APIRouter(prefix="/empresas", tags=["empresas"])

# Campos que pueden quedar en NULL; en el resto un null se ignora.
_ANULABLES = {"sitio_web", "logo"}


def _validar_ruc_libre(db: Session, feria_id: str, ruc: str, excepto: str | None = None) -> None:
    """El mismo RUC no puede estar dos veces en una feria."""
    q = select(Empresa.nombre).where(Empresa.feria_id == feria_id, Empresa.ruc == ruc)
    if excepto:
        q = q.where(Empresa.id != excepto)
    otra = db.scalar(q)
    if otra:
        raise HTTPException(status.HTTP_409_CONFLICT, f"El RUC {ruc} ya está registrado en esta feria ({otra}).")


def obtener_empresa(db: Session, empresa_id: str) -> Empresa:
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa no encontrada")
    return empresa


def empresa_de(db: Session, empresa_id: str, sesion: Sesion | None) -> Empresa:
    """La empresa; un organizador solo accede a las de sus ferias (si no, 404)."""
    empresa = obtener_empresa(db, empresa_id)
    if sesion is not None and sesion.role == "organizador" and empresa.feria.organizador_id != sesion.ref_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa no encontrada")
    return empresa


def correo_libre(db: Session, email: str, *, excepto_empresa: str | None = None, excepto_usuario: str | None = None) -> None:
    """El login de empresa busca el correo en empresas y en vendedores: no puede repetirse en ninguna de las dos."""
    empresa = db.scalar(select(Empresa.id).where(Empresa.email == email))
    usuario = db.scalar(select(UsuarioEmpresa.id).where(UsuarioEmpresa.email == email))
    if (empresa and empresa != excepto_empresa) or (usuario and usuario != excepto_usuario):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo.")


def _validar_email_libre(db: Session, email: str, excepto: str | None = None) -> None:
    correo_libre(db, email, excepto_empresa=excepto)


@router.get("", response_model=list[EmpresaOut])
def listar(
    db: DB,
    sesion: Annotated[Sesion | None, Depends(sesion_opcional)],
    feria_id: Annotated[str | None, Query(alias="feriaId")] = None,
):
    """Público (el visitante escanea el QR del stand). El organizador solo recibe las de sus ferias."""
    q = select(Empresa).order_by(Empresa.nombre)
    if feria_id:
        q = q.where(Empresa.feria_id == feria_id)
    if sesion is not None and sesion.role == "organizador":
        q = q.where(Empresa.feria_id.in_(ids_ferias_de(sesion.ref_id)))
    return db.scalars(q).all()


# ---------- Carga masiva desde Excel (antes de /{empresa_id}) ----------


@router.get(
    "/plantilla",
    response_class=Response,
    responses={200: {"content": {MIME_XLSX: {}}, "description": "Plantilla .xlsx"}},
)
def plantilla():
    """Plantilla vacía para POST /empresas/importar (columnas e instrucciones)."""
    return Response(
        content=plantilla_xlsx(),
        media_type=MIME_XLSX,
        headers={"Content-Disposition": 'attachment; filename="plantilla-empresas.xlsx"'},
    )


@router.post("/importar", response_model=ImportacionOut)
async def importar(
    sesion: Annotated[Sesion, Depends(requiere("organizador"))],
    db: DB,
    tareas: BackgroundTasks,
    feria_id: Annotated[str, Query(alias="feriaId")],
    archivo: Annotated[UploadFile, File(description="Excel .xlsx con las columnas de la plantilla")],
):
    """Crea las empresas válidas en la feria; las filas con errores se informan y no detienen la carga."""
    feria = feria_de(db, feria_id, sesion)
    libres = exigir_cupo_empresas(db, feria)
    contenido = await archivo.read()
    try:
        resultado = leer(contenido, db, feria.id)
    except ArchivoInvalido as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if len(resultado.validas) > libres:
        # Las que no caben en el plan se informan como errores, igual que las filas inválidas.
        for fila in resultado.validas[libres:]:
            resultado.errores.append((fila.fila, "No se cargó: la feria llegó al límite de empresas de tu plan."))
        resultado.validas = resultado.validas[:libres]
        resultado.errores.sort()

    fechas = rango_fechas(feria.fecha_inicio, feria.fecha_fin)
    for fila in resultado.validas:
        d = fila.datos
        db.add(
            Empresa(
                id=uid("emp-"),
                feria_id=feria.id,
                nombre=d["nombre"],
                ruc=d["ruc"],
                rubro=d.get("rubro", ""),
                stand=d.get("stand", ""),
                contacto_nombre=d.get("contacto", ""),
                email=d["email"],
                telefono=d.get("telefono", ""),
                descripcion="",
                servicios=[],
                fotos=[],
                password_hash=hash_password(d["password"]) if d.get("password") else None,
            )
        )
    db.commit()
    for fila in resultado.validas:
        if fila.datos.get("password"):
            tareas.add_task(
                enviar_sin_fallar, enviar_acceso_empresa,
                fila.datos["email"], fila.datos["nombre"], fila.datos["password"], feria.nombre, fechas,
                portada=feria.portada, portada_alt=feria.portada_alt,
            )
    return ImportacionOut(
        creadas=len(resultado.validas),
        errores=[ErrorImportacion(fila=n, motivo=m) for n, m in resultado.errores],
    )


@router.get("/{empresa_id}", response_model=EmpresaOut)
def obtener(empresa_id: str, db: DB):
    return obtener_empresa(db, empresa_id)


@router.post("", response_model=EmpresaOut, status_code=status.HTTP_201_CREATED)
def crear(data: EmpresaCrear, db: DB, tareas: BackgroundTasks, sesion: Annotated[Sesion, Depends(requiere("organizador"))]):
    campos = data.model_dump(exclude={"password"})
    campos["email"] = campos["email"].lower()
    _validar_email_libre(db, campos["email"])
    feria = feria_de(db, data.feria_id, sesion)
    exigir_cupo_empresas(db, feria)
    _validar_ruc_libre(db, feria.id, data.ruc)
    empresa = Empresa(
        **campos,
        id=uid("emp-"),
        password_hash=hash_password(data.password) if data.password else None,
    )
    db.add(empresa)
    db.commit()
    if data.password:
        # En segundo plano: la empresa se crea aunque el correo falle.
        tareas.add_task(
            enviar_sin_fallar, enviar_acceso_empresa,
            empresa.email, empresa.nombre, data.password, feria.nombre, rango_fechas(feria.fecha_inicio, feria.fecha_fin),
            portada=feria.portada, portada_alt=feria.portada_alt,
        )
    return empresa


@router.patch("/{empresa_id}", response_model=EmpresaOut)
def actualizar(
    empresa_id: str,
    cambios: EmpresaActualizar,
    db: DB,
    sesion: Annotated[Sesion, Depends(requiere("organizador", "empresa"))],
):
    solo_propio(sesion, "empresa", empresa_id)
    empresa = empresa_de(db, empresa_id, sesion)

    datos = cambios.model_dump(exclude_unset=True)
    password = datos.pop("password", None)
    if datos.get("email"):
        datos["email"] = datos["email"].lower()
        _validar_email_libre(db, datos["email"], excepto=empresa.id)
    if "ruc" in datos:
        ruc = datos.pop("ruc")
        if ruc and ruc != empresa.ruc:
            # La empresa ve su RUC pero no lo cambia: es el dato con el que el organizador la identifica.
            if sesion.role != "organizador":
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el organizador puede cambiar el RUC.")
            _validar_ruc_libre(db, empresa.feria_id, ruc, excepto=empresa.id)
            empresa.ruc = ruc

    for campo, valor in datos.items():
        if valor is None and campo not in _ANULABLES:
            continue
        setattr(empresa, campo, valor)
    if password:
        empresa.password_hash = hash_password(password)

    db.commit()
    return empresa


# ---------- Equipo de la empresa (vendedores) ----------


def _administra_equipo(sesion: Sesion, empresa_id: str) -> None:
    """El organizador o la cuenta principal de la empresa; un vendedor no administra el equipo."""
    solo_propio(sesion, "empresa", empresa_id)
    if sesion.role == "empresa" and sesion.usuario_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo la cuenta principal de la empresa administra el equipo.")


SesionEquipo = Annotated[Sesion, Depends(requiere("organizador", "empresa"))]


@router.get("/{empresa_id}/usuarios", response_model=list[UsuarioEmpresaOut])
def listar_usuarios(empresa_id: str, db: DB, sesion: SesionEquipo):
    _administra_equipo(sesion, empresa_id)
    empresa_de(db, empresa_id, sesion)
    return db.scalars(
        select(UsuarioEmpresa).where(UsuarioEmpresa.empresa_id == empresa_id).order_by(UsuarioEmpresa.nombre)
    ).all()


@router.post("/{empresa_id}/usuarios", response_model=UsuarioEmpresaOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(empresa_id: str, data: UsuarioEmpresaCrear, db: DB, sesion: SesionEquipo):
    """Agrega un vendedor que entra con su correo y contraseña por POST /auth/empresa."""
    _administra_equipo(sesion, empresa_id)
    empresa_de(db, empresa_id, sesion)
    email = data.email.lower()
    correo_libre(db, email)
    usuario = UsuarioEmpresa(
        id=uid("usr-"),
        empresa_id=empresa_id,
        nombre=data.nombre.strip(),
        email=email,
        password_hash=hash_password(data.password),
    )
    db.add(usuario)
    db.commit()
    return usuario


@router.delete("/{empresa_id}/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_usuario(empresa_id: str, usuario_id: str, db: DB, sesion: SesionEquipo):
    """Quita al vendedor. Sus leads se conservan con su nombre en registradoPor."""
    _administra_equipo(sesion, empresa_id)
    empresa_de(db, empresa_id, sesion)
    usuario = db.get(UsuarioEmpresa, usuario_id)
    if not usuario or usuario.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    db.delete(usuario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(empresa_id: str, db: DB, sesion: Annotated[Sesion, Depends(requiere("organizador"))]):
    # Sus leads y vistas se borran por ON DELETE CASCADE.
    db.delete(empresa_de(db, empresa_id, sesion))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
