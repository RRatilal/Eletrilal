"""
Endpoints de CRUD: projetos, componentes, circuitos e conexões.
"""
import math
import heapq
import threading
import logging
from typing import List, Union
from pydantic import BaseModel
import os
import time
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db, SessionLocal
from electrical import calculator, validator


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


def _compute_dimensioning(circuito, db):
    """
    Central dimensioning logic — uses IEC 60364 calculateCircuit.
    Returns a dict compatible with the /circuits/{id}/dimensionamento endpoint.
    """
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

    resultado = calculator.calculateCircuit(
        power_W=potencia_total,
        voltage_V=voltage_V,
        circuitType=circuitType,
        length_m=comprimento_m,
        temperature_C=temperatura,
        grouping_factor=agrupados,
    )

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



def calcular_comprimento_max_circuito(project_id: int, circuit_id: int, db: Session) -> float:
    """Calcula o comprimento máximo de fiação do QDF até qualquer componente do circuito usando o grafo de conexões."""

    # 1. Encontra todos os componentes do projeto
    todos_componentes = db.query(models.Component).filter(models.Component.project_id == project_id).all()
    comp_map = {c.id: c for c in todos_componentes}
    
    # Encontra todos os quadros do projeto (tipo == "quadro")
    quadros = [c for c in todos_componentes if c.tipo == "quadro"]
    if not quadros:
        return 15.0  # Sem quadro: usa comprimento padrão de 15m
        
    # 2. Carrega todas as conexões do projeto
    conexoes = db.query(models.Connection).filter(models.Connection.project_id == project_id).all()
    
    import json
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


def calcular_circuitos_agrupados(project_id: int, circuit_id: int, db: Session) -> int:
    """Retorna o número máximo de circuitos diferentes que partilham conexões com este circuito."""
    componentes = db.query(models.Component).filter(models.Component.project_id == project_id).all()
    comp_to_circuit = {c.id: c.circuit_id for c in componentes if c.circuit_id is not None}
    
    comp_ids_circuito = {c.id for c in componentes if c.circuit_id == circuit_id}
    if not comp_ids_circuito:
        return 1
        
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

    circuitos = db.query(models.Circuit).filter(models.Circuit.project_id == project_id).all()
    resultados = []

    for circuito in circuitos:
        componentes = db.query(models.Component).filter(
            models.Component.circuit_id == circuito.id
        ).all()
        potencia_total = sum((c.potencia_w or 0.0) for c in componentes)

        comprimento_m = calcular_comprimento_max_circuito(
            projeto.id, circuito.id, db
        )
        agrupados = calcular_circuitos_agrupados(
            projeto.id, circuito.id, db
        )

        temp = getattr(circuito, 'temperatura_c', None)
        temperatura = temp if temp is not None else 30.0

        fase = (circuito.fase or "monofasico").lower()
        voltage_V = 380 if fase in ("bifasico", "trifasico") else 220

        circuitType = _detect_circuit_type(componentes)

        try:
            resultado = calculator.calculateCircuit(
                power_W=potencia_total,
                voltage_V=voltage_V,
                circuitType=circuitType,
                length_m=comprimento_m,
                temperature_C=temperatura,
                grouping_factor=agrupados,
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
        (
            (models.Connection.origem_id == payload.origem_id) & (models.Connection.destino_id == payload.destino_id)
        ) | (
            (models.Connection.origem_id == payload.destino_id) & (models.Connection.destino_id == payload.origem_id)
        )
    ).first()
    if existente:
        raise HTTPException(status_code=409, detail="Já existe uma conexão entre estes dois componentes.")

    import json
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
    import json
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
