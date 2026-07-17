"""
Cálculos de dimensionamento elétrico avançados baseados na NBR 5410.
"""
from dataclasses import dataclass
from typing import List

TENSAO_MONOFASICA_V = 220
TENSAO_BIFASICA_V = 380
TENSAO_TRIFASICA_V = 380

FASE_TENSAO = {
    "monofasico": TENSAO_MONOFASICA_V,
    "bifasico": TENSAO_BIFASICA_V,
    "trifasico": TENSAO_TRIFASICA_V,
}

# Tabela simplificada de capacidade de condução de corrente (A) -> bitola do cabo (mm²)
# Referência: NBR 5410, Tabela 36, Método B1 (condutores carregados em eletroduto embutido em parede), cabos de cobre com isolação em PVC (70°C).
# Usando valor para 2 condutores carregados (monofásico/bifásico) ou 3 condutores (trifásico).
TABELA_BITOLA_2_COND = [
    (17.5, 1.5),
    (24.0, 2.5),
    (32.0, 4.0),
    (41.0, 6.0),
    (57.0, 10.0),
    (76.0, 16.0),
    (101.0, 25.0),
    (125.0, 35.0),
]

TABELA_BITOLA_3_COND = [
    (15.5, 1.5),
    (21.0, 2.5),
    (28.0, 4.0),
    (36.0, 6.0),
    (50.0, 10.0),
    (68.0, 16.0),
    (89.0, 25.0),
    (110.0, 35.0),
]

# Disjuntores comerciais padrão (A)
DISJUNTORES_PADRAO = [10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100]

# Resistividade do cobre a 70°C (em ohm * mm² / m)
RESISTIVIDADE_COBRE_OHM_MM2_M = 0.023

@dataclass
class ResultadoDimensionamento:
    potencia_total_w: float
    corrente_a: float
    corrente_corrigida_a: float
    disjuntor_recomendado_a: float
    cabo_recomendado_mm2: float
    queda_tensao_pct: float
    fase: str
    fca: float
    fct: float
    comprimento_m: float
    avisos: List[str]

def obter_fca(circuitos_agrupados: int) -> float:
    """Retorna o Fator de Correção de Agrupamento (FCA) da NBR 5410."""
    if circuitos_agrupados is None or circuitos_agrupados <= 0:
        return 1.00
    tabela = {
        1: 1.00,
        2: 0.80,
        3: 0.70,
        4: 0.65,
        5: 0.60,
        6: 0.60,
        7: 0.50,
        8: 0.50,
        9: 0.50,
    }
    if circuitos_agrupados in tabela:
        return tabela[circuitos_agrupados]
    return 0.40  # acima de 9 circuitos agrupados

def obter_fct(temperatura_c: float) -> float:
    """Retorna o Fator de Correção de Temperatura (FCT) para PVC (ref: 30°C)."""
    if temperatura_c is None:
        temperatura_c = 30.0
    if temperatura_c <= 30:
        return 1.00
    elif temperatura_c <= 35:
        return 0.94
    elif temperatura_c <= 40:
        return 0.87
    elif temperatura_c <= 45:
        return 0.79
    elif temperatura_c <= 50:
        return 0.71
    return 0.50  # temperatura extrema

def calcular_corrente(potencia_total_w: float, fase: str = "monofasico", fator_potencia: float = 0.92) -> float:
    """Calcula a corrente nominal de projeto (A)."""
    potencia_total_w = potencia_total_w or 0.0
    fator_potencia = max(0.01, min(1.0, fator_potencia or 0.92))
    tensao = FASE_TENSAO.get(fase, TENSAO_MONOFASICA_V)
    if tensao <= 0:
        tensao = TENSAO_MONOFASICA_V
    if fase == "trifasico":
        return potencia_total_w / (1.732 * tensao * fator_potencia)
    return potencia_total_w / (tensao * fator_potencia)

def escolher_disjuntor(corrente_a: float) -> float:
    """Escolhe o disjuntor comercial imediatamente superior."""
    for amperagem in DISJUNTORES_PADRAO:
        if amperagem >= corrente_a:
            return float(amperagem)
    return float(DISJUNTORES_PADRAO[-1])

def escolher_bitola_capacidade(corrente_corrigida_a: float, fase: str) -> float:
    """Escolhe a bitola do cabo pela capacidade de condução de corrente."""
    tabela = TABELA_BITOLA_3_COND if fase == "trifasico" else TABELA_BITOLA_2_COND
    for limite_a, bitola in tabela:
        if corrente_corrigida_a <= limite_a:
            return bitola
    return tabela[-1][1]

def calcular_queda_tensao_pct(
    corrente_a: float,
    comprimento_m: float,
    bitola_mm2: float,
    fase: str = "monofasico",
    fator_potencia: float = 0.92
) -> float:
    """Calcula a percentagem de queda de tensão com verificação de zero."""
    if comprimento_m <= 0 or bitola_mm2 <= 0:
        return 0.0
    
    tensao = FASE_TENSAO.get(fase, TENSAO_MONOFASICA_V)
    if tensao <= 0:
        tensao = TENSAO_MONOFASICA_V
    fator_potencia = max(0.01, min(1.0, fator_potencia or 0.92))
    fator_fase = 1.732 if fase == "trifasico" else 2.0
    queda_v = (fator_fase * RESISTIVIDADE_COBRE_OHM_MM2_M * comprimento_m * corrente_a * fator_potencia) / bitola_mm2
    
    return (queda_v / tensao) * 100.0

def dimensionar_circuito(
    potencia_total_w: float,
    fase: str = "monofasico",
    comprimento_m: float = 10.0,
    circuitos_agrupados: int = 1,
    temperatura_c: float = 30.0,
    queda_tensao_max_pct: float = 4.0,
    fator_potencia: float = 0.92,
) -> ResultadoDimensionamento:
    """
    Dimensionamento completo do circuito considerando capacidade de corrente, agrupamento e queda de tensão.
    """
    avisos = []
    if potencia_total_w <= 0:
        return ResultadoDimensionamento(
            potencia_total_w=0.0,
            corrente_a=0.0,
            corrente_corrigida_a=0.0,
            disjuntor_recomendado_a=10.0,
            cabo_recomendado_mm2=1.5,
            queda_tensao_pct=0.0,
            fase=fase,
            fca=1.0,
            fct=1.0,
            comprimento_m=comprimento_m,
            avisos=["Circuito sem potência ativa cadastrada."],
        )

    # 1. Corrente nominal de projeto
    corrente = calcular_corrente(potencia_total_w, fase, fator_potencia)

    # 2. Fatores de correção
    fca = obter_fca(circuitos_agrupados)
    fct = obter_fct(temperatura_c)
    
    # Corrente de projeto corrigida
    corrente_corrigida = corrente / (fca * fct)

    # 3. Disjuntor
    disjuntor = escolher_disjuntor(corrente)

    # 4. Escolha do cabo por condução de corrente
    bitola = escolher_bitola_capacidade(corrente_corrigida, fase)

    # 5. Validação de queda de tensão (Critério do limite percentual)
    queda_tensao = calcular_queda_tensao_pct(corrente, comprimento_m, bitola, fase, fator_potencia)
    
    # Se a queda de tensão for maior que o limite admissível, aumentamos a bitola do cabo de forma iterativa
    tabela = TABELA_BITOLA_3_COND if fase == "trifasico" else TABELA_BITOLA_2_COND
    tentativa_bitola = bitola
    
    while queda_tensao > queda_tensao_max_pct:
        # Encontra a próxima bitola disponível
        indice_atual = next((i for i, (_, b) in enumerate(tabela) if b == tentativa_bitola), None)
        if indice_atual is not None and indice_atual < len(tabela) - 1:
            tentativa_bitola = tabela[indice_atual + 1][1]
            queda_tensao = calcular_queda_tensao_pct(corrente, comprimento_m, tentativa_bitola, fase, fator_potencia)
        else:
            avisos.append(
                f"Mesmo com a maior bitola disponível ({tentativa_bitola} mm²), a queda de tensão ({queda_tensao:.2f}%) "
                f"excede o limite de {queda_tensao_max_pct}%. Considere redividir o circuito ou mudar o ponto do quadro."
            )
            break
            
    bitola = tentativa_bitola

    # Adicionar avisos automáticos relevantes
    if circuitos_agrupados > 2:
        avisos.append(f"Agrupamento de {circuitos_agrupados} circuitos reduz a capacidade dos condutores (FCA = {fca:.2f}).")
    if queda_tensao > 3.0:
        # Se alterou de bitola_original para maior bitola por conta de queda de tensão:
        bitola_original = escolher_bitola_capacidade(corrente_corrigida, fase)
        if bitola > bitola_original:
            avisos.append(f"Cabo redimensionado de {bitola_original} mm² para {bitola} mm² devido à queda de tensão ({queda_tensao:.2f}%).")

    return ResultadoDimensionamento(
        potencia_total_w=potencia_total_w,
        corrente_a=round(corrente, 2),
        corrente_corrigida_a=round(corrente_corrigida, 2),
        disjuntor_recomendado_a=disjuntor,
        cabo_recomendado_mm2=bitola,
        queda_tensao_pct=round(queda_tensao, 2),
        fase=fase,
        fca=fca,
        fct=fct,
        comprimento_m=round(comprimento_m, 2),
        avisos=avisos,
    )
