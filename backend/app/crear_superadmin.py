"""Crear un Super Administrador (o cambiarle la contraseña) desde la terminal del servidor.

Uso (en la carpeta backend, con el .env de producción):
    py -m app.crear_superadmin            # pide correo, nombre y contraseña
    py -m app.crear_superadmin --listar   # muestra los Super Administradores (sin contraseñas)

Si el correo ya existe, solo cambia su contraseña (sirve para recuperar el acceso). La contraseña se escribe sin
que se vea en pantalla y no queda guardada en ningún archivo ni en el historial de la terminal.
"""

import getpass
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .migraciones import migrar
from .models import SuperAdmin
from .schemas import _validar_password
from .security import hash_password
from .utils import uid


def _pedir(texto: str, validar) -> str:
    while True:
        valor = input(texto).strip()
        error = validar(valor)
        if not error:
            return valor
        print(f"  ✗ {error}")


def _error_email(v: str) -> str | None:
    try:
        validate_email(v, check_deliverability=False)
        return None
    except EmailNotValidError:
        return "Correo no válido."


def _pedir_password() -> str:
    while True:
        p1 = getpass.getpass("Contraseña (mín. 8, letras y números): ")
        try:
            _validar_password(p1)
        except ValueError as e:
            print(f"  ✗ {e}")
            continue
        if getpass.getpass("Repite la contraseña: ") != p1:
            print("  ✗ No coinciden.")
            continue
        return p1


def main() -> None:
    Base.metadata.create_all(engine)
    migrar(engine)
    with SessionLocal() as db:
        if "--listar" in sys.argv:
            for sa in db.scalars(select(SuperAdmin).order_by(SuperAdmin.creado_en)):
                print(f"- {sa.nombre} <{sa.email}> · desde {sa.creado_en:%Y-%m-%d}")
            return

        print("Super Administrador de FeriaBot Pro\n")
        email = _pedir("Correo: ", _error_email).lower()
        existente = db.scalar(select(SuperAdmin).where(SuperAdmin.email == email))
        if existente:
            print(f"Ya existe ({existente.nombre}). Vas a cambiar su contraseña.")
            existente.password_hash = hash_password(_pedir_password())
            db.commit()
            print("✓ Contraseña actualizada.")
            return
        nombre = _pedir("Nombre: ", lambda v: None if len(v) >= 2 else "Escribe el nombre.")
        db.add(SuperAdmin(id=uid("sa-"), nombre=nombre, email=email, password_hash=hash_password(_pedir_password())))
        db.commit()
        print(f"✓ Super Administrador creado: {email}. Entra en /ingresar?rol=superadmin")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nCancelado.")
