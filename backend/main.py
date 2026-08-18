"""
Ponto de entrada da aplicação FastAPI.
# v2 — PDF plant import enabled
Para correr localmente:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload

A API fica disponível em http://127.0.0.1:8000
Documentação interativa (Swagger) em http://127.0.0.1:8000/docs
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
import models  # noqa: F401 - necessário para o create_all conhecer as tabelas
from routers import projects, upload, export

# Cria as tabelas e índices no SQLite se ainda não existirem
init_db()

app = FastAPI(
    title="Electrilal API",
    description="API para o sistema de projeto elétrico (uso pessoal, local).",
    version="0.1.0",
)

# CORS liberado para o frontend local (configurável via env var CORS_ORIGINS)
_cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(export.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
