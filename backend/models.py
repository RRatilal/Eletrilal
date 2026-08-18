"""
Modelos SQLAlchemy - definem as tabelas da base de dados.
"""
# pyrefly: ignore [missing-import]
from sqlalchemy import (
    Column, Integer, String, Float, ForeignKey, DateTime, Text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), onupdate=func.now())
    dxf_original_path = Column(String, nullable=True)

    rooms = relationship("Room", back_populates="project", cascade="all, delete-orphan")
    components = relationship("Component", back_populates="project", cascade="all, delete-orphan")
    circuits = relationship("Circuit", back_populates="project", cascade="all, delete-orphan")
    connections = relationship("Connection", back_populates="project", cascade="all, delete-orphan")


class Room(Base):
    """Divisões/compartimentos extraídos do DXF."""
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    nome = Column(String, nullable=True)
    poligono_geojson = Column(Text, nullable=False)  # guardado como string JSON

    project = relationship("Project", back_populates="rooms")


class Circuit(Base):
    """Circuito elétrico: agrupa componentes e define o disjuntor/cabo."""
    __tablename__ = "circuits"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    nome = Column(String, nullable=False)
    numero = Column(Integer, nullable=True)      # número de identificação no quadro (ex: 1, 2, 13)
    disjuntor_amperagem = Column(Float, nullable=True)
    cabo_bitola_mm2 = Column(Float, nullable=True)
    fase = Column(String, default="monofasico")  # monofasico | bifasico | trifasico
    temperatura_c = Column(Float, default=30.0)        # Temperatura ambiente (°C)
    queda_tensao_max_pct = Column(Float, default=4.0)  # Queda de tensão máxima (%)
    quadro_id = Column(Integer, ForeignKey("components.id", ondelete="SET NULL"), nullable=True, index=True)

    project = relationship("Project", back_populates="circuits")
    components = relationship("Component", back_populates="circuit", foreign_keys="Component.circuit_id")
    quadro = relationship("Component", foreign_keys=[quadro_id])


class Component(Base):
    """Componente elétrico: tomada, interruptor, luminária, quadro, etc."""
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=True, index=True)

    tipo = Column(String, nullable=False)  # tomada | interruptor | luminaria | quadro
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    rotacao = Column(Float, default=0.0)
    scale_x = Column(Float, default=1.0)
    scale_y = Column(Float, default=1.0)
    potencia_w = Column(Float, default=0.0)
    rotulo = Column(String, nullable=True)  # ex: "Tomada Cozinha 1"

    project = relationship("Project", back_populates="components")
    circuit = relationship("Circuit", back_populates="components", foreign_keys=[circuit_id])


class Connection(Base):
    """Ligação (conduto) entre dois componentes."""
    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    origem_id = Column(Integer, ForeignKey("components.id"), nullable=False, index=True)
    destino_id = Column(Integer, ForeignKey("components.id"), nullable=False, index=True)
    tipo_cabo = Column(String, nullable=True)  # ex: "2.5mm2"
    localizacao = Column(String, default="teto_parede")  # teto_parede | subterraneo
    circuitos_bloqueados = Column(String, default="[]")   # JSON array string ex: '["1", "3"]'
    c1_x = Column(Float, nullable=True)  # Ponto de controlo X (curva Bezier)
    c1_y = Column(Float, nullable=True)  # Ponto de controlo Y (curva Bezier)

    project = relationship("Project", back_populates="connections")
