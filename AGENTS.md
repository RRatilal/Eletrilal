# AGENTS.md — Electrilal

Local personal-use electrical design system: draw schematics on architectural floor plans (.dxf/.pdf) with circuit sizing (IEC 60364 / NBR 5410 approximations).

All UI text and code comments are in **Portuguese (pt-PT)**. Prefer Portuguese for new UI strings and user-facing messages.

## Architecture

| Layer | Stack | Location |
|-------|--------|----------|
| Backend | FastAPI + SQLAlchemy + SQLite + ezdxf + pdfplumber + shapely | `backend/` |
| Frontend | React 18 + Vite 5 + Fabric.js 6 + Three.js | `frontend/` |
| Data | SQLite DB + uploads/exports | `data/` (DB), `backend/data/` (uploads/exports) |

- API: `http://127.0.0.1:8000` (Swagger at `/docs`, health at `/api/health`)
- Frontend dev: `http://127.0.0.1:5173`
- API prefix: all routers mounted under `/api`
- CORS locked to `localhost:5173` / `127.0.0.1:5173`
- No env files — config is hardcoded for local use

## Quick start

Backend (terminal 1):
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend (terminal 2):
```bash
cd frontend
npm install
npm run dev
```

**Backend must be running before frontend** — the app calls the API on load.

## Commands

| Task | Command | Cwd |
|------|---------|-----|
| Run backend | `uvicorn main:app --reload` | `backend/` |
| Run frontend | `npm run dev` | `frontend/` |
| Build frontend | `npm run build` | `frontend/` |
| Ad-hoc DXF parse test | `python test_dxf_parse.py` | `backend/` |
| Ad-hoc PDF tests | `python test_extractor.py` / `test_pdf_rects.py` / `test_pdf_labels.py` | `backend/` |

No formal test framework, linter, type checker, or formatter. No TypeScript — plain JSX/JS and Python.

## Database

SQLite via SQLAlchemy. Tables auto-created from `models.py` on startup (`Base.metadata.create_all`).

- DB path: `data/projeto.db` (project root, relative to backend parent)
- WAL mode + `synchronous=NORMAL` enabled on connect
- Lightweight auto-migrations in `database.py` (`ALTER TABLE ADD COLUMN` + FK indexes) for columns added after initial schema
- `check_same_thread=False` required for FastAPI multi-threaded requests
- Cascading deletes on project deletion

| Table | Key columns | Notes |
|-------|-------------|--------|
| `projects` | `id`, `nome`, `criado_em`, `atualizado_em`, `dxf_original_path` | has many rooms, components, circuits, connections |
| `rooms` | `project_id`, `nome`, `poligono_geojson` | GeoJSON polygon string |
| `circuits` | `project_id`, `nome`, `fase`, `disjuntor_amperagem`, `cabo_bitola_mm2`, `temperatura_c`, `queda_tensao_max_pct` | defaults: 30 °C, 4% Vdrop |
| `components` | `project_id`, `circuit_id?`, `tipo`, `x`, `y`, `rotacao`, `scale_x`, `scale_y`, `potencia_w`, `rotulo` | many `tipo` values (see schemas) |
| `connections` | `project_id`, `origem_id`, `destino_id`, `tipo_cabo`, `localizacao`, `circuitos_bloqueados`, `c1_x`, `c1_y` | graph edges; Bezier control point optional |

- `fase`: `monofasico` | `bifasico` | `trifasico`
- `localizacao`: `teto_parede` | `subterraneo`
- Component `tipo` is a large Literal in `schemas.py` (tomadas, interruptores, lâmpadas, comunicações, caixas de passagem, etc.) — not only the original four types
- Coordinates: Cartesian meters in DB; canvas uses `ESCALA_PX_POR_METRO = 40` and flips Y for display
- Room GeoJSON uses y-down from top-left; PDF extraction flips Y to match

## Backend layout

```
backend/
  main.py                 # FastAPI app, CORS, router mounts
  database.py             # engine, session, WAL, column migrations
  models.py               # SQLAlchemy ORM
  schemas.py              # Pydantic request/response models
  dxf_parser.py           # DXF geometry extraction (ezdxf + shapely)
  pdf_plant_builder.py    # PDF floor-plan parser (pdfplumber, auto-scale)
  pdf_to_dxf.py           # PDF → DXF conversion
  electrical/
    calculator.py         # sizing: current, breaker, cable, voltage drop
    validator.py          # power-limit / proximity checks
  routers/
    projects.py           # CRUD + dimensionamento + batch deletes + geometry
    upload.py             # DXF upload, PDF plant import, PDF→DXF
    export.py             # DXF export
```

### Important API surfaces

- Projects CRUD; `GET /projects/{id}/geometry` re-parses original DXF when autosave has no geometry
- Components / circuits / connections / rooms CRUD + batch-delete endpoints
- `POST /circuits/{id}/dimensionamento` — single-circuit sizing (Dijkstra on connection graph for wire length)
- `POST /projects/{id}/dimensionamento-global` — size all circuits
- `POST /projects/{id}/upload-dxf`, `import-pdf-plant`, `pdf-to-dxf/preview`, `pdf-to-dxf/convert`
- `GET /projects/{id}/export/dxf`
- Uploads: `backend/data/uploads/` (50 MB max); exports: `backend/data/exports/`

## Frontend layout

```
frontend/src/
  App.jsx                 # shell: home + editor, state orchestration
  api/client.js           # fetch client → http://127.0.0.1:8000/api
  hooks/
    useFabricCanvas.js    # Fabric canvas, geometry, components, connections, grid
    useFloorPlanTools.js  # crop / calibrate / erase (two-step draw → confirm)
    useCanvasIntegration.js  # selection ↔ Sidebar two-way binding
    useAutosave.js        # localStorage autosave (~2s debounce)
    useUndoRedo.js        # undo stack
    ThemeContext.jsx      # light/dark theme
  components/
    Canvas/               # Canvas.jsx, Canvas3D.jsx, SymbolFactory.js
    Sidebar/              # general + plant tools + component forms
    Toolbar/              # top toolbar + component toolbar
    BottomToolbar/        # zoom, floor-plan lock
    CircuitosPanel/       # circuits UI
    PropertiesPanel/      # selected object properties
    ComponentPanel/       # palette of electrical symbols
    PdfImporter/, PdfToDxf/
    Toast/
```

### Canvas / interaction notes

- Fabric.js v6: `canvas.getPointer(e)` already returns world coordinates — do **not** re-apply viewport transforms (historical double-transform bug)
- Large DXF (≥ ~2000 objects): grouped native 2D drawing mode for performance; floor-plan drag uses offset tracking
- Floor plan tools: crop (clipPath / native clip), calibrate scale (known distance), erase (fully contained objects only)
- Floor plan lock toggle: locked = click-through for placing components; unlocked = selectable (opens plant panel)
- Cable mode (`modoCabo`): create/edit connections between components; Bezier handles via `c1_x`/`c1_y`
- Autosave stores componentes, circuitos, conexoes, rooms, floorPlanModifications, floorPlanPosition, plantaTravada — not full geometry (geometry from API / original file)
- Three.js `Canvas3D` is experimental; toggled from toolbar and exits cable mode
- Scale constant: 40 px/m in `useFabricCanvas.js`

## Conventions

- Backend: one FastAPI router per domain under `backend/routers/`
- Frontend: feature folders under `components/`; shared canvas logic in hooks, not only in components
- API client is the single place for HTTP paths (`frontend/src/api/client.js`)
- Prefer extending existing patterns (schemas Literal types, batch endpoints, Portuguese UI) over introducing new stacks
- Electrical tables in `calculator.py` are **simplified approximations** of IEC 60364 / NBR 5410 — never present values as certified code compliance without human verification

## Gotchas

- DB lives at project-root `data/`; uploads/exports under `backend/data/` (paths differ by module `BASE_DIR`)
- No Alembic — new columns need both `models.py` and a `_migar_coluna` call in `database.py` for existing DBs
- README is outdated (still describes early “Fase 1”; many listed “missing” features now exist: autosave, undo/redo, connections UI, PDF import)
- `knowledge.md` may also lag; trust code + this file over old docs when they conflict
- `Connection` is fully wired in API + canvas (not a Phase 7 stub anymore)
- Rooms are not auto-inferred from DXF walls; geometry is raw lines/polylines unless user creates rooms
- CSS `transform` on Sidebar traps `position: fixed` children — modals (e.g. calibration) use `createPortal` to `document.body`
- Gitignore: `data/*.db`, `data/uploads/`, `data/exports/`, `venv/`, `node_modules/`, `dist/` — runtime DB/WAL files may show as dirty locally

## Key files to start from

| Goal | File |
|------|------|
| App entry / orchestration | `frontend/src/App.jsx` |
| Canvas drawing & symbols | `frontend/src/hooks/useFabricCanvas.js` |
| API surface | `frontend/src/api/client.js`, `backend/routers/*.py` |
| Schema / tipos | `backend/schemas.py`, `backend/models.py` |
| Sizing math | `backend/electrical/calculator.py` |
| DXF I/O | `backend/dxf_parser.py`, `backend/routers/export.py` |
| PDF plants | `backend/pdf_plant_builder.py`, `backend/pdf_to_dxf.py` |
| Recent feature history | `CHANGELOG.md` |
