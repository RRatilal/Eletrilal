"""
Conversão de PDF para DXF — extrai geometria de páginas selecionadas.
"""
import os
import re
import tempfile
import pdfplumber
import ezdxf


ESCALAS_PADRAO = {
    "1:50": 50, "1:75": 75, "1:100": 100, "1:125": 125,
    "1:150": 150, "1:200": 200, "1:250": 250, "1:500": 500,
}

PT_POR_METRO = 28.3465


def obter_info_paginas(caminho_pdf: str) -> list[dict]:
    """Abre o PDF e retorna info de cada página (número, largura, altura em pontos)."""
    paginas = []
    with pdfplumber.open(caminho_pdf) as pdf:
        for i, page in enumerate(pdf.pages):
            paginas.append({
                "numero": i + 1,
                "largura_pt": round(page.width, 1),
                "altura_pt": round(page.height, 1),
            })
    return paginas


def _detectar_escala(page) -> str | None:
    """Procura uma string de escala tipo '1:100' no texto da página."""
    texto = page.extract_text() or ""
    match = re.search(r"1\s*:\s*(\d+)", texto)
    if match:
        return f"1:{match.group(1)}"
    return None


def _extrair_geometria_pagina(page, metros_por_ponto: float) -> dict:
    """Extrai linhas, retângulos e curvas de uma página PDF.
    Inclui filtragem agressiva para reduzir o número de entidades."""

    # Determinar o linewidth mínimo das linhas "fortes" (paredes, mobiliário)
    # Linhas com linewidth abaixo deste valor são grid/hatch e são removidas
    LIMITE_LINEWIDTH = 0.4
    # Comprimento mínimo em pontos (filtrar micro-segmentos)
    COMPRIMENTO_MIN_PT = 3

    linhas_raw = []
    vistas = set()  # Para deduplicação
    for line in (page.lines or []):
        x1, y1 = line["x0"], line["top"]
        x2, y2 = line["x1"], line["bottom"]
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        comprimento = (dx**2 + dy**2) ** 0.5
        if comprimento < COMPRIMENTO_MIN_PT:
            continue
        lw = line.get("linewidth") or 0
        # Remover linhas finas (grid/hatch) — só manter linhas com espessura significativa
        if lw > 0 and lw < LIMITE_LINEWIDTH:
            continue
        # Deduplicar linhas com mesmos endpoints (arredondados)
        chave = (round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1))
        chave_inv = (round(x2, 1), round(y2, 1), round(x1, 1), round(y1, 1))
        if chave in vistas or chave_inv in vistas:
            continue
        vistas.add(chave)
        linhas_raw.append({
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
        })

    linhas = [{
        "x1": round(l["x1"] * metros_por_ponto, 4),
        "y1": round(l["y1"] * metros_por_ponto, 4),
        "x2": round(l["x2"] * metros_por_ponto, 4),
        "y2": round(l["y2"] * metros_por_ponto, 4),
    } for l in linhas_raw]

    retangulos = []
    for rect in (page.rects or []):
        w = rect["x1"] - rect["x0"]
        h = rect["bottom"] - rect["top"]
        if w < 2 or h < 2:
            continue
        lw = rect.get("linewidth") or 0
        if lw > 0 and lw < LIMITE_LINEWIDTH:
            continue
        retangulos.append({
            "x": round(rect["x0"] * metros_por_ponto, 4),
            "y": round(rect["top"] * metros_por_ponto, 4),
            "w": round(w * metros_por_ponto, 4),
            "h": round(h * metros_por_ponto, 4),
        })

    curvas = []
    for curve in (page.curves or []):
        pontos_raw = curve.get("pts", [])
        if len(pontos_raw) < 2:
            continue
        # Filtrar curvas muito curtas (decorativas/hatching)
        if len(pontos_raw) == 2:
            dx = abs(pontos_raw[1][0] - pontos_raw[0][0])
            dy = abs(pontos_raw[1][1] - pontos_raw[0][1])
            if (dx**2 + dy**2) ** 0.5 < COMPRIMENTO_MIN_PT:
                continue
        pontos = [{"x": round(p[0] * metros_por_ponto, 4), "y": round(p[1] * metros_por_ponto, 4)} for p in pontos_raw]
        curvas.append({"pontos": pontos, "fechada": curve.get("closed", False)})

    return {"linhas": linhas, "retangulos": retangulos, "curvas": curvas}


def converter_pdf_para_dxf(
    caminho_pdf: str,
    paginas_selecionadas: list[int],
    escala: str | None = None,
) -> str:
    """
    Converte páginas selecionadas de um PDF para DXF.
    Retorna o caminho do ficheiro DXF temporário gerado.
    Coordenadas PDF (pontos) são convertidas para metros: 1 ponto = 1/72 polegada.
    """
    metros_por_ponto = 1.0 / PT_POR_METRO

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    with pdfplumber.open(caminho_pdf) as pdf:
        total_paginas = len(pdf.pages)

        for num_pagina in paginas_selecionadas:
            if num_pagina < 1 or num_pagina > total_paginas:
                continue

            page = pdf.pages[num_pagina - 1]

            nome_layer = f"Pagina_{num_pagina}"
            doc.layers.add(nome_layer, color=7)

            geo = _extrair_geometria_pagina(page, metros_por_ponto)
            altura_m = page.height * metros_por_ponto
            attrs = {"layer": nome_layer, "lineweight": 30, "color": 7}

            for l in geo["linhas"]:
                msp.add_line(
                    (l["x1"], altura_m - l["y1"]),
                    (l["x2"], altura_m - l["y2"]),
                    dxfattribs=attrs,
                )

            for r in geo["retangulos"]:
                x, y, w, h = r["x"], r["y"], r["w"], r["h"]
                pts = [
                    (x, altura_m - y),
                    (x + w, altura_m - y),
                    (x + w, altura_m - (y + h)),
                    (x, altura_m - (y + h)),
                ]
                msp.add_lwpolyline(pts, close=True, dxfattribs=attrs)

            for c in geo["curvas"]:
                pts_raw = c["pontos"]
                pts = [(p["x"], altura_m - p["y"]) for p in pts_raw]
                if c["fechada"]:
                    msp.add_lwpolyline(pts, close=True, dxfattribs=attrs)
                else:
                    msp.add_lwpolyline(pts, close=False, dxfattribs=attrs)

    exports_dir = os.path.join(os.path.dirname(__file__), "data", "exports")
    os.makedirs(exports_dir, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(suffix=".dxf", delete=False, dir=exports_dir)
    doc.saveas(tmp.name)
    return tmp.name
