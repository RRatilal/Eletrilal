import { useState, useEffect, useCallback, useRef } from "react";
import * as fabric from "fabric";

/**
 * useFloorPlanTools
 *
 * Hook que gere as 3 ferramentas de edição da planta (floor plan):
 * 1. Crop   — clipPath no grupo da planta via rect desenhado
 * 2. Calibr — linha de calibração para re-escalar a planta
 * 3. Erase  — apagar objetos do grupo contidos 100% no rect
 *
 * Fluxo Two-Step:
 *   Fase 1 (Desenho): Utilizador ativa ferramenta e desenha forma no Canvas.
 *                      A forma fica visível e guardada em tempSelection.
 *   Fase 2 (Execução): Utilizador clica em "Confirmar" na Sidebar.
 *                      A ação é aplicada e a forma temporária é removida.
 */
export function useFloorPlanTools({
  fabricCanvasRef,
  floorPlanGroupRef,
  geometriaRef,
  floorPlanScaleRef,
  floorPlanClipRectRef,
  floorPlanModeRef,
  onModified,       // callback(state) — chamado após cada confirmação para persistir
}) {
  const [activeTool, setActiveTool] = useState(null); // null | 'crop' | 'calibr' | 'erase'
  const [calibResult, setCalibResult] = useState(null); // { distanciaPixeis } | null
  const [tempSelection, setTempSelection] = useState(null); // { x, y, w, h } | { x1,y1,x2,y2 } | null
  const tempDrawRef = useRef(null);     // Objeto temporário (rect ou linha) no canvas
  const isDrawingRef = useRef(false);
  const startPointRef = useRef(null);

  // ─── Limpar / desativar ferramenta ────────────────────────────────────
  const desativarFerramenta = useCallback(() => {
    const canvas = fabricCanvasRef?.current;
    if (canvas) {
      canvas.selection = true;
      canvas.defaultCursor = "default";
      canvas.isDrawingMode = false;
    }
    // Restaurar selectable/evented do floor plan (estado anterior à ferramenta)
    const grupo = floorPlanGroupRef?.current;
    if (grupo) {
      const origSel = grupo._fpToolSelectable;
      const origEvt = grupo._fpToolEvented;
      // Se tinha valores guardados, restaura; senão, unlocked (true)
      const restoreSelectable = origSel !== undefined ? origSel : true;
      const restoreEvented = origEvt !== undefined ? origEvt : true;
      grupo.set({
        selectable: restoreSelectable,
        evented: restoreEvented,
        hoverCursor: restoreSelectable ? 'pointer' : 'default',
      });
      delete grupo._fpToolSelectable;
      delete grupo._fpToolEvented;
    }
    if (tempDrawRef.current && canvas) {
      canvas.remove(tempDrawRef.current);
      tempDrawRef.current = null;
    }
    isDrawingRef.current = false;
    startPointRef.current = null;
    setActiveTool(null);
    setTempSelection(null);
    setCalibResult(null);
    fabricCanvasRef?.current?.renderAll();
  }, [fabricCanvasRef, floorPlanGroupRef]);

  // ─── Iniciar ferramentas ──────────────────────────────────────────────
  // Helper: forçar cursor crosshair no floor plan group
  const setFloorPlanCursorCrosshair = useCallback(() => {
    const grupo = floorPlanGroupRef?.current;
    if (grupo) {
      grupo.set('hoverCursor', 'crosshair');
    }
  }, [floorPlanGroupRef]);

  // Helper: desativar selectable/evented do floor plan durante ferramenta
  const disableFloorPlanInteraction = useCallback(() => {
    const grupo = floorPlanGroupRef?.current;
    if (grupo) {
      // Guardar estado original para restaurar depois
      grupo._fpToolSelectable = grupo.selectable;
      grupo._fpToolEvented = grupo.evented;
      grupo.set({
        selectable: false,
        evented: false,
        hoverCursor: 'crosshair',
      });
    }
  }, [floorPlanGroupRef]);

  const iniciarCrop = useCallback(() => {
    if (!fabricCanvasRef?.current) return;
    desativarFerramenta();
    setActiveTool("crop");
    setTempSelection(null);
    fabricCanvasRef.current.selection = false;
    fabricCanvasRef.current.defaultCursor = "crosshair";
    disableFloorPlanInteraction();
  }, [fabricCanvasRef, desativarFerramenta, disableFloorPlanInteraction]);

  const iniciarCalibracao = useCallback(() => {
    if (!fabricCanvasRef?.current) return;
    desativarFerramenta();
    setActiveTool("calibr");
    setTempSelection(null);
    setCalibResult(null);
    fabricCanvasRef.current.selection = false;
    fabricCanvasRef.current.defaultCursor = "crosshair";
    disableFloorPlanInteraction();
  }, [fabricCanvasRef, desativarFerramenta, disableFloorPlanInteraction]);

  const iniciarLimpeza = useCallback(() => {
    if (!fabricCanvasRef?.current) return;
    desativarFerramenta();
    setActiveTool("erase");
    setTempSelection(null);
    fabricCanvasRef.current.selection = false;
    fabricCanvasRef.current.defaultCursor = "crosshair";
    disableFloorPlanInteraction();
  }, [fabricCanvasRef, desativarFerramenta, disableFloorPlanInteraction]);

  // ─── Confirmar Crop (Fase 2) ──────────────────────────────────────────
  const confirmarCrop = useCallback(() => {
    const canvas = fabricCanvasRef?.current;
    if (!canvas || !tempSelection || activeTool !== "crop") return;
    const { x, y, w, h } = tempSelection;
    if (w <= 5 || h <= 5) return;

    const grupo = floorPlanGroupRef?.current;
    if (!grupo) return;

    const clipRect = new fabric.Rect({
      left: x - (grupo.left || 0),
      top: y - (grupo.top || 0),
      width: w,
      height: h,
      originX: "left",
      originY: "top",
    });

    if (floorPlanModeRef?.current === "individual") {
      grupo.set("clipPath", clipRect);

      // Remover objetos 100% fora do rect de crop para encolher a bounding box
      const toRemove = [];
      grupo.forEachObject((child) => {
        const bbox = child.getBoundingRect();
        const outside = bbox.left + bbox.width < x ||
                        bbox.top + bbox.height < y ||
                        bbox.left > x + w ||
                        bbox.top > y + h;
        if (outside) toRemove.push(child);
      });
      toRemove.forEach((child) => grupo.removeWithUpdate(child));
      grupo.setCoords();

      // Sincronizar geometriaRef para persistência (eliminar objetos removidos)
      if (geometriaRef?.current && toRemove.length > 0) {
        const data = geometriaRef.current;
        toRemove.forEach((removed) => {
          const bbox = removed.getBoundingRect();
          data.linhas = data.linhas.filter((l) => {
            const match = Math.abs(l.x1 - bbox.left) < 5 && Math.abs(l.y1 - bbox.top) < 5
                       && Math.abs(l.x2 - (bbox.left + bbox.width)) < 5
                       && Math.abs(l.y2 - (bbox.top + bbox.height)) < 5;
            return !match;
          });
          data.circulos = data.circulos.filter((c) => {
            const match = Math.abs(c.cx - (bbox.left + bbox.width / 2)) < 5
                       && Math.abs(c.cy - (bbox.top + bbox.height / 2)) < 5;
            return !match;
          });
        });
      }
    } else if (floorPlanModeRef?.current === "agrupado" && floorPlanClipRectRef) {
      floorPlanClipRectRef.current = { left: x, top: y, width: w, height: h };
    }

    // Remover temp draw
    if (tempDrawRef.current && canvas) {
      canvas.remove(tempDrawRef.current);
      tempDrawRef.current = null;
    }
    canvas.renderAll();

    // ─── Persistir estado da planta após crop ──────────────
    if (onModified) {
      const clipRect = floorPlanClipRectRef?.current
        ? { ...floorPlanClipRectRef.current }
        : null;
      onModified({
        geometria: geometriaRef?.current
          ? JSON.parse(JSON.stringify(geometriaRef.current))
          : null,
        clipRect,
        scale: floorPlanScaleRef?.current || 1,
        mode: floorPlanModeRef?.current || "individual",
      });
    }

    desativarFerramenta();
  }, [fabricCanvasRef, tempSelection, activeTool, floorPlanGroupRef, floorPlanModeRef, floorPlanClipRectRef, geometriaRef, floorPlanScaleRef, onModified, desativarFerramenta]);

  // ─── Confirmar Limpeza (Fase 2) ───────────────────────────────────────
  const confirmarLimpeza = useCallback(() => {
    const canvas = fabricCanvasRef?.current;
    if (!canvas || !tempSelection || activeTool !== "erase") return;
    const { x, y, w, h } = tempSelection;
    if (w <= 5 || h <= 5) return;

    const grupo = floorPlanGroupRef?.current;
    if (!grupo) return;

    if (floorPlanModeRef?.current === "individual" && grupo.type === "group") {
      // ─── Modo individual: remover objetos 100% contidos ─────
      const testRect = new fabric.Rect({
        left: x, top: y, width: w, height: h,
      });

      const toRemove = [];
      grupo.forEachObject((child) => {
        if (child.isContainedWithinObject(testRect)) {
          toRemove.push(child);
        }
      });
      toRemove.forEach((child) => grupo.removeWithUpdate(child));
      grupo.setCoords();
      canvas.renderAll();

      // ─── Sincronizar geometriaRef para persistência ─────
      if (geometriaRef?.current) {
        const data = geometriaRef.current;
        // Remover linhas contidas (usando bounding box de cada child)
        // Como não temos referência direta, marcamos como removido
        // usando coordenadas aproximadas
        toRemove.forEach((removed) => {
          const bbox = removed.getBoundingRect();
          data.linhas = data.linhas.filter((l) => {
            const px1 = l.x1, py1 = l.y1;
            const px2 = l.x2, py2 = l.y2;
            // Verifica se a linha corresponde ao objeto removido (margem 5px)
            const match = Math.abs(px1 - bbox.left) < 5 && Math.abs(py1 - bbox.top) < 5
                       && Math.abs(px2 - (bbox.left + bbox.width)) < 5
                       && Math.abs(py2 - (bbox.top + bbox.height)) < 5;
            return !match;
          });
          // Remover círculos
          data.circulos = data.circulos.filter((c) => {
            const match = Math.abs(c.cx - (bbox.left + bbox.width / 2)) < 5
                       && Math.abs(c.cy - (bbox.top + bbox.height / 2)) < 5;
            return !match;
          });
        });
      }
    } else if (floorPlanModeRef?.current === "agrupado" && geometriaRef) {
      // ─── Modo agrupado: remover de geometriaRef ────────────
      const data = geometriaRef.current;
      if (data) {
        data.linhas = data.linhas.filter((l) => {
          // Remove linha APENAS se ambos os pontos estão DENTRO do rect
          const inside = l.x1 >= x && l.x1 <= x + w &&
                         l.y1 >= y && l.y1 <= y + h &&
                         l.x2 >= x && l.x2 <= x + w &&
                         l.y2 >= y && l.y2 <= y + h;
          return !inside;
        });
        data.circulos = data.circulos.filter((c) => {
          return !(c.cx >= x && c.cx <= x + w && c.cy >= y && c.cy <= y + h);
        });
        data.polilinhas = data.polilinhas.filter((p) => {
          const allInside = p.pontos.every(
            (pt) => pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h
          );
          return !allInside;
        });
        canvas.renderAll();
      }
    }

    // Remover temp draw
    if (tempDrawRef.current && canvas) {
      canvas.remove(tempDrawRef.current);
      tempDrawRef.current = null;
    }

    // ─── Persistir estado da planta após limpeza ───────────
    if (onModified) {
      onModified({
        geometria: geometriaRef?.current
          ? JSON.parse(JSON.stringify(geometriaRef.current))
          : null,
        clipRect: floorPlanClipRectRef?.current
          ? { ...floorPlanClipRectRef.current }
          : null,
        scale: floorPlanScaleRef?.current || 1,
        mode: floorPlanModeRef?.current || "individual",
      });
    }

    desativarFerramenta();
  }, [fabricCanvasRef, tempSelection, activeTool, floorPlanGroupRef, geometriaRef, floorPlanModeRef, floorPlanClipRectRef, floorPlanScaleRef, onModified, desativarFerramenta]);

  // ─── Confirmar Calibração (Fase 2) ────────────────────────────────────
  const confirmarCalibracao = useCallback((distanciaRealMetros) => {
    const canvas = fabricCanvasRef?.current;
    if (!canvas || !calibResult || !distanciaRealMetros || distanciaRealMetros <= 0) return;

    const { distanciaPixeis } = calibResult;
    const scale = (distanciaRealMetros * 40) / distanciaPixeis;

    // Remover temp line
    if (tempDrawRef.current && canvas) {
      canvas.remove(tempDrawRef.current);
      tempDrawRef.current = null;
    }

    const grupo = floorPlanGroupRef?.current;
    if (!grupo) return;
    const modo = floorPlanModeRef?.current;

    if (modo === "individual" && grupo.type === "group") {
      grupo.set({ scaleX: scale, scaleY: scale });
      grupo.setCoords();
      canvas.renderAll();

      // ─── Sincronizar geometriaRef para persistência ─────
      if (geometriaRef?.current) {
        const data = geometriaRef.current;
        data.linhas.forEach((l) => {
          l.x1 *= scale; l.y1 *= scale;
          l.x2 *= scale; l.y2 *= scale;
        });
        data.polilinhas.forEach((p) => {
          p.pontos.forEach((pt) => { pt.x *= scale; pt.y *= scale; });
        });
        data.circulos.forEach((c) => {
          c.cx *= scale; c.cy *= scale; c.raio *= scale;
        });
      }
    } else if (modo === "agrupado" && geometriaRef) {
      const data = geometriaRef.current;
      if (data) {
        data.linhas.forEach((l) => {
          l.x1 *= scale; l.y1 *= scale;
          l.x2 *= scale; l.y2 *= scale;
        });
        data.polilinhas.forEach((p) => {
          p.pontos.forEach((pt) => { pt.x *= scale; pt.y *= scale; });
        });
        data.circulos.forEach((c) => {
          c.cx *= scale; c.cy *= scale; c.raio *= scale;
        });
        if (floorPlanScaleRef) floorPlanScaleRef.current = 1;
        if (floorPlanClipRectRef?.current) {
          floorPlanClipRectRef.current.left *= scale;
          floorPlanClipRectRef.current.top *= scale;
          floorPlanClipRectRef.current.width *= scale;
          floorPlanClipRectRef.current.height *= scale;
        }
        // Atualizar bounding box do invisible rect
        if (grupo.type === "rect") {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const l of data.linhas) {
            if (l.x1 < minX) minX = l.x1; if (l.y1 < minY) minY = l.y1;
            if (l.x2 > maxX) maxX = l.x2; if (l.y2 > maxY) maxY = l.y2;
          }
          for (const c of data.circulos) {
            const cl = c.cx - c.raio; if (cl < minX) minX = cl;
            const cr = c.cx + c.raio; if (cr > maxX) maxX = cr;
            const ct = c.cy - c.raio; if (ct < minY) minY = ct;
            const cb = c.cy + c.raio; if (cb > maxY) maxY = cb;
          }
          grupo.set({ left: minX, top: minY, width: maxX - minX || 100, height: maxY - minY || 100 });
          grupo.setCoords();
          // Atualizar referência de posição inicial para offset de drag
          grupo._floorPlanInitialLeft = grupo.left;
          grupo._floorPlanInitialTop = grupo.top;
        }
        canvas.renderAll();
      }
    }

    // ─── Persistir estado da planta após calibração ────────
    if (onModified) {
      onModified({
        geometria: geometriaRef?.current
          ? JSON.parse(JSON.stringify(geometriaRef.current))
          : null,
        clipRect: floorPlanClipRectRef?.current
          ? { ...floorPlanClipRectRef.current }
          : null,
        scale: floorPlanScaleRef?.current || 1,
        mode: floorPlanModeRef?.current || "individual",
      });
    }

    desativarFerramenta();
  }, [fabricCanvasRef, calibResult, floorPlanGroupRef, floorPlanScaleRef, floorPlanClipRectRef, floorPlanModeRef, geometriaRef, onModified, desativarFerramenta]);

  // ─── Handlers de rato condicionais ────────────────────────────────────
  useEffect(() => {
    const canvas = fabricCanvasRef?.current;
    if (!canvas || !activeTool) return;

    function getWorldPointer(e) {
      // canvas.getPointer() já devolve coordenadas no mundo (sem zoom/pan)
      const pointer = canvas.getPointer(e);
      return {
        worldX: pointer.x,
        worldY: pointer.y,
      };
    }

    function onMouseDown(opt) {
      const e = opt.e;
      if (e.button !== 0) return;
      const pt = getWorldPointer(e);
      isDrawingRef.current = true;
      startPointRef.current = pt;

      if (activeTool === "crop" || activeTool === "erase") {
        const rect = new fabric.Rect({
          left: pt.worldX, top: pt.worldY,
          width: 0, height: 0,
          fill: activeTool === "crop" ? "rgba(99, 102, 241, 0.15)" : "rgba(239, 68, 68, 0.2)",
          stroke: activeTool === "crop" ? "rgba(99, 102, 241, 0.8)" : "rgba(239, 68, 68, 0.8)",
          strokeWidth: 2 / canvas.getZoom(),
          strokeDashArray: [4 / canvas.getZoom(), 3 / canvas.getZoom()],
          selectable: false, evented: false,
          originX: "left", originY: "top",
        });
        canvas.add(rect);
        tempDrawRef.current = rect;
      } else if (activeTool === "calibr") {
        const line = new fabric.Line([pt.worldX, pt.worldY, pt.worldX, pt.worldY], {
          stroke: "#22c55e",
          strokeWidth: 3 / canvas.getZoom(),
          strokeDashArray: [6 / canvas.getZoom(), 4 / canvas.getZoom()],
          selectable: false, evented: false,
        });
        canvas.add(line);
        tempDrawRef.current = line;
      }
    }

    function onMouseMove(opt) {
      if (!isDrawingRef.current || !tempDrawRef.current) return;
      const pt = getWorldPointer(opt.e);
      const start = startPointRef.current;

      if (activeTool === "crop" || activeTool === "erase") {
        const x = Math.min(start.worldX, pt.worldX);
        const y = Math.min(start.worldY, pt.worldY);
        const w = Math.abs(pt.worldX - start.worldX);
        const h = Math.abs(pt.worldY - start.worldY);
        tempDrawRef.current.set({ left: x, top: y, width: w, height: h });
        tempDrawRef.current.setCoords();
      } else if (activeTool === "calibr") {
        tempDrawRef.current.set({ x2: pt.worldX, y2: pt.worldY });
        tempDrawRef.current.setCoords();
      }
      canvas.renderAll();
    }

    function onMouseUp(opt) {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      const pt = getWorldPointer(opt.e);
      const start = startPointRef.current;
      const tempObj = tempDrawRef.current;
      if (!tempObj || !start) return;

      if (activeTool === "crop" || activeTool === "erase") {
        const x = Math.min(start.worldX, pt.worldX);
        const y = Math.min(start.worldY, pt.worldY);
        const w = Math.abs(pt.worldX - start.worldX);
        const h = Math.abs(pt.worldY - start.worldY);

        if (w > 5 && h > 5) {
          // Guardar seleção temporária — NÃO aplicar ainda
          setTempSelection({ x, y, w, h });
        } else {
          // Muito pequeno, remover temp
          if (tempObj && canvas) {
            canvas.remove(tempObj);
            tempDrawRef.current = null;
            canvas.renderAll();
          }
          setTempSelection(null);
        }
      } else if (activeTool === "calibr") {
        const dx = pt.worldX - start.worldX;
        const dy = pt.worldY - start.worldY;
        const distanciaPixeis = Math.hypot(dx, dy);

        if (distanciaPixeis > 5) {
          // Guardar medição — linha permanece visível até confirmação
          setTempSelection({
            x1: start.worldX, y1: start.worldY,
            x2: pt.worldX, y2: pt.worldY,
          });
          setCalibResult({ distanciaPixeis });
        } else {
          // Muito curto
          if (tempObj && canvas) {
            canvas.remove(tempObj);
            tempDrawRef.current = null;
            canvas.renderAll();
          }
          setTempSelection(null);
          setCalibResult(null);
        }
      }
    }

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    return () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
    };
  }, [fabricCanvasRef, activeTool, floorPlanGroupRef, geometriaRef, floorPlanScaleRef, floorPlanClipRectRef, floorPlanModeRef]);

  // ─── ESC para cancelar ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTool) return;
    function handleKey(e) {
      if (e.key === "Escape") {
        desativarFerramenta();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeTool, desativarFerramenta]);

  return {
    activeTool,
    setActiveTool,
    calibResult,
    setCalibResult,
    tempSelection,
    setTempSelection,
    iniciarCrop,
    iniciarCalibracao,
    iniciarLimpeza,
    confirmarCrop,
    confirmarLimpeza,
    confirmarCalibracao,
    desativarFerramenta,
  };
}
