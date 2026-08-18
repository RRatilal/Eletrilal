"""
Schemas Pydantic - validação de entrada/saída da API.
"""
import json
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

TipoComponente = Literal[
    # Originais
    "tomada", "interruptor", "lampada", "quadro", "quadro_parcial",
    # Lâmpadas
    "lampada_simples", "lampada_arandela", "lampada_spot", "lampada_tubular", "lampada_led", "lampada_led_fita", "lampada_pendente", "lampada_jardim",
    # Tomadas
    "tomada_baixa", "tomada_media", "tomada_alta", "tomada_trifasica", "tomada_sensor", "tomada_dupla", "tomada_tripla",
    # Comunicações
    "telefonia", "dados", "tv", "campainha", "camera",
    # Caixas de Passagem
    "caixa_passagem", "passagem_sobe", "passagem_desce",
    # Interruptores
    "interruptor_simples", "interruptor_duplo", "interruptor_triplo", "interruptor_intermediario", "interruptor_paralelo", "interruptor_dimmer", "interruptor_pulsador"
]
TipoFase = Literal["monofasico", "bifasico", "trifasico"]


# ---------- Project ----------
class ProjectCreate(BaseModel):
    nome: str


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nome: str
    criado_em: datetime
    atualizado_em: Optional[datetime] = None
    dxf_original_path: Optional[str] = None


# ---------- Room ----------
class RoomCreate(BaseModel):
    nome: Optional[str] = None
    poligono_geojson: str


class RoomUpdate(BaseModel):
    nome: Optional[str] = None
    poligono_geojson: Optional[str] = None


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    nome: Optional[str] = None
    poligono_geojson: str


# ---------- Circuit ----------
class CircuitCreate(BaseModel):
    nome: str
    numero: Optional[int] = None
    fase: TipoFase = "monofasico"
    disjuntor_amperagem: Optional[float] = None
    cabo_bitola_mm2: Optional[float] = None
    temperatura_c: float = 30.0
    queda_tensao_max_pct: float = 4.0
    quadro_id: Optional[int] = None


class CircuitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    nome: str
    numero: Optional[int] = None
    fase: TipoFase
    disjuntor_amperagem: Optional[float] = None
    cabo_bitola_mm2: Optional[float] = None
    temperatura_c: float = 30.0
    queda_tensao_max_pct: float = 4.0
    quadro_id: Optional[int] = None


class CircuitUpdate(BaseModel):
    nome: Optional[str] = None
    numero: Optional[int] = None
    fase: Optional[TipoFase] = None
    disjuntor_amperagem: Optional[float] = None
    cabo_bitola_mm2: Optional[float] = None
    temperatura_c: Optional[float] = None
    queda_tensao_max_pct: Optional[float] = None
    quadro_id: Optional[int] = None


# ---------- Component ----------
class ComponentCreate(BaseModel):
    tipo: TipoComponente
    x: float
    y: float
    rotacao: float = 0.0
    scale_x: Optional[float] = 1.0
    scale_y: Optional[float] = 1.0
    potencia_w: float = Field(default=0.0, ge=0)
    rotulo: Optional[str] = None
    circuit_id: Optional[int] = None


class ComponentUpdate(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    rotacao: Optional[float] = None
    scale_x: Optional[float] = None
    scale_y: Optional[float] = None
    potencia_w: Optional[float] = Field(default=None, ge=0)
    rotulo: Optional[str] = None
    circuit_id: Optional[int] = None


class ComponentBatchUpdate(BaseModel):
    ids: List[int]
    dados: ComponentUpdate


class ComponentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    circuit_id: Optional[int] = None
    tipo: TipoComponente
    x: float
    y: float
    rotacao: float
    scale_x: float = 1.0
    scale_y: float = 1.0
    potencia_w: float
    rotulo: Optional[str] = None


# ---------- Connection ----------
class ConnectionCreate(BaseModel):
    origem_id: int
    destino_id: int
    tipo_cabo: Optional[str] = None
    localizacao: Optional[str] = "teto_parede"
    circuitos_bloqueados: Optional[List[str]] = None
    c1_x: Optional[float] = None
    c1_y: Optional[float] = None


class ConnectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    origem_id: int
    destino_id: int
    tipo_cabo: Optional[str] = None
    localizacao: Optional[str] = "teto_parede"
    circuitos_bloqueados: List[str] = []
    c1_x: Optional[float] = None
    c1_y: Optional[float] = None

    @field_validator("circuitos_bloqueados", mode="before")
    @classmethod
    def parse_circuitos_bloqueados(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []


class ConnectionUpdate(BaseModel):
    tipo_cabo: Optional[str] = None
    localizacao: Optional[str] = None
    circuitos_bloqueados: Optional[List[str]] = None
    c1_x: Optional[float] = None
    c1_y: Optional[float] = None


# ---------- Batch Delete ----------
class BatchDeleteRequest(BaseModel):
    ids: List[int]


# ---------- Exportação PDF ----------
class ExportPdfRequest(BaseModel):
    formato: Literal["A4", "A3"] = "A4"
    nome_projeto: Optional[str] = None
    autor: Optional[str] = "Electrilal"
    data: Optional[str] = None
    escala_manual: Optional[str] = None
    numero_folha: int = Field(default=1, ge=1)
    notas: Optional[str] = None
    incluir_unifilar: bool = True

    @field_validator("data")
    @classmethod
    def validar_data_pdf(cls, valor):
        if valor is None or valor == "":
            return valor
        try:
            datetime.strptime(valor, "%d/%m/%Y")
        except ValueError as erro:
            raise ValueError("A data deve estar no formato DD/MM/AAAA.") from erro
        return valor
