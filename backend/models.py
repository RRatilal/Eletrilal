"""
Modelos SQLAlchemy - definem as tabelas da base de dados.
"""
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
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    nome = Column(String, nullable=True)
    poligono_geojson = Column(Text, nullable=False)  # guardado como string JSON

    project = relationship("Project", back_populates="rooms")


class Circuit(Base):
    """Circuito elétrico: agrupa componentes e define o disjuntor/cabo."""
    __tablename__ = "circuits"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    nome = Column(String, nullable=False)
    disjuntor_amperagem = Column(Float, nullable=True)
    cabo_bitola_mm2 = Column(Float, nullable=True)
    fase = Column(String, default="monofasico")  # monofasico | bifasico | trifasico

    project = relationship("Project", back_populates="circuits")
    components = relationship("Component", back_populates="circuit")


class Component(Base):
    """Componente elétrico: tomada, interruptor, luminária, quadro, etc."""
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=True)

    tipo = Column(String, nullable=False)  # tomada | interruptor | luminaria | quadro
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    rotacao = Column(Float, default=0.0)
    potencia_w = Column(Float, default=0.0)
    rotulo = Column(String, nullable=True)  # ex: "Tomada Cozinha 1"

    project = relationship("Project", back_populates="components")
    circuit = relationship("Circuit", back_populates="components")


class Connection(Base):
    """Ligação (cabo) entre dois componentes."""
    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    origem_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    destino_id = Column(Integer, ForeignKey("components.id"), nullable=False)
    tipo_cabo = Column(String, nullable=True)  # ex: "2.5mm2"

    project = relationship("Project", back_populates="connections")
