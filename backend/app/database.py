import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

def _argumentos_ssl() -> dict:
    """Si hay certificado (DB_SSL_CA), la conexión a MySQL va cifrada y verifica el servidor (las bases en la
    nube como Aiven lo exigen). El certificado llega como texto en la variable de entorno y se guarda en un
    archivo temporal, porque PyMySQL pide la ruta."""
    pem = settings.db_ssl_ca.strip().replace("\\n", "\n")
    if not pem:
        return {}
    ruta = Path(tempfile.gettempdir()) / "feriabot-mysql-ca.pem"
    ruta.write_text(pem + "\n", encoding="utf-8")
    return {"ssl": {"ca": str(ruta)}}


engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=3600, connect_args=_argumentos_ssl())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


DB = Annotated[Session, Depends(get_db)]
