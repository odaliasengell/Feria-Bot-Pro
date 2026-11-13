from fastapi import APIRouter, HTTPException, status

from .. import legal
from ..schemas import DocumentoLegal

router = APIRouter(prefix="/legal", tags=["legal"])


@router.get("/{slug}", response_model=DocumentoLegal)
def obtener(slug: str):
    """Textos legales: `privacidad`, `tratamiento-datos`, `aviso-legal` o `cookies`."""
    doc = legal.documento(slug)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Documento no encontrado. Disponibles: {', '.join(legal.slugs())}")
    return doc
