# Project knowledge

This file gives Freebuff context about your project: goals, commands, conventions, and gotchas.

## What is this?

**Electrilal** — Sistema de Projeto Elétrico. A local desktop CAD tool for drawing electrical schematics over architectural DXF floor plans, with circuit sizing calculations.

## Quickstart

### Backend (FastAPI + SQLite + ezdxf)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload  # http://127.0.0.1:8000
```
Swagger docs at `/docs`.

### Frontend (React + Vite + Fabric.js + Three.js)
```bash
cd frontend
npm install
npm run dev          # dev server at http://127.0.0.1:5173
npm run build        # production build
npm run preview      # preview production build
```

**Important:** Backend must be running before frontend.

### Testing
No formal test framework is configured. Ad-hoc test scripts exist in `backend/`:
```bash
cd backend && python test_dxf_parse.py
cd backend && python test_extractor.py
cd backend && python test_pdf_labels.py
cd backend && python test_pdf_rects.py
```

## Architecture

### Key directories
- `backend/` — FastAPI app: `main.py` (entry), `database.py` (SQLAlchemy + SQLite), `models.py` (ORM), `schemas.py` (Pydantic), `routers/` (API routes), `dxf_parser.py` (DXF geometry extraction), `electrical/` (sizing calculator + validator), `pdf_plant_builder.py` (PDF processing)
- `frontend/src/` — React app: `main.jsx` (entry), `App.jsx` (root), `components/` (Canvas/2D+3D, ComponentPanel, PropertiesPanel, Toolbar, PdfImporter, PdfToDxf, Toast), `hooks/` (useFabricCanvas, useAutosave, useUndoRedo), `api/client.js` (API calls), `data/plantaPDF.js` (test data)
- `data/` — Generated runtime data: SQLite DB (`projeto.db`), uploaded DXF files, exported DXF files

### Data flow
1. User uploads `.dxf` → backend parses with `ezdxf` + `shapely` → returns geometry as JSON
2. User drags components from panel → frontend creates Fabric.js objects → persisted to SQLite via API
3. Circuit sizing: backend `calculator.py` computes current → breaker → cable gauge
4. Export: backend writes new DXF with original geometry + components overlaid

### Conventions
- **Backend:** FastAPI async routes with SQLAlchemy ORM. Pydantic schemas for validation. Database auto-created on first run.
- **Frontend:** React functional components with hooks. Fabric.js canvas managed via `useFabricCanvas` hook. 3D view via Three.js in `Canvas3D.jsx`.
- **Database:** SQLite via SQLAlchemy. Tables: `projects`, `circuits`, `components`, `connections`, `rooms`, `circuit_components`.
- **No linter/formatter configured** (frontend or backend). No TypeScript — plain JSX.

### Notable gotchas
- Canvas 3D (`Canvas3D.jsx`) uses continuous `requestAnimationFrame` loop — may cause performance issues on complex models.
- DXF upload parses geometry but does **not** infer rooms/divisions automatically (raw geometry only).
- Electrical calculator values (`calculator.py`, `validator.py`) are generic approximations — must be adjusted to local norms (NBR 5410, IEC 60364, etc.).
- `Connection` model exists in DB but has **no UI** for creating/visualizing connections between components.
- `Canvas3D.jsx` has memory leak risk — dispose of Three.js geometries/materials on unmount.
- Undo/redo (`useUndoRedo.js`) may not be fully wired through the app yet.
- `execute.md` contains an optimization plan that hasn't been implemented yet.
