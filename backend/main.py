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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
import models  # noqa: F401 - necessário para o create_all conhecer as tabelas
from routers import projects, upload, export

# Cria as tabelas no SQLite se ainda não existirem
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Electrilal API",
    description="API para o sistema de projeto elétrico (uso pessoal, local).",
    version="0.1.0",
)

# CORS liberado para o frontend local (Vite roda por padrão em localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
