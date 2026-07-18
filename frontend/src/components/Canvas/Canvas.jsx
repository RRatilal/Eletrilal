import React, { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { useFabricCanvas, ESCALA_PX_POR_METRO } from "../../hooks/useFabricCanvas";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import "./Canvas.css";

/**
 * Área principal de desenho — ocupa toda a tela (fullscreen).
 * Suporta: drag-and-drop de componentes, modo de desenho de cabos,
 * criação e manipulação interativa de divisões (rooms),
 * Delete para apagar componentes, cabos e divisões.
 */
export default function Canvas({
  projectId,
  geometria,
  componentes,
  conexoes,
  rooms = [],
  modoCabo,
  onComponenteCriado,
  onComponenteAtualizado,
  onComponenteApagado,
  onConexaoCriada,
  onConexaoApagada,
  onCaboOrigemSelecionada,
  onRoomAtualizada,
  onRoomApagada,
  onGeometriaAtualizada,
  onGravarUndo,
  gridVisivel,
  onToggleGrid,
  onCanvasRef,
  floorPlanModifications,
  floorPlanPosition
}) {
  const containerRef = useRef(null);
  const canvasElRef = useRef(null);
  const appliedFloorPlanModsRef = useRef(null);
  const {
    fabricCanvasRef, pronto,
    desenharGeometria, desenharComponente,
    desenharConexao, desenharRoom, atualizarConexoes, encontrarComponenteEm,
    limpar, setGridVisible, toggleFloorPlanLock,
    geometriaRef, floorPlanGroupRef, floorPlanScaleRef,
    floorPlanClipRectRef, floorPlanModeRef,
  } = useFabricCanvas(canvasElRef, containerRef);
  const desenhadosRef = useRef(new Set());
  const toast = useToast();
  const [caboOrigem, setCaboOrigem] = useState(null);

  // Forward do fabricCanvasRef e refs do floor plan para o componente pai
  useEffect(() => {
    if (pronto && fabricCanvasRef.current && onCanvasRef) {
      onCanvasRef({
        canvas: fabricCanvasRef.current,
        toggleFloorPlanLock,
        geometriaRef,
        floorPlanGroupRef,
        floorPlanScaleRef,
        floorPlanClipRectRef,
        floorPlanModeRef,
      });
    }
  }, [pronto, fabricCanvasRef, geometriaRef, floorPlanGroupRef,
      floorPlanScaleRef, floorPlanClipRectRef, floorPlanModeRef, onCanvasRef]);

  // Sincronizar visibilidade da grelha
  useEffect(() => {
    if (pronto) setGridVisible(gridVisivel);
  }, [gridVisivel, pronto]);

  // Desenha a geometria + divisões (rooms) + componentes na inicialização/alterações estruturais
  useEffect(() => {
    if (!pronto) return;
    limpar();
    desenhadosRef.current = new Set();
    
    // 1. Desenhar a planta DXF de fundo
    const geoResult = desenharGeometria(geometria);
    if (geoResult?.modo === "agrupado" && geoResult.totalObjetos > 0) {
      toast.info(`Planta com ${geoResult.totalObjetos.toLocaleString()} linhas — modo agrupado (sem seleção individual de linhas)`);
    }
    
    // 2. Desenhar as divisões (rooms)
    rooms.forEach((r) => {
      desenharRoom(r, { onModified: handleRoomModified });
    });

    // 3. Desenhar componentes elétricos
    componentes.forEach((c) => {
      if (desenhadosRef.current.has(c.id)) return;
      desenhadosRef.current.add(c.id);
      desenharComponente(c, { onModified: handleModified });
    });
    
    // 4. Desenhar conexões elétricas (cabos)
    conexoes.forEach((con) => desenharConexao(con, componentes));

    // 5. Render único no fim (as funções de desenho já não chamam renderAll)
    fabricCanvasRef.current?.requestRenderAll();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, geometria, rooms]);

  // ─── Aplicar posição guardada da planta + floor plan modifications após geometria carregar ───
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    const grupo = floorPlanGroupRef?.current;
    if (!pronto || !canvas || !grupo) return;

    // Aplicar posição guardada (arrasto da planta)
    if (floorPlanPosition && (floorPlanPosition.left !== 0 || floorPlanPosition.top !== 0)) {
      grupo.set({ left: floorPlanPosition.left, top: floorPlanPosition.top });
      grupo.setCoords();
    }

    if (!floorPlanModifications) return;
    // Só aplicar uma vez por objecto de modificações
    if (appliedFloorPlanModsRef.current === floorPlanModifications) return;

    const mode = floorPlanModeRef?.current;
    if (!mode) return;

    // Re-aplicar clipPath (crop)
    if (floorPlanModifications.clipRect) {
      if (mode === "individual") {
        const clipRect = new fabric.Rect({
          left: floorPlanModifications.clipRect.left - (grupo.left || 0),
          top: floorPlanModifications.clipRect.top - (grupo.top || 0),
          width: floorPlanModifications.clipRect.width,
          height: floorPlanModifications.clipRect.height,
          originX: "left",
          originY: "top",
        });
        grupo.set("clipPath", clipRect);
        grupo.setCoords();
      } else if (mode === "agrupado" && floorPlanClipRectRef) {
        floorPlanClipRectRef.current = { ...floorPlanModifications.clipRect };
      }
    }

    // Re-aplicar escala (calibração) — modo individual
    if (floorPlanModifications.scale && floorPlanModifications.scale !== 1) {
      if (mode === "individual") {
        grupo.set({ scaleX: floorPlanModifications.scale, scaleY: floorPlanModifications.scale });
        grupo.setCoords();
      }
      // Modo agrupado: a escala já está aplicada nos dados de geometria
    }

    canvas.requestRenderAll();
    appliedFloorPlanModsRef.current = floorPlanModifications;
  }, [pronto, geometria, floorPlanModifications, floorPlanGroupRef, floorPlanModeRef, floorPlanClipRectRef]);

  // Adiciona componentes criados dinamicamente
  useEffect(() => {
    if (!pronto) return;
    let adicionou = false;
    componentes.forEach((c) => {
      if (desenhadosRef.current.has(c.id)) return;
      desenhadosRef.current.add(c.id);
      desenharComponente(c, { onModified: handleModified });
      adicionou = true;
    });
    if (adicionou) fabricCanvasRef.current?.requestRenderAll();
  }, [componentes, pronto]);

  // Atualiza conexões — usa requestRenderAll internamente
  useEffect(() => {
    if (!pronto) return;
    atualizarConexoes(conexoes, componentes);
  }, [conexoes, pronto]);

  // Modo de desenho de cabos
  useEffect(() => {
    if (!pronto || !modoCabo) {
      setCaboOrigem(null);
      return;
    }

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.setCursor("crosshair");
    canvas.selection = false;

    function handleClick(opt) {
      const pointer = canvas.getPointer(opt.e);
      const vpt = canvas.viewportTransform;
      const zoom = canvas.getZoom();
      const screenX = pointer.x * zoom + vpt[4];
      const screenY = pointer.y * zoom + vpt[5];

      const compId = encontrarComponenteEm({ x: screenX, y: screenY });
      if (!compId) return;

      if (!caboOrigem) {
        setCaboOrigem(compId);
        onCaboOrigemSelecionada?.(compId);
        toast.info("Clique no componente de destino para criar o cabo");
      } else {
        if (compId === caboOrigem) {
          toast.warning("Clique num componente diferente");
          return;
        }
        criarConexao(caboOrigem, compId);
        setCaboOrigem(null);
        onCaboOrigemSelecionada?.(null);
      }
    }

    canvas.on("mouse:down", handleClick);

    return () => {
      canvas.off("mouse:down", handleClick);
      canvas.setCursor("default");
      canvas.selection = true;
    };
  }, [pronto, modoCabo, caboOrigem]);

  useEffect(() => {
    if (!modoCabo) {
      setCaboOrigem(null);
    }
  }, [modoCabo]);

  // Evitar stale closures mantendo referências atualizadas em refs
  const callbacksRef = useRef({});
  callbacksRef.current = {
    caboOrigem,
    onCaboOrigemSelecionada,
    executarRemocoes,
  };

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;

        // Suporta tanto seleção unitária como seleção múltipla (ActiveSelection)
        const isMulti = activeObject.type === "activeSelection";
        const objectsToDelete = isMulti ? [...activeObject.getObjects()] : [activeObject];

        if (objectsToDelete.length === 0) return;

        const componentesParaApagar = [];
        const conexoesParaApagar = [];
        const roomsParaApagar = [];
        const dxfParaApagar = [];

        objectsToDelete.forEach((obj) => {
          if (obj.data?.componentId) {
            componentesParaApagar.push(obj);
          } else if (obj.data?.connectionId) {
            conexoesParaApagar.push(obj);
          } else if (obj.data?.roomId) {
            roomsParaApagar.push(obj);
          } else if (obj.data?.isDxfGeometry) {
            dxfParaApagar.push(obj);
          }
        });

        if (
          componentesParaApagar.length === 0 &&
          conexoesParaApagar.length === 0 &&
          roomsParaApagar.length === 0 &&
          dxfParaApagar.length === 0
        ) {
          return;
        }

        e.preventDefault();
        
        // Limpa a seleção ativa do canvas antes de remover para evitar glitches visuais no Fabric.js
        canvas.discardActiveObject();

        callbacksRef.current.executarRemocoes?.(
          componentesParaApagar,
          conexoesParaApagar,
          roomsParaApagar,
          dxfParaApagar
        );
      }

      if (e.key === "Escape" && callbacksRef.current.caboOrigem) {
        setCaboOrigem(null);
        callbacksRef.current.onCaboOrigemSelecionada?.(null);
        toast.info("Desenho de cabo cancelado");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function executarRemocoes(componentesParaApagar, conexoesParaApagar, roomsParaApagar, dxfParaApagar) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // 1. Remover fisicamente do Canvas de forma síncrona imediata
    // Isso dá feedback instantâneo ao utilizador
    if (dxfParaApagar.length > 0) {
      dxfParaApagar.forEach((obj) => canvas.remove(obj));
    }

    if (conexoesParaApagar.length > 0) {
      conexoesParaApagar.forEach((obj) => {
        const { connectionId } = obj.data;
        const glowObj = canvas.getObjects().find(
          (o) => o.data?.isConnectionGlow && o.data?.connectionId === connectionId
        );
        if (glowObj) canvas.remove(glowObj);
        canvas.remove(obj);
      });
    }

    if (componentesParaApagar.length > 0) {
      componentesParaApagar.forEach((obj) => {
        canvas.remove(obj);
        desenhadosRef.current.delete(obj.data.componentId);
      });
    }

    if (roomsParaApagar.length > 0) {
      roomsParaApagar.forEach((obj) => canvas.remove(obj));
    }

    canvas.renderAll();

    // 2. Agendar as atualizações de estado e chamadas de API para o próximo tick do event loop.
    // Isto evita loops recursivos síncronos (stack overflow) com o Fabric.js.
    setTimeout(() => {
      // Gravar undo uma vez
      if (dxfParaApagar.length > 0 || componentesParaApagar.length > 0 || conexoesParaApagar.length > 0 || roomsParaApagar.length > 0) {
        onGravarUndo?.();
      }

      // Atualizar Geometria DXF
      if (dxfParaApagar.length > 0) {
        reconstruirGeometria();
        const txt = dxfParaApagar.length === 1 ? "Linha removida" : `${dxfParaApagar.length} linhas removidas`;
        toast.info(txt);
      }

      // Atualizar Conexões (API batch + React State)
      if (conexoesParaApagar.length > 0) {
        const connectionIds = conexoesParaApagar.map((obj) => obj.data.connectionId);
        onConexaoApagada?.(connectionIds);
        api.apagarConexoesBatch(connectionIds).catch((err) => console.warn("Erro API batch conexoes:", err));
      }

      // Atualizar Componentes (API batch + React State)
      if (componentesParaApagar.length > 0) {
        const componentIds = componentesParaApagar.map((obj) => obj.data.componentId);
        onComponenteApagado?.(componentIds);
        api.apagarComponentesBatch(componentIds).catch((err) => console.error("Erro API batch componentes:", err));
      }

      // Atualizar Divisões (API batch + React State)
      if (roomsParaApagar.length > 0) {
        const roomIds = roomsParaApagar.map((obj) => obj.data.roomId);
        onRoomApagada?.(roomIds);
        api.apagarRoomsBatch(roomIds).catch((err) => console.error("Erro API batch rooms:", err));
        toast.success(roomIds.length === 1 ? "Divisão removida" : `${roomIds.length} divisões removidas`);
      }
    }, 0);
  }

  async function criarConexao(origemId, destinoId) {
    try {
      const novaConexao = await api.criarConexao(projectId, {
        origem_id: origemId,
        destino_id: destinoId,
      });
      onConexaoCriada?.(novaConexao);
      toast.success("Cabo criado");
    } catch (err) {
      toast.error(err.message);
    }
  }

  function reconstruirGeometria() {
    if (!onGeometriaAtualizada) return;
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Se a geometria está em modo agrupado (Path único), não tentar reconstruir
    // a partir de objetos individuais — preservar os dados originais
    const hasGroupedPath = canvas.getObjects().some(
      (obj) => obj.data?.isGroupedPath
    );
    if (hasGroupedPath) {
      // Nada a reconstruir — a geometria agrupada não é editável individualmente
      return;
    }

    const linhas = [];
    const circulos = [];
    canvas.getObjects().forEach((obj) => {
      if (!obj.data?.isDxfGeometry) return;
      if (obj.type === "line") {
        linhas.push({
          x1: Math.round(obj.x1 / ESCALA_PX_POR_METRO * 10000) / 10000,
          y1: Math.round(-obj.y1 / ESCALA_PX_POR_METRO * 10000) / 10000,
          x2: Math.round(obj.x2 / ESCALA_PX_POR_METRO * 10000) / 10000,
          y2: Math.round(-obj.y2 / ESCALA_PX_POR_METRO * 10000) / 10000,
        });
      } else if (obj.type === "circle") {
        const cx = (obj.left + obj.radius) / ESCALA_PX_POR_METRO;
        const cy = -(obj.top + obj.radius) / ESCALA_PX_POR_METRO;
        circulos.push({
          cx: Math.round(cx * 10000) / 10000,
          cy: Math.round(cy * 10000) / 10000,
          raio: Math.round(obj.radius / ESCALA_PX_POR_METRO * 10000) / 10000,
        });
      }
    });
    onGeometriaAtualizada((prev) => ({
      ...prev,
      linhas,
      circulos,
    }));
  }

  async function handleModified(grupo) {
    const { componentId } = grupo.data;
    const x = grupo.left / ESCALA_PX_POR_METRO;
    const y = -grupo.top / ESCALA_PX_POR_METRO;
    try {
      const atualizado = await api.atualizarComponente(componentId, { x, y });
      onComponenteAtualizado?.(atualizado);
    } catch (err) {
      toast.error(`Erro ao atualizar posição: ${err.message}`);
    }
  }

  async function handleRoomModified(grupo, width, height) {
    const { roomId } = grupo.data;
    
    // Converter de pixels de volta para metros mundiais cartesianos
    const world_x = grupo.left / ESCALA_PX_POR_METRO;
    const world_y = -grupo.top / ESCALA_PX_POR_METRO;
    const world_w = width / ESCALA_PX_POR_METRO;
    const world_h = height / ESCALA_PX_POR_METRO;

    // Criar o polígono GeoJSON retangular fechado (5 pontos)
    const geojsonObj = {
      type: "Polygon",
      coordinates: [[
        [world_x, world_y],
        [world_x + world_w, world_y],
        [world_x + world_w, world_y - world_h],
        [world_x, world_y - world_h],
        [world_x, world_y]
      ]]
    };

    try {
      const atualizada = await api.atualizarRoom(roomId, {
        poligono_geojson: JSON.stringify(geojsonObj)
      });
      onRoomAtualizada?.(atualizada);
    } catch (err) {
      toast.error(`Erro ao atualizar divisão: ${err.message}`);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    if (modoCabo) return;
    const tipo = e.dataTransfer.getData("tipo-componente");
    if (!tipo || !projectId) return;

    const canvas = fabricCanvasRef.current;
    const rect = canvasElRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Converter coordenadas de ecrã para mundo, considerando zoom e pan
    const zoom = canvas ? canvas.getZoom() : 1;
    const vpt = canvas ? canvas.viewportTransform : [1, 0, 0, 1, 0, 0];
    const x = (px - vpt[4]) / zoom / ESCALA_PX_POR_METRO;
    const y = -((py - vpt[5]) / zoom) / ESCALA_PX_POR_METRO;

    try {
      const novoComponente = await api.criarComponente(projectId, {
        tipo,
        x,
        y,
        potencia_w: 0,
        rotulo: tipo,
      });
      onComponenteCriado?.(novoComponente);
    } catch (err) {
      toast.error(`Erro ao criar componente: ${err.message}`);
    }
  }

  return (
    <div
      ref={containerRef}
      className={`editor-canvas-area ${modoCabo ? "modo-cabo" : ""}`}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <canvas ref={canvasElRef} id="fabric-canvas" />
      <div className="canvas-coords" id="canvas-coords" />

      {modoCabo && (
        <div className="cable-mode-banner">
          {caboOrigem
            ? "🔗 Clique no componente de destino (Esc para cancelar)"
            : "🔗 Clique no componente de origem"
          }
        </div>
      )}
    </div>
  );
}
