"""
Validações de regras elétricas básicas.

Assim como o calculator.py, os limiares aqui são aproximações genéricas.
Ajustar conforme a norma técnica que decidires seguir.
"""
from typing import List
from dataclasses import dataclass, field

MAX_POTENCIA_CIRCUITO_TOMADAS_W = 2200  # referência comum para circuitos de tomadas de uso geral
DISTANCIA_MIN_TOMADAS_M = 0.3  # distância mínima sugerida entre tomadas na mesma parede


@dataclass
class ValidacaoResultado:
    valido: bool
    erros: List[str] = field(default_factory=list)
    avisos: List[str] = field(default_factory=list)


def validar_potencia_circuito(potencia_total_w: float, tipo_circuito: str = "tomadas") -> ValidacaoResultado:
    """Verifica se a soma de potência do circuito excede o limite recomendado com tratamento de None."""
    resultado = ValidacaoResultado(valido=True)
    potencia_total_w = potencia_total_w or 0.0

    if tipo_circuito == "tomadas" and potencia_total_w > MAX_POTENCIA_CIRCUITO_TOMADAS_W:
        resultado.avisos.append(
            f"Potência do circuito ({potencia_total_w:.0f} W) excede o valor de referência "
            f"({MAX_POTENCIA_CIRCUITO_TOMADAS_W} W) para circuitos de tomadas de uso geral. "
            "Considere dividir em mais de um circuito."
        )

    return resultado


def validar_distancia_componentes(componentes: list) -> ValidacaoResultado:
    """
    Verifica se há componentes do mesmo tipo muito próximos entre si
    (possível sobreposição ou erro de posicionamento).
    componentes: lista de objetos/dicts com atributos x, y, tipo.
    Suporta tanto dicionários como instâncias ORM do SQLAlchemy.
    """
    resultado = ValidacaoResultado(valido=True)

    for i, comp_a in enumerate(componentes):
        for comp_b in componentes[i + 1:]:
            tipo_a = comp_a.get("tipo") if isinstance(comp_a, dict) else getattr(comp_a, "tipo", None)
            tipo_b = comp_b.get("tipo") if isinstance(comp_b, dict) else getattr(comp_b, "tipo", None)
            if tipo_a != tipo_b or tipo_a is None:
                continue

            xa = comp_a.get("x") if isinstance(comp_a, dict) else getattr(comp_a, "x", 0.0)
            ya = comp_a.get("y") if isinstance(comp_a, dict) else getattr(comp_a, "y", 0.0)
            xb = comp_b.get("x") if isinstance(comp_b, dict) else getattr(comp_b, "x", 0.0)
            yb = comp_b.get("y") if isinstance(comp_b, dict) else getattr(comp_b, "y", 0.0)

            dx = (xa or 0.0) - (xb or 0.0)
            dy = (ya or 0.0) - (yb or 0.0)
            distancia = (dx ** 2 + dy ** 2) ** 0.5
            if distancia < DISTANCIA_MIN_TOMADAS_M:
                rotulo_a = comp_a.get("rotulo") if isinstance(comp_a, dict) else getattr(comp_a, "rotulo", None)
                rotulo_b = comp_b.get("rotulo") if isinstance(comp_b, dict) else getattr(comp_b, "rotulo", None)
                resultado.avisos.append(
                    f"Componentes '{rotulo_a or tipo_a}' e "
                    f"'{rotulo_b or tipo_b}' estão muito próximos "
                    f"({distancia:.2f} m)."
                )

    return resultado


def validar_circuito_sem_componentes(circuito_id: int, componentes: list) -> ValidacaoResultado:
    """Verifica se um circuito foi criado mas não tem componentes associados (híbrido dict/objeto)."""
    resultado = ValidacaoResultado(valido=True)
    def get_circuit_id(c):
        return c.get("circuit_id") if isinstance(c, dict) else getattr(c, "circuit_id", None)
    ligados = [c for c in componentes if get_circuit_id(c) == circuito_id]
    if not ligados:
        resultado.avisos.append(f"Circuito {circuito_id} não tem nenhum componente associado.")
    return resultado
