"""
pdf_plant_builder.py — Extração genérica de divisões de PDFs arquitetónicos.

Funciona com QUALQUER PDF de projeto de arquitetura em português:
  - Auto-deteta páginas de planta (alta diversidade de rects)
  - Auto-deteta páginas de tabela (rects uniformes) e exclui-as
  - Auto-calibra escala a partir do texto ("1:100", "E:1/50", etc.)
  - Matching por scoring combinado (área esperada + distância + containment)
  - Suporta nomes multi-palavra ("Sala de Estar", "Varanda Principal")
  - Simplificação de geometria via Shapely para reduzir vértices em polígonos
  - Cache de parsing por hash MD5 do ficheiro (evita reprocessamento)
"""

import re, math, json, hashlib, os
from collections import Counter, OrderedDict
from typing import Optional
import pdfplumber
from shapely.geometry import Polygon, mapping


# ─── Catálogo de divisões ──────────────────────────────────────────────────────
DIVISOES = [
    # (prefixo_lower, nome_display, extensoes_validas_alem_de_numeros)
    ("sala de estar",    "Sala de Estar",    []),
    ("sala de jantar",   "Sala de Jantar",   []),
    ("sala",             "Sala",             ["de estar", "de jantar"]),
    ("suite",            "Suíte",            []),
    ("quarto",           "Quarto",           []),
    ("cozinha",          "Cozinha",          []),
    ("copa",             "Copa",             []),
    ("lavandaria",       "Lavandaria",       []),
    ("lavabo",           "Lavabo",           []),
    ("w.c.",             "W.C.",             []),
    ("w.c",              "W.C.",             []),
    ("wc",               "W.C.",             []),
    ("i.s.",             "I.S.",             []),
    ("corredor",         "Corredor",         []),
    ("hall",             "Hall",             []),
    ("escada",           "Escada",           []),
    ("vestiario",        "Vestiário",        []),
    ("vestiário",        "Vestiário",        []),
    ("arrumo",           "Arrumo",           []),
    ("dispensa",         "Dispensa",         []),
    ("garagem",          "Garagem",          []),
    ("varanda principal","Varanda Principal", []),
    ("varanda",          "Varanda",          ["principal"]),
    ("terraço",          "Terraço",          []),
    ("piscina",          "Piscina",          []),
    ("escritório",       "Escritório",       []),
    ("escritorio",       "Escritório",       []),
]

AREA_RE   = re.compile(r"[Aa]\s*[:\.]?\s*(\d+[\.,]?\d*)\s*m[²2]?", re.I)
COTA_RE   = re.compile(r"^(\d{1,3}[.,]\d{2})$")
ESCALA_RE = re.compile(r"(?:1\s*[:/]\s*(\d+)|[Ee][:./]\s*1\s*/\s*(\d+))", re.I)
NUM_RE    = re.compile(r"^\d$")

# Dimensões mínimas razoáveis para uma divisão (em pontos PDF)
RECT_MIN_DIM  = 26    # ~1.06m a 0.0409m/pt (exclui chaminés, pilares e caixas técnicas)
RECT_MIN_AREA = 1100  # ~1.8m²
RECT_MAX_AREA = 300_000

# Área esperada por tipo (m²) — heurística genérica
_AREA_RANGES: dict = {
    "sala":       (8.0,  80),
    "quarto":     (7.5,  35),
    "cozinha":    (5.0,  30),
    "w.c":        (1.8,  12),
    "wc":         (1.8,  12),
    "corredor":   (2.0,  25),
    "varanda":    (2.0,  50),
    "lavandaria": (1.8,  15),
    "dispensa":   (1.2,  12),
    "arrumo":     (1.2,  12),
    "garagem":    (10.0, 100),
    "vestiario":  (1.8,  15),
    "vestiari":   (1.8,  15),
    "hall":       (2.0,  20),
    "piscina":    (5, 150),
    "escada":     (1,  18),
    "suite":      (10,  50),
    "lavabo":     (0.8,  8),
    "copa":       (2,  15),
    "escritorio": (4,  40),
}

def _area_range(label_lower: str) -> tuple:
    for key, rng in _AREA_RANGES.items():
        if label_lower.startswith(key):
            return rng
    return (0.5, 300.0)


# ─── Cache LRU simples baseado em hash do ficheiro ────────────────────────────
_CACHE_MAX = 10  # número máximo de resultados em cache
_CACHE: OrderedDict = OrderedDict()  # cache_hash -> resultado

def _hash_ficheiro(caminho: str) -> str:
    """Calcula MD5 do conteúdo do ficheiro para usar como chave de cache.
    Inclui o timestamp de modificação para detetar re-extrações do mesmo PDF."""
    try:
        with open(caminho, 'rb') as f:
            file_hash = hashlib.md5(f.read()).hexdigest()
        # Acrescentar timestamp para forçar recálculo se o ficheiro mudar
        mtime = str(os.path.getmtime(caminho))
        return f"{file_hash}_{mtime}"
    except Exception:
        return ""

def _verificar_cache(caminho: str) -> Optional[dict]:
    """Retorna o resultado em cache se existir, ou None."""
    chave = _hash_ficheiro(caminho)
    if not chave:
        return None
    if chave in _CACHE:
        _CACHE.move_to_end(chave)  # LRU: mover para o fim
        return _CACHE[chave]
    return None

def _guardar_cache(caminho: str, resultado: dict):
    """Guarda o resultado no cache LRU."""
    chave = _hash_ficheiro(caminho)
    if not chave:
        return
    _CACHE[chave] = resultado
    if len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)  # remove o mais antigo


# ─── Utilitários ──────────────────────────────────────────────────────────────

def _dist(a: dict, b: dict) -> float:
    return math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2)


def _filtrar_rects(rects: list) -> list:
    """Filtra por dimensões mínimas."""
    out = []
    for r in rects:
        rw = r["x1"] - r["x0"]
        rh = r["y1"] - r["y0"]
        if (rw >= RECT_MIN_DIM and rh >= RECT_MIN_DIM
                and RECT_MIN_AREA <= rw * rh <= RECT_MAX_AREA):
            out.append(r)
    return out


def _is_spec_table(rects: list) -> bool:
    """
    Deteta páginas de tabelas de especificações.
    Numa tabela, a maioria dos rects tem o mesmo tamanho.
    Numa planta, os rects têm tamanhos muito diversos.
    Usa granularidade de 10pt para agrupar rects semelhantes.
    """
    if len(rects) < 4:
        return True   # Muito poucas → não é planta
    # 10pt granularity: janelas/portas que diferem por 1-2pt ficam no mesmo bucket
    sizes = Counter(
        (round((r["x1"]-r["x0"]) / 10) * 10,
         round((r["y1"]-r["y0"]) / 10) * 10)
        for r in rects
    )
    most_common = sizes.most_common(1)[0][1]
    # Só é tabela se 65%+ dos rects têm o mesmo tamanho
    return most_common / len(rects) > 0.65


def _diversidade_rects(rects: list) -> float:
    """Score de diversidade de tamanhos (maior = mais planta, menor = mais tabela)."""
    if not rects:
        return 0.0
    areas = [(r["x1"]-r["x0"]) * (r["y1"]-r["y0"]) for r in rects]
    if len(areas) < 2:
        return 0.0
    mu  = sum(areas) / len(areas)
    var = sum((a - mu) ** 2 for a in areas) / len(areas)
    return math.sqrt(var) / max(mu, 1.0)   # coeficiente de variação


def _bbox(rects: list) -> tuple:
    return (min(r["x0"] for r in rects), min(r["y0"] for r in rects),
            max(r["x1"] for r in rects), max(r["y1"] for r in rects))


def _geojson_from_rect(r: dict, dx0: float, dy0: float,
                        sc: float, ref_h: float) -> str:
    x0 = (r["x0"] - dx0) * sc
    y0 = ref_h - (r["y0"] - dy0) * sc
    x1 = (r["x1"] - dx0) * sc
    y1 = ref_h - (r["y1"] - dy0) * sc
    coords = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
    return json.dumps({"type": "Polygon", "coordinates": [coords]})


def _deduzir_terreno(cotas: list) -> tuple:
    cands = sorted(set(c for c in cotas if 3 < c < 300), reverse=True)
    return (cands[0] if cands else None), (cands[1] if len(cands) >= 2 else None)


def _detectar_escala(texto: str) -> Optional[int]:
    """Extrai ratio de escala de strings como '1:100', 'E:1/50', '1/200'."""
    for m in ESCALA_RE.finditer(texto):
        v = m.group(1) or m.group(2)
        if v:
            r = int(v)
            if 20 <= r <= 5000:
                return r
    return None


# ─── Extração de labels com posição ───────────────────────────────────────────

def _sufixo_valido(suf: str, exts: list) -> bool:
    s = suf.strip()
    if not s:
        return True
    if NUM_RE.match(s):
        return True
    if s.lower() in [e.lower() for e in exts]:
        return True
    return False


def _classificar(texto: str) -> Optional[str]:
    t = texto.strip()
    if len(t) < 2 or len(t) > 32:
        return None
    tl = t.lower()
    for pref, display, exts in DIVISOES:
        if tl.startswith(pref):
            suf = t[len(pref):].strip()
            if _sufixo_valido(suf, exts):
                return (display + (" " + suf if suf else "")).strip()
    return None


def _extrair_labels(pagina) -> list:
    """Extrai labels de divisão com posição (x, y). Suporta nomes multi-palavra."""
    words = pagina.extract_words(x_tolerance=3, y_tolerance=3) or []
    words.sort(key=lambda w: (round(float(w.get("top", 0)) / 4) * 4,
                               float(w.get("x0", 0))))
    labels = []
    used   = set()

    for i, w in enumerate(words):
        if i in used:
            continue
        t = w["text"].strip()
        if len(t) < 2:
            continue

        tl = t.lower()
        matched = None
        for pref, display, exts in DIVISOES:
            if tl.startswith(pref.split()[0]):
                matched = (pref, display, exts)
                break
        if not matched:
            continue

        pref, display, exts = matched
        pref_words = pref.split()
        nome_words = [t]
        cx0 = float(w["x0"])
        cx1 = float(w["x1"])
        top_ref = float(w.get("top", 0))
        j = i + 1

        # Continuar pelas palavras do prefixo multi-palavra
        for k in range(1, len(pref_words)):
            if j >= len(words) or j in used:
                break
            nw = words[j]
            if abs(float(nw.get("top", 0)) - top_ref) >= 6:
                break
            if float(nw["x0"]) - cx1 >= 20:
                break
            if nw["text"].strip().lower() == pref_words[k]:
                nome_words.append(nw["text"].strip())
                cx1 = float(nw["x1"])
                used.add(j)
                j += 1
            else:
                break

        # Extensão opcional: número ou qualificador (ex: "Principal", "1")
        if j < len(words) and j not in used:
            nw = words[j]
            nt = nw["text"].strip()
            same_line = abs(float(nw.get("top", 0)) - top_ref) < 6
            adjacent  = float(nw["x0"]) - cx1 < 22
            if same_line and adjacent:
                if NUM_RE.match(nt) or nt.lower() in [e.lower() for e in exts]:
                    nome_words.append(nt)
                    cx1 = float(nw["x1"])
                    used.add(j)

        label = _classificar(" ".join(nome_words))
        if label:
            used.add(i)
            cy = (float(w.get("top", 0)) + float(w.get("bottom", 0))) / 2
            labels.append({"label": label, "x": (cx0 + cx1) / 2, "y": cy})

    return labels


# ─── Extractor principal ───────────────────────────────────────────────────────

def _simplificar_poligono_geojson(geojson_str: str, tolerancia: float = 0.02) -> str:
    """
    Simplifica um polígono GeoJSON usando Shapely (Douglas-Peucker).
    Reduz o número de vértices em geometrias complexas de PDF mantendo
    a forma global dentro da tolerância (em metros).
    """
    if tolerancia <= 0:
        return geojson_str
    try:
        data = json.loads(geojson_str)
        coords = data["coordinates"][0]
        if len(coords) <= 5:  # retângulo simples (5 pts = fechado), não simplificar
            return geojson_str
        poly = Polygon(coords)
        if not poly.is_valid:
            return geojson_str
        simplified = poly.simplify(tolerancia, preserve_topology=True)
        # Se a simplificação reduziu para < 4 pontos, manter o original
        if len(simplified.exterior.coords) < 4:
            return geojson_str
        result = mapping(simplified)
        return json.dumps(result)
    except Exception:
        return geojson_str


def extrair_planta_pdf(caminho_pdf: str, usar_cache: bool = True) -> dict:
    """
    Extrai divisões de qualquer PDF arquitetónico em português.

    Args:
        caminho_pdf: Caminho para o ficheiro PDF.
        usar_cache: Se True (padrão), usa cache baseado em hash MD5 para
                    evitar reprocessamento de ficheiros já analisados.

    Returns:
        dict com chaves:
          - divisoes: lista de divisões (nome, area_m2, dim_w, dim_h,
                      x_mundo, y_mundo, poligono_geojson, confianca)
          - terreno_w, terreno_h: dimensões do terreno em metros (ou None)
          - escala: string da escala detetada (ex: "1:100") ou None
          - paginas_analisadas: total de páginas do PDF
          - em_cache: booleano indicando se o resultado veio da cache
    """
    # ── Verificar cache ──────────────────────────────────────────────────────
    if usar_cache:
        cached = _verificar_cache(caminho_pdf)
        if cached is not None:
            cached["em_cache"] = True
            return cached
    cotas      = []
    escala_ratio: Optional[int] = None
    paginas    = 0

    # ── Passagem 1: analisar todas as páginas ──────────────────────────────────
    pg_info = []   # [(score_geometria, score_labels, i, page, rects, labels)]

    with pdfplumber.open(caminho_pdf) as pdf:
        paginas = len(pdf.pages)

        # Verificar se o PDF é digitalizado/rasterizado (sem texto nem retângulos vetoriais em nenhuma página)
        total_rects = sum(len(page.rects) for page in pdf.pages)
        total_chars = sum(len(page.chars) for page in pdf.pages)
        if total_rects == 0 and total_chars == 0:
            raise ValueError(
                "O ficheiro PDF não contém elementos vetoriais nem texto extraível (PDF rasterizado/imagem). "
                "Por favor, use um PDF exportado diretamente do software CAD com elementos vetoriais."
            )

        for i, page in enumerate(pdf.pages):
            rects = _filtrar_rects(page.rects)

            # Recolher cotas e escala de qualquer página
            for ww in (page.extract_words(x_tolerance=2, y_tolerance=2) or []):
                tw = ww["text"].strip()
                if escala_ratio is None:
                    r = _detectar_escala(tw)
                    if r:
                        escala_ratio = r
                mc = COTA_RE.match(tw)
                if mc:
                    cotas.append(float(mc.group(1).replace(",", ".")))

            if not rects:
                continue

            # Pontuação como página de geometria (SEMPRE, sem excluir tabelas)
            div = _diversidade_rects(rects)
            score_geom = len(rects) * div

            # Labels só de páginas que NÃO são tabelas
            is_table = _is_spec_table(rects)
            labels = _extrair_labels(page) if not is_table else []
            score_lbl = len(labels) * math.log2(len(rects) + 2)

            pg_info.append((score_geom, score_lbl, i, page, rects, labels))

    if not pg_info:
        return {"divisoes": [], "terreno_w": None, "terreno_h": None,
                "escala": None, "paginas_analisadas": paginas,
                "texto_total_blocos": 0}

    # ── Página de geometria: maior score_geom ─────────────────────────────────
    pg_info.sort(key=lambda x: -x[0])
    _, _, geom_pg_i, geom_page, geom_rects, _ = pg_info[0]

    # ── Terreno e escala ──────────────────────────────────────────────────────
    terreno_w, terreno_h = _deduzir_terreno(cotas)
    ref_w = terreno_w or 40.0
    ref_h = terreno_h or 20.0

    # Calcular escala (m/pt)
    draw_x0, draw_y0, draw_x1, draw_y1 = _bbox(geom_rects)
    draw_w = draw_x1 - draw_x0
    draw_h = draw_y1 - draw_y0

    if escala_ratio:
        # Escala do texto PDF: 1pt = 0.3528mm, logo 1m real = (1000/ratio)*mm/0.3528
        pts_per_m = (1000.0 / escala_ratio) / 0.3528
        sc = 1.0 / pts_per_m
    else:
        # Fallback: ajustar ao terreno detetado
        sc_x = ref_w / max(draw_w, 1)
        sc_y = ref_h / max(draw_h, 1)
        sc = (sc_x + sc_y) / 2.0

    # ── Recolher labels de TODAS as páginas de planta ─────────────────────────
    todos_labels = []
    for score_geom, score_lbl, pg_i, page, rects, labels in pg_info:
        if labels:   # já filtrado por is_spec_table
            todos_labels.extend(labels)

    # Deduplicar labels (mesmo texto + posição próxima)
    labels_dedup = []
    for lbl in todos_labels:
        dup = any(
            ex["label"] == lbl["label"]
            and abs(ex["x"] - lbl["x"]) < 8
            and abs(ex["y"] - lbl["y"]) < 8
            for ex in labels_dedup
        )
        if not dup:
            labels_dedup.append(lbl)

    # ── Matching: label → rect da página de geometria ─────────────────────────
    usados      = set()
    nomes_vistos = set()
    divisoes    = []

    max_d = min(draw_w, draw_h) * 0.55   # raio máximo de pesquisa

    for lbl in labels_dedup:
        lx, ly = lbl["x"], lbl["y"]
        a_min, a_max = _area_range(lbl["label"].lower())
        scored = []

        for i, r in enumerate(geom_rects):
            if i in usados:
                continue
            rw = r["x1"] - r["x0"]
            rh = r["y1"] - r["y0"]

            # Filtro de proporção: excluir linhas de cota/dimensão
            aspect = max(rw, rh) / max(min(rw, rh), 0.1)
            if aspect > 6.0:
                continue

            area_m2 = (rw * sc) * (rh * sc)

            # Filtro de área por tipo de divisão
            if area_m2 < a_min * 0.5 or area_m2 > a_max * 2.0:
                continue

            rcx = (r["x0"] + r["x1"]) / 2
            rcy = (r["y0"] + r["y1"]) / 2
            d = _dist({"x": lx, "y": ly}, {"x": rcx, "y": rcy})
            if d > max_d:
                continue

            contained = (r["x0"] <= lx <= r["x1"] and r["y0"] <= ly <= r["y1"])

            # Score combinado
            if a_min <= area_m2 <= a_max:
                area_sc = 1.0
            elif area_m2 < a_min:
                area_sc = max(0.05, area_m2 / a_min)
            else:
                area_sc = max(0.05, a_max / area_m2)

            dist_sc    = 1.0 / (1.0 + d / 50.0)
            cont_bonus = 5.0 if contained else 1.0
            scored.append((area_sc * dist_sc * cont_bonus, i, r))

        if not scored:
            continue

        scored.sort(key=lambda s: -s[0])
        _, chosen_i, chosen_r = scored[0]
        usados.add(chosen_i)

        rw = chosen_r["x1"] - chosen_r["x0"]
        rh = chosen_r["y1"] - chosen_r["y0"]
        w_m = round(rw * sc, 2)
        h_m = round(rh * sc, 2)
        x_m = round((chosen_r["x0"] - draw_x0) * sc, 2)
        y_m = round(ref_h - (chosen_r["y0"] - draw_y0) * sc, 2)

        # Deduplicar: mesmo nome + posição arredondada
        key = f"{lbl['label']}|{round(x_m, 1)}|{round(y_m, 1)}"
        if key in nomes_vistos:
            continue
        nomes_vistos.add(key)

        poligono_geojson = _geojson_from_rect(chosen_r, draw_x0, draw_y0, sc, ref_h)
        poligono_geojson = _simplificar_poligono_geojson(poligono_geojson, 0.02)

        divisoes.append({
            "nome":             lbl["label"],
            "area_m2":          round(w_m * h_m, 1),
            "dim_w":            w_m,
            "dim_h":            h_m,
            "x_mundo":          x_m,
            "y_mundo":          y_m,
            "poligono_geojson": poligono_geojson,
            "confianca":        round(scored[0][0], 2) if scored else 0.5,
        })

    resultado = {
        "divisoes":           divisoes,
        "terreno_w":          terreno_w,
        "terreno_h":          terreno_h,
        "escala":             f"1:{escala_ratio}" if escala_ratio else None,
        "paginas_analisadas": paginas,
        "texto_total_blocos": len(divisoes),
        "em_cache":           False,
    }

    # ── Guardar em cache ──────────────────────────────────────────────────────
    if usar_cache:
        _guardar_cache(caminho_pdf, resultado)

    return resultado
