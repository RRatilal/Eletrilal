"""
Conexão com a base de dados SQLite.
O ficheiro .db fica em data/projeto.db, na raiz do projeto.
"""
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'projeto.db')}"

# check_same_thread=False é necessário para SQLite + FastAPI (múltiplos threads)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _configurar_pragmas_sqlite(dbapi_connection, connection_record):
    """
    Ativa WAL (Write-Ahead Logging) + synchronous=NORMAL em cada nova conexão.
    WAL permite leituras concorrentes enquanto há uma escrita em curso (em vez
    de bloquear a base de dados inteira), o que importa aqui porque o
    autosave do frontend pode escrever componentes/posições enquanto outros
    pedidos GET (listagens, dimensionamento) estão a ler.
    synchronous=NORMAL é seguro em modo WAL e evita fsync a cada escrita,
    reduzindo a latência sem risco real de corrupção de dados num uso local.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")

    # Migração automática: adicionar colunas novas se não existirem
    # (SQLite não suporta ALTER TABLE ADD COLUMN IF NOT EXISTS)
    _migar_coluna(cursor, "circuits", "temperatura_c", "FLOAT DEFAULT 30.0")
    _migar_coluna(cursor, "circuits", "queda_tensao_max_pct", "FLOAT DEFAULT 4.0")
    _migar_coluna(cursor, "connections", "localizacao", "VARCHAR DEFAULT 'teto_parede'")
    _migar_coluna(cursor, "connections", "circuitos_bloqueados", "VARCHAR DEFAULT '[]'")
    _migar_coluna(cursor, "connections", "c1_x", "FLOAT DEFAULT NULL")
    _migar_coluna(cursor, "connections", "c1_y", "FLOAT DEFAULT NULL")
    _migar_coluna(cursor, "components", "scale_x", "FLOAT DEFAULT 1.0")
    _migar_coluna(cursor, "components", "scale_y", "FLOAT DEFAULT 1.0")

    # Migração automática: criar índices para as chaves estrangeiras
    _criar_indice(cursor, "rooms", "project_id", "idx_rooms_project_id")
    _criar_indice(cursor, "circuits", "project_id", "idx_circuits_project_id")
    _criar_indice(cursor, "components", "project_id", "idx_components_project_id")
    _criar_indice(cursor, "components", "circuit_id", "idx_components_circuit_id")
    _criar_indice(cursor, "connections", "project_id", "idx_connections_project_id")
    _criar_indice(cursor, "connections", "origem_id", "idx_connections_origem_id")
    _criar_indice(cursor, "connections", "destino_id", "idx_connections_destino_id")

    cursor.close()


def _migar_coluna(cursor, tabela, coluna, tipo_def):
    """Adiciona coluna a uma tabela SQLite se ela ainda não existir."""
    try:
        cursor.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo_def};")
    except Exception:
        pass  # Coluna já existe — ignorar


def _criar_indice(cursor, tabela, coluna, nome_indice):
    """Cria um índice para uma coluna de uma tabela SQLite se ele ainda não existir."""
    try:
        cursor.execute(f"CREATE INDEX IF NOT EXISTS {nome_indice} ON {tabela} ({coluna});")
    except Exception:
        pass  # Índice já existe ou tabela ainda não foi criada



SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency do FastAPI: abre e fecha a sessão por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()