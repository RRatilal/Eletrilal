import pytest

from pdf_exporter import _parse_scale, _resultado_para_circuito, _quadro_nome_tabela, _descricao_tabela
from pdf_utils import nome_legivel


def test_parse_scale_accepts_common_formats():
    assert _parse_scale("1:50") == 50
    assert _parse_scale(" 1:100 ") == 100
    assert _parse_scale("50") == 50


def test_parse_scale_rejects_invalid_values():
    with pytest.raises(ValueError):
        _parse_scale("1:abc")
    with pytest.raises(ValueError):
        _parse_scale("1:0")


def test_resultado_para_circuito_accepts_integer_id():
    circuito = {"id": 7}
    assert _resultado_para_circuito(circuito, {7: {"potencia_total_w": 100}})["potencia_total_w"] == 100


def test_nome_legivel_extrai_nome_do_json():
    assert nome_legivel('{"nome": "quadro", "rotulo": "quadro", "tipo_fase": "trifasico"}') == "quadro"


def test_nome_legivel_devolve_texto_simples():
    assert nome_legivel("QGBT") == "QGBT"


def test_nome_legivel_ignora_json_invalido():
    assert nome_legivel("{nome invalido") == ""


def test_quadro_nome_tabela_nao_vaza_json():
    circuito = {"quadro_nome": '{"nome": "quadro_parcial", "tipo_fase": "monofasico"}'}
    assert _quadro_nome_tabela(circuito) == "quadro_parcial"


def test_quadro_nome_tabela_fallback():
    assert _quadro_nome_tabela({}) == "—"


def test_descricao_tabela_usa_nome_do_circuito():
    circuito = {"nome": "ILUM2"}
    resultado = {"avisos": ["Power of 1050W exceeds the common limit."]}
    assert _descricao_tabela(circuito, resultado) == "ILUM2"


def test_descricao_tabela_marca_erro_real():
    circuito = {"nome": "TUG1"}
    resultado = {"erro": "Falha ao dimensionar."}
    assert _descricao_tabela(circuito, resultado) == "ERRO: Falha ao dimensionar."
