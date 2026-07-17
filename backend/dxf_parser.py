"""
Leitura e escrita de ficheiros DXF usando ezdxf.

Fase 1: extração simples de entidades geométricas (linhas, polilinhas,
círculos) para desenhar a planta no frontend. A identificação "inteligente"
de divisões/compartimentos (usando Shapely para fechar polígonos a partir
de linhas soltas) fica marcada como melhoria futura (Fase 2+).
"""
import json
import math
import ezdxf
from shapely.geometry import LineString


class DXFParseError(Exception):
    """Erro ao processar um ficheiro DXF."""
    pass


# ─── Mapa de conversão de unidades DXF para metros ──────────────────────────
# Valores INSUNITS do DXF: https://help.autodesk.com/view/OAR/2024/ENU/?guid=GUID-7D0BB96F-7D44-4D43-8120-5C4E9F0F1B4A
_UNITS_TO_METERS = {
    0: 1.0,    # Unitless — assumir metros
    1: 0.0254, # Inches → metros
    2: 0.3048, # Feet → metros
    3: 1609.344, # Miles → metros
    4: 0.001,  # Millimeters → metros
    5: 0.01,   # Centimeters → metros
    6: 1.0,    # Meters → metros
    7: 1000.0, # Kilometers → metros
    8: 2.54e-8, # Microinches → metros
    9: 2.54e-5, # Mils → metros
    10: 0.9144, # Yards → metros
}

_DEFAULT_UNITS = 6  # Assumir metros se INSUNITS não estiver definido


def _obter_fator_conversao(doc) -> tuple:
    """
    Lê a variável de cabeçalho $INSUNITS do DXF e devolve:
    (fator_para_metros, insunits_original)
    """
    try:
        # INSUNITS é uma variável de cabeçalho DXF standard que define as
        # unidades de desenho (4=mm, 6=m, etc.). O nome tem prefixo $.
        insunits = doc.header.get("$INSUNITS", default=_DEFAULT_UNITS)
        return _UNITS_TO_METERS.get(insunits, 1.0), insunits
    except Exception:
        return 1.0, _DEFAULT_UNITS


def _converter_para_metros(linhas: list, polilinhas: list, circulos: list, fator: float):
    """Aplica o fator de conversão a todas as coordenadas."""
    if fator == 1.0:
        return
    for l in linhas:
        l["x1"] *= fator
        l["y1"] *= fator
        l["x2"] *= fator
        l["y2"] *= fator
    for p in polilinhas:
        for pt in p["pontos"]:
            pt["x"] *= fator
            pt["y"] *= fator
    for c in circulos:
        c["cx"] *= fator
        c["cy"] *= fator
        c["raio"] *= fator


# Comprimento mínimo de linha (metros) — abaixo disto é micro-segmento e é filtrado
COMPRIMENTO_MIN_M = 0.01

# Tolerância padrão (metros) para simplificação de polilinhas via Shapely.
# Reduz o número de vértices enviados ao frontend sem alterar visivelmente o
# desenho (algoritmo Douglas-Peucker). 0.02 m = 2 cm é imperceptível à escala
# de uma planta arquitetónica, mas ajustável se necessário.
TOLERANCIA_SIMPLIFICACAO_M = 0.02


def _chave_linha(l: dict) -> tuple:
    """Gera uma chave canónica para detetar linhas duplicadas (mesmos endpoints em qualquer direção)."""
    p1 = (round(l["x1"], 4), round(l["y1"], 4))
    p2 = (round(l["x2"], 4), round(l["y2"], 4))
    return (min(p1, p2), max(p1, p2))


def _comprimento_linha(l: dict) -> float:
    """Calcula o comprimento de uma linha."""
    dx = l["x2"] - l["x1"]
    dy = l["y2"] - l["y1"]
    return math.sqrt(dx * dx + dy * dy)


def _simplificar_linhas(linhas: list) -> list:
    """Remove linhas duplicadas e micro-segmentos."""
    vistas = set()
    resultado = []
    for l in linhas:
        # Filtrar micro-segmentos
        if _comprimento_linha(l) < COMPRIMENTO_MIN_M:
            continue
        # Filtrar duplicatas
        chave = _chave_linha(l)
        if chave in vistas:
            continue
        vistas.add(chave)
        resultado.append(l)
    return resultado


def _simplificar_polilinha(pontos: list, tolerancia: float) -> list:
    """
    Reduz o número de vértices de uma polilinha via Shapely (Douglas-Peucker),
    preservando a forma dentro da tolerância dada. Polilinhas com 2 pontos ou
    menos não têm o que simplificar.
    """
    if len(pontos) <= 2 or tolerancia <= 0:
        return pontos
    try:
        linha = LineString([(p["x"], p["y"]) for p in pontos])
        simplificada = linha.simplify(tolerancia, preserve_topology=False)
        return [{"x": float(x), "y": float(y)} for x, y in simplificada.coords]
    except Exception:
        # Geometria degenerada (ex: pontos coincidentes) — mantém original
        return pontos


def _calcular_offset(linhas: list, polilinhas: list, circulos: list) -> dict:
    """
    Calcula o centro da bounding box de toda a geometria, para normalizar
    (transladar) o desenho para perto da origem (0,0). Isto evita coordenadas
    muito grandes (comuns em DXFs georreferenciados ou com múltiplas plantas
    no mesmo ficheiro), o que ajuda a precisão de renderização no Three.js
    (câmara/controlo perto da origem sofre menos de erro de ponto flutuante).
    """
    xs, ys = [], []
    for l in linhas:
        xs += [l["x1"], l["x2"]]
        ys += [l["y1"], l["y2"]]
    for p in polilinhas:
        for pt in p["pontos"]:
            xs.append(pt["x"])
            ys.append(pt["y"])
    for c in circulos:
        xs.append(c["cx"])
        ys.append(c["cy"])

    if not xs:
        return {"x": 0.0, "y": 0.0}

    return {
        "x": float(min(xs) + max(xs)) / 2,
        "y": float(min(ys) + max(ys)) / 2,
    }


def _transladar(linhas: list, polilinhas: list, circulos: list, offset: dict):
    """Aplica a translação -offset a toda a geometria, em memória."""
    ox, oy = offset["x"], offset["y"]
    for l in linhas:
        l["x1"] -= ox
        l["y1"] -= oy
        l["x2"] -= ox
        l["y2"] -= oy
    for p in polilinhas:
        for pt in p["pontos"]:
            pt["x"] -= ox
            pt["y"] -= oy
    for c in circulos:
        c["cx"] -= ox
        c["cy"] -= oy


def extrair_geometria(caminho_arquivo: str, tolerancia_simplificacao: float = TOLERANCIA_SIMPLIFICACAO_M) -> dict:
    """
    Lê um ficheiro DXF e extrai entidades básicas como uma lista de formas.
    Retorna um dicionário serializável em JSON com linhas, polilinhas e círculos.
    Inclui contagens totais para o frontend gerir a renderização.

    A geometria devolvida está TRANSLADADA para ficar centrada perto da
    origem (0,0) — o deslocamento aplicado vem em "offset". Isto é
    determinístico (mesmo ficheiro -> mesmo offset), por isso o export pode
    voltar a chamar esta função e reaplicar o offset na direção inversa para
    reconstruir as coordenadas absolutas originais.
    """
    try:
        doc = ezdxf.readfile(caminho_arquivo)
    except IOError:
        raise DXFParseError("Não foi possível abrir o ficheiro DXF (verifique o caminho).")
    except ezdxf.DXFStructureError:
        raise DXFParseError(
            "O ficheiro DXF está corrompido ou não é uma estrutura DXF válida."
        )

    # Obter fator de conversão das unidades do DXF para metros
    fator_conversao, insunits_original = _obter_fator_conversao(doc)

    msp = doc.modelspace()

    linhas = []
    polilinhas = []
    circulos = []

    for entidade in msp:
        try:
            if entidade.dxftype() == "LINE":
                linhas.append({
                    "x1": entidade.dxf.start.x, "y1": entidade.dxf.start.y,
                    "x2": entidade.dxf.end.x, "y2": entidade.dxf.end.y,
                    "layer": entidade.dxf.layer,
                })
            elif entidade.dxftype() in ("LWPOLYLINE", "POLYLINE"):
                pontos = [{"x": p[0], "y": p[1]} for p in entidade.get_points()] \
                    if entidade.dxftype() == "LWPOLYLINE" else \
                    [{"x": v.dxf.location.x, "y": v.dxf.location.y} for v in entidade.vertices]
                polilinhas.append({
                    "pontos": pontos,
                    "fechada": entidade.is_closed,
                    "layer": entidade.dxf.layer,
                })
            elif entidade.dxftype() == "CIRCLE":
                circulos.append({
                    "cx": entidade.dxf.center.x, "cy": entidade.dxf.center.y,
                    "raio": entidade.dxf.radius,
                    "layer": entidade.dxf.layer,
                })
        except Exception:
            # Entidade com dados inesperados/incompletos: ignora e continua
            # (evita que um único elemento estranho quebre a leitura toda)
            continue

    # Converter todas as coordenadas para metros com base nas unidades do DXF
    _converter_para_metros(linhas, polilinhas, circulos, fator_conversao)

    # Simplificar linhas (remover duplicatas e micro-segmentos)
    linhas_originais = len(linhas)
    linhas = _simplificar_linhas(linhas)

    # Simplificar polilinhas via Shapely (Douglas-Peucker) — reduz vértices
    # em plantas complexas exportadas do ArchiCAD/GSPublisher, mantendo a forma.
    total_vertices_originais = sum(len(p["pontos"]) for p in polilinhas)
    if tolerancia_simplificacao > 0:
        for p in polilinhas:
            p["pontos"] = _simplificar_polilinha(p["pontos"], tolerancia_simplificacao)
    total_vertices_simplificados = sum(len(p["pontos"]) for p in polilinhas)

    # Normalizar coordenadas para perto da origem
    offset = _calcular_offset(linhas, polilinhas, circulos)
    _transladar(linhas, polilinhas, circulos, offset)

    # Contar segmentos de polilinhas para o total
    total_segmentos_poli = sum(
        max(len(p["pontos"]) - 1, 0) + (1 if p.get("fechada") else 0)
        for p in polilinhas
    )

    return {
        "linhas": linhas,
        "polilinhas": polilinhas,
        "circulos": circulos,
        "camadas": [layer.dxf.name for layer in doc.layers],
        "offset": offset,
        "unidades_originais": insunits_original,
        "stats": {
            "total_linhas": len(linhas),
            "total_linhas_originais": linhas_originais,
            "total_polilinhas": len(polilinhas),
            "total_segmentos_poli": total_segmentos_poli,
            "total_circulos": len(circulos),
            "total_objetos_canvas": len(linhas) + total_segmentos_poli + len(circulos),
            "total_vertices_poli_originais": total_vertices_originais,
            "total_vertices_poli_simplificados": total_vertices_simplificados,
        },
    }


def exportar_dxf(caminho_saida: str, componentes: list, geometria_base: dict = None, offset: dict = None, unidades_originais: int = 6):
    """
    Gera um novo DXF com os componentes elétricos desenhados como blocos/círculos
    simples, opcionalmente sobre a geometria base (paredes) já existente.

    Se "offset" for fornecido (o mesmo devolvido por extrair_geometria para o
    ficheiro original), a translação é revertida antes de escrever — ou seja,
    o DXF exportado fica nas coordenadas absolutas originais, para poder ser
    sobreposto corretamente a outras peças do projeto (hidráulica, estrutura)
    no AutoCAD/ArchiCAD do engenheiro.

    Args:
        unidades_originais: Código INSUNITS do DXF original (6=m, 4=mm, etc.)
                            Usado para converter de metros de volta para a
                            unidade original do desenho.
    """
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    # Fator de conversão inverso: metros → unidades originais
    inv_factor = 1.0 / _UNITS_TO_METERS.get(unidades_originais, 1.0)

    ox = offset["x"] if offset else 0.0
    oy = offset["y"] if offset else 0.0

    # Aplica o fator inverso para voltar às coordenadas originais
    ox *= inv_factor
    oy *= inv_factor

    # Redesenha a geometria base (paredes), se fornecida — com o offset revertido
    if geometria_base:
        for linha in geometria_base.get("linhas", []):
            msp.add_line(
                ((linha["x1"] * inv_factor) + ox, (linha["y1"] * inv_factor) + oy),
                ((linha["x2"] * inv_factor) + ox, (linha["y2"] * inv_factor) + oy),
            )
        for poli in geometria_base.get("polilinhas", []):
            pontos = [
                ((p["x"] * inv_factor) + ox, (p["y"] * inv_factor) + oy)
                for p in poli["pontos"]
            ]
            msp.add_lwpolyline(pontos, close=poli.get("fechada", False))

    # Desenha os componentes elétricos como círculos com rótulo de texto
    # (componentes já vêm nas coordenadas locais/normalizadas do canvas,
    # por isso também levam o offset revertido)
    for comp in componentes:
        x = (comp["x"] * inv_factor) + ox
        y = (comp["y"] * inv_factor) + oy
        msp.add_circle((x, y), radius=0.15 * inv_factor)
        if comp.get("rotulo"):
            msp.add_text(comp["rotulo"], dxfattribs={"height": 0.1 * inv_factor}).set_placement(
                (x + 0.2 * inv_factor, y)
            )

    doc.saveas(caminho_saida)
    return caminho_saida