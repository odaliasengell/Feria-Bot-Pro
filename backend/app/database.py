import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import URL, create_engine, make_url
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


def _url_base() -> URL:
    """Acepta también la «Service URI» tal como la copia el proveedor (p. ej. Aiven: mysql://…?ssl-mode=REQUIRED):
    usa el driver PyMySQL, que es el que está instalado, y quita `ssl-mode`, que PyMySQL no entiende (el SSL se
    configura con DB_SSL_CA)."""
    url = make_url(settings.database_url.strip())
    if url.drivername == "mysql":
        url = url.set(drivername="mysql+pymysql")
    consulta = {k: v for k, v in url.query.items() if k.lower() not in ("ssl-mode", "ssl_mode", "sslmode")}
    consulta.setdefault("charset", "utf8mb4")
    return url.set(query=consulta)


engine = create_engine(_url_base(), pool_pre_ping=True, pool_recycle=3600, connect_args=_argumentos_ssl())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


DB = Annotated[Session, Depends(get_db)]
