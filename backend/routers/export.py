"""Endpoints de exportação vectorial do projeto para DXF e PDF."""
import os
import re
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dxf_parser import extrair_geometria, exportar_dxf, DXFParseError
from pdf_exporter import gerar_pdf_projeto
from routers.projects import _compute_dimensioning_readonly

router = APIRouter(tags=["export"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS_DIR = os.path.join(BASE_DIR, "data", "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)


def _remover_ficheiro(caminho):
    """Remove um ficheiro temporário depois de o FileResponse terminar."""
    try:
        os.remove(caminho)
    except OSError:
        pass


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


@router.post("/projects/{project_id}/export/pdf")
def exportar_projeto_pdf(
    project_id: int,
    config: schemas.ExportPdfRequest,
    db: Session = Depends(get_db),
):
    """Gera a folha técnica vectorial e, opcionalmente, o diagrama unifilar."""
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    componentes = db.query(models.Component).filter(
        models.Component.project_id == project_id
    ).all()
    circuitos = db.query(models.Circuit).filter(
        models.Circuit.project_id == project_id
    ).all()
    conexoes = db.query(models.Connection).filter(
        models.Connection.project_id == project_id
    ).all()
    rooms = db.query(models.Room).filter(
        models.Room.project_id == project_id
    ).all()

    geometria = None
    if projeto.dxf_original_path and os.path.exists(projeto.dxf_original_path):
        try:
            geometria = extrair_geometria(projeto.dxf_original_path)
        except DXFParseError as erro:
            raise HTTPException(status_code=422, detail=f"Erro ao ler a planta DXF: {erro}")

    # O mesmo cálculo usado pela API de dimensionamento mantém a tabela QGBT
    # coerente com o editor, incluindo comprimento e queda de tensão.
    resultados = {}
    for circuito in circuitos:
        try:
            calculado = _compute_dimensioning_readonly(circuito, db)
            resultados[circuito.id] = calculado.get("dimensionamento", {})
        except Exception as erro:
            resultados[circuito.id] = {"avisos": [f"Não foi possível dimensionar: {erro}"]}

    dados_config = config.model_dump()
    if not dados_config.get("data"):
        dados_config["data"] = date.today().strftime("%d/%m/%Y")
    nome_seguro = re.sub(r"[^a-zA-Z0-9_\-]+", "_", config.nome_projeto or projeto.nome).strip("_") or f"projeto_{project_id}"
    identificador = uuid.uuid4().hex[:10]
    caminho_saida = os.path.join(EXPORTS_DIR, f"{nome_seguro}_{config.formato.lower()}_{identificador}.pdf")
    try:
        gerar_pdf_projeto(
            caminho_saida,
            projeto,
            geometria=geometria,
            componentes=componentes,
            circuitos=circuitos,
            conexoes=conexoes,
            rooms=rooms,
            resultados=resultados,
            config=dados_config,
        )
    except Exception as erro:
        db.rollback()
        _remover_ficheiro(caminho_saida)
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {erro}")

    return FileResponse(
        caminho_saida,
        media_type="application/pdf",
        filename=f"{nome_seguro}_{config.formato.lower()}.pdf",
        background=BackgroundTask(_remover_ficheiro, caminho_saida),
    )
