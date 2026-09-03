#!/usr/bin/env bash
#
# dev.sh — Inicia o backend (FastAPI) e o frontend (Vite) em paralelo.
#
# Uso:
#   ./dev.sh              # corre os dois servidores
#   ./dev.sh --build      # faz build do frontend antes de iniciar
#   ./dev.sh --frontend   # só o frontend
#   ./dev.sh --backend    # só o backend
#
# Atalho: pode também usar `make dev` se tiver Makefile.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Cores para output
VERDE='\033[0;32m'
AZUL='\033[0;34m'
AMARELO='\033[1;33m'
SEM_COR='\033[0m'

info()  { echo -e "${AZUL}[dev.sh]${SEM_COR} $1"; }
ok()    { echo -e "${VERDE}[dev.sh]${SEM_COR} $1"; }
aviso() { echo -e "${AMARELO}[dev.sh]${SEM_COR} $1"; }

PID_BACKEND=""
PID_FRONTEND=""

limpar() {
  aviso "A encerrar servidores..."
  [ -n "$PID_BACKEND" ] && kill "$PID_BACKEND" 2>/dev/null || true
  [ -n "$PID_FRONTEND" ] && kill "$PID_FRONTEND" 2>/dev/null || true
  wait "$PID_BACKEND" 2>/dev/null || true
  wait "$PID_FRONTEND" 2>/dev/null || true
  ok "Servidores encerrados."
}
# NOTA: NÃO usar EXIT aqui, senão o trap dispara 2x (SIGINT + EXIT)
trap limpar SIGINT SIGTERM

MODO_BACKEND=true
MODO_FRONTEND=true
FAZER_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --backend) MODO_FRONTEND=false ;;
    --frontend) MODO_BACKEND=false ;;
    --build) FAZER_BUILD=true ;;
    *) aviso "Argumento ignorado: $arg" ;;
  esac
done

# ─── Frontend Build (opcional) ────────────────────────────────────────────
if $FAZER_BUILD; then
  info "A fazer build do frontend..."
  cd "$FRONTEND_DIR"
  npm run build
  cd "$ROOT_DIR"
  ok "Build concluído."
fi

# ─── Backend ──────────────────────────────────────────────────────────────
if $MODO_BACKEND; then
  info "A iniciar backend (FastAPI) em http://127.0.0.1:8000 ..."
  cd "$BACKEND_DIR"

  # Ativar virtualenv se existir (venv ou .venv)
  if [ -f "venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source venv/bin/activate
  elif [ -f "venv/Scripts/activate" ]; then
    # shellcheck disable=SC1091
    source venv/Scripts/activate
  elif [ -f ".venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
  fi

  # Se uvicorn não estiver disponível, criar/reparar venv e instalar dependências
  if ! command -v uvicorn &>/dev/null; then
    aviso "Ambiente virtual ou uvicorn não encontrado. A configurar backend/venv..."
    if command -v python3 &>/dev/null; then
      python3 -m venv venv
    else
      python -m venv venv
    fi

    if [ -f "venv/bin/activate" ]; then
      source venv/bin/activate
    elif [ -f "venv/Scripts/activate" ]; then
      source venv/Scripts/activate
    fi

    pip install -r requirements.txt
  fi

  uvicorn main:app --reload --host 127.0.0.1 --port 8000 &
  PID_BACKEND=$!
  cd "$ROOT_DIR"
  ok "Backend a correr (PID $PID_BACKEND)"
fi

# ─── Frontend ─────────────────────────────────────────────────────────────
if $MODO_FRONTEND; then
  info "A iniciar frontend (Vite) em http://localhost:5173 ..."
  cd "$FRONTEND_DIR"

  # Verificar se node_modules existe
  if [ ! -d "node_modules" ]; then
    aviso "node_modules não encontrado. A instalar dependências..."
    npm install
  fi

  npm run dev &
  PID_FRONTEND=$!
  cd "$ROOT_DIR"
  ok "Frontend a correr (PID $PID_FRONTEND)"
fi

echo ""
info "═══════════════════════════════════════════"
info "  Backend:  http://127.0.0.1:8000"
info "  Swagger:  http://127.0.0.1:8000/docs"
info "  Frontend: http://localhost:5173"
info "═══════════════════════════════════════════"
info "Prima Ctrl+C para parar ambos."
echo ""

# Aguarda até que um dos processos termine (Ctrl+C → trap → limpar)
wait
