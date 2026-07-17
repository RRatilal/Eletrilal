# Electrilal — Sistema de Projeto Elétrico (Fase 1)

Sistema local (uso pessoal) para desenhar esquemas elétricos sobre plantas
arquitetónicas (.dxf), com cálculo básico de dimensionamento de circuitos.

## Estrutura

```
electrilal/
├── backend/      FastAPI + SQLite + ezdxf
└── frontend/     React + Vite + Fabric.js
```

## Como correr no teu PC (Windows)

### 1. Backend

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

A API fica em **http://127.0.0.1:8000**
Documentação interativa (Swagger): **http://127.0.0.1:8000/docs**

Isto cria automaticamente `data/projeto.db` (SQLite) na primeira execução.

### 2. Frontend

Num outro terminal:

```
cd frontend
npm install
npm run dev
```

A interface fica em **http://127.0.0.1:5173** (abre no navegador).

> Importante: o backend tem de estar a correr (passo 1) antes de abrir o
> frontend, senão os pedidos à API falham.

## O que já funciona (Fase 1)

- Criar projetos (persistidos em SQLite).
- Upload de ficheiro `.dxf` — o backend extrai linhas/polilinhas/círculos
  e o frontend desenha a planta no canvas.
- Arrastar componentes (tomada, interruptor, luminária, quadro) do painel
  lateral para o canvas — cada um é gravado no SQLite.
- Mover componentes no canvas — a posição é atualizada automaticamente.
- Criar circuitos e atribuir componentes a eles.
- Calcular dimensionamento (corrente, disjuntor, bitola de cabo) por circuito,
  com avisos de validação (ex: circuito de tomadas acima do limite de referência).
- Exportar o projeto para um novo `.dxf` (planta original + componentes desenhados).

## O que falta (próximas fases)

Estas ficam marcadas como pendentes deliberadamente — ver conversa de
planeamento original:

1. **Norma técnica de referência** — os valores em
   `backend/electrical/calculator.py` e `validator.py` são aproximações
   genéricas. Precisas de confirmar/ajustar contra a norma que vais seguir
   (NBR 5410, IEC 60364, ou regulamento local).
2. **Exportação para PDF** (só DXF está implementado).
3. **Biblioteca de símbolos elétricos normativos** (atualmente os componentes
   são círculos coloridos simples no canvas).
4. **Identificação automática de divisões/compartimentos** a partir das
   linhas do DXF (usando Shapely para fechar polígonos) — hoje o sistema só
   desenha a geometria bruta, sem inferir "isto é a cozinha".
5. **Autosave/backup automático** do estado do canvas.
6. **Desfazer/refazer (undo/redo)** no canvas.
7. **Painel de conexões** (cabo entre dois componentes) — o modelo de dados
   já existe (`Connection`), mas ainda não há UI para criar/visualizar.

## Testes já realizados neste ambiente de desenvolvimento

- Backend: criação de projeto, circuito e componentes via API ✓
- Cálculo de dimensionamento (2700 W → 12.27 A → disjuntor 16 A → cabo 1.5 mm²,
  com aviso de limite excedido) ✓
- Upload e parsing de um DXF de teste (polilinha fechada + linha) ✓
- Exportação de DXF com a geometria original + componentes desenhados ✓
- Frontend: `npm run build` sem erros ✓

O que **não foi possível testar** neste ambiente: a interface React no
browser (drag-and-drop visual, canvas interativo) — precisa de ser validada
por ti localmente, correndo `npm run dev` e abrindo no navegador.
