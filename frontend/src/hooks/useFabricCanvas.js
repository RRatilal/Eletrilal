/**
 * useFabricCanvas.js — Hook principal que compõe sub-hooks especializados.
 *
 * Sub-hooks:
 *   - useMagneticSnap.js: Constantes, funções de snap e grelha espacial
 *   - useDxfRenderer.js:  Render nativo 2D (grid + DXF)
 *   - useFloorPlanRenderer.js: Render de planta, componentes, conexões, divisões
 *
 * Exporta:
 *   - useFabricCanvas (hook principal)
 *   - ESCALA_PX_POR_METRO (constante)
 *   - getClosestPointOnSegment, getPerpendicularSnapAngle (utilitários)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import {
  ESCALA_PX_POR_METRO,
  getClosestPointOnSegment,
  getPerpendicularSnapAngle,
  queryWallLinesGrid,
} from "./useMagneticSnap";
import { drawDynamicGrid, drawDxfGeometry, drawFiacaoTicks } from "./useDxfRenderer";
import { useFloorPlanRenderer } from "./useFloorPlanRenderer";

// Re-exportar constantes e utilitários para compatibilidade
export { ESCALA_PX_POR_METRO, getClosestPointOnSegment, getPerpendicularSnapAngle };

/**
 * Hook que inicializa e gere o canvas Fabric.js (fullscreen).
 * Suporta: dark mode, zoom (scroll), pan (Space+drag ou middle-click),
 * grelha dinâmica, coordenadas do rato, magnetic snap.
 *
 * Composição: usa useFloorPlanRenderer para desenhar planta/componentes.
 */
export function useFabricCanvas(canvasElRef, containerRef) {
  const fabricCanvasRef = useRef(null);
  const [pronto, setPronto] = useState(false);
  const isPanningRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const gridVisibleRef = useRef(true);
  const fiacaoRef = useRef(null);          // dados de /eletrodutos/fiacao, indexados por connection_id
  const fiacaoVisivelRef = useRef(false);  // toggle de visibilidade da fiação

  // Refs partilhados com sub-hooks
  const geometriaRef = useRef(null);
  const floorPlanGroupRef = useRef(null);
  const floorPlanScaleRef = useRef(1);
  const floorPlanClipRectRef = useRef(null);
  const floorPlanModeRef = useRef(null);
  const wallLinesSpatialGridRef = useRef({ cellSize: 150, grid: new Map(), lines: [] });

  // Sub-hook: renderização da planta
  const {
    desenharGeometria,
    desenharComponente,
    desenharFitaLed,
    desenharConexao,
    atualizarConexoes,
    encontrarComponenteEm,
    desenharRoom,
    limpar: limparRenderer,
    atualizarLinhasDoComponente,
  } = useFloorPlanRenderer(
    fabricCanvasRef, geometriaRef, floorPlanGroupRef,
    floorPlanScaleRef, floorPlanClipRectRef, floorPlanModeRef, wallLinesSpatialGridRef
  );

  function getCanvasBg() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas").trim() || "#e8ecf0";
    } catch {
      return "#e8ecf0";
    }
  }

  // ─── Inicialização do Canvas (useEffect único) ─────────────────────────
  useEffect(() => {
    if (!canvasElRef.current || !containerRef?.current) return;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      backgroundColor: getCanvasBg(),
      selection: true,
      selectionColor: "rgba(255, 166, 43, 0.16)",
      selectionBorderColor: "rgba(255, 166, 43, 0.65)",
      selectionLineWidth: 1,
      selectionKey: ["shiftKey", "ctrlKey", "metaKey"],
      fireRightClick: true,
      stopContextMenu: true,
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;

    // Resize
    const resize = () => {
      const container = containerRef.current;
      if (!container) return;
      canvas.setWidth(container.clientWidth);
      canvas.setHeight(container.clientHeight);
      canvas.renderAll();
    };
    resize();
    window.addEventListener("resize", resize);

    // After render: grid + DXF geometry + fiação dos eletrodutos
    canvas.on("after:render", () => {
      drawDynamicGrid(canvas, gridVisibleRef);
      drawDxfGeometry(canvas, geometriaRef, floorPlanGroupRef, floorPlanClipRectRef);
      drawFiacaoTicks(canvas, fiacaoRef, fiacaoVisivelRef);
    });

    // Zoom (scroll)
    canvas.on("mouse:wheel", (opt) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** e.deltaY;
      zoom = Math.min(Math.max(zoom, 0.05), 20);
      canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
      canvas.renderAll();
      updateCoordsDisplay(e.offsetX, e.offsetY, canvas);
    });

    // Pan (middle mouse or Space+drag)
    canvas.on("mouse:down", (opt) => {
      const e = opt.e;
      if (e.button === 1 || spaceHeldRef.current) {
        isPanningRef.current = true;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        canvas.setCursor("grabbing");
        canvas.selection = false;
        e.preventDefault();
      }
    });

    canvas.on("mouse:move", (opt) => {
      const e = opt.e;
      updateCoordsDisplay(e.offsetX, e.offsetY, canvas);
      if (isPanningRef.current) {
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        const vpt = canvas.viewportTransform;
        vpt[4] += dx;
        vpt[5] += dy;
        canvas.requestRenderAll();
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }
    });

    canvas.on("mouse:up", () => {
      isPanningRef.current = false;
      if (!spaceHeldRef.current) {
        canvas.setCursor("default");
        canvas.selection = true;
      }
    });

    // Magnetic Snap (object:moving)
    canvas.on("object:moving", (opt) => {
      const obj = opt.target;
      if (!obj) return;

      const edType = obj.electricalData?.type || obj.data?.tipo || obj.tipo || "";
      const isWallComp =
        edType.startsWith("tomada") || edType.startsWith("interruptor") || edType === "quadro" ||
        edType.startsWith("caixa_passagem") || edType.startsWith("passagem");
      if (!isWallComp) return;

      const center = obj.getCenterPoint();
      const px = center.x, py = center.y;
      const SNAP_THRESHOLD = 20;
      const candidates = queryWallLinesGrid(px, py, wallLinesSpatialGridRef, SNAP_THRESHOLD);
      if (candidates.length === 0) return;

      let closest = null, minDist = Infinity;
      for (const line of candidates) {
        const res = getClosestPointOnSegment(px, py, line.x1, line.y1, line.x2, line.y2);
        if (res.distance < minDist) { minDist = res.distance; closest = res; }
      }

      if (closest && minDist <= SNAP_THRESHOLD) {
        const snappedAngle = getPerpendicularSnapAngle(closest.lineAngle, closest.x, closest.y, px, py);
        const offsetPx = 0.5;
        const rad = (snappedAngle * Math.PI) / 180;
        obj.setPositionByOrigin(
          new fabric.Point(closest.x + Math.sin(rad) * offsetPx, closest.y - Math.cos(rad) * offsetPx),
          obj.originX || "center", obj.originY || "center"
        );
        obj.set("angle", Math.round(snappedAngle));
        obj.setCoords();
      }
    });

    // Space key for pan mode
    function handleKeyDown(e) {
      if (e.code === "Space" && !e.repeat && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        spaceHeldRef.current = true;
        canvas.setCursor("grab");
        canvas.selection = false;
        canvas.forEachObject((obj) => { obj._origSelectable = obj.selectable; obj.selectable = false; });
      }
    }
    function handleKeyUp(e) {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        isPanningRef.current = false;
        canvas.setCursor("default");
        canvas.selection = true;
        canvas.forEachObject((obj) => {
          if (obj._origSelectable !== undefined) { obj.selectable = obj._origSelectable; delete obj._origSelectable; }
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Theme observer
    const themeObserver = new MutationObserver(() => {
      canvas.backgroundColor = getCanvasBg();
      canvas.renderAll();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    setPronto(true);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      themeObserver.disconnect();
      canvas.dispose();
    };
  }, [canvasElRef, containerRef]);

  // ─── Coordinates display ────────────────────────────────────────────────
  function updateCoordsDisplay(px, py, canvas) {
    const el = document.getElementById("canvas-coords");
    if (!el) return;
    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform;
    const worldX = ((px - vpt[4]) / zoom / ESCALA_PX_POR_METRO).toFixed(2);
    const worldY = (-(py - vpt[5]) / zoom / ESCALA_PX_POR_METRO).toFixed(2);
    el.textContent = `X: ${worldX}m  Y: ${worldY}m  Zoom: ${Math.round(zoom * 100)}%`;
  }

  // ─── Exportar PNG ───────────────────────────────────────────────────────
  const exportarPNG = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const dataURL = canvas.toDataURL({ format: "png", quality: 1, multiplier: 2 });
    const link = document.createElement("a");
    link.href = dataURL;
    link.download = `electrilal_planta_${Date.now()}.png`;
    link.click();
  }, [fabricCanvasRef]);

  // ─── Toggle floor plan lock ─────────────────────────────────────────────
  const toggleFloorPlanLock = useCallback(() => {
    const grupo = floorPlanGroupRef.current;
    if (!grupo) return false;
    const currentlyLocked = grupo.selectable === false;
    grupo.set({
      selectable: currentlyLocked,
      evented: currentlyLocked,
      hoverCursor: currentlyLocked ? "pointer" : "default",
    });
    return !currentlyLocked;
  }, [floorPlanGroupRef]);

  // ─── Grid visibility ────────────────────────────────────────────────────
  const setGridVisible = useCallback((visible) => {
    gridVisibleRef.current = visible;
    fabricCanvasRef.current?.requestRenderAll();
  }, [fabricCanvasRef]);

  // ─── Fiação dos eletrodutos (chicote de condutores) ─────────────────────
  const carregarFiacao = useCallback(async (projectId, apiClient) => {
    try {
      const resultado = await apiClient.obterFiacaoEletrodutos(projectId);
      const porConexao = {};
      resultado.eletrodutos.forEach((e) => {
        porConexao[e.connection_id] = e;
      });
      fiacaoRef.current = porConexao;
      fiacaoVisivelRef.current = true;
      fabricCanvasRef.current?.requestRenderAll();
      return true;
    } catch (err) {
      fiacaoRef.current = null;
      fiacaoVisivelRef.current = false;
      fabricCanvasRef.current?.requestRenderAll();
      return false;
    }
  }, [fabricCanvasRef]);

  const ocultarFiacao = useCallback(() => {
    fiacaoVisivelRef.current = false;
    fabricCanvasRef.current?.requestRenderAll();
  }, [fabricCanvasRef]);

  // ─── Limpar (delega para useFloorPlanRenderer) ──────────────────────────
  const limpar = useCallback(() => {
    limparRenderer();
    fabricCanvasRef.current?.requestRenderAll();
  }, [limparRenderer, fabricCanvasRef]);

  return {
    fabricCanvasRef,
    pronto,
    desenharGeometria,
    desenharComponente,
    desenharFitaLed,
    desenharConexao,
    atualizarConexoes,
    encontrarComponenteEm,
    desenharRoom,
    limpar,
    setGridVisible,
    carregarFiacao,
    ocultarFiacao,
    toggleFloorPlanLock,
    exportarPNG,
    geometriaRef,
    floorPlanGroupRef,
    floorPlanScaleRef,
    floorPlanClipRectRef,
    floorPlanModeRef,
    atualizarLinhasDoComponente,
  };
}
