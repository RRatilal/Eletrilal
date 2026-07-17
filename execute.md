# Plano de Implementação: Otimização de Performance da Plataforma CAD Elétrica

Este plano de implementação visa aplicar diretrizes rígidas de otimização na plataforma CAD Elétrica, com foco em resolver problemas de rendering no 3D (Three.js), simplificar o estado do editor 2D (Fabric.js), acelerar o processamento geométrico no backend (Shapely e ezdxf) e otimizar a concorrência na base de dados (SQLite WAL).

---

## User Review Required

> [!IMPORTANT]
> **Modificações Estruturais no Canvas3D:**
> A alteração do loop de animação contínuo (`requestAnimationFrame`) para **Render on Demand** (renderização sob demanda) alterará a forma como controlos de câmara e atualizações de propriedades disparam redesenhos no WebGL. É crítico garantir que todos os eventos do `OrbitControls` e as mudanças de *props* do React invoquem a função de renderização.

> [!WARNING]
> **Normalização de Coordenadas:**
> A translação das geometrias para o centro `(0, 0)` no backend exige que o frontend saiba reposicionar e aplicar o `offset` correto ao exportar de volta para o formato real do DXF. Isso garante precisão no WebGL (evitando o tremor ou *jitter* de câmara), mas adiciona uma camada de mapeamento de coordenadas.

---

## Open Questions

> [!NOTE]
> **Qual o nível aceitável de simplificação geométrica no Shapely?**
> A tolerância da simplificação (`shape.simplify(tolerance)`) influencia diretamente o número de vértices das polilinhas (paredes/divisões) enviados do Python para o frontend. Propomos uma tolerância inicial de `0.02` (2 cm), ajustável conforme a complexidade do projeto.

---

## Proposed Changes

### 1. Frontend: Camada 3D (Three.js)

#### [MODIFY] [Canvas3D.jsx](file:///media/ratilal/Ratilal/Projectos/Electrilal/frontend/src/components/Canvas/Canvas3D.jsx)
*   **InstancedMesh para Componentes:** Agrupar componentes elétricos repetitivos (tomadas, interruptores, lâmpadas) por tipo e renderizá-los usando `THREE.InstancedMesh` em vez de criar instâncias de `THREE.Mesh` individuais dentro do ciclo `componentes.forEach`.
*   **Render on Demand:** Remover o loop `requestAnimationFrame` contínuo. Criar uma função dedicada `requestRender` que execute `renderer.render(scene, camera)`. Registar esta função no evento `change` dos `OrbitControls` e invocá-la sempre que as propriedades (`geometria`, `componentes`, `conexoes`) mudarem.
*   **Merge de Geometrias das Divisões:** Utilizar `BufferGeometryUtils.mergeGeometries` para fundir as caixas de chão e paredes estáticas de todas as divisões (*rooms*) numa única geometria, reduzindo o número de *Draw Calls*.
*   **Limpeza Rigorosa (Dispose):** No retorno de limpeza do `useEffect`, percorrer todos os objetos criados e chamar explicitamente o método `.dispose()` nas geometrias e materiais para prevenir fugas de memória (*memory leaks*).
*   **Geometria de Fios Otimizada:** Assegurar que as conexões usam geometrias de linhas simples (`LineSegments`), evitando `TubeGeometry` para conexões extensas.

---

### 2. Frontend: Integração React & Fabric.js

#### [MODIFY] [Canvas.jsx](file:///media/ratilal/Ratilal/Projectos/Electrilal/frontend/src/components/Canvas/Canvas.jsx)
*   **Gestão de Instâncias:** Garantir que o estado interno do canvas do Fabric.js e outras instâncias de utilitários sejam estritamente mantidos em referências React (`useRef`) para evitar renderizações cíclicas da árvore do React.
*   **Sincronização Otimizada (Debounced Sync):** Sincronizar as atualizações geométricas pesadas com o backend e o Three.js apenas ao disparar o evento `object:modified` (final do arrastamento) em vez de no `object:moving`.

---

### 3. Backend: Processamento Geométrico & Cache (Python)

#### [MODIFY] [dxf_parser.py](file:///media/ratilal/Ratilal/Projectos/Electrilal/backend/dxf_parser.py)
*   **Simplificação de Polilinhas:** Aplicar `shape.simplify(0.02)` via Shapely na extração de polilinhas provenientes de ficheiros DXF complexos antes de os serializar para o formato de resposta JSON.
*   **Normalização na Origem:** Transladar todas as coordenadas extraídas de forma a centrar o desenho em `(0, 0)`. Calcular o `offset` correspondente e devolvê-lo na resposta da API para permitir a re-exportação correta.

#### [MODIFY] [pdf_plant_builder.py](file:///media/ratilal/Ratilal/Projectos/Electrilal/backend/pdf_plant_builder.py)
*   **Simplificação e Otimização de Geometria de PDF:** Filtrar e simplificar os segmentos extraídos do PDF via Shapely antes do processamento e exportação para o frontend.
*   **Cache de Parsing:** Adicionar um mecanismo de cache (usando tabelas de metadados SQLite ou cache em memória) baseado no hash do ficheiro carregado. Se o hash do DXF ou PDF for idêntico, saltar o parsing pesado e retornar diretamente a geometria guardada.

---

### 4. Backend: Rotas & Base de Dados

#### [MODIFY] [database.py](file:///media/ratilal/Ratilal/Projectos/Electrilal/backend/database.py)
*   **Configuração de Modo WAL no SQLite:** Alterar as definições do motor SQLAlchemy para correr comandos PRAGMA na abertura de ligações, ativando `PRAGMA journal_mode=WAL;` e `PRAGMA synchronous=NORMAL;` para otimizar escritas concorrentes em grandes volumes de dados.

#### [MODIFY] [routers/projects.py](file:///media/ratilal/Ratilal/Projectos/Electrilal/backend/routers/projects.py)
*   **Dijkstra Assíncrono:** Ajustar a rota de cálculo de dimensionamento/grafos para utilizar `BackgroundTasks` do FastAPI se o número de conexões ou nós do grafo ultrapassar um limite pré-definido.

---

## Verification Plan

### Automated Tests
- Testar a velocidade do parsing com e sem cache executando os scripts ad-hoc:
  ```bash
  python test_extractor.py
  ```
- Validar a corretude da simplificação de polilinhas verificando o número final de vértices.

### Manual Verification
1.  **Monitorização de Performance (DevTools Chrome):**
    *   Abrir a aba de Rendering no Chrome DevTools e validar que o número de *Draw Calls* no 3D caiu significativamente com a aplicação do Instancing nas tomadas/lâmpadas.
    *   Monitorizar o contador de frames (FPS) durante a rotação da câmara em projetos grandes, visando manter estável nos 60 FPS.
2.  **Verificação de Memory Leaks:**
    *   Montar e desmontar a aba 3D consecutivamente e observar a memória heap do JavaScript no gestor de tarefas do browser para garantir que não há acumulação de geometrias/materiais ativos.
3.  **Teste de Concorrência da Base de Dados:**
    *   Efetuar operações de escrita no canvas (por exemplo, mover múltiplos componentes simultaneamente) enquanto se realizam pedidos de leitura da API, confirmando o bom funcionamento do SQLite em modo WAL (Write-Ahead Logging).
