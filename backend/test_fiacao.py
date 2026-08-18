"""Teste ad-hoc do lançamento automático de fiação (SQLite em memória)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from database import Base
from routers.projects import obter_fiacao_eletrodutos

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
Session = sessionmaker(bind=engine)
db = Session()

proj = models.Project(nome="Teste Fiação")
db.add(proj)
db.flush()

# QGBT (0,0) -> A (3,0) -> B (6,0) -> C (9,0)  |  A -> D (3,-4)
q = models.Component(project_id=proj.id, tipo="quadro", x=0, y=0, potencia_w=0, rotulo="QGBT")
a = models.Component(project_id=proj.id, tipo="caixa_passagem", x=3, y=0, potencia_w=0)
b = models.Component(project_id=proj.id, tipo="lampada_simples", x=6, y=0, potencia_w=60)
c = models.Component(project_id=proj.id, tipo="lampada_simples", x=9, y=0, potencia_w=60)
d = models.Component(project_id=proj.id, tipo="tomada_dupla", x=3, y=-4, potencia_w=200)
db.add_all([q, a, b, c, d])
db.flush()

circ1 = models.Circuit(project_id=proj.id, nome="Iluminação", numero=5, cabo_bitola_mm2=1.5, quadro_id=q.id)
circ2 = models.Circuit(project_id=proj.id, nome="Tomadas", numero=9, cabo_bitola_mm2=2.5, quadro_id=q.id)
db.add_all([circ1, circ2])
db.flush()
a.circuit_id = circ1.id
b.circuit_id = circ1.id
c.circuit_id = circ1.id
d.circuit_id = circ2.id

con_q_a = models.Connection(project_id=proj.id, origem_id=q.id, destino_id=a.id, circuitos_bloqueados="[]")
con_a_b = models.Connection(project_id=proj.id, origem_id=a.id, destino_id=b.id, circuitos_bloqueados="[]")
con_b_c = models.Connection(project_id=proj.id, origem_id=b.id, destino_id=c.id, circuitos_bloqueados="[]")
con_a_d = models.Connection(project_id=proj.id, origem_id=a.id, destino_id=d.id, circuitos_bloqueados="[]")
db.add_all([con_q_a, con_a_b, con_b_c, con_a_d])
db.commit()

resultado = obter_fiacao_eletrodutos(proj.id, db)
eletro = {e["connection_id"]: e for e in resultado["eletrodutos"]}

assert len(eletro[con_q_a.id]["circuitos"]) == 2, "Q->A devia ter 2 circuitos (1 e 2)"
assert len(eletro[con_a_b.id]["circuitos"]) == 1, "A->B devia ter 1 circuito (1)"
assert len(eletro[con_b_c.id]["circuitos"]) == 1, "B->C devia ter 1 circuito (1)"
assert len(eletro[con_a_d.id]["circuitos"]) == 1, "A->D devia ter 1 circuito (2)"
assert eletro[con_b_c.id]["circuitos"][0]["numero"] == 5, "numero errado no circuito 1"
assert eletro[con_b_c.id]["circuitos"][0]["fase"] == "monofasico", "fase errada no circuito 1"
assert eletro[con_b_c.id]["circuitos"][0]["bitola_mm2"] == 1.5, "bitola errada no circuito 1"
assert eletro[con_a_d.id]["circuitos"][0]["numero"] == 9, "numero errado no circuito 2"
assert eletro[con_q_a.id]["tem_terra"] is True
assert eletro[con_b_c.id]["tem_terra"] is True

# Circuito novo, nunca dimensionado: bitola None sem erro
circ3 = models.Circuit(project_id=proj.id, nome="Sem Bitola", numero=2)
db.add(circ3)
db.flush()
e = models.Component(project_id=proj.id, tipo="tomada_baixa", x=1, y=3, potencia_w=100, circuit_id=circ3.id)
db.add(e)
db.flush()
con_q_e = models.Connection(project_id=proj.id, origem_id=q.id, destino_id=e.id, circuitos_bloqueados="[]")
db.add(con_q_e)
db.commit()

resultado2 = obter_fiacao_eletrodutos(proj.id, db)
eletro2 = {x["connection_id"]: x for x in resultado2["eletrodutos"]}
sem_bitola = [c for c in eletro2[con_q_e.id]["circuitos"] if c["circuit_id"] == circ3.id][0]
assert sem_bitola["bitola_mm2"] is None, "circuito sem dimensionar devia devolver bitola None"

# Bloqueio: impedir o circuito 2 (nome "Tomadas") de passar por Q-A
con_q_a.circuitos_bloqueados = '["Tomadas"]'
db.commit()
resultado3 = obter_fiacao_eletrodutos(proj.id, db)
eletro3 = {x["connection_id"]: x for x in resultado3["eletrodutos"]}
assert not any(c["circuit_id"] == circ2.id for c in eletro3[con_q_a.id]["circuitos"]), "circuito 2 bloqueado não devia aparecer em Q-A"
assert any(c["circuit_id"] == circ1.id for c in eletro3[con_q_a.id]["circuitos"]), "circuito 1 devia continuar em Q-A"

print("TODOS OS TESTES PASSARAM")