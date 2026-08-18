"""Gerador vectorial de folhas PDF para projetos elétricos Electrilal.

A planta é desenhada diretamente no canvas do ReportLab: não há captura do
canvas web nem imagens raster. As tabelas são usadas apenas para informação
estruturada e todos os elementos gráficos permanecem vectoriais.
"""
import json
import math
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A3, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.pdfgen.canvas import Canvas as PdfCanvas

from reportlab.pdfbase.pdfmetrics import stringWidth
from pdf_unifilar import desenhar_diagrama_unifilar
from pdf_utils import valor as _valor, cortar_texto as _cortar_texto

PRETO = colors.black
CINZA = colors.HexColor("#444444")
CINZA_CLARO = colors.HexColor("#dddddd")
ESCALAS_NORMALIZADAS = (25, 50, 75, 100, 150, 200)
# 1 metro = 1000 mm; convertido para pontos a 72 pt/polegada (≈ 2834,65 pt).
PONTOS_POR_METRO_1_1 = 1000.0 * 72.0 / 25.4

TIPOS_NOMES = {
    "tomada": "Tomada",
    "tomada_baixa": "Tomada baixa",
    "tomada_media": "Tomada média",
    "tomada_alta": "Tomada alta",
    "tomada_trifasica": "Tomada trifásica",
    "tomada_sensor": "Tomada com sensor",
    "tomada_dupla": "Tomada dupla",
    "tomada_tripla": "Tomada tripla",
    "interruptor": "Interruptor",
    "interruptor_simples": "Interruptor simples",
    "interruptor_duplo": "Interruptor duplo",
    "interruptor_triplo": "Interruptor triplo",
    "interruptor_intermediario": "Interruptor intermédio",
    "interruptor_paralelo": "Interruptor paralelo",
    "interruptor_dimmer": "Interruptor dimmer",
    "interruptor_pulsador": "Interruptor pulsador",
    "lampada": "Lâmpada",
    "lampada_simples": "Lâmpada simples",
    "lampada_arandela": "Lâmpada arandela",
    "lampada_spot": "Lâmpada spot",
    "lampada_tubular": "Lâmpada tubular",
    "lampada_led": "Lâmpada LED",
    "lampada_led_fita": "Fita LED",
    "lampada_pendente": "Lâmpada pendente",
    "lampada_jardim": "Lâmpada de jardim",
    "quadro": "Quadro Geral (QGBT)",
    "quadro_parcial": "Quadro Parcial (QP)",
    "caixa_passagem": "Caixa de passagem",
    "passagem_sobe": "Passagem sobe",
    "passagem_desce": "Passagem desce",
    "campainha": "Campainha",
    "camera": "Câmara",
    "telefonia": "Telefonia",
    "dados": "Dados",
    "tv": "Televisão",
}


def _tipo_nome(tipo):
    if tipo in TIPOS_NOMES:
        return TIPOS_NOMES[tipo]
    tipo = str(tipo or "Componente").replace("_", " ")
    return tipo[:1].upper() + tipo[1:]


def _numero(valor, casas=2, padrao="—"):
    if valor is None or valor == "":
        return padrao
    try:
        return f"{float(valor):.{casas}f}".replace(".", ",")
    except (TypeError, ValueError):
        return str(valor)


def _numero_curto(valor, padrao="—"):
    if valor is None or valor == "":
        return padrao
    try:
        numero = float(valor)
        if numero.is_integer():
            return str(int(numero))
        return f"{numero:.2f}".replace(".", ",")
    except (TypeError, ValueError):
        return str(valor)


def _fase(fase):
    return {"monofasico": "Monofásico", "bifasico": "Bifásico", "trifasico": "Trifásico"}.get(
        str(fase or "monofasico").lower(), str(fase or "—")
    )


def _parse_scale(valor):
    if not valor:
        return None
    texto = str(valor).lower().replace(" ", "")
    if texto.startswith("1:"):
        texto = texto[2:]
    try:
        denominador = float(texto.replace(",", "."))
        if denominador <= 0:
            return None
        return denominador
    except ValueError:
        return None


def _geometrias_room(rooms):
    resultado = []
    for room in rooms or []:
        try:
            geo = json.loads(_valor(room, "poligono_geojson", "{}"))
            coords = geo.get("coordinates", [[]])[0]
            pontos = [(float(p[0]), float(p[1])) for p in coords if len(p) >= 2]
            if len(pontos) >= 2:
                resultado.append((room, pontos))
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    return resultado


def _bounds(geometria, componentes, rooms):
    xs, ys = [], []
    geometria = geometria or {}
    for linha in geometria.get("linhas", []):
        xs.extend([linha.get("x1", 0), linha.get("x2", 0)])
        ys.extend([linha.get("y1", 0), linha.get("y2", 0)])
    for poli in geometria.get("polilinhas", []):
        for ponto in poli.get("pontos", []):
            xs.append(ponto.get("x", 0))
            ys.append(ponto.get("y", 0))
    for circulo in geometria.get("circulos", []):
        raio = abs(circulo.get("raio", 0))
        xs.extend([circulo.get("cx", 0) - raio, circulo.get("cx", 0) + raio])
        ys.extend([circulo.get("cy", 0) - raio, circulo.get("cy", 0) + raio])
    for componente in componentes or []:
        xs.append(float(_valor(componente, "x", 0) or 0))
        ys.append(float(_valor(componente, "y", 0) or 0))
    for _, pontos in _geometrias_room(rooms):
        for x, y in pontos:
            xs.append(x)
            ys.append(y)
    if not xs:
        return -1.0, -1.0, 1.0, 1.0
    return min(xs), min(ys), max(xs), max(ys)


def _transformacao(geometria, componentes, rooms, area_x, area_y, area_w, area_h, denominador=None):
    xmin, ymin, xmax, ymax = _bounds(geometria, componentes, rooms)
    largura = max(xmax - xmin, 0.01)
    altura = max(ymax - ymin, 0.01)
    margem = 8
    limite = min((area_w - 2 * margem) / largura, (area_h - 2 * margem) / altura)
    if denominador:
        escala = PONTOS_POR_METRO_1_1 / denominador
        escala = min(escala, limite) if limite > 0 else escala
    else:
        escala = limite
    desenho_w = largura * escala
    desenho_h = altura * escala
    origem_x = area_x + (area_w - desenho_w) / 2 - xmin * escala
    origem_y = area_y + (area_h - desenho_h) / 2 - ymin * escala

    def ponto(x, y):
        return origem_x + float(x) * escala, origem_y + float(y) * escala

    return ponto, escala, (xmin, ymin, xmax, ymax), limite


def _posicao_limpa_rotulo(x, y, rad, tam_simbolo, tam_fonte, texto, is_interruptor, label_rects):
    """Encontra uma posição (lx, ly) em torno do componente sem sobreposição de rótulos."""
    fonte = "Helvetica-Bold" if is_interruptor else "Helvetica"
    largura = stringWidth(texto, fonte, tam_fonte)
    altura = tam_fonte

    def get_box(lx, ly):
        hw = largura / 2.0 + 1.5
        hh = altura / 2.0 + 1.0
        return (lx - hw, ly - hh, lx + hw, ly + hh)

    def colide(b1, b2):
        return not (b1[2] < b2[0] or b1[0] > b2[2] or b1[3] < b2[1] or b1[1] > b2[3])

    sin_a = math.sin(rad)
    cos_a = math.cos(rad)
    perp_x = cos_a
    perp_y = -sin_a

    base_dist = 1.8 if is_interruptor else 1.0
    tentativas = [
        (base_dist, 0.0),
        (base_dist, 10.0),
        (base_dist, -10.0),
        (base_dist + 0.8, 0.0),
        (base_dist + 0.8, 10.0),
        (base_dist + 0.8, -10.0),
        (base_dist, 20.0),
        (base_dist, -20.0),
        (base_dist + 1.5, 0.0),
    ]

    for d_mult, p_off in tentativas:
        dist = tam_simbolo * d_mult
        lx = x + dist * sin_a + p_off * perp_x
        ly = y + dist * cos_a + p_off * perp_y
        box = get_box(lx, ly)
        if not any(colide(box, b) for b in label_rects):
            label_rects.append(box)
            return lx, ly

    dist = tam_simbolo * base_dist
    lx = x + dist * sin_a
    ly = y + dist * cos_a
    box = get_box(lx, ly)
    label_rects.append(box)
    return lx, ly


def _escala_auto(limite):
    if limite <= 0:
        return None, "ajuste"
    # A maior escala normalizada que cabe na área usa melhor o espaço disponível.
    possiveis = [d for d in ESCALAS_NORMALIZADAS if PONTOS_POR_METRO_1_1 / d <= limite]
    if possiveis:
        denominador = min(possiveis)
        return denominador, f"1:{denominador}"
    return None, f"ajuste ({1 / limite:.0f}:1)"


def _desenhar_simbolo(canvas, tipo, x, y, tamanho=6, rotacao=0.0):
    """Símbolos compactos, monocromáticos e vectoriais para planta/legenda.

    Cada subtipo de lâmpada e interruptor tem uma representação distinta,
    baseada nas convenções IEC 60617 / NBR 5444. Suporta rotação em graus.
    """
    tipo = str(tipo or "").lower()
    s = tamanho
    canvas.saveState()
    canvas.translate(x, y)
    if rotacao:
        try:
            canvas.rotate(-float(rotacao))
        except (TypeError, ValueError):
            pass

    # Avançar símbolos de parede (tomadas, interruptores) para o interior da divisão
    if tipo.startswith("tomada") or tipo.startswith("interruptor"):
        canvas.translate(0, s * 0.45)

    x, y = 0.0, 0.0
    canvas.setStrokeColor(PRETO)
    canvas.setFillColor(PRETO)
    canvas.setLineWidth(0.25)

    # ── Lâmpadas ──────────────────────────────────────────────────────────
    if tipo == "lampada_spot":
        # Spot: círculo com ponto preenchido no centro
        canvas.circle(x, y, s * 0.72, stroke=1, fill=0)
        canvas.circle(x, y, s * 0.22, stroke=0, fill=1)
    elif tipo == "lampada_arandela":
        # Arandela: meia-lua (parede) com X
        canvas.arc(x - s * 0.72, y - s * 0.72, x + s * 0.72, y + s * 0.72, -90, 180)
        canvas.line(x, y - s * 0.72, x, y + s * 0.72)
        canvas.line(x - s * 0.35, y - s * 0.35, x + s * 0.35, y + s * 0.35)
        canvas.line(x - s * 0.35, y + s * 0.35, x + s * 0.35, y - s * 0.35)
    elif tipo == "lampada_tubular":
        # Tubular/fluorescente: rectângulo estreito
        canvas.rect(x - s * 0.9, y - s * 0.28, s * 1.8, s * 0.56, stroke=1, fill=0)
        canvas.line(x - s * 0.5, y - s * 0.28, x - s * 0.5, y + s * 0.28)
        canvas.line(x + s * 0.5, y - s * 0.28, x + s * 0.5, y + s * 0.28)
    elif tipo == "lampada_led":
        # LED: círculo com X + marca "LED" (pequeno triângulo)
        canvas.circle(x, y, s * 0.72, stroke=1, fill=0)
        canvas.line(x - s * 0.5, y - s * 0.5, x + s * 0.5, y + s * 0.5)
        canvas.line(x - s * 0.5, y + s * 0.5, x + s * 0.5, y - s * 0.5)
        # Pequeno triângulo no canto superior direito
        path = canvas.beginPath()
        path.moveTo(x + s * 0.45, y + s * 0.72)
        path.lineTo(x + s * 0.72, y + s * 0.72)
        path.lineTo(x + s * 0.72, y + s * 0.45)
        path.close()
        canvas.drawPath(path, stroke=0, fill=1)
    elif tipo == "lampada_led_fita":
        # Fita LED: linha ondulada
        canvas.circle(x, y, s * 0.72, stroke=1, fill=0)
        path = canvas.beginPath()
        path.moveTo(x - s * 0.5, y)
        path.curveTo(x - s * 0.25, y + s * 0.35, x, y - s * 0.35, x + s * 0.25, y + s * 0.2)
        path.lineTo(x + s * 0.5, y)
        canvas.drawPath(path, stroke=1, fill=0)
    elif tipo == "lampada_pendente":
        # Pendente: círculo com X + linha vertical para baixo
        canvas.circle(x, y, s * 0.55, stroke=1, fill=0)
        canvas.line(x - s * 0.38, y - s * 0.38, x + s * 0.38, y + s * 0.38)
        canvas.line(x - s * 0.38, y + s * 0.38, x + s * 0.38, y - s * 0.38)
        canvas.line(x, y - s * 0.55, x, y - s * 0.88)
        canvas.line(x - s * 0.18, y - s * 0.88, x + s * 0.18, y - s * 0.88)
    elif tipo == "lampada_jardim":
        # Jardim: círculo com X + estaca (linha para baixo com base)
        canvas.circle(x, y + s * 0.15, s * 0.55, stroke=1, fill=0)
        canvas.line(x - s * 0.38, y + s * 0.15 - s * 0.38, x + s * 0.38, y + s * 0.15 + s * 0.38)
        canvas.line(x - s * 0.38, y + s * 0.15 + s * 0.38, x + s * 0.38, y + s * 0.15 - s * 0.38)
        canvas.line(x, y - s * 0.4, x, y - s * 0.85)
        canvas.line(x - s * 0.25, y - s * 0.85, x + s * 0.25, y - s * 0.85)
    elif tipo.startswith("lampada") or tipo in ("luminaria", "luminária"):
        # Genérica / simples: círculo com X (NBR 5444)
        canvas.circle(x, y, s * 0.72, stroke=1, fill=0)
        canvas.line(x - s * 0.5, y - s * 0.5, x + s * 0.5, y + s * 0.5)
        canvas.line(x - s * 0.5, y + s * 0.5, x + s * 0.5, y - s * 0.5)

    # ── Interruptores (0° = Haste a -Y / Círculo a +Y) ───────────────────
    elif tipo.startswith("interruptor"):
        # Haste conectando à parede (para baixo)
        canvas.line(0, -s, 0, -s * 0.15)
        cy = s * 0.3
        cr = s * 0.45
        if tipo == "interruptor_paralelo" or tipo == "three_way":
            # Three-way: círculo totalmente preenchido (●)
            canvas.circle(0, cy, cr, stroke=1, fill=1)
        elif tipo == "interruptor_intermediario" or tipo == "four_way":
            # Four-way: círculo meio preenchido (◐)
            canvas.circle(0, cy, cr, stroke=1, fill=0)
            path_meio = canvas.beginPath()
            path_meio.arc(0 - cr, cy - cr, 0 + cr, cy + cr, 90, 180)
            path_meio.close()
            canvas.drawPath(path_meio, stroke=0, fill=1)
        elif tipo == "interruptor_duplo":
            canvas.circle(0, cy, cr, stroke=1, fill=0)
            canvas.line(-s * 0.2, cy + cr, -s * 0.2, cy + cr + s * 0.3)
            canvas.line(s * 0.2, cy + cr, s * 0.2, cy + cr + s * 0.3)
        elif tipo == "interruptor_triplo":
            canvas.circle(0, cy, cr, stroke=1, fill=0)
            canvas.line(-s * 0.3, cy + cr, -s * 0.3, cy + cr + s * 0.3)
            canvas.line(0, cy + cr, 0, cy + cr + s * 0.35)
            canvas.line(s * 0.3, cy + cr, s * 0.3, cy + cr + s * 0.3)
        elif tipo == "interruptor_dimmer":
            canvas.circle(0, cy, cr, stroke=1, fill=0)
            canvas.arc(-cr, cy - cr, cr, cy + cr, 45, 180)
        elif tipo == "interruptor_pulsador":
            canvas.circle(0, cy, cr, stroke=1, fill=0)
            canvas.circle(0, cy, cr * 0.35, stroke=0, fill=1)
        else:
            # Simples / genérico: círculo vazado (○)
            canvas.circle(0, cy, cr, stroke=1, fill=0)

    # ── Tomadas (0° = Haste a -Y / Triângulo apontando a +Y) ─────────────
    elif tipo.startswith("tomada"):
        if "dupla" in tipo or "tripla" in tipo:
            canvas.line(0, -s, 0, -s * 0.3)
            # Dois triângulos em série ao longo do eixo Y
            for dy in (-s * 0.3, s * 0.15):
                path = canvas.beginPath()
                path.moveTo(-s * 0.4, dy)
                path.lineTo(0, dy + s * 0.45)
                path.lineTo(s * 0.4, dy)
                path.close()
                canvas.drawPath(path, stroke=1, fill=0)
        else:
            canvas.line(0, -s, 0, -s * 0.2)
            path = canvas.beginPath()
            path.moveTo(-s * 0.5, -s * 0.2)
            path.lineTo(0, s * 0.6)
            path.lineTo(s * 0.5, -s * 0.2)
            path.close()

            if "alta" in tipo:
                # Tomada alta: triângulo totalmente preenchido (▲)
                canvas.drawPath(path, stroke=1, fill=1)
            elif "media" in tipo or "média" in tipo:
                # Tomada média: triângulo meio preenchido (metade esquerda)
                canvas.drawPath(path, stroke=1, fill=0)
                path_meio = canvas.beginPath()
                path_meio.moveTo(-s * 0.5, -s * 0.2)
                path_meio.lineTo(0, s * 0.6)
                path_meio.lineTo(0, -s * 0.2)
                path_meio.close()
                canvas.drawPath(path_meio, stroke=0, fill=1)
            else:
                # Tomada baixa / simples / trifásica: triângulo vazado (△)
                canvas.drawPath(path, stroke=1, fill=0)
                if "trifasica" in tipo or "trifásica" in tipo:
                    canvas.setFont("Helvetica-Bold", max(3.5, s * 0.5))
                    canvas.drawCentredString(0, -s * 0.05, "3")

    # ── Outros tipos ──────────────────────────────────────────────────────
    elif tipo == "quadro":
        canvas.rect(x - s, y - s * 0.72, 2 * s, 1.44 * s, stroke=1, fill=0)
        canvas.line(x - s * 0.7, y, x + s * 0.7, y)
    elif "campainha" in tipo:
        canvas.arc(x - s, y - s * 0.5, x + s, y + s, 0, 180)
        canvas.circle(x, y - s * 0.15, s * 0.14, stroke=1, fill=1)
    elif "camera" in tipo:
        path = canvas.beginPath()
        path.moveTo(x, y + s)
        path.lineTo(x + s, y + s * 0.2)
        path.lineTo(x + s * 0.62, y - s)
        path.lineTo(x - s * 0.62, y - s)
        path.lineTo(x - s, y + s * 0.2)
        path.close()
        canvas.drawPath(path, stroke=1, fill=0)
    elif tipo in ("telefonia", "dados", "tv"):
        path = canvas.beginPath()
        path.moveTo(x, y + s)
        path.lineTo(x + s, y - s)
        path.lineTo(x - s, y - s)
        path.close()
        canvas.drawPath(path, stroke=1, fill=0)
        canvas.setFont("Helvetica-Bold", max(4, s))
        canvas.drawCentredString(x, y - s * 0.55, {"telefonia": "T", "dados": "D", "tv": "V"}.get(tipo, ""))
    elif "passagem" in tipo:
        canvas.rect(x - s * 0.72, y - s * 0.72, 1.44 * s, 1.44 * s, stroke=1, fill=0)
        canvas.line(x - s * 0.62, y - s * 0.62, x + s * 0.62, y + s * 0.62)
        canvas.line(x - s * 0.62, y + s * 0.62, x + s * 0.62, y - s * 0.62)
    else:
        canvas.circle(x, y, s * 0.65, stroke=1, fill=0)
        canvas.line(x - s * 0.45, y, x + s * 0.45, y)
        canvas.line(x, y - s * 0.45, x, y + s * 0.45)
    canvas.restoreState()


def _desenhar_planta(canvas, geometria, componentes, conexoes, rooms, area_x, area_y, area_w, area_h, denominador):
    ponto, escala, limites, limite = _transformacao(
        geometria, componentes, rooms, area_x, area_y, area_w, area_h, denominador
    )
    canvas.setStrokeColor(PRETO)
    canvas.setLineWidth(0.35)
    geometria = geometria or {}

    for linha in geometria.get("linhas", []):
        canvas.line(*ponto(linha.get("x1", 0), linha.get("y1", 0)), *ponto(linha.get("x2", 0), linha.get("y2", 0)))
    for poli in geometria.get("polilinhas", []):
        pontos = poli.get("pontos", [])
        if len(pontos) < 2:
            continue
        canvas.saveState()
        canvas.setLineWidth(0.45)
        canvas.setDash(1.5, 1.5) if not poli.get("fechada") else canvas.setDash()
        for a, b in zip(pontos, pontos[1:]):
            canvas.line(*ponto(a.get("x", 0), a.get("y", 0)), *ponto(b.get("x", 0), b.get("y", 0)))
        if poli.get("fechada"):
            canvas.line(*ponto(pontos[-1].get("x", 0), pontos[-1].get("y", 0)), *ponto(pontos[0].get("x", 0), pontos[0].get("y", 0)))
        canvas.restoreState()
    for circulo in geometria.get("circulos", []):
        cx, cy = ponto(circulo.get("cx", 0), circulo.get("cy", 0))
        canvas.circle(cx, cy, max(0.25, abs(circulo.get("raio", 0)) * escala), stroke=1, fill=0)

    # Divisões ficam em linha tracejada para não competir com as paredes DXF.
    for room, poligono in _geometrias_room(rooms):
        canvas.saveState()
        canvas.setDash(2, 2)
        canvas.setLineWidth(0.3)
        for a, b in zip(poligono, poligono[1:]):
            canvas.line(*ponto(*a), *ponto(*b))
        if len(poligono) > 2:
            canvas.line(*ponto(*poligono[-1]), *ponto(*poligono[0]))
        canvas.restoreState()
        nome = _valor(room, "nome")
        if nome:
            cx = sum(p[0] for p in poligono) / len(poligono)
            cy = sum(p[1] for p in poligono) / len(poligono)
            tx, ty = ponto(cx, cy)
            canvas.setFont("Helvetica", 4.5)
            canvas.setFillColor(CINZA)
            canvas.drawCentredString(tx, ty, _cortar_texto(nome, 90, tamanho=4.5))
            canvas.setFillColor(PRETO)

    # Tamanho dos símbolos proporcional à escala: um símbolo elétrico real
    # ocupa ~18cm; clamped entre 2.5pt (legível) e 6pt (não sobrepõe).
    tam_simbolo = max(2.5, min(7, 0.28 * escala))
    tam_fonte = max(3.0, min(4.5, tam_simbolo * 0.82))

    comp_por_id = {_valor(c, "id"): c for c in componentes or []}
    for conexao in conexoes or []:
        origem = comp_por_id.get(_valor(conexao, "origem_id"))
        destino = comp_por_id.get(_valor(conexao, "destino_id"))
        if not origem or not destino:
            continue
        x1, y1 = ponto(_valor(origem, "x", 0), _valor(origem, "y", 0))
        x2, y2 = ponto(_valor(destino, "x", 0), _valor(destino, "y", 0))
        canvas.saveState()
        canvas.setLineWidth(max(0.25, min(0.55, 0.04 * escala)))
        c1x, c1y = _valor(conexao, "c1_x"), _valor(conexao, "c1_y")
        if c1x is not None and c1y is not None:
            cx, cy = ponto(c1x, c1y)
            path = canvas.beginPath()
            path.moveTo(x1, y1)
            path.curveTo(cx, cy, cx, cy, x2, y2)
            canvas.drawPath(path, stroke=1, fill=0)
        else:
            canvas.line(x1, y1, x2, y2)
        canvas.restoreState()

    label_rects = []
    for componente in componentes or []:
        x, y = ponto(_valor(componente, "x", 0), _valor(componente, "y", 0))
        tipo = _valor(componente, "tipo", "")
        rotacao = _valor(componente, "rotacao", 0.0)
        _desenhar_simbolo(canvas, tipo, x, y, tamanho=tam_simbolo, rotacao=rotacao)

        # Lâmpadas e interruptores mostram as letras dos comandos (ex: "a", "a, b", "1a").
        # Outros tipos (tomadas, caixas, fitas LED, JSONs) não exibem rótulo na planta.
        is_lampada = str(tipo).startswith("lampada") or tipo in ("lampada", "luminaria")
        is_interruptor = str(tipo).startswith("interruptor")
        if (is_lampada or is_interruptor) and tipo != "lampada_led_fita":
            rotulo = str(_valor(componente, "rotulo") or "").strip()
            if not rotulo or rotulo == tipo:
                if tipo == "interruptor_duplo":
                    rotulo = "a, b"
                elif tipo == "interruptor_triplo":
                    rotulo = "a, b, c"
                elif is_interruptor:
                    rotulo = "a"
            if rotulo and not rotulo.startswith(("{", "[")) and len(rotulo) <= 16:
                texto_comando = rotulo.replace(",", ", ")
                rad = math.radians(float(rotacao or 0.0))
                font_sz = tam_fonte * (1.15 if is_interruptor else 1.0)
                
                # Encontrar posição limpa sem sobrepor outros rótulos de agrupamento
                label_x, label_y = _posicao_limpa_rotulo(
                    x, y, rad, tam_simbolo, font_sz, texto_comando, is_interruptor, label_rects
                )

                canvas.saveState()
                if is_interruptor:
                    canvas.setFont("Helvetica-Bold", font_sz)
                    
                    # Posição do centro da cabeça do interruptor
                    sym_x = x + (tam_simbolo * 0.75) * math.sin(rad)
                    sym_y = y + (tam_simbolo * 0.75) * math.cos(rad)
                    
                    dx = label_x - sym_x
                    dy = label_y - sym_y
                    dist_tot = math.sqrt(dx * dx + dy * dy)
                    
                    if dist_tot > 2.0:
                        ux = dx / dist_tot
                        uy = dy / dist_tot
                        
                        # Vetor normal (perpendicular) apontando para cima da linha
                        nx, ny = -uy, ux
                        if ny < 0 or (abs(ny) < 1e-4 and nx < 0):
                            nx, ny = -nx, -ny
                        
                        r_sym = tam_simbolo * 0.45
                        start_x = sym_x + ux * r_sym
                        start_y = sym_y + uy * r_sym
                        
                        largura_t = stringWidth(_cortar_texto(texto_comando, 48, tamanho=font_sz), "Helvetica-Bold", font_sz)
                        end_x = label_x + ux * (largura_t / 2.0 + 1.0)
                        end_y = label_y + uy * (largura_t / 2.0 + 1.0)
                        
                        # Desenhar linha de chamada simples vinda do interruptor (sem setinha/triângulo)
                        canvas.setStrokeColor(PRETO)
                        canvas.setLineWidth(0.4)
                        canvas.line(start_x, start_y, end_x, end_y)
                        
                        # Posição do texto diretamente por cima da linha
                        text_x = label_x + nx * 2.5
                        text_y = label_y + ny * 2.5
                        canvas.drawCentredString(text_x, text_y, _cortar_texto(texto_comando, 48, tamanho=font_sz))
                    else:
                        canvas.drawCentredString(label_x, label_y + 2.5, _cortar_texto(texto_comando, 48, tamanho=font_sz))
                else:
                    canvas.setFont("Helvetica", font_sz)
                    canvas.drawCentredString(label_x, label_y - 1.5, _cortar_texto(texto_comando, 48, tamanho=font_sz))
                canvas.restoreState()
    return escala, limite


def _desenhar_legenda(canvas, x, y_top, largura, tipos):
    """Desenha todos os tipos usados, distribuindo-os por duas colunas."""
    colunas = 2 if len(tipos) > 13 else 1
    itens_por_coluna = max(1, math.ceil(len(tipos) / colunas))
    altura = 35 + itens_por_coluna * 13
    canvas.setStrokeColor(PRETO)
    canvas.rect(x, y_top - altura, largura, altura, stroke=1, fill=0)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(x + 8, y_top - 14, "LEGENDA")
    largura_coluna = largura / colunas
    canvas.setFont("Helvetica", 5.7)
    for indice, tipo in enumerate(tipos):
        coluna = indice // itens_por_coluna
        linha = indice % itens_por_coluna
        item_x = x + coluna * largura_coluna
        item_y = y_top - 29 - linha * 13
        _desenhar_simbolo(canvas, tipo, item_x + 9, item_y + 1, tamanho=5)
        nome = _tipo_nome(tipo)
        limite_texto = largura_coluna - 23
        texto = _cortar_texto(nome, limite_texto, tamanho=5.7)
        canvas.drawString(item_x + 18, item_y - 1, texto)
    if not tipos:
        canvas.setFont("Helvetica-Oblique", 6)
        canvas.drawString(x + 8, y_top - 30, "Sem componentes")


def _resultado_para_circuito(circuito, resultados):
    resultado = (resultados or {}).get(_valor(circuito, "id"), {})
    return resultado if isinstance(resultado, dict) else {}


def _estilo_tabela_qgbt():
    estilos = getSampleStyleSheet()
    estilo = ParagraphStyle("celula_pdf", parent=estilos["Normal"], fontName="Helvetica", fontSize=5.1, leading=6)
    estilo_cab = ParagraphStyle("cab_pdf", parent=estilo, fontName="Helvetica-Bold", alignment=1)
    return estilo, estilo_cab


def _criar_tabela_qgbt(dados, larguras):
    tabela = Table(dados, colWidths=larguras, repeatRows=1)
    tabela.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, PRETO),
        ("BACKGROUND", (0, 0), (-1, 0), CINZA_CLARO),
        ("ALIGN", (0, 1), (-2, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return tabela


def _desenhar_tabela_qgbt(canvas, x, y_top, largura, circuitos, resultados, altura_max=None):
    estilo, estilo_cab = _estilo_tabela_qgbt()
    cabecalho = ["Nº", "Potência\n(VA)", "Corrente\n(A)", "Fase", "Disj.\n(A)", "Cabo\n(mm²)", "Comp.\n(m)", "Queda\n(%)", "Descrição"]
    dados = [[Paragraph(c.replace("\n", "<br/>"), estilo_cab) for c in cabecalho]]
    descricao_largura = max(70, largura - 333)
    for indice, circuito in enumerate(circuitos or [], start=1):
        r = _resultado_para_circuito(circuito, resultados)
        dados.append([
            str(indice),
            _numero_curto(r.get("potencia_total_w")),
            _numero(r.get("corrente_a"), 2),
            _fase(_valor(circuito, "fase")),
            _numero_curto(r.get("disjuntor_recomendado_a", _valor(circuito, "disjuntor_amperagem"))),
            _numero_curto(r.get("cabo_recomendado_mm2", _valor(circuito, "cabo_bitola_mm2"))),
            _numero(r.get("comprimento_m"), 2),
            _numero(r.get("queda_tensao_pct"), 2),
            Paragraph(_cortar_texto(_valor(circuito, "nome", "Circuito"), descricao_largura - 4, tamanho=5.1), estilo),
        ])
    larguras = [18, 40, 38, 48, 35, 38, 38, 38, descricao_largura]
    escala_largura = largura / sum(larguras)
    larguras = [w * escala_largura for w in larguras]
    tabela = _criar_tabela_qgbt(dados, larguras)
    _, altura = tabela.wrap(largura, 1000)

    if altura_max and altura > altura_max and len(dados) > 2:
        total_circuitos = len(dados) - 1
        restantes = total_circuitos
        while restantes > 0:
            candidatos = dados[:restantes + 1]
            candidatos.append([Paragraph(f"{total_circuitos - restantes} circuito(s) omitido(s) por falta de espaço", estilo), "", "", "", "", "", "", "", ""])
            tabela_candidata = _criar_tabela_qgbt(candidatos, larguras)
            _, altura_candidata = tabela_candidata.wrap(largura, 1000)
            if altura_candidata <= altura_max:
                tabela, altura = tabela_candidata, altura_candidata
                break
            restantes -= 1
        if restantes == 0 and altura > altura_max:
            tabela, altura = _criar_tabela_qgbt(dados[:1] + [[Paragraph("Tabela excede a área disponível", estilo)] + [""] * 8], larguras), altura_max

    tabela.drawOn(canvas, x, y_top - altura)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(x, y_top + 10, "QGBT — QUADRO GERAL DE BAIXA TENSÃO")
    return altura


def _desenhar_carimbo(canvas, x, y, largura, altura, config, escala_texto):
    """Carimbo técnico — layout: nome do projeto (topo), autor, notas, Data|Escala|Folha.

    Sem rectângulo próprio; as bordas externas coincidem com a margem da folha.
    Apenas linhas divisórias internas.
    """
    notas = str(config.get("notas") or "")
    barra_h = 18  # altura da barra inferior Data|Escala|Folha
    col_escala = largura * 0.55
    col_folha = largura * 0.78

    canvas.setLineWidth(0.5)
    # Bordas externas
    canvas.rect(x, y, largura, altura, stroke=1, fill=0)

    # Divisória horizontal entre conteúdo superior e barra inferior
    canvas.line(x, y + barra_h, x + largura, y + barra_h)

    # Divisórias verticais da barra inferior (3 células: Data | Escala | Folha)
    canvas.line(x + col_escala, y, x + col_escala, y + barra_h)
    canvas.line(x + col_folha, y, x + col_folha, y + barra_h)

    # ── Conteúdo superior: nome do projeto ──
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(x + 6, y + altura - 14,
                      _cortar_texto(config.get("nome_projeto") or "Projeto", largura - 12, tamanho=9))

    # ── Autor ──
    canvas.setFont("Helvetica", 7)
    canvas.drawString(x + 6, y + altura - 28,
                      _cortar_texto(f"Autor: {config.get('autor') or 'Electrilal'}", largura - 12, tamanho=7))

    # ── Notas (opcionais, entre autor e barra) ──
    if notas:
        canvas.setFont("Helvetica-Oblique", 5.5)
        canvas.drawString(x + 6, y + barra_h + 6,
                          _cortar_texto(notas, largura - 12, tamanho=5.5))

    # ── Barra inferior: Data | Escala | Folha ──
    canvas.setFont("Helvetica", 6.5)
    canvas.drawString(x + 5, y + 5,
                      f"Data: {config.get('data') or date.today().strftime('%d/%m/%Y')}")
    canvas.drawString(x + col_escala + 5, y + 5,
                      f"Escala: {escala_texto}")
    canvas.drawString(x + col_folha + 5, y + 5,
                      f"Folha: {config.get('numero_folha') or 1}")


def _tamanho_pagina(formato):
    return landscape(A3 if str(formato).upper() == "A3" else A4)


def gerar_pdf_projeto(caminho_saida, projeto, geometria=None, componentes=None, circuitos=None, conexoes=None, rooms=None, resultados=None, config=None):
    """Gera o PDF completo e devolve o caminho do ficheiro criado.

    ``resultados`` é um dicionário indexado por ``circuit_id`` com o retorno
    normalizado do dimensionamento. Os objetos recebidos podem ser ORM ou dicts.
    """
    config = dict(config or {})
    largura, altura = _tamanho_pagina(config.get("formato", "A4"))
    nome = config.get("nome_projeto") or _valor(projeto, "nome", "Projeto")
    componentes = list(componentes or [])
    circuitos = list(circuitos or [])
    conexoes = list(conexoes or [])
    rooms = list(rooms or [])
    tipos = sorted({_valor(c, "tipo", "componente") for c in componentes}, key=lambda t: _tipo_nome(t).lower())

    canvas = PdfCanvas(caminho_saida, pagesize=(largura, altura))
    margem = 18
    canvas.setTitle(f"{nome} — Projeto elétrico")
    canvas.setStrokeColor(PRETO)
    canvas.setFillColor(PRETO)
    canvas.setLineWidth(0.8)
    canvas.rect(margem, margem, largura - 2 * margem, altura - 2 * margem, stroke=1, fill=0)

    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(margem + 12, altura - margem - 19, "PROJETO ELÉTRICO")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(largura - margem - 12, altura - margem - 18, _cortar_texto(nome, largura - 2 * margem - 24, tamanho=8))
    canvas.setLineWidth(0.35)
    canvas.line(margem + 12, altura - margem - 29, largura - margem - 12, altura - margem - 29)

    carimbo_w = min(300, largura * 0.32)
    carimbo_h = 58
    carimbo_x = largura - margem - carimbo_w
    carimbo_y = margem + 2
    planta_x = margem + 155
    planta_y = carimbo_y + carimbo_h + 84
    planta_w = max(100, largura - margem - carimbo_w - planta_x - 18)
    planta_h = max(120, altura - margem - planta_y - 42)
    legenda_y = altura - margem - 45
    _desenhar_legenda(canvas, margem + 10, legenda_y, 132, tipos)

    # Determinar escala automática a partir da área real, antes de desenhar.
    _, _, _, limite = _transformacao(geometria or {}, componentes, rooms, planta_x, planta_y, planta_w, planta_h)
    manual = _parse_scale(config.get("escala_manual"))
    denominador = manual
    if denominador is None:
        denominador, escala_texto = _escala_auto(limite)
    else:
        escala_texto = f"1:{_numero_curto(denominador)}"
    _desenhar_planta(canvas, geometria, componentes, conexoes, rooms, planta_x, planta_y, planta_w, planta_h, denominador)
    canvas.setLineWidth(0.45)
    canvas.rect(planta_x, planta_y, planta_w, planta_h, stroke=1, fill=0)
    canvas.setFont("Helvetica", 6)
    canvas.drawString(planta_x + 5, planta_y + planta_h - 10, f"PLANTA — escala {escala_texto}")

    tabela_y_top = planta_y - 28
    tabela_w = max(280, planta_w)
    altura_tabela_max = max(34, tabela_y_top - margem - 12)
    _desenhar_tabela_qgbt(canvas, planta_x, tabela_y_top, tabela_w, circuitos, resultados, altura_max=altura_tabela_max)

    # Painel de informação rápida à direita, mantendo o carimbo limpo.
    painel_x = largura - margem - carimbo_w
    painel_y = carimbo_y + carimbo_h + 32
    painel_h = max(80, altura - painel_y - margem - 45)
    canvas.rect(painel_x, painel_y, carimbo_w, painel_h, stroke=1, fill=0)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(painel_x + 8, painel_y + painel_h - 14, "QUADRO / NOTAS")
    canvas.setFont("Helvetica", 6.5)
    linhas = [
        f"Circuitos: {len(circuitos)}",
        f"Componentes: {len(componentes)}",
        f"Conexões: {len(conexoes)}",
        "",
        "Diagrama unifilar na folha seguinte." if config.get("incluir_unifilar", True) else "Diagrama unifilar não incluído.",
        "",
        "Dimensionamento aproximado; validar",
        "por técnico responsável antes da execução.",
    ]
    yy = painel_y + painel_h - 28
    for linha in linhas:
        canvas.drawString(painel_x + 8, yy, linha)
        yy -= 10

    _desenhar_carimbo(canvas, carimbo_x, carimbo_y, carimbo_w, carimbo_h, {**config, "nome_projeto": nome}, escala_texto)
    canvas.setFont("Helvetica", 5.5)
    canvas.drawString(margem + 10, margem + 9, "Electrilal — exportação vectorial monocromática")

    if config.get("incluir_unifilar", True):
        canvas.showPage()
        desenhar_diagrama_unifilar(canvas, largura, altura, circuitos, resultados, nome)
    canvas.save()
    return caminho_saida
