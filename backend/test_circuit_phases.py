from types import SimpleNamespace

from routers.projects import fases_por_tipo, tipo_por_fases


def test_combination_is_normalized_to_physical_phases():
    circuito = SimpleNamespace(fase="bifasico", fases=["L1-L2"])

    assert fases_por_tipo(circuito) == ["L1", "L2"]
    assert tipo_por_fases(circuito) == "bifasico"


def test_multiple_phase_values_remain_supported():
    circuito = SimpleNamespace(fase="trifasico", fases=["L1", "L2", "L3"])

    assert fases_por_tipo(circuito) == ["L1", "L2", "L3"]
    assert tipo_por_fases(circuito) == "trifasico"
