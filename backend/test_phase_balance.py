import math
from types import SimpleNamespace

from electrical.calculator import calculateCircuit
from routers.projects import balancear_por_fase, distribuir_potencia_por_fase


def test_current_formula_by_system_type():
    mono = calculateCircuit(209, 220, "lighting", cos_phi=0.95)
    bi = calculateCircuit(361, 380, "sockets", cos_phi=0.95)
    tri = calculateCircuit(380 * math.sqrt(3) * 0.95, 380 * math.sqrt(3), "specific", cos_phi=0.95)
    assert math.isclose(mono.nominalCurrent_A, 1.0, abs_tol=0.01)
    assert math.isclose(bi.nominalCurrent_A, 1.0, abs_tol=0.01)
    assert math.isclose(tri.nominalCurrent_A, 1.0, abs_tol=0.01)


def test_phase_power_distribution():
    assert distribuir_potencia_por_fase(900, SimpleNamespace(fase="monofasico", fases=["L2"])) == {"L2": 900}
    assert distribuir_potencia_por_fase(900, SimpleNamespace(fase="bifasico", fases=["L1", "L3"])) == {"L1": 450, "L3": 450}
    assert distribuir_potencia_por_fase(900, SimpleNamespace(fase="trifasico", fases=None)) == {"L1": 300, "L2": 300, "L3": 300}


def test_phase_balance_has_warning_over_fifteen_percent():
    quadro = SimpleNamespace(id=1, rotulo="QGBT")
    circuits = [
        SimpleNamespace(id=1, quadro_id=1, fase="monofasico", fases=["L1"]),
        SimpleNamespace(id=2, quadro_id=1, fase="monofasico", fases=["L2"]),
    ]
    result = balancear_por_fase(circuits, {1: {"potencia_total_w": 2200}, 2: {"potencia_total_w": 100}}, [quadro])
    assert result[0]["desequilibrio_pct"] > 15
    assert result[0]["nivel"] in {"warning", "danger"}
