"""
Endpoints de CRUD: projetos, componentes, circuitos e conexões.
"""
import json
import math
import heapq
import threading
import logging
from typing import List, Union
from pydantic import BaseModel
import os
import time
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session, selectinload

import models
import schemas
from database import get_db, SessionLocal
from electrical import calculator, validator

# Shapely para geolocalização de componentes dentro de divisões
from shapely.geometry import Point, shape


# ─── Constantes para Divisão Automática de Circuitos ────────────────────────
LIMIAR_CARGA_EXCLUSIVA_W = 2200    # ~10A @ 220V — cargas acima viram TUE
LIMIAR_BIFASICO_SUGERIDO_W = 5000  # cargas muito altas sugerem bifásico
PALAVRAS_AREA_MOLHADA = ["cozinha", "w.c", "wc", "lavab", "lavandaria", "varanda", "banho"]


def _area_da_divisao(nome_divisao: str) -> str:
    """Classifica uma divisão como 'molhada' ou 'seca' pelo nome (regra 3)."""
    nome_lower = (nome_divisao or "").lower()
    if any(p in nome_lower for p in PALAVRAS_AREA_MOLHADA):
        return "molhada"
    return "seca"


def _encontrar_room_do_componente(comp, rooms_shapely):
    """Devolve o nome da Room que contém o ponto (x,y) do componente, ou None."""
    ponto = Point(comp.x or 0.0, comp.y or 0.0)
    for nome, poligono in rooms_shapely:
        if poligono.contains(ponto):
            return nome
    return None


def _distribuir_em_circuitos(componentes: list, potencia_max_por_circuito: float) -> list:
    """
    Agrupa uma lista de componentes em circuitos, respeitando um teto de
    potência por circuito (bin-packing guloso, simples e previsível).
    """
    grupos = []
    grupo_atual = []
    potencia_atual = 0.0

    for comp in sorted(componentes, key=lambda c: -(c.potencia_w or 0.0)):
        p = comp.potencia_w or 0.0
        if grupo_atual and (potencia_atual + p) > potencia_max_por_circuito:
            grupos.append(grupo_atual)
            grupo_atual = []
            potencia_atual = 0.0
        grupo_atual.append(comp)
        potencia_atual += p

    if grupo_atual:
        grupos.append(grupo_atual)
    return grupos


# ─── Dimensioning Cache (simple LRU) ──────────────────────────────────────
_DIM_CACHE: dict = {}
_DIM_CACHE_MAX = 20
_DIM_CACHE_TTL_S = 300  # 5 minutes
_DIM_CACHE_LOCK = threading.Lock()

def _get_cached_dim(circuit_id: int):
    """Return cached result or None."""
    with _DIM_CACHE_LOCK:
        entry = _DIM_CACHE.get(circuit_id)
        if entry and (time.time() - entry["ts"]) < _DIM_CACHE_TTL_S:
            return entry["result"]
        return None

def _set_cached_dim(circuit_id: int, result: dict):
    with _DIM_CACHE_LOCK:
        _DIM_CACHE[circuit_id] = {"result": result, "ts": time.time()}
        if len(_DIM_CACHE) > _DIM_CACHE_MAX:
            oldest = min(_DIM_CACHE.keys(), key=lambda k: _DIM_CACHE[k]["ts"])
            del _DIM_CACHE[oldest]


def _dimensioning_background(circuit_id: int, db_session_factory):
    """
    Background task to pre-compute and cache dimensioning for large projects.
    """
    logger = logging.getLogger("uvicorn.error")
    db = db_session_factory()
    try:
        circuito = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
        if not circuito:
            return
        resultado = _compute_dimensioning(circuito, db)
        _set_cached_dim(circuit_id, resultado)
    except Exception as e:
        logger.error(f"Erro no dimensionamento em background para circuito {circuit_id}: {str(e)}")
    finally:
        db.close()


def _compute_dimensioning(circuito, db, persistir=True):
    """
    Central dimensioning logic — uses IEC 60364 calculateCircuit.
    Returns a dict compatible with the /circuits/{id}/dimensionamento endpoint.
    """
    # Load circuit components directly (avoid N+1 by batching at call site where possible)
    componentes = db.query(models.Component).filter(
        models.Component.circuit_id == circuito.id
    ).all()
    potencia_total = sum((c.potencia_w or 0.0) for c in componentes)

    comprimento_m = calcular_comprimento_max_circuito(
        circuito.project_id, circuito.id, db
    )
    agrupados = calcular_circuitos_agrupados(
        circuito.project_id, circuito.id, db
    )

    temp = getattr(circuito, 'temperatura_c', None)
    temperatura = temp if temp is not None else 30.0

    fase = (circuito.fase or "monofasico").lower()
    voltage_V = 380 if fase in ("bifasico", "trifasico") else 220

    circuitType = _detect_circuit_type(componentes)

    # Usar queda de tensão máxima personalizada do circuito, se definida
    queda_max = getattr(circuito, 'queda_tensao_max_pct', None)

    resultado = calculator.calculateCircuit(
        power_W=potencia_total,
        voltage_V=voltage_V,
        circuitType=circuitType,
        length_m=comprimento_m,
        temperature_C=temperatura,
        grouping_factor=agrupados,
        queda_tensao_max_pct=queda_max if queda_max and queda_max > 0 else None,
    )

    if persistir:
        circuito.disjuntor_amperagem = resultado.breaker_A
        circuito.cabo_bitola_mm2 = resultado.cableSection_mm2
        db.commit()

    validacao = validator.validar_potencia_circuito(potencia_total)

    fca_val = calculator.get_grouping_factor(agrupados)
    fct_val = calculator.get_temperature_factor(temperatura)

    dimensionamento = {
        "potencia_total_w": round(potencia_total, 2),
        "corrente_a": resultado.nominalCurrent_A,
        "corrente_corrigida_a": resultado.nominalCurrent_A,
        "disjuntor_recomendado_a": resultado.breaker_A,
        "cabo_recomendado_mm2": resultado.cableSection_mm2,
        "queda_tensao_pct": resultado.voltageDrop_percentage,
        "fase": fase,
        "fca": fca_val,
        "fct": fct_val,
        "comprimento_m": round(comprimento_m, 2),
        "avisos": resultado.warnings,
    }

    todos_avisos = list(set(validacao.avisos + resultado.warnings))

    return {
        "circuito_id": circuito.id,
        "dimensionamento": dimensionamento,
        "avisos_validacao": todos_avisos,
    }


def _compute_dimensioning_readonly(circuito, db):
    """Calcula um circuito para relatórios sem alterar nem confirmar a BD."""
    return _compute_dimensioning(circuito, db, persistir=False)


def _detect_circuit_type(componentes):
    """Detect IEC circuit type from component names."""
    for comp in componentes:
        tipo = (comp.tipo or "").lower()
        if any(x in tipo for x in ["lampada", "spot", "arandela", "tubular", "led", "pendente"]):
            return "lighting"
        elif any(x in tipo for x in ["tomada", "tug"]):
            return "sockets"
    return "specific"

router = APIRouter(tags=["projects"])


# ---------- Projects ----------
@router.post("/projects", response_model=schemas.ProjectOut)
def criar_projeto(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    projeto = models.Project(nome=payload.nome)
    db.add(projeto)
    db.commit()
    db.refresh(projeto)
    return projeto


@router.get("/projects", response_model=List[schemas.ProjectOut])
def listar_projetos(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.atualizado_em.desc()).all()


@router.get("/projects/{project_id}", response_model=schemas.ProjectOut)
def obter_projeto(project_id: int, db: Session = Depends(get_db)):
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return projeto


@router.get("/projects/{project_id}/geometry")
def obter_geometria(project_id: int, db: Session = Depends(get_db)):
    """
    Retorna a geometria DXF do projeto re-processada a partir do ficheiro original.
    Isto permite que a planta persista mesmo após limpar o autosave/browser.
    """
    from dxf_parser import extrair_geometria, DXFParseError

    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    if not projeto.dxf_original_path:
        raise HTTPException(status_code=404, detail="Este projeto não tem ficheiro DXF associado.")

    if not os.path.exists(projeto.dxf_original_path):
        raise HTTPException(status_code=404, detail="O ficheiro DXF original já não existe em disco.")

    try:
        geometria = extrair_geometria(projeto.dxf_original_path)
    except DXFParseError as e:
        raise HTTPException(status_code=422, detail=f"Erro ao re-processar o DXF: {str(e)}")

    return {
        "project_id": project_id,
        "geometria": geometria,
    }


@router.delete("/projects/{project_id}")
def apagar_projeto(project_id: int, db: Session = Depends(get_db)):
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    # Apaga o arquivo DXF associado para evitar fugas de armazenamento
    if projeto.dxf_original_path and os.path.exists(projeto.dxf_original_path):
        try:
            os.remove(projeto.dxf_original_path)
        except Exception:
            pass  # Prossegue se o ficheiro já não existir ou estiver bloqueado

    db.delete(projeto)
    db.commit()
    return {"ok": True}


# ---------- Rooms (divisões) ----------
@router.get("/projects/{project_id}/rooms", response_model=List[schemas.RoomOut])
def listar_rooms(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.Room).filter(models.Room.project_id == project_id).all()


@router.post("/projects/{project_id}/rooms", response_model=schemas.RoomOut)
def criar_room(project_id: int, payload: schemas.RoomCreate, db: Session = Depends(get_db)):
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    room = models.Room(project_id=project_id, **payload.model_dump())
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.patch("/rooms/{room_id}", response_model=schemas.RoomOut)
def atualizar_room(room_id: int, payload: schemas.RoomUpdate, db: Session = Depends(get_db)):
    room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Divisão não encontrada.")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(room, campo, valor)
    db.commit()
    db.refresh(room)
    return room


@router.delete("/rooms/{room_id}")
def apagar_room(room_id: int, db: Session = Depends(get_db)):
    room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Divisão não encontrada.")
    db.delete(room)
    db.commit()
    return {"ok": True}


# ---------- Circuits ----------
@router.post("/projects/{project_id}/circuits", response_model=schemas.CircuitOut)
def criar_circuito(project_id: int, payload: schemas.CircuitCreate, db: Session = Depends(get_db)):
    circuito = models.Circuit(project_id=project_id, **payload.model_dump())
    db.add(circuito)
    db.commit()
    db.refresh(circuito)
    return circuito


@router.get("/projects/{project_id}/circuits", response_model=List[schemas.CircuitOut])
def listar_circuitos(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.Circuit).filter(models.Circuit.project_id == project_id).all()


@router.patch("/circuits/{circuit_id}", response_model=schemas.CircuitOut)
def atualizar_circuito(circuit_id: int, payload: schemas.CircuitUpdate, db: Session = Depends(get_db)):
    circuito = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
    if not circuito:
        raise HTTPException(status_code=404, detail="Circuito não encontrado.")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(circuito, campo, valor)
    db.commit()
    db.refresh(circuito)
    return circuito



def calcular_comprimento_max_circuito(
    project_id: int, circuit_id: int, db: Session,
    todos_componentes: list = None, conexoes: list = None
) -> float:
    """Calcula o comprimento máximo de fiação do QDF até qualquer componente do circuito usando o grafo de conexões."""

    # 1. Encontra todos os componentes do projeto
    if todos_componentes is None:
        todos_componentes = db.query(models.Component).filter(models.Component.project_id == project_id).all()
    comp_map = {c.id: c for c in todos_componentes}
    
    # Encontra todos os quadros do projeto (tipo == "quadro" ou "quadro_parcial")
    quadros = [c for c in todos_componentes if c.tipo in ("quadro", "quadro_parcial")]
    if not quadros:
        return 15.0  # Sem quadro: usa comprimento padrão de 15m
        
    # 2. Carrega todas as conexões do projeto
    if conexoes is None:
        conexoes = db.query(models.Connection).filter(models.Connection.project_id == project_id).all()
    
    circ = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
    circ_nome = circ.nome if circ else ""
    circ_id_str = str(circuit_id)

    # Constrói o grafo: adj[n] = [(vizinho, peso_distancia)]
    adj = {c.id: [] for c in todos_componentes}
    for conn in conexoes:
        if conn.origem_id in comp_map and conn.destino_id in comp_map:
            # Verificar se este conduto bloqueia a passagem deste circuito
            bloqueados = []
            if conn.circuitos_bloqueados:
                try:
                    bloqueados = json.loads(conn.circuitos_bloqueados)
                except Exception:
                    bloqueados = []
            if circ_id_str in bloqueados or (circ_nome and circ_nome in bloqueados):
                continue

            c1 = comp_map[conn.origem_id]
            c2 = comp_map[conn.destino_id]
            x1, y1 = c1.x or 0.0, c1.y or 0.0
            x2, y2 = c2.x or 0.0, c2.y or 0.0
            dist = math.sqrt((x1 - x2)**2 + (y1 - y2)**2)
            adj[conn.origem_id].append((conn.destino_id, dist))
            adj[conn.destino_id].append((conn.origem_id, dist))
            
    # 3. Dijkstra multi-origem a partir de todos os quadros detetados
    distancias = {c.id: float('inf') for c in todos_componentes}
    queue = []
    for q in quadros:
        distancias[q.id] = 0.0
        heapq.heappush(queue, (0.0, q.id))
    
    while queue:
        dist_atual, u = heapq.heappop(queue)
        if dist_atual > distancias[u]:
            continue
        for v, peso in adj.get(u, []):
            nova_dist = dist_atual + peso
            if nova_dist < distancias[v]:
                distancias[v] = nova_dist
                heapq.heappush(queue, (nova_dist, v))
                
    # 4. A maior distância calculada (Dijkstra ou Euclidiana de fallback)
    comps_do_circuito = [c for c in todos_componentes if c.circuit_id == circuit_id]
    if not comps_do_circuito:
        return 10.0
        
    max_dist = 0.0
    for comp in comps_do_circuito:
        d = distancias[comp.id]
        if d == float('inf'):
            # Fallback: calcula distância euclidiana ao quadro mais próximo
            min_eucl = float('inf')
            for q in quadros:
                qx, qy = q.x or 0.0, q.y or 0.0
                cx, cy = comp.x or 0.0, comp.y or 0.0
                dist_dir = math.sqrt((cx - qx)**2 + (cy - qy)**2)
                if dist_dir < min_eucl:
                    min_eucl = dist_dir
            d = min_eucl if min_eucl != float('inf') else 15.0
            
        if d > max_dist:
            max_dist = d
            
    # Limiar físico mínimo (não ter cabos virtuais de 0 metros na parede)
    return max(max_dist, 2.0)


def calcular_caminho_circuito(project_id: int, circuit_id: int, db: Session) -> set:
    """
    Devolve o conjunto de connection_id que fazem parte do caminho mais curto
    (Dijkstra) do(s) quadro(s) até QUALQUER componente deste circuito.
    Reaproveita a mesma lógica de grafo/bloqueio de calcular_comprimento_max_circuito.
    """
    todos_componentes = db.query(models.Component).filter(models.Component.project_id == project_id).all()
    comp_map = {c.id: c for c in todos_componentes}

    quadros = [c for c in todos_componentes if c.tipo in ("quadro", "quadro_parcial")]
    if not quadros:
        return set()

    conexoes = db.query(models.Connection).filter(models.Connection.project_id == project_id).all()

    circ = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
    circ_nome = circ.nome if circ else ""
    circ_id_str = str(circuit_id)

    # adj[n] = [(vizinho, peso, connection_id)]
    adj = {c.id: [] for c in todos_componentes}
    for conn in conexoes:
        if conn.origem_id in comp_map and conn.destino_id in comp_map:
            bloqueados = []
            if conn.circuitos_bloqueados:
                try:
                    bloqueados = json.loads(conn.circuitos_bloqueados)
                except Exception:
                    bloqueados = []
            if circ_id_str in bloqueados or (circ_nome and circ_nome in bloqueados):
                continue

            c1 = comp_map[conn.origem_id]
            c2 = comp_map[conn.destino_id]
            x1, y1 = c1.x or 0.0, c1.y or 0.0
            x2, y2 = c2.x or 0.0, c2.y or 0.0
            dist = math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
            adj[conn.origem_id].append((conn.destino_id, dist, conn.id))
            adj[conn.destino_id].append((conn.origem_id, dist, conn.id))

    # Dijkstra multi-origem a partir de todos os quadros, guardando os
    # predecessores para reconstruir o caminho (não só a distância).
    distancias = {c.id: float('inf') for c in todos_componentes}
    predecessor_edge = {c.id: None for c in todos_componentes}  # comp_id -> connection_id usado para chegar
    predecessor_node = {c.id: None for c in todos_componentes}  # comp_id -> nó anterior no caminho
    queue = []
    for q in quadros:
        distancias[q.id] = 0.0
        heapq.heappush(queue, (0.0, q.id))

    while queue:
        dist_atual, u = heapq.heappop(queue)
        if dist_atual > distancias[u]:
            continue
        for v, peso, conn_id in adj.get(u, []):
            nova_dist = dist_atual + peso
            if nova_dist < distancias[v]:
                distancias[v] = nova_dist
                predecessor_node[v] = u
                predecessor_edge[v] = conn_id
                heapq.heappush(queue, (nova_dist, v))

    comps_do_circuito = [c for c in todos_componentes if c.circuit_id == circuit_id]

    connection_ids_usados = set()
    for comp in comps_do_circuito:
        atual = comp.id
        visitados_seguranca = 0
        while predecessor_edge.get(atual) is not None and visitados_seguranca < len(todos_componentes):
            connection_ids_usados.add(predecessor_edge[atual])
            atual = predecessor_node[atual]
            visitados_seguranca += 1

    return connection_ids_usados


@router.get("/projects/{project_id}/eletrodutos/fiacao")
def obter_fiacao_eletrodutos(project_id: int, db: Session = Depends(get_db)):
    """
    Para cada conduto (Connection) do projeto, devolve a lista de circuitos
    cujo caminho mais curto até ao quadro passa por esse troço — pronto para
    desenhar a notação de chicote de condutores (traço por fio, numerado,
    com secção em baixo, e um traço extra 'T' de terra).
    """
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    circuitos = db.query(models.Circuit).filter(models.Circuit.project_id == project_id).all()
    conexoes = db.query(models.Connection).filter(models.Connection.project_id == project_id).all()

    # connection_id -> lista de circuitos que passam por ali
    fiacao_por_conexao = {conn.id: [] for conn in conexoes}

    for circuito in circuitos:
        connection_ids = calcular_caminho_circuito(project_id, circuito.id, db)
        for conn_id in connection_ids:
            if conn_id in fiacao_por_conexao:
                fiacao_por_conexao[conn_id].append({
                    "circuit_id": circuito.id,
                    "numero": circuito.numero,
                    "nome": circuito.nome,
                    "fase": circuito.fase,
                    "bitola_mm2": circuito.cabo_bitola_mm2,
                })

    resultado = []
    for conn in conexoes:
        circuitos_no_troco = fiacao_por_conexao.get(conn.id, [])
        resultado.append({
            "connection_id": conn.id,
            "origem_id": conn.origem_id,
            "destino_id": conn.destino_id,
            "circuitos": circuitos_no_troco,
            "tem_terra": len(circuitos_no_troco) > 0,
        })

    return {"project_id": project_id, "eletrodutos": resultado}


def calcular_circuitos_agrupados(
    project_id: int, circuit_id: int, db: Session,
    todos_componentes: list = None, conexoes: list = None
) -> int:
    """Retorna o número máximo de circuitos diferentes que partilham conexões com este circuito."""
    if todos_componentes is None:
        todos_componentes = db.query(models.Component).filter(models.Component.project_id == project_id).all()
    comp_to_circuit = {c.id: c.circuit_id for c in todos_componentes if c.circuit_id is not None}
    
    comp_ids_circuito = {c.id for c in todos_componentes if c.circuit_id == circuit_id}
    if not comp_ids_circuito:
        return 1
        
    if conexoes is None:
        conexoes = db.query(models.Connection).filter(models.Connection.project_id == project_id).all()
    
    circuitos_por_conexao = []
    for conn in conexoes:
        circs = set()
        if conn.origem_id in comp_to_circuit:
            circs.add(comp_to_circuit[conn.origem_id])
        if conn.destino_id in comp_to_circuit:
            circs.add(comp_to_circuit[conn.destino_id])
        
        if circuit_id in circs:
            circuitos_por_conexao.append(len(circs))
            
    if circuitos_por_conexao:
        return max(max(circuitos_por_conexao), 1)
    return 1


# Número de componentes/conexões acima do qual o cálculo é feito em background
_LIMITE_BACKGROUND_COMPONENTES = 50
_LIMITE_BACKGROUND_CONEXOES = 100


@router.post("/circuits/{circuit_id}/dimensionamento")
def dimensionar_circuito_endpoint(
    circuit_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Calcula corrente, disjuntor e bitola de cabo com base nos componentes
    do circuito, agrupamento e queda de tensão.

    Para projetos pequenos (< 50 componentes e < 100 conexões), o cálculo
    é síncrono e retorna imediatamente.
    Para projetos maiores, o resultado é servido de cache se disponível,
    e um BackgroundTask é agendado para pré-calcular o resultado seguinte.
    """
    circuito = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
    if not circuito:
        raise HTTPException(status_code=404, detail="Circuito não encontrado.")

    # Verificar tamanho do projeto
    total_componentes = db.query(models.Component).filter(
        models.Component.project_id == circuito.project_id
    ).count()
    total_conexoes = db.query(models.Connection).filter(
        models.Connection.project_id == circuito.project_id
    ).count()

    is_large = (
        total_componentes > _LIMITE_BACKGROUND_COMPONENTES or
        total_conexoes > _LIMITE_BACKGROUND_CONEXOES
    )

    if is_large:
        # Tentar servir de cache
        cached = _get_cached_dim(circuit_id)
        if cached:
            # Agendar refresh em background para manter cache fresca
            background_tasks.add_task(
                _dimensioning_background, circuit_id, SessionLocal
            )
            return cached

        # Schedule pre-computation in background for next request
        background_tasks.add_task(
            _dimensioning_background, circuit_id, SessionLocal
        )

    resultado = _compute_dimensioning(circuito, db)
    _set_cached_dim(circuit_id, resultado)

    return resultado

# ─── Divisão Automática de Circuitos ────────────────────────────────────────

@router.post("/projects/{project_id}/dividir-circuitos-automatico")
def dividir_circuitos_automatico(project_id: int, db: Session = Depends(get_db)):
    """
    Divisão inicial automática de circuitos (TUG / Iluminação / TUE), seguindo:
    1. Cargas mono/bi/trifásicas não ficam no mesmo circuito.
    2. Iluminação fica separada de tomadas.
    3. Tomadas de área seca ficam separadas das de área molhada.
    4. Cargas acima de 10A (~2200W) ficam em circuito exclusivo.

    Só atua sobre componentes SEM circuito atribuído (circuit_id is None) —
    não mexe em nada já organizado manualmente ou por uma corrida anterior.
    """
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    componentes = db.query(models.Component).filter(
        models.Component.project_id == project_id,
        models.Component.circuit_id.is_(None),
    ).all()

    if not componentes:
        return {
            "project_id": project_id,
            "total_circuitos_criados": 0,
            "circuitos": [],
            "resumo": {"iluminacao": 0, "tug_seca": 0, "tug_molhada": 0, "tue_exclusivas": 0},
            "mensagem": "Nenhum componente por atribuir — todos já têm circuito definido.",
            "aviso_potencia": None,
        }

    # Aviso preventivo: componentes sem potência definida distorcem a divisão
    # (regra 4 e a sugestão de fase dependem disto para funcionar corretamente)
    sem_potencia = [
        c for c in componentes
        if ((c.tipo or "").startswith("lampada") or (c.tipo or "").startswith("tomada"))
        and not (c.potencia_w and c.potencia_w > 0)
    ]

    aviso_potencia = None
    if sem_potencia:
        rotulos = [c.rotulo or f"#{c.id}" for c in sem_potencia[:5]]
        extra = f" (+{len(sem_potencia) - 5} outros)" if len(sem_potencia) > 5 else ""
        aviso_potencia = (
            f"{len(sem_potencia)} componente(s) sem potência definida (ex: {', '.join(rotulos)}{extra}). "
            "A divisão automática pode não isolar corretamente cargas de alta potência "
            "nem sugerir a fase certa para elas. Recomenda-se preencher a potência antes "
            "de correr esta função, especialmente em tomadas dedicadas (fogão, chuveiro, "
            "termoacumulador, bomba de água)."
        )

    rooms = db.query(models.Room).filter(models.Room.project_id == project_id).all()

    rooms_shapely = []
    for room in rooms:
        try:
            geo = json.loads(room.poligono_geojson)
            rooms_shapely.append((room.nome or "Divisão", shape(geo)))
        except Exception:
            continue

    lampadas = [c for c in componentes if (c.tipo or "").startswith("lampada")]
    tomadas = [c for c in componentes if (c.tipo or "").startswith("tomada")]

    tomadas_exclusivas = [c for c in tomadas if (c.potencia_w or 0.0) > LIMIAR_CARGA_EXCLUSIVA_W]
    tomadas_gerais = [c for c in tomadas if (c.potencia_w or 0.0) <= LIMIAR_CARGA_EXCLUSIVA_W]

    tomadas_por_area = {"seca": [], "molhada": []}
    for comp in tomadas_gerais:
        nome_divisao = _encontrar_room_do_componente(comp, rooms_shapely)
        area = _area_da_divisao(nome_divisao) if nome_divisao else "seca"
        tomadas_por_area[area].append(comp)

    circuitos_criados = []

    def _criar_circuito_e_atribuir(nome, componentes_grupo, fase="monofasico"):
        circuito = models.Circuit(project_id=project_id, nome=nome, fase=fase)
        db.add(circuito)
        db.flush()
        for comp in componentes_grupo:
            comp.circuit_id = circuito.id
        circuitos_criados.append(circuito)
        return circuito

    # Iluminação
    grupos_luz = _distribuir_em_circuitos(lampadas, LIMIAR_CARGA_EXCLUSIVA_W)
    for i, grupo in enumerate(grupos_luz, start=1):
        nome = f"[Auto] Iluminação {i}" if len(grupos_luz) > 1 else "[Auto] Iluminação"
        _criar_circuito_e_atribuir(nome, grupo, fase="monofasico")

    # TUG por área
    for area, lista in tomadas_por_area.items():
        if not lista:
            continue
        rotulo_area = "Área Seca" if area == "seca" else "Área Molhada"
        grupos = _distribuir_em_circuitos(lista, LIMIAR_CARGA_EXCLUSIVA_W)
        for i, grupo in enumerate(grupos, start=1):
            nome = f"[Auto] TUG {rotulo_area} {i}" if len(grupos) > 1 else f"[Auto] TUG {rotulo_area}"
            _criar_circuito_e_atribuir(nome, grupo, fase="monofasico")

    # TUE exclusivas
    for comp in tomadas_exclusivas:
        potencia = comp.potencia_w or 0.0
        fase_sugerida = "bifasico" if potencia > LIMIAR_BIFASICO_SUGERIDO_W else "monofasico"
        rotulo_comp = comp.rotulo or f"Componente {comp.id}"
        nome = f"[Auto] TUE — {rotulo_comp}"
        _criar_circuito_e_atribuir(nome, [comp], fase=fase_sugerida)

    db.commit()

    return {
        "project_id": project_id,
        "total_circuitos_criados": len(circuitos_criados),
        "circuitos": [{"id": c.id, "nome": c.nome, "fase": c.fase} for c in circuitos_criados],
        "resumo": {
            "iluminacao": len(lampadas),
            "tug_seca": len(tomadas_por_area["seca"]),
            "tug_molhada": len(tomadas_por_area["molhada"]),
            "tue_exclusivas": len(tomadas_exclusivas),
        },
        "aviso_potencia": aviso_potencia,
    }


# ─── Pydantic models for dimensioning response ───────────────────────────

class _DimItem(BaseModel):
    circuito_id: int
    circuito_nome: str
    circuitType: str
    potencia_total_w: float
    nominalCurrent_A: float
    breaker_A: float
    cableSection_mm2: float
    voltageDrop_percentage: float
    warnings: List[str] = []


class _DimError(BaseModel):
    circuito_id: int
    circuito_nome: str
    error: str


class _DimGlobalResponse(BaseModel):
    project_id: int
    total_circuits: int
    results: List[Union[_DimItem, _DimError]]


@router.post("/projects/{project_id}/dimensionamento-global", response_model=_DimGlobalResponse)
def dimensionar_todos_circuitos(
    project_id: int,
    db: Session = Depends(get_db),
):
    """
    Calculate dimensioning for ALL circuits in a project at once.
    Uses IEC 60364 calculateCircuit for each circuit.
    Returns a list of results per circuit.
    """
    projeto = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    circuitos = db.query(models.Circuit).filter(
        models.Circuit.project_id == project_id
    ).all()
    todos_componentes = db.query(models.Component).filter(
        models.Component.project_id == project_id
    ).all()
    todas_conexoes = db.query(models.Connection).filter(
        models.Connection.project_id == project_id
    ).all()

    resultados = []

    # Pré-construir dicionário circuito -> componentes (O(N) em vez de O(C×N))
    comp_by_circuit = {}
    for c in todos_componentes:
        if c.circuit_id is not None:
            comp_by_circuit.setdefault(c.circuit_id, []).append(c)

    for circuito in circuitos:
        componentes = comp_by_circuit.get(circuito.id, [])
        potencia_total = sum((c.potencia_w or 0.0) for c in componentes)

        comprimento_m = calcular_comprimento_max_circuito(
            projeto.id, circuito.id, db, todos_componentes=todos_componentes, conexoes=todas_conexoes
        )
        agrupados = calcular_circuitos_agrupados(
            projeto.id, circuito.id, db, todos_componentes=todos_componentes, conexoes=todas_conexoes
        )

        temp = getattr(circuito, 'temperatura_c', None)
        temperatura = temp if temp is not None else 30.0

        fase = (circuito.fase or "monofasico").lower()
        voltage_V = 380 if fase in ("bifasico", "trifasico") else 220

        circuitType = _detect_circuit_type(componentes)

        try:
            # Usar queda de tensão máxima personalizada do circuito, se definida
            queda_max = getattr(circuito, 'queda_tensao_max_pct', None)

            resultado = calculator.calculateCircuit(
                power_W=potencia_total,
                voltage_V=voltage_V,
                circuitType=circuitType,
                length_m=comprimento_m,
                temperature_C=temperatura,
                grouping_factor=agrupados,
                queda_tensao_max_pct=queda_max if queda_max and queda_max > 0 else None,
            )

            circuito.disjuntor_amperagem = resultado.breaker_A
            circuito.cabo_bitola_mm2 = resultado.cableSection_mm2

            resultados.append(_DimItem(
                circuito_id=circuito.id,
                circuito_nome=circuito.nome,
                circuitType=circuitType,
                potencia_total_w=round(potencia_total, 2),
                nominalCurrent_A=resultado.nominalCurrent_A,
                breaker_A=resultado.breaker_A,
                cableSection_mm2=resultado.cableSection_mm2,
                voltageDrop_percentage=resultado.voltageDrop_percentage,
                warnings=resultado.warnings,
            ))
        except Exception as e:
            resultados.append(_DimError(
                circuito_id=circuito.id,
                circuito_nome=circuito.nome,
                error=str(e),
            ))

    db.commit()

    return _DimGlobalResponse(
        project_id=project_id,
        total_circuits=len(resultados),
        results=resultados,
    )


@router.delete("/circuits/{circuit_id}")
def apagar_circuito(circuit_id: int, db: Session = Depends(get_db)):
    circuito = db.query(models.Circuit).filter(models.Circuit.id == circuit_id).first()
    if not circuito:
        raise HTTPException(status_code=404, detail="Circuito não encontrado.")
    # Remover a associação de componentes a este circuito antes de apagar
    db.query(models.Component).filter(models.Component.circuit_id == circuit_id).update(
        {models.Component.circuit_id: None}
    )
    db.delete(circuito)
    db.commit()
    return {"ok": True}


# ---------- Components ----------
@router.post("/projects/{project_id}/components", response_model=schemas.ComponentOut)
def criar_componente(project_id: int, payload: schemas.ComponentCreate, db: Session = Depends(get_db)):
    componente = models.Component(project_id=project_id, **payload.model_dump())
    db.add(componente)
    db.commit()
    db.refresh(componente)
    return componente


@router.get("/projects/{project_id}/components", response_model=List[schemas.ComponentOut])
def listar_componentes(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.Component).filter(models.Component.project_id == project_id).all()


@router.patch("/components/{component_id}", response_model=schemas.ComponentOut)
def atualizar_componente(component_id: int, payload: schemas.ComponentUpdate, db: Session = Depends(get_db)):
    componente = db.query(models.Component).filter(models.Component.id == component_id).first()
    if not componente:
        raise HTTPException(status_code=404, detail="Componente não encontrado.")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(componente, campo, valor)
    db.commit()
    db.refresh(componente)
    return componente


@router.post("/components/batch-update", response_model=List[schemas.ComponentOut])
def atualizar_componentes_lote(payload: schemas.ComponentBatchUpdate, db: Session = Depends(get_db)):
    if not payload.ids:
        return []
    componentes = db.query(models.Component).filter(models.Component.id.in_(payload.ids)).all()
    update_data = payload.dados.model_dump(exclude_unset=True)
    for comp in componentes:
        for campo, valor in update_data.items():
            setattr(comp, campo, valor)
    db.commit()
    for comp in componentes:
        db.refresh(comp)
    return componentes


@router.delete("/components/{component_id}")
def apagar_componente(component_id: int, db: Session = Depends(get_db)):
    componente = db.query(models.Component).filter(models.Component.id == component_id).first()
    if not componente:
        raise HTTPException(status_code=404, detail="Componente não encontrado.")
    # B10: Apagar conexões associadas ao componente (origem ou destino)
    db.query(models.Connection).filter(
        (models.Connection.origem_id == component_id) |
        (models.Connection.destino_id == component_id)
    ).delete(synchronize_session='fetch')
    db.delete(componente)
    db.commit()
    return {"ok": True}


# ---------- Connections ----------
@router.post("/projects/{project_id}/connections", response_model=schemas.ConnectionOut)
def criar_conexao(project_id: int, payload: schemas.ConnectionCreate, db: Session = Depends(get_db)):
    # Validação: não permitir self-loop
    if payload.origem_id == payload.destino_id:
        raise HTTPException(status_code=400, detail="Não é possível ligar um componente a si mesmo.")

    # Validação: verificar que ambos os componentes existem e pertencem ao projeto
    origem = db.query(models.Component).filter(
        models.Component.id == payload.origem_id,
        models.Component.project_id == project_id,
    ).first()
    destino = db.query(models.Component).filter(
        models.Component.id == payload.destino_id,
        models.Component.project_id == project_id,
    ).first()
    if not origem or not destino:
        raise HTTPException(status_code=404, detail="Componente de origem ou destino não encontrado neste projeto.")

    # Validação: não permitir conexão duplicada (em qualquer direção)
    existente = db.query(models.Connection).filter(
        models.Connection.project_id == project_id,
        or_(
            and_(models.Connection.origem_id == payload.origem_id, models.Connection.destino_id == payload.destino_id),
            and_(models.Connection.origem_id == payload.destino_id, models.Connection.destino_id == payload.origem_id),
        )
    ).first()
    if existente:
        raise HTTPException(status_code=409, detail="Já existe uma conexão entre estes dois componentes.")

    data = payload.model_dump()
    if "circuitos_bloqueados" in data and isinstance(data["circuitos_bloqueados"], list):
        data["circuitos_bloqueados"] = json.dumps(data["circuitos_bloqueados"])

    conexao = models.Connection(project_id=project_id, **data)
    db.add(conexao)
    db.commit()
    db.refresh(conexao)
    return conexao


@router.get("/projects/{project_id}/connections", response_model=List[schemas.ConnectionOut])
def listar_conexoes(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.Connection).filter(models.Connection.project_id == project_id).all()


@router.patch("/connections/{connection_id}", response_model=schemas.ConnectionOut)
def atualizar_conexao(connection_id: int, payload: schemas.ConnectionUpdate, db: Session = Depends(get_db)):
    """Atualiza propriedades de uma conexão (ex: tipo_cabo, localizacao, circuitos_bloqueados, c1_x, c1_y)."""
    conexao = db.query(models.Connection).filter(models.Connection.id == connection_id).first()
    if not conexao:
        raise HTTPException(status_code=404, detail="Conexão não encontrada.")
    data = payload.model_dump(exclude_unset=True)
    if "circuitos_bloqueados" in data and isinstance(data["circuitos_bloqueados"], list):
        data["circuitos_bloqueados"] = json.dumps(data["circuitos_bloqueados"])
    for campo, valor in data.items():
        setattr(conexao, campo, valor)
    db.commit()
    db.refresh(conexao)
    return conexao


@router.delete("/connections/{connection_id}")
def apagar_conexao(connection_id: int, db: Session = Depends(get_db)):
    conexao = db.query(models.Connection).filter(models.Connection.id == connection_id).first()
    if not conexao:
        raise HTTPException(status_code=404, detail="Conexão não encontrada.")
    db.delete(conexao)
    db.commit()
    return {"ok": True}


# ---------- Batch Delete ----------

@router.post("/components/batch-delete")
def apagar_componentes_batch(payload: schemas.BatchDeleteRequest, db: Session = Depends(get_db)):
    """Apaga múltiplos componentes de uma vez (e suas conexões associadas)."""
    if not payload.ids:
        return {"ok": True, "deleted": 0}
    try:
        # Apagar conexões associadas a qualquer dos componentes
        db.query(models.Connection).filter(
            (models.Connection.origem_id.in_(payload.ids)) |
            (models.Connection.destino_id.in_(payload.ids))
        ).delete(synchronize_session='fetch')
        # Apagar os componentes
        deleted = db.query(models.Component).filter(
            models.Component.id.in_(payload.ids)
        ).delete(synchronize_session='fetch')
        db.commit()
        return {"ok": True, "deleted": deleted}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao apagar componentes em lote: {str(e)}")


@router.post("/connections/batch-delete")
def apagar_conexoes_batch(payload: schemas.BatchDeleteRequest, db: Session = Depends(get_db)):
    """Apaga múltiplas conexões de uma vez."""
    if not payload.ids:
        return {"ok": True, "deleted": 0}
    try:
        deleted = db.query(models.Connection).filter(
            models.Connection.id.in_(payload.ids)
        ).delete(synchronize_session='fetch')
        db.commit()
        return {"ok": True, "deleted": deleted}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao apagar conexões em lote: {str(e)}")


@router.post("/rooms/batch-delete")
def apagar_rooms_batch(payload: schemas.BatchDeleteRequest, db: Session = Depends(get_db)):
    """Apaga múltiplas divisões de uma vez."""
    if not payload.ids:
        return {"ok": True, "deleted": 0}
    try:
        deleted = db.query(models.Room).filter(
            models.Room.id.in_(payload.ids)
        ).delete(synchronize_session='fetch')
        db.commit()
        return {"ok": True, "deleted": deleted}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao apagar divisões em lote: {str(e)}")
