# AGENTS.md — Electrilal

Local personal-use electrical design system: draw schematics on architectural floor plans (.dxf/.pdf) with basic circuit sizing (NBR 5410).

## Architecture

- **Backend**: `backend/` — FastAPI + SQLAlchemy + SQLite + ezdxf + pdfplumber
- **Frontend**: `frontend/` — React 18 + Vite 5 + Fabric.js 6 + Three.js
- **Data**: `data/projeto.db` (SQLite, auto-created on first run)
- API base: `http://127.0.0.1:8000` (Swagger at `/docs`)
- Frontend dev server: `http://127.0.0.1:5173`

## Database Schema

SQLite via SQLAlchemy — no migrations; tables auto-created from `models.py` on startup.

| Table | Key Columns | Relationships |
|-------|-------------|---------------|
| `projects` | `id`, `nome`, `criado_em`, `atualizado_em`, `dxf_original_path` | has many: rooms, components, circuits |
| `rooms` | `id`, `project_id`, `nome`, `poligono_geojson` (GeoJSON string) | belongs to project |
| `circuits` | `id`, `project_id`, `nome`, `fase` (mono/bi/tri), `disjuntor_amperagem`, `cabo_bitola_mm2` | belongs to project; has many components |
| `components` | `id`, `project_id`, `circuit_id?`, `tipo`, `x`, `y`, `rotacao`, `potencia_w`, `rotulo` | belongs to project + optional circuit |
| `connections` | `id`, `project_id`, `origem_id`, `destino_id`, `tipo_cabo` | two components (graph edges) |

- `tipo` enum: `tomada` | `interruptor` | `luminaria` | `quadro`
- `fase` enum: `monofasico` | `bifasico` | `trifasico`
- All cascading deletes on project deletion
- `connections` are bidirectional graph edges (Dijkstra used for wire length calculation)

## Quick start

Backend (terminal 1):
```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend (terminal 2):
```
cd frontend
npm install
npm run dev
```

**Backend must be running before frontend** — frontend makes API calls on load.

## Commands

| Task | Command |
|------|---------|
| Run backend | `uvicorn main:app --reload` (from `backend/`) |
| Run frontend dev | `npm run dev` (from `frontend/`) |
| Build frontend | `npm run build` (from `frontend/`) |
| Test PDF extraction | `python test_extractor.py` (from `backend/`) |

No formal test framework. `test_extractor.py`, `test_pdf_rects.py`, `test_pdf_labels.py` are ad-hoc scripts — run manually against sample files.

No linter, type checker, or formatter configured.

## Key files

- `backend/main.py` — FastAPI app, CORS, router mounts
- `backend/models.py` — DB schema: Project, Room, Circuit, Component, Connection
- `backend/routers/projects.py` — CRUD + `/circuits/{id}/dimensionamento` (sizing calculation with Dijkstra graph)
- `backend/routers/upload.py` — DXF and PDF upload/parse endpoints
- `backend/routers/export.py` — DXF export
- `backend/electrical/calculator.py` — NBR 5410 sizing: current, breaker, cable gauge, voltage drop
- `backend/electrical/validator.py` — power limit and proximity validators
- `backend/dxf_parser.py` — DXF read/write via ezdxf
- `backend/pdf_plant_builder.py` — PDF floor plan parser (pdfplumber, auto-scale detection)
- `frontend/src/App.jsx` — main app shell: home screen + canvas editor + undo/redo/autosave

## Gotchas

- SQLite uses `check_same_thread=False` — required for FastAPI multi-threaded requests
- DXF export writes to `data/exports/`, uploads go to `data/uploads/` — both gitignored
- Electrical calculator tables are **simplified approximations** of NBR 5410 — confirm against actual norm before relying on values
- `Connection` model exists in DB but has no UI yet (Phase 7 TODO)
- CORS locked to `localhost:5173` / `127.0.0.1:5173`
- All UI text and comments are in Portuguese (pt-PT)
- Room coordinates use Cartesian (y-down from top-left) in GeoJSON storage; PDF extraction flips Y to match
- Three.js (`Canvas3D`) is experimental — toggled via toolbar, exits cable mode

## Conventions

- Backend: FastAPI routers in `backend/routers/`, one per domain
- Frontend components in `frontend/src/components/` — Canvas, ComponentToolbar, PropertiesPanel, PdfImporter, Toast, Toolbar
- API client at `frontend/src/api/client.js`
- Custom hooks in `frontend/src/hooks/` (useUndoRedo, useAutosave)
- No env files needed — all config is hardcoded for local use
