"""
Conexão com a base de dados SQLite.
O ficheiro .db fica em data/projeto.db, na raiz do projeto.
"""
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# Raiz atual do projeto Electrilal.
# Pode ser substituída por ELECTRILAL_PROJECT_ROOT quando o projeto for movido.
PROJECT_ROOT = os.environ.get(
    "ELECTRILAL_PROJECT_ROOT",
    "/home/ratilal/Projectos/Electrilal",
)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_PATH = os.path.join(DATA_DIR, "projeto.db")
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# check_same_thread=False é necessário para SQLite + FastAPI (múltiplos threads)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _configurar_pragmas_sqlite(dbapi_connection, connection_record):
    """
    Ativa WAL (Write-Ahead Logging) + synchronous=NORMAL em cada nova conexão.
    WAL permite leituras concorrentes enquanto há uma escrita em curso (em vez
    de bloquear a base de dados inteira).
    synchronous=NORMAL é seguro em modo WAL e evita fsync a cada escrita.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.close()


def init_db():
    """
    Executado uma vez no arranque da aplicação: cria tabelas,
    aplica migrações de colunas e garante os índices FK em SQLite.
    """
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        dbapi_conn = conn.connection
        cursor = dbapi_conn.cursor()

        # Migração automática: adicionar colunas novas se não existirem
        _migar_coluna(cursor, "circuits", "temperatura_c", "FLOAT DEFAULT 30.0")
        _migar_coluna(cursor, "circuits", "queda_tensao_max_pct", "FLOAT DEFAULT 4.0")
        _migar_coluna(cursor, "circuits", "quadro_id", "INTEGER REFERENCES components(id)")
        _migar_coluna(cursor, "circuits", "numero", "INTEGER DEFAULT NULL")
        _migar_coluna(cursor, "circuits", "fases", "TEXT DEFAULT '[]'")
        _migar_coluna(cursor, "connections", "localizacao", "VARCHAR DEFAULT 'teto_parede'")
        _migar_coluna(cursor, "connections", "circuitos_bloqueados", "VARCHAR DEFAULT '[]'")
        _migar_coluna(cursor, "connections", "c1_x", "FLOAT DEFAULT NULL")
        _migar_coluna(cursor, "connections", "c1_y", "FLOAT DEFAULT NULL")
        _migar_coluna(cursor, "components", "scale_x", "FLOAT DEFAULT 1.0")
        _migar_coluna(cursor, "components", "scale_y", "FLOAT DEFAULT 1.0")

        # Migração automática: criar índices para as chaves estrangeiras
        _criar_indice(cursor, "rooms", "project_id", "idx_rooms_project_id")
        _criar_indice(cursor, "circuits", "project_id", "idx_circuits_project_id")
        _criar_indice(cursor, "circuits", "quadro_id", "idx_circuits_quadro_id")
        _criar_indice(cursor, "components", "project_id", "idx_components_project_id")
        _criar_indice(cursor, "components", "circuit_id", "idx_components_circuit_id")
        _criar_indice(cursor, "connections", "project_id", "idx_connections_project_id")
        _criar_indice(cursor, "connections", "origem_id", "idx_connections_origem_id")
        _criar_indice(cursor, "connections", "destino_id", "idx_connections_destino_id")

        dbapi_conn.commit()
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