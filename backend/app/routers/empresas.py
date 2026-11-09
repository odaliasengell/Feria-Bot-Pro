from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import DB
from ..models import Empresa
from ..schemas import EmpresaActualizar, EmpresaCrear, EmpresaOut, Sesion
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


def _validar_email_libre(db: Session, email: str, excepto: str | None = None) -> None:
    otro = db.scalar(select(Empresa.id).where(Empresa.email == email))
    if otro and otro != excepto:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una empresa con ese correo.")


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
def crear(data: EmpresaCrear, db: DB):
    campos = data.model_dump(exclude={"password"})
    campos["email"] = campos["email"].lower()
    _validar_email_libre(db, campos["email"])
    obtener_feria(db, data.feria_id)
    empresa = Empresa(
        **campos,
        id=uid("emp-"),
        password_hash=hash_password(data.password) if data.password else None,
    )
    db.add(empresa)
    db.commit()
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


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requiere("organizador"))])
def eliminar(empresa_id: str, db: DB):
    # Sus leads y vistas se borran por ON DELETE CASCADE.
    db.delete(obtener_empresa(db, empresa_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
