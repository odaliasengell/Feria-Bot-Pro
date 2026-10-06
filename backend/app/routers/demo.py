from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..config import settings
from ..database import DB
from ..security import requiere
from ..seed import reiniciar_demo

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reiniciar", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requiere("organizador"))])
def reiniciar(db: DB):
    """Borra empresas, visitantes, leads y vistas y vuelve a cargar los datos de demostración."""
    if not settings.demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El modo demo está desactivado.")
    reiniciar_demo(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
