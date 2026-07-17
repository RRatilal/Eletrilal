"""
Endpoints de upload e análise de ficheiros (DXF, PDF).
"""
import os
import json
import shutil
import re
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from database import get_db
from dxf_parser import extrair_geometria, DXFParseError
from pdf_plant_builder import extrair_planta_pdf
from pdf_to_dxf import obter_info_paginas, converter_pdf_para_dxf

router = APIRouter(tags=["upload"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, "data", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

TAMANHO_MAX_MB = 50


def _sanitizar_nome(filename: str) -> str:
    """Remove path traversal e caracteres perigosos do nome do ficheiro."""
    nome = os.path.basename(filename)
    # Remove caracteres problemáticos, mantendo apenas alfanuméricos, pontos, hífens e underscores
    nome = re.sub(r'[^\w.\-]', '_', nome)
    return nome or "upload"


async def _guardar_upload(file: UploadFile, destino: str, max_mb: int = TAMANHO_MAX_MB):
    """Lê o ficheiro em chunks e guarda em disco com validação de tamanho."""
    tamanho = 0
    with open(destino, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            tamanho += len(chunk)
            if tamanho > max_mb * 1024 * 1024:
                buffer.close()
                os.remove(destino)
                raise HTTPException(
                    status_code=413,
                    detail=f"Ficheiro excede o limite de {max_mb}MB."
                )
            buffer.write(chunk)


# ─── Upload DXF ──────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/upload-dxf")
async def upload_dxf(project_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    if not file.filename.lower().endswith(".dxf"):
        raise HTTPException(status_code=400, detail="Apenas ficheiros .dxf são aceites.")

    nome_seguro = _sanitizar_nome(file.filename)
    caminho_destino = os.path.join(UPLOADS_DIR, f"projeto_{project_id}_{nome_seguro}")

    await _guardar_upload(file, caminho_destino)

    try:
        geometria = extrair_geometria(caminho_destino)
    except Exception as e:
        if os.path.exists(caminho_destino):
            os.remove(caminho_destino)
        detail_msg = str(e) if isinstance(e, DXFParseError) else "Erro interno no processamento do ficheiro DXF."
        raise HTTPException(status_code=422, detail=detail_msg)

    projeto.dxf_original_path = caminho_destino
    db.commit()

    return {
        "project_id": project_id,
        "arquivo": file.filename,
        "geometria": geometria,
    }


# ─── Importar Planta PDF ─────────────────────────────────────────────────────

@router.post("/projects/{project_id}/import-pdf-plant")
async def import_pdf_plant(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Recebe um PDF arquitetónico, extrai divisões (nome, área, posição estimada)
    e devolve a lista para o frontend confirmar antes de criar as rooms.
    """
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas ficheiros .pdf são aceites.")

    # Guardar temporariamente em disco
    nome_seguro = _sanitizar_nome(file.filename)
    caminho_tmp = os.path.join(UPLOADS_DIR, f"tmp_pdf_{project_id}_{nome_seguro}")

    await _guardar_upload(file, caminho_tmp)

    try:
        resultado = extrair_planta_pdf(caminho_tmp)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Erro ao analisar o PDF: {str(e)}"
        )
    finally:
        # Remover o ficheiro temporário (não é necessário persistir o PDF)
        if os.path.exists(caminho_tmp):
            os.remove(caminho_tmp)

    return {
        "project_id": project_id,
        "arquivo": file.filename,
        **resultado,
    }


# ─── PDF → DXF: Preview ────────────────────────────────────────────────────

@router.post("/projects/{project_id}/pdf-to-dxf/preview")
async def pdf_to_dxf_preview(project_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Recebe um PDF e retorna info de cada página (número, dimensões)."""
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas ficheiros .pdf são aceites.")

    nome_seguro = _sanitizar_nome(file.filename)
    caminho_tmp = os.path.join(UPLOADS_DIR, f"tmp_dxf_preview_{project_id}_{nome_seguro}")

    await _guardar_upload(file, caminho_tmp)

    try:
        paginas = obter_info_paginas(caminho_tmp)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Erro ao analisar o PDF: {str(e)}")
    finally:
        if os.path.exists(caminho_tmp):
            os.remove(caminho_tmp)

    return {
        "project_id": project_id,
        "arquivo": file.filename,
        "total_paginas": len(paginas),
        "paginas": paginas,
    }


# ─── PDF → DXF: Convert ────────────────────────────────────────────────────

@router.post("/projects/{project_id}/pdf-to-dxf/convert")
async def pdf_to_dxf_convert(
    project_id: int,
    file: UploadFile = File(...),
    paginas: str = Form(""),
    escala: str = Form(""),
    db: Session = Depends(get_db),
):
    """Converte páginas selecionadas de um PDF para DXF e devolve o ficheiro."""
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas ficheiros .pdf são aceites.")

    if not paginas:
        raise HTTPException(status_code=400, detail="Selecione pelo menos uma página.")

    try:
        lista_paginas = [int(p.strip()) for p in paginas.split(",") if p.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Números de página inválidos.")

    if not lista_paginas:
        raise HTTPException(status_code=400, detail="Selecione pelo menos uma página.")

    nome_seguro = _sanitizar_nome(file.filename)
    caminho_tmp = os.path.join(UPLOADS_DIR, f"tmp_dxf_convert_{project_id}_{nome_seguro}")

    await _guardar_upload(file, caminho_tmp)

    caminho_dxf = None
    try:
        caminho_dxf = converter_pdf_para_dxf(
            caminho_tmp,
            lista_paginas,
            escala=escala if escala else None,
        )
        # Ler o DXF para memória para poder limpar o ficheiro temporário
        with open(caminho_dxf, "rb") as f:
            conteudo = f.read()
        nome_saida = file.filename.rsplit(".", 1)[0] + ".dxf"
        from fastapi.responses import Response
        return Response(
            content=conteudo,
            media_type="application/dxf",
            headers={"Content-Disposition": f'attachment; filename="{nome_saida}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Erro ao converter PDF para DXF: {str(e)}")
    finally:
        if os.path.exists(caminho_tmp):
            os.remove(caminho_tmp)
        if caminho_dxf and os.path.exists(caminho_dxf):
            os.remove(caminho_dxf)
