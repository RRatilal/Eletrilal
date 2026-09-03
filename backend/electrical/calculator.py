"""
Advanced electrical sizing calculations based on IEC 60364 / NBR 5410.
"""
from dataclasses import dataclass
from typing import List, Literal


# ─── Constants ──────────────────────────────────────────────────────────────

# Copper conductivity at 70°C (m/(Ω·mm²))
COPPER_CONDUCTIVITY = 56.0

# Iz table (Método de Referência B1/B2 — RTIEBT, conduta embebida em alvenaria)
# Cobre, isolamento PVC (70°C), 3 condutores carregados, 30°C ambiente.
# Valores confirmados contra fonte técnica RTIEBT (não a tabela IEC/NBR genérica anterior).
# Format: (section_mm2, capacity_A)
TABLE_IZ_IEC = [
    (1.5, 15.5),
    (2.5, 21.0),
    (4.0, 28.0),
    (6.0, 36.0),
    (10.0, 50.0),
    (16.0, 68.0),
    (25.0, 89.0),
    (35.0, 110.0),
    (50.0, 134.0),
    (70.0, 171.0),
    (95.0, 207.0),
]

# IEC 60898 standard breaker ratings (A)
BREAKERS_IEC_60898 = [10, 16, 20, 25, 32, 40, 50, 63]

# Minimum normative sections (IEC 60364-5-52)
MIN_SECTION = {
    "lighting": 1.5,
    "sockets": 2.5,
    "specific": 2.5,  # NBR 5410 requires 2.5 mm² for general power circuits
}

# Fator de segurança recomendado pelo RTIEBT, aplicado à corrente de
# projeto (Ib) antes de escolher o disjuntor.
SAFETY_FACTOR_RTIEBT = 1.25


# ─── Supported types ────────────────────────────────────────────────────────

CircuitType = Literal["lighting", "sockets", "specific"]


@dataclass
class CircuitResult:
    """IEC 60364 circuit sizing result."""
    nominalCurrent_A: float
    breaker_A: float
    cableSection_mm2: float
    voltageDrop_percentage: float
    warnings: List[str]


# ─── Helper functions ───────────────────────────────────────────────────────

def get_grouping_factor(grouped_circuits: int) -> float:
    """Return the grouping correction factor (FCA) per NBR 5410."""
    if grouped_circuits is None or grouped_circuits <= 0:
        return 1.00
    table = {
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
    if grouped_circuits in table:
        return table[grouped_circuits]
    return 0.40  # >9 grouped circuits


def get_temperature_factor(temperature_C: float) -> float:
    """Return the temperature correction factor (FCT) for PVC (ref: 30°C)."""
    if temperature_C is None:
        temperature_C = 30.0
    if temperature_C <= 30:
        return 1.00
    elif temperature_C <= 35:
        return 0.94
    elif temperature_C <= 40:
        return 0.87
    elif temperature_C <= 45:
        return 0.79
    elif temperature_C <= 50:
        return 0.71
    return 0.50  # extreme temperature


def choose_breaker_iec(current_A: float) -> float:
    """Choose the nearest IEC 60898 breaker >= Ib."""
    for rating in BREAKERS_IEC_60898:
        if rating >= current_A:
            return float(rating)
    return float(BREAKERS_IEC_60898[-1])


def calculate_voltage_drop_pct(
    current_A: float,
    length_m: float,
    section_mm2: float,
    voltage_V: float,
    cos_phi: float = 0.95,
) -> float:
    """
    Calculate voltage drop percentage using the IEC formula:
        deltaV% = (2 * L * I * cosPhi) / (56 * S * V) * 100
    (Factor 2 accounts for go-and-return path in single-phase.)
    """
    if length_m <= 0 or section_mm2 <= 0 or voltage_V <= 0:
        return 0.0
    drop_V = (2.0 * length_m * current_A * cos_phi) / (COPPER_CONDUCTIVITY * section_mm2)
    return (drop_V / voltage_V) * 100.0


# ─── Main circuit sizing function (IEC 60364) ───────────────────────────────

def calculateCircuit(
    power_W: float,
    voltage_V: float,
    circuitType: CircuitType,
    length_m: float = 10.0,
    temperature_C: float = 30.0,
    grouping_factor: int = 1,
    cos_phi: float = 0.95,
    queda_tensao_max_pct: float = None,
) -> CircuitResult:
    """
    Size an electrical circuit per IEC 60364 / NBR 5410 / RTIEBT.

    Steps:
        A. Ib = P / V (design current)
        B. Minimum normative section by circuit type
        C. Choose commercial breaker >= Ib * SAFETY_FACTOR_RTIEBT (In)
        D. Cable capacity Iz (Method B1/B2 RTIEBT)
        E. Effective Iz = Iz × FCA × FCT > In
        F. Voltage drop: (2·L·I·cosφ) / (56·S) ≤ max_queda_pct or 3% (lighting) / 5% (other)
    """
    warnings: List[str] = []

    # ─── Step A: Design current (Ib) ───────────────────────────────────────
    # The caller passes the effective system voltage. For a three-phase
    # circuit the caller must pass sqrt(3) * 380 V.
    if power_W <= 0 or voltage_V <= 0:
        return CircuitResult(
            nominalCurrent_A=0.0,
            breaker_A=10.0,
            cableSection_mm2=MIN_SECTION.get(circuitType, 1.5),
            voltageDrop_percentage=0.0,
            warnings=["Invalid power or voltage. Check parameters."],
        )

    if cos_phi <= 0:
        raise ValueError("cos_phi must be greater than zero.")

    Ib = power_W / (voltage_V * cos_phi)

    # ─── Step B: Minimum normative section ─────────────────────────────────
    min_section = MIN_SECTION.get(circuitType, 1.5)

    # ─── Step C: Breaker (In) ──────────────────────────────────────────────
    In = choose_breaker_iec(Ib * SAFETY_FACTOR_RTIEBT)

    # Warn if the design current exceeds the largest available breaker (63 A)
    max_breaker = float(BREAKERS_IEC_60898[-1])
    if Ib > max_breaker:
        warnings.append(
            f"Design current {Ib:.1f}A exceeds the largest IEC 60898 breaker "
            f"({max_breaker:.0f}A). The selected {In:.0f}A breaker will be "
            "undersized. Consider splitting the circuit or using a higher-rated breaker."
        )

    # ─── Correction factors ────────────────────────────────────────────────
    FCA = get_grouping_factor(grouping_factor)
    FCT = get_temperature_factor(temperature_C)

    # ─── Steps D + E: Cable section selection ──────────────────────────────
    # Start at the minimum section and increase until:
    #   Iz * FCA * FCT > In
    chosen_section = min_section
    start_idx = 0

    for i, (section, _) in enumerate(TABLE_IZ_IEC):
        if abs(section - min_section) < 0.01:
            start_idx = i
            break

    section_found = False
    for i in range(start_idx, len(TABLE_IZ_IEC)):
        section, Iz = TABLE_IZ_IEC[i]
        Iz_effective = Iz * FCA * FCT
        if Iz_effective > In:
            chosen_section = section
            section_found = True
            break

    if not section_found:
        chosen_section = TABLE_IZ_IEC[-1][0]
        warnings.append(
            f"No available section satisfies Iz·FCA·FCT > {In}A. "
            f"Using maximum ({chosen_section} mm²). "
            "Consider reducing grouping or splitting the circuit."
        )

    # ─── Step F: Voltage drop ──────────────────────────────────────────────
    voltage_drop = calculate_voltage_drop_pct(
        current_A=Ib,
        length_m=length_m,
        section_mm2=chosen_section,
        voltage_V=voltage_V,
        cos_phi=cos_phi,
    )

    # RTIEBT: queda de tensão máxima admissível — usa o valor do circuito
    # (queda_tensao_max_pct) se fornecido, senão 3% iluminação / 5% outros.
    if queda_tensao_max_pct is not None and queda_tensao_max_pct > 0:
        max_voltage_drop_pct = queda_tensao_max_pct
    else:
        max_voltage_drop_pct = 3.0 if circuitType == "lighting" else 5.0

    while voltage_drop > max_voltage_drop_pct:
        current_idx = None
        for j, (section, _) in enumerate(TABLE_IZ_IEC):
            if abs(section - chosen_section) < 0.01:
                current_idx = j
                break
        if current_idx is not None and current_idx < len(TABLE_IZ_IEC) - 1:
            chosen_section = TABLE_IZ_IEC[current_idx + 1][0]
            voltage_drop = calculate_voltage_drop_pct(
                current_A=Ib,
                length_m=length_m,
                section_mm2=chosen_section,
                voltage_V=voltage_V,
                cos_phi=cos_phi,
            )
        else:
            warnings.append(
                f"Even with the largest section ({chosen_section} mm²), "
                f"voltage drop ({voltage_drop:.2f}%) exceeds {max_voltage_drop_pct}%. "
                "Consider moving the panel closer or splitting the circuit."
            )
            break

    # ─── Additional warnings ───────────────────────────────────────────────
    if grouping_factor > 2:
        warnings.append(
            f"{grouping_factor} grouped circuits reduce conductor "
            f"capacity (FCA = {FCA:.2f})."
        )

    if circuitType == "sockets" and power_W > 2200:
        warnings.append(
            f"Power of {power_W:.0f}W exceeds the common limit "
            "for general-purpose sockets (2200W). Consider splitting the circuit."
        )

    return CircuitResult(
        nominalCurrent_A=round(Ib, 2),
        breaker_A=In,
        cableSection_mm2=chosen_section,
        voltageDrop_percentage=round(voltage_drop, 2),
        warnings=warnings,
    )
