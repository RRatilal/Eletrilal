"""Desenho vectorial do diagrama unifilar do projeto elétrico."""
from reportlab.lib import colors
from pdf_utils import valor as _valor, cortar_texto as _cortar
import json

PRETO = colors.black
CINZA = colors.HexColor("#444444")


def _texto_fase(fase, fases=None):
    if isinstance(fases, str):
        try:
            import json
            fases = json.loads(fases)
        except (TypeError, ValueError):
            fases = None
    validas = [f for f in (fases or []) if f in ("L1", "L2", "L3")]
    if validas:
        return "-".join(validas)
    return {"monofasico": "L1", "bifasico": "L1-L2", "trifasico": "L1-L2-L3"}.get((fase or "monofasico").lower(), "—")


def _nome_quadro(quadro):
    """Obtém o nome legível do quadro sem imprimir o JSON de configuração."""
    rotulo = _valor(quadro, "rotulo")
    if isinstance(rotulo, str):
        texto = rotulo.strip()
        if texto.startswith("{"):
            try:
                dados = json.loads(texto)
                if isinstance(dados, dict):
                    return str(dados.get("nome") or dados.get("rotulo") or "").strip()
            except (TypeError, ValueError):
                return ""
        return texto
    return str(rotulo or "").strip()


def _texto_numero(valor, padrao="—"):
    if valor is None or valor == "":
        return padrao
    try:
        n = float(valor)
        return str(int(n)) if n.is_integer() else f"{n:g}"
    except (TypeError, ValueError):
        return str(valor)


def _desenhar_disjuntor_vertical(canvas, x, y, amperagem):
    """Disjuntor compacto com arco e dois terminais, como no esquema de referência."""
    raio = 7
    canvas.circle(x, y, raio, stroke=1, fill=0)
    canvas.line(x - raio, y, x + raio, y)
    canvas.line(x - 3, y - 9, x - 3, y - 5)
    canvas.line(x + 3, y - 9, x + 3, y - 5)
    canvas.circle(x - 6, y - 9, 1.5, stroke=1, fill=0)
    canvas.circle(x + 6, y - 9, 1.5, stroke=1, fill=0)
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(x, y + 10, f"{_texto_numero(amperagem)} A")


def _desenhar_ramificacao(canvas, x_bus, y, circuito, resultado, escala=1.0):
    fase = _texto_fase(_valor(circuito, "fase"), _valor(circuito, "fases"))
    amperagem = _valor(resultado, "disjuntor_recomendado_a") or _valor(circuito, "disjuntor_amperagem")
    cabo = _valor(resultado, "cabo_recomendado_mm2") or _valor(circuito, "cabo_bitola_mm2")
    numero = _valor(circuito, "numero")
    nome = _valor(circuito, "nome", "Circuito")
    nome = _cortar(nome, 120, tamanho=7)

    # Condutor horizontal até ao disjuntor.
    canvas.setLineWidth(0.8)
    canvas.line(x_bus, y, x_bus + 58, y)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(x_bus + 38, y + 4, fase)
    _desenhar_disjuntor_vertical(canvas, x_bus + 66, y + 1, amperagem)

    # Saída e identificação textual à direita.
    x_texto = x_bus + 84
    canvas.line(x_bus + 73, y, x_texto - 4, y)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(x_texto, y + 3, f"CIRC {_texto_numero(numero)} - {nome}")
    canvas.setFont("Helvetica", 7)
    cabo_texto = _texto_numero(cabo)
    canvas.drawString(x_texto, y - 10, f"1#{cabo_texto}({cabo_texto})mm²")


def _desenhar_dps(canvas, x, y):
    canvas.setLineWidth(0.7)
    canvas.rect(x - 4, y - 10, 8, 20, stroke=1, fill=0)
    canvas.line(x - 3, y + 5, x + 3, y - 4)
    canvas.line(x - 3, y - 4, x + 3, y - 4)
    canvas.line(x, y - 10, x, y - 17)
    canvas.line(x - 5, y - 17, x + 5, y - 17)
    canvas.setFont("Helvetica", 6)
    canvas.drawString(x + 8, y + 4, "DPS")
    canvas.drawString(x + 8, y - 4, "4x11")
    canvas.drawString(x + 8, y - 12, "275V")
    canvas.drawString(x + 8, y - 20, "45kA")


def desenhar_diagrama_unifilar(canvas, largura_pagina, altura_pagina, circuitos, resultados=None, nome_projeto="Projeto", quadros=None, disjuntor_geral=32, diferencial=40):
    """Desenha todos os quadros, cada um com o seu barramento e circuitos."""
    circuitos = list(circuitos or [])
    resultados = resultados or {}
    quadros = list(quadros or [])
    if not quadros:
        quadros = [{"id": None, "tipo": "quadro", "rotulo": "QGBT"}]
    grupos = { _valor(q, "id"): [] for q in quadros }
    sem_quadro = []
    for circuito in circuitos:
        qid = _valor(circuito, "quadro_id")
        if qid in grupos:
            grupos[qid].append(circuito)
        else:
            sem_quadro.append(circuito)
    if sem_quadro:
        grupos.setdefault(None, []).extend(sem_quadro)
        if not any(_valor(q, "id") is None for q in quadros):
            quadros.append({"id": None, "tipo": "quadro", "rotulo": "Sem quadro atribuído"})
    margem = 40
    # Permite ao exportador reservar uma coluna lateral para a tabela.
    largura_desenho = float(largura_pagina)
    if largura_desenho > 700:
        largura_desenho = min(largura_desenho, 650.0)
    canvas.saveState()
    canvas.rect(0, 0, largura_desenho, altura_pagina, stroke=0, fill=0)
    canvas.clipPath(canvas.beginPath(), stroke=0, fill=0) if False else None
    canvas.setStrokeColor(PRETO)
    canvas.setFillColor(PRETO)
    canvas.setLineWidth(0.8)

    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(margem, altura_pagina - margem, "DIAGRAMA UNIFILAR")
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(largura_desenho - margem, altura_pagina - margem, _cortar(nome_projeto, 180, tamanho=7))
    canvas.setFont("Helvetica", 7)
    canvas.drawString(margem, altura_pagina - margem - 14, "Alimentação: 3P+N+PE ~ 400V/230V 50Hz")

    x_caixa = margem + 38
    x_bus = x_caixa + 176
    y_top = altura_pagina - 78
    y_bottom = margem + 38
    altura_disponivel = y_top - y_bottom
    altura_por_quadro = min(360, max(150, altura_disponivel / max(len(quadros), 1)))

    # Cada quadro recebe a sua própria caixa e barramento; nenhum quadro do projeto é omitido.
    canvas.setFont("Helvetica", 8)
    for indice_quadro, quadro in enumerate(quadros):
        grupo = grupos.get(_valor(quadro, "id"), [])
        caixa_top = y_top - indice_quadro * altura_por_quadro
        caixa_bottom = max(y_bottom, caixa_top - altura_por_quadro + 24)
        barramento_top = caixa_top - 24
        barramento_bottom = caixa_bottom + 20
        nome_quadro = _nome_quadro(quadro) or (
            "QGBT" if _valor(quadro, "tipo") == "quadro" else "Quadro parcial"
        )
        canvas.drawString(x_caixa, caixa_top + 8, _cortar(nome_quadro, 130, tamanho=8))
        canvas.rect(x_caixa, caixa_bottom, x_bus - x_caixa + 42, caixa_top - caixa_bottom, stroke=1, fill=0)
        canvas.setLineWidth(1.1)
        canvas.line(x_bus, barramento_top, x_bus, barramento_bottom)

        if grupo:
            espacamento = min(38, max(20, (barramento_top - barramento_bottom - 8) / len(grupo)))
            for indice, circuito in enumerate(grupo):
                y = barramento_top - 14 - indice * espacamento
                if y < barramento_bottom + 8:
                    break
                resultado = resultados.get(_valor(circuito, "id"), {})
                if not isinstance(resultado, dict):
                    resultado = {}
                _desenhar_ramificacao(canvas, x_bus, y, circuito, resultado)
        else:
            canvas.setFont("Helvetica", 7)
            canvas.drawString(x_bus + 12, (barramento_top + barramento_bottom) / 2, "Sem circuitos")

    # A alimentação principal fica associada ao primeiro quadro, normalmente o QGBT.
    y_alimentacao = y_top - 154
    y_caixa_top = y_top + 20
    y_caixa_bottom = max(y_bottom, y_top - altura_por_quadro + 24)

    # O disjuntor geral deve proteger a soma das cargas a jusante.
    # Se o cálculo não fornecer um valor, mantém-se 32 A como valor nominal.
    maior_circuito = max(
        (_valor(resultados.get(_valor(c, "id"), {}), "disjuntor_recomendado_a", 0) or 0)
        for c in circuitos
    ) if circuitos else 0
    disjuntor_geral = max(float(disjuntor_geral or 0), float(maior_circuito or 0)) or 32

    # Alimentação principal à esquerda e disjuntor geral/DR.
    y_alimentacao = y_top - 154
    canvas.line(x_caixa - 42, y_alimentacao, x_caixa + 25, y_alimentacao)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(x_caixa - 41, y_alimentacao + 9, "3#6(6)")
    canvas.drawString(x_caixa + 25, y_alimentacao + 12, f"{_texto_numero(disjuntor_geral)} A")
    canvas.circle(x_caixa + 38, y_alimentacao, 10, stroke=1, fill=0)
    canvas.line(x_caixa + 30, y_alimentacao, x_caixa + 46, y_alimentacao)
    canvas.circle(x_caixa + 31, y_alimentacao - 10, 1.5, stroke=1, fill=0)
    canvas.circle(x_caixa + 45, y_alimentacao - 10, 1.5, stroke=1, fill=0)
    canvas.line(x_caixa + 48, y_alimentacao, x_caixa + 70, y_alimentacao)
    canvas.rect(x_caixa + 70, y_alimentacao - 10, 21, 20, stroke=1, fill=0)
    canvas.setFont("Helvetica", 6)
    canvas.drawCentredString(x_caixa + 80.5, y_alimentacao + 3, f"{_texto_numero(diferencial)} A")
    canvas.drawCentredString(x_caixa + 80.5, y_alimentacao - 5, "DR")
    canvas.line(x_caixa + 91, y_alimentacao, x_bus, y_alimentacao)
    _desenhar_dps(canvas, x_caixa + 64, y_alimentacao - 38)

    canvas.line(x_caixa + 91, y_alimentacao, x_bus, y_alimentacao)

    canvas.setFont("Helvetica", 6)
    canvas.setFillColor(CINZA)
    canvas.drawString(margem, margem + 10, "Esquema simplificado — valores aproximados; validar pelo técnico responsável.")
    canvas.drawRightString(largura_desenho - margem, margem + 10, "Electrilal")
    canvas.setFillColor(PRETO)
    canvas.restoreState()
