"""Desenho vectorial do diagrama unifilar do projeto elétrico."""
from reportlab.lib import colors
from pdf_utils import valor as _valor, cortar_texto as _cortar

PRETO = colors.black
CINZA = colors.HexColor("#444444")


def _texto_fase(fase):
    return {
        "monofasico": "MONO",
        "bifasico": "BI",
        "trifasico": "TRI",
    }.get((fase or "monofasico").lower(), str(fase or "MONO").upper())


def _desenhar_disjuntor(canvas, x, y, largura=26, altura=16, rotulo=None):
    """Desenha um disjuntor IEC simplificado, sem preencher superfícies."""
    canvas.rect(x - largura / 2, y - altura / 2, largura, altura, stroke=1, fill=0)
    canvas.line(x - largura / 2 + 4, y - altura / 2 + 3, x + largura / 2 - 4, y + altura / 2 - 3)
    canvas.line(x - largura / 2 + 4, y + altura / 2 - 3, x + largura / 2 - 4, y - altura / 2 + 3)
    if rotulo:
        canvas.setFont("Helvetica", 5.5)
        canvas.drawCentredString(x, y - altura / 2 - 8, str(rotulo))


def _desenhar_ramificacao(canvas, x, y_bus, y_card, circuito, resultado=None, largura=100, altura=56):
    centro = y_card + altura / 2
    canvas.line(x, y_bus, x, centro + altura / 2)
    canvas.circle(x, y_bus, 1.4, stroke=1, fill=1)
    _desenhar_disjuntor(canvas, x, centro + 9, rotulo=_valor(circuito, "disjuntor_amperagem") or _valor(resultado, "disjuntor_recomendado_a"))
    canvas.line(x, centro - 1, x, centro - altura / 2)
    canvas.rect(x - largura / 2, y_card, largura, altura, stroke=1, fill=0)

    nome = _valor(circuito, "nome", "Circuito")
    fase = _texto_fase(_valor(circuito, "fase"))
    cabo = _valor(circuito, "cabo_bitola_mm2") or _valor(resultado, "cabo_recomendado_mm2")
    potencia = _valor(resultado, "potencia_total_w")
    linhas = [
        _cortar(nome, largura - 8, tamanho=6.2),
        f"{fase}  |  {cabo:g} mm²" if isinstance(cabo, (int, float)) else f"{fase}  |  {cabo or '—'}",
        f"{potencia:g} VA" if isinstance(potencia, (int, float)) else "Potência —",
    ]
    canvas.setFont("Helvetica", 6)
    canvas.drawCentredString(x, y_card + altura - 13, linhas[0])
    canvas.setFillColor(CINZA)
    canvas.drawCentredString(x, y_card + altura - 25, linhas[1])
    canvas.drawCentredString(x, y_card + 9, linhas[2])
    canvas.setFillColor(PRETO)


def desenhar_diagrama_unifilar(canvas, largura_pagina, altura_pagina, circuitos, resultados=None, nome_projeto="Projeto"):
    """Desenha uma página A4/A3 paisagem com barramento e ramos dos circuitos."""
    margem = 28
    resultados = resultados or {}
    canvas.setStrokeColor(PRETO)
    canvas.setFillColor(PRETO)
    canvas.setLineWidth(0.7)

    canvas.rect(margem, margem, largura_pagina - 2 * margem, altura_pagina - 2 * margem, stroke=1, fill=0)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(margem + 14, altura_pagina - margem - 22, "DIAGRAMA UNIFILAR")
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(largura_pagina - margem - 14, altura_pagina - margem - 21, _cortar(nome_projeto or "Projeto", largura_pagina - 2 * margem - 120, tamanho=7))

    circuitos = list(circuitos or [])
    if not circuitos:
        canvas.setFont("Helvetica", 9)
        canvas.drawCentredString(largura_pagina / 2, altura_pagina / 2, "Sem circuitos definidos")
        canvas.setFont("Helvetica", 6)
        canvas.drawString(margem + 14, margem + 12, "Folha gerada automaticamente — valores aproximados, sujeitos a verificação técnica.")
        return

    # O layout usa até oito ramos por fila para manter os cartões legíveis em A4.
    colunas = min(8, max(1, len(circuitos)))
    filas = (len(circuitos) + colunas - 1) // colunas
    area_largura = largura_pagina - 2 * margem - 56
    espacamento = area_largura / max(colunas, 1)
    card_largura = min(106, max(62, espacamento - 12))
    y_bus = altura_pagina - 112

    # Alimentação principal e disjuntor geral.
    x_geral = margem + 28
    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawString(x_geral - 18, y_bus + 16, "QGBT")
    bus_inicio = x_geral + 52
    bus_fim = largura_pagina - margem - 24
    canvas.line(x_geral, y_bus, bus_fim, y_bus)
    canvas.circle(x_geral, y_bus, 2.2, stroke=1, fill=1)
    _desenhar_disjuntor(canvas, x_geral + 22, y_bus, largura=28, altura=18, rotulo="GERAL")
    canvas.line(x_geral + 36, y_bus, bus_inicio, y_bus)

    topo_cartoes = y_bus - 35
    separacao_vertical = max(86, (topo_cartoes - margem - 36) / max(filas, 1))
    for fila in range(filas):
        y_barramento = y_bus - fila * separacao_vertical
        if fila > 0:
            canvas.line(bus_inicio, y_bus, bus_inicio, y_barramento)
            canvas.line(bus_inicio, y_barramento, bus_fim, y_barramento)
        elif bus_inicio < bus_fim:
            canvas.line(bus_inicio, y_bus, bus_fim, y_bus)

    for indice, circuito in enumerate(circuitos):
        coluna = indice % colunas
        fila = indice // colunas
        x = margem + 56 + (coluna + 0.5) * espacamento
        y = topo_cartoes - fila * separacao_vertical - 56
        resultado = resultados.get(_valor(circuito, "id"), {}) if isinstance(resultados, dict) else {}
        if not isinstance(resultado, dict):
            resultado = {}
        _desenhar_ramificacao(
            canvas, x, y_bus - fila * separacao_vertical,
            y, circuito, resultado, largura=card_largura, altura=56,
        )

    y_legenda = margem + 18
    canvas.setFont("Helvetica", 6)
    canvas.setFillColor(CINZA)
    canvas.drawString(margem + 14, y_legenda, "Barramento principal  |  Disjuntor geral  |  Ramos por circuito")
    canvas.drawRightString(largura_pagina - margem - 14, y_legenda, "Valores aproximados — validar antes da execução")
    canvas.setFillColor(PRETO)
