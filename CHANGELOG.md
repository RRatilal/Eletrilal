# Changelog — Electrilal

Todas as actualizações significativas do projecto Electrilal.

---

## [2026-07-17] — Painel de Edição da Planta + Refinamentos

### ✨ Novas Funcionalidades

#### Painel de Edição da Planta (Sidebar)
- **3 ferramentas de edição** com fluxo Two-Step (desenhar → confirmar):
  - **✂️ Cortar (Crop):** Utilizador desenha um rectângulo no canvas e clica em "Aplicar Corte". Aplica `clipPath` ao grupo da planta (modo individual) ou clip nativo no Canvas 2D context (modo agrupado)
  - **📏 Calibrar Escala:** Utilizador desenha uma linha sobre uma medida conhecida, um modal pergunta a distância real em metros, e a planta é reescalada. Mostra "Escala atual: X%" no accordion
  - **🧹 Apagar Área:** Utilizador desenha um rectângulo e clica em "Apagar elementos contidos na seleção". Remove apenas objectos **100% contidos** (`isContainedWithinObject`) dentro do rectângulo
- **Comportamento de Acordeão:** Cada ferramenta expande-se ao clicar, revelando instruções, info da selecção, e botão de confirmação

#### Barra de Ferramentas Inferior (BottomToolbar)
- **Zoom +/-:** Botões para aproximar/afastar centrados no centro do canvas
- **Bloqueio da Planta:** Toggle que alterna `selectable`/`evented` no grupo da planta
  - 🔓 **Destravada (Amarelo):** Planta clicável e seleccionável — abre PainelPlanta
  - 🔒 **Travada (Verde):** Planta não interactiva — permite clicar através dela para adicionar componentes
- **Indicador de Grid:** Texto estático "Grid: 0.5 m" (placeholder)

### 🐛 Correções de Bugs

#### Coordenadas duplamente transformadas (Crítico)
- `canvas.getPointer(e)` no Fabric.js v6 já devolve coordenadas no espaço-mundo. A função `getWorldPointer` estava a aplicar uma segunda transformação `(pointer.x - vpt[4]) / zoom`, produzindo coordenadas ~1/4 da posição real
- **Resultado:** O rectângulo temporário era criado longe do cursor
- **Correcção:** Removida a dupla transformação — `worldX` passou a ser `pointer.x` directamente

#### Arrasto da planta interfere com desenho de ferramentas (Crítico)
- Quando uma ferramenta (Crop/Erase) estava activa, o floor plan ainda tinha `selectable: true, evented: true`. O clique no canvas iniciava simultaneamente o arrasto nativo do Fabric.js no grupo da planta E o desenho temporário da ferramenta
- **Resultado:** A planta movia-se em vez de desenhar o rectângulo
- **Correcção:** Nova função `disableFloorPlanInteraction()` guarda o estado original `selectable`/`evented` em `_fpToolSelectable`/`_fpToolEvented`, desactiva ambos, e restaura no final

#### Cursor não muda para crosshair nas ferramentas
- O floor plan group tinha `hoverCursor: "pointer"`, que o Fabric.js usava quando o rato estava sobre o objecto, sobrepondo-se ao `canvas.defaultCursor = "crosshair"`
- **Correcção:** Ao activar ferramenta, `hoverCursor` do grupo muda para `'crosshair'`. Ao desactivar, restaura para `'pointer'` (ou `'default'` se a planta estiver travada)

#### Sidebar desaparece ao desenhar rectângulo
- Quando o utilizador clicava no canvas para desenhar o rectângulo, o Fabric.js disparava `selection:cleared`, que limpava `electricalData` e a Sidebar trocava PainelPlanta por PainelGeral
- **Correcção:** No Sidebar, se `activeTool` não for `null`, renderiza PainelPlanta independentemente do `electricalData`

#### Modal de calibração aparece dentro do painel lateral
- O sidebar tem `transform: translateX(...)` no CSS. Elementos com `position: fixed` dentro de um elemento com `transform` ficam relativos a esse elemento (spec CSS), não à página
- **Correcção:** `CalibrationModal.jsx` agora usa `createPortal` do `react-dom` para renderizar o modal directamente em `document.body`, ignorando a contenção do CSS transform

#### Arrasto da planta no modo agrupado (2D context)
- No modo agrupado (≥2000 linhas), a planta é desenhada via Canvas 2D nativo com coordenadas absolutas. O `invisRect` (rectângulo de clique) é um objecto Fabric.js separado. Quando arrastado, o rect movia-se mas o desenho nativo ficava parado
- **Correcção:** Guarda `_floorPlanInitialLeft`/`_floorPlanInitialTop` no rect. Em `drawDxfGeometry`, calcula `offset = currentPos - initialPos` e aplica a todas as coordenadas. Após calibração, actualiza a referência inicial

#### Posição da planta não persiste (arrasto perdido ao recarregar)
- Quando o utilizador arrasta a planta no canvas, a nova posição não era guardada em lado nenhum
- **Correcção:**
  - `App.jsx`: Novo `floorPlanPositionRef` com listener `object:modified` no canvas que captura `{ left, top }` do floor plan group
  - Posição incluída no `autosaveData` e restaurada em `abrirProjeto`
  - `Canvas.jsx`: Novo `useEffect` que aplica `grupo.set({ left, top })` após `desenharGeometria`

#### Seleção do crop mostra bounding box original em vez da área cortada
- Após aplicar `clipPath`, a bounding box do `fabric.Group` mantinha o tamanho original (clipPath é uma máscara visual, não altera dimensões)
- **Correcção:** Em `confirmarCrop`, após aplicar clipPath, são removidos os objetos filhos 100% fora do rect de crop. Isto encolhe a bounding box automaticamente. `geometriaRef` também é sincronizado para persistência

#### Painel de propriedades sobrepõe painel de circuitos
- `PropertiesPanel` e `Sidebar` usavam ambos `position: fixed` com a mesma posição `right: var(--space-md)` e `z-index: 50`, causando sobreposição
- **Correcção:** `Sidebar` recebe nova prop `propertiesOpen`; quando activa, a sidebar desloca-se para `right: calc(var(--panel-width) + var(--space-md) * 2)` ficando ao lado do PropertiesPanel

#### Modificações da planta (crop, erase, calibrate) perdidas ao recarregar
- Crop, Erase e Calibração da planta só existiam em refs/memória RAM. Ao recarregar a página, todas as modificações eram perdidas
- **Correcção:**
  - `useFloorPlanTools`: Novo callback `onModified(state)` chamado após cada confirmação, serializando `{ geometria, clipRect, scale, mode }`
  - `App.jsx`: Novo estado `floorPlanModifications` incluído no `autosaveData` (localStorage). Ao reabrir projecto, restaura modificações e usa geometria modificada se disponível
  - `Canvas.jsx`: Novo `useEffect` re-aplica `clipPath` (crop) e `scaleX/scaleY` (calibração) no grupo da planta após carregamento da geometria
  - `setFloorPlanModifications(null)` ao importar novo DXF/PDF, evitando misturar modificações antigas com geometria nova

#### Geometria não persiste ao reabrir projecto
- A geometria da planta só era carregada do autosave (localStorage). Ao sair e voltar, o autosave não existia e a geometria ficava `null`
- **Correcção:** Novo endpoint `GET /projects/{id}/geometry` no backend que re-processa o ficheiro DXF original. No frontend, `abrirProjeto` tenta: autosave → API → vazio

#### Desfoque no Zoom (DXF com muitas linhas)
- O `fabric.Path` com `objectCaching: true` rasterizava as linhas DXF num bitmap. Ao fazer zoom in, o bitmap era escalado → pixelização
- **Correcção:** Modo agrupado (≥2000 linhas): render nativo no Canvas 2D context (`after:render`) com viewport culling. Modo individual (<2000): `fabric.Line` com `strokeUniform: true`. `objectCaching` nunca é usado para a geometria DXF

### 📁 Ficheiros Criados

| Ficheiro | Descrição |
|----------|-----------|
| `frontend/src/hooks/useFloorPlanTools.js` | Hook com as 3 ferramentas de edição: crop, calibração, limpeza. Two-step workflow, `isContainedWithinObject`, guarda/seleccão temporária |
| `frontend/src/components/Sidebar/PainelPlanta.jsx` | Componente acordeão com 3 ferramentas expansíveis, botões de confirmação, info da selecção |
| `frontend/src/components/Sidebar/CalibrationModal.jsx` | Modal overlay para inserir distância real em metros durante calibração |
| `frontend/src/components/BottomToolbar/BottomToolbar.jsx` | Barra inferior com zoom +/- , lock/unlock toggle, indicador de grid |
| `frontend/src/components/BottomToolbar/BottomToolbar.css` | Estilos glassmorphism para a barra inferior |
| `backend/routers/projects.py` (endpoint) | `GET /projects/{id}/geometry` — re-processa DXF original da BD |

### 📁 Ficheiros Modificados

| Ficheiro | Principais Alterações |
|----------|----------------------|
| `frontend/src/hooks/useFabricCanvas.js` | `floorPlanGroupRef`, `floorPlanScaleRef`, `floorPlanClipRectRef`, `floorPlanModeRef`, `toggleFloorPlanLock()`, `_desenharGeometriaIndividual`/`Agrupada` com `electricalData.type='floorplan'`, `drawDxfGeometry` com offset drag + clip nativo |
| `frontend/src/hooks/useCanvasIntegration.js` | `criarElectricalData()` para gerar dados padrão por tipo |
| `frontend/src/components/Sidebar/Sidebar.jsx` | Detecta `type: 'floorplan'`, prioridade `activeTool` sobre `electricalData`, novas props de ferramentas |
| `frontend/src/components/Sidebar/Sidebar.css` | Estilos de acordeão, tool buttons, modal, confirmação, status bar |
| `frontend/src/components/Canvas/Canvas.jsx` | `onCanvasRef` envia objecto `{ canvas, toggleFloorPlanLock, geometriaRef, ... }` |
| `frontend/src/App.jsx` | `handleCanvasRef` desempacota canvas + refs, `useFloorPlanTools`, `BottomToolbar`, `plantaTravada`/`zoomNivel` states, `escalaAtual` prop |
| `frontend/src/api/client.js` | `api.obterGeometria(projectId)` |

---

## [2026-07-17] — Painel Dinâmico de Propriedades (Sidebar)

### ✨ Novas Funcionalidades

#### Sidebar com Two-Way Binding
- **Sem selecção:** Mostra `PainelGeral` com atalhos de teclado e dicas
- **Com selecção:** Lê `electricalData.type` do objecto activo no Fabric.js e renderiza formulário específico:
  - **Lâmpada:** Potência(VA) + olho, Tensão (radio 127/220), Comando + olho, Circuito + olho
  - **Interruptor:** Comando(Letra) + olho
  - **Tomada:** Nome + olho, Tipo (select), Potência + olho, Tensão (radio), Altura (select), Circuito + olho, Incluir Legenda (checkbox)
- **Ícone de Olho:** Alterna `visible` no `electricalData` para mostrar/esconder labels no canvas
- **Botão "Atualizar":** Sincroniza React → Fabric.js: actualiza `electricalData` no grupo, e itera sobre `fabric.IText` children com `data.labelKey` para actualizar texto e visibilidade

#### Componentes Reutilizáveis
- `InputWithVisibility` — input de texto + botão olho
- `RadioButtonGroup` — 127V/220V
- `SelectField` — dropdowns
- `CheckboxField` — checkbox com label

### 🐛 Correções
- Estabilização da ref do canvas (useRef em vez de criar objecto novo a cada render)
- Listeners do Fabric.js correctamente limpos no unmount

---

## [2026-07-17] — Ícones SVG + Tema

### ✨ Novas Funcionalidades

#### Ícones SVG para Componentes Eléctricos
- 13 ícones SVG normalizados (`viewBox="0 0 100 100"`, `stroke="#333333"`, `stroke-width="5"`)
- Categorias: Iluminação (lâmpada, arandela, tubular), Tomadas (baixa, média, alta, dupla, piso), Interruptores (simples, duplo, triplo, paralelo, bipolar)

#### Alternar Tema (Dark/Light Mode)
- Botão na toolbar para alternar entre dark mode e light mode
- Por padrão: light mode
- Cores do canvas, grelha, painéis e componentes adaptam-se ao tema

---

## [2026-07-16] — Configuração Inicial

### ✨ Funcionalidades Iniciais

#### Projecto Electrilal
- Sistema de projecto eléctrico para uso local
- Frontend: React + Vite + Fabric.js
- Backend: FastAPI + SQLite
- Upload e parsing de ficheiros DXF
- Canvas interactivo com zoom, pan, grelha dinâmica
- Componentes eléctricos (lâmpadas, tomadas, interruptores, telecom, passagens, quadro)
- Ligações/cabos entre componentes
- Divisões (Rooms) com GeoJSON
- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- Autosave com localStorage
- Exportação DXF
- Vista 3D
- Importação de PDF
