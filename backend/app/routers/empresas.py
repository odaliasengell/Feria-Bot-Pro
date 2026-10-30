from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..correo import enviar_acceso_empresa, enviar_sin_fallar, rango_fechas
from ..database import DB
from ..models import Empresa, UsuarioEmpresa
from ..schemas import EmpresaActualizar, EmpresaCrear, EmpresaOut, Sesion, UsuarioEmpresaCrear, UsuarioEmpresaOut
from ..security import hash_password, requiere, solo_propio
from ..utils import uid
from .ferias import obtener_feria

router = APIRouter(prefix="/empresas", tags=["empresas"])

# Campos que pueden quedar en NULL; en el resto un null se ignora.
_ANULABLES = {"sitio_web", "logo"}


def obtener_empresa(db: Session, empresa_id: str) -> Empresa:
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
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
def listar(db: DB, feria_id: Annotated[str | None, Query(alias="feriaId")] = None):
    q = select(Empresa).order_by(Empresa.nombre)
    if feria_id:
        q = q.where(Empresa.feria_id == feria_id)
    return db.scalars(q).all()


@router.get("/{empresa_id}", response_model=EmpresaOut)
def obtener(empresa_id: str, db: DB):
    return obtener_empresa(db, empresa_id)


@router.post("", response_model=EmpresaOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(requiere("organizador"))])
def crear(data: EmpresaCrear, db: DB, tareas: BackgroundTasks):
    campos = data.model_dump(exclude={"password"})
    campos["email"] = campos["email"].lower()
    _validar_email_libre(db, campos["email"])
    feria = obtener_feria(db, data.feria_id)
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
    empresa = obtener_empresa(db, empresa_id)

    datos = cambios.model_dump(exclude_unset=True)
    password = datos.pop("password", None)
    if datos.get("email"):
        datos["email"] = datos["email"].lower()
        _validar_email_libre(db, datos["email"], excepto=empresa.id)

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
    obtener_empresa(db, empresa_id)
    return db.scalars(
        select(UsuarioEmpresa).where(UsuarioEmpresa.empresa_id == empresa_id).order_by(UsuarioEmpresa.nombre)
    ).all()


@router.post("/{empresa_id}/usuarios", response_model=UsuarioEmpresaOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(empresa_id: str, data: UsuarioEmpresaCrear, db: DB, sesion: SesionEquipo):
    """Agrega un vendedor que entra con su correo y contraseña por POST /auth/empresa."""
    _administra_equipo(sesion, empresa_id)
    obtener_empresa(db, empresa_id)
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
    usuario = db.get(UsuarioEmpresa, usuario_id)
    if not usuario or usuario.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    db.delete(usuario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requiere("organizador"))])
def eliminar(empresa_id: str, db: DB):
    # Sus leads y vistas se borran por ON DELETE CASCADE.
    db.delete(obtener_empresa(db, empresa_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
