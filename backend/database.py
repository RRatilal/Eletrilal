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

    cursor.close()


def _migar_coluna(cursor, tabela, coluna, tipo_def):
    """Adiciona coluna a uma tabela SQLite se ela ainda não existir."""
    try:
        cursor.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo_def};")
    except Exception:
        pass  # Coluna já existe — ignorar



SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency do FastAPI: abre e fecha a sessão por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()