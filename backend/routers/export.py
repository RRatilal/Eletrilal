"""
Endpoint de exportação do projeto para DXF.
(Exportação para PDF fica marcada como melhoria futura - Fase 5.)
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from database import get_db
from dxf_parser import extrair_geometria, exportar_dxf, DXFParseError

router = APIRouter(tags=["export"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS_DIR = os.path.join(BASE_DIR, "data", "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)


@router.get("/projects/{project_id}/export/dxf")
def exportar_projeto_dxf(project_id: int, db: Session = Depends(get_db)):
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    componentes = db.query(models.Component).filter(models.Component.project_id == project_id).all()
    componentes_dict = [
        {"x": c.x, "y": c.y, "rotulo": c.rotulo, "tipo": c.tipo}
        for c in componentes
    ]

    geometria_base = None
    offset = None
    unidades_originais = 6  # padrão: metros
    if projeto.dxf_original_path and os.path.exists(projeto.dxf_original_path):
        try:
            geometria_base = extrair_geometria(projeto.dxf_original_path)
            offset = geometria_base.get("offset")
            unidades_originais = geometria_base.get("unidades_originais", 6)
        except DXFParseError:
            geometria_base = None  # exporta só os componentes se a base falhar

    caminho_saida = os.path.join(EXPORTS_DIR, f"projeto_{project_id}_esquema.dxf")
    exportar_dxf(caminho_saida, componentes_dict, geometria_base, offset=offset, unidades_originais=unidades_originais)

    return FileResponse(
        caminho_saida,
        media_type="application/dxf",
        filename=f"projeto_{project_id}_esquema.dxf",
    )