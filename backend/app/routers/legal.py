from fastapi import APIRouter, HTTPException, status

from .. import legal
from ..schemas import DocumentoLegal

router = APIRouter(prefix="/legal", tags=["legal"])


@router.get("/{slug}", response_model=DocumentoLegal)
def obtener(slug: str):
    """Texto estático de la «Política de privacidad» (`privacidad`) o del «Tratamiento de datos» (`tratamiento-datos`)."""
    doc = legal.documento(slug)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Documento no encontrado. Disponibles: {', '.join(legal.slugs())}")
    return doc
