import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import { criarElectricalData } from "./useCanvasIntegration";
import { createLampSymbol, createCaixaPassagemSymbol } from "../components/Canvas/SymbolFactory";

// Escala: 1 metro do mundo real = 40 pixels no canvas (ajustável)
export const ESCALA_PX_POR_METRO = 40;

// Grid settings (in world-space pixels, before zoom)
const GRID_MINOR = 20;  // minor grid every 20px (0.5m)
const GRID_MAJOR = 100; // major grid every 100px (2.5m)

/**
 * Hook que inicializa e gere o canvas Fabric.js (fullscreen).
 * Suporta: dark mode, zoom (scroll), pan (Space+drag ou middle-click),
 * grelha dinâmica, e coordenadas do rato.
 */
export function useFabricCanvas(canvasElRef, containerRef) {
  const fabricCanvasRef = useRef(null);
  const [pronto, setPronto] = useState(false);
  const isPanningRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const gridVisibleRef = useRef(true);
  const geometriaRef = useRef(null); // Dados DXF para render nativo no 2D context
  const floorPlanGroupRef = useRef(null); // fabric.Group (individual) ou invis. rect (agrupado) com electricalData
  const floorPlanScaleRef = useRef(1);   // Fator de escala aplicado pela calibração
  const floorPlanClipRectRef = useRef(null); // { left, top, width, height } para crop nativo
  const floorPlanModeRef = useRef(null); // 'individual' | 'agrupado'

  function getCanvasBg() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas").trim() || "#e8ecf0";
    } catch {
      return "#e8ecf0";
    }
  }

  useEffect(() => {
    if (!canvasElRef.current || !containerRef?.current) return;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      backgroundColor: getCanvasBg(),
      selection: true,
      selectionColor: "rgba(99, 102, 241, 0.15)",
      selectionBorderColor: "rgba(99, 102, 241, 0.6)",
      selectionLineWidth: 1,
      fireRightClick: true,
      stopContextMenu: true,
    });
    fabricCanvasRef.current = canvas;

    // ─── Resize to fill the outer container ───
    const resize = () => {
      const container = containerRef.current;
      if (!container) return;
      canvas.setWidth(container.clientWidth);
      canvas.setHeight(container.clientHeight);
      canvas.renderAll();
    };
    resize();
    window.addEventListener("resize", resize);

    // ─── After render: grid + DXF geometry on the raw 2D context ───
    canvas.on("after:render", () => {
      drawDynamicGrid(canvas);
      drawDxfGeometry(canvas);
    });

    // ─── Zoom (scroll) ───
    canvas.on("mouse:wheel", (opt) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(zoom, 0.05), 20);

      canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
      canvas.renderAll();

      updateCoordsDisplay(e.offsetX, e.offsetY, canvas);
    });

    // ─── Pan (middle mouse or Space+drag) ───
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

    // ─── Space key for pan mode ───
    function handleKeyDown(e) {
      if (e.code === "Space" && !e.repeat && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        spaceHeldRef.current = true;
        canvas.setCursor("grab");
        canvas.selection = false;
        canvas.forEachObject((obj) => {
          obj._origSelectable = obj.selectable;
          obj.selectable = false;
        });
      }
    }

    function handleKeyUp(e) {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        isPanningRef.current = false;
        canvas.setCursor("default");
        canvas.selection = true;
        canvas.forEachObject((obj) => {
          if (obj._origSelectable !== undefined) {
            obj.selectable = obj._origSelectable;
            delete obj._origSelectable;
          }
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // ─── Observer para atualizar background do canvas quando o tema muda ───
    const themeObserver = new MutationObserver(() => {
      canvas.backgroundColor = getCanvasBg();
      canvas.renderAll();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    setPronto(true);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      themeObserver.disconnect();
      canvas.dispose();
    };
  }, [canvasElRef, containerRef]);

  // ─── Coordinates display ───
  function updateCoordsDisplay(px, py, canvas) {
    const el = document.getElementById("canvas-coords");
    if (!el) return;
    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform;
    const worldX = ((px - vpt[4]) / zoom / ESCALA_PX_POR_METRO).toFixed(2);
    const worldY = (-(py - vpt[5]) / zoom / ESCALA_PX_POR_METRO).toFixed(2);
    el.textContent = `X: ${worldX}m  Y: ${worldY}m  Zoom: ${Math.round(zoom * 100)}%`;
  }

  /**
   * Desenha a grelha diretamente no contexto 2D, DEPOIS do render do Fabric.
   * A grelha adapta-se ao zoom e pan — nunca fica distorcida.
   * Usa o lower-canvas context para desenhar por baixo dos objetos.
   */
  function drawDynamicGrid(canvas) {
    if (!gridVisibleRef.current) return;
    const ctx = canvas.getContext();
    if (!ctx) return;

    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform;
    const w = canvas.getWidth();
    const h = canvas.getHeight();

    // Calculate the visible world-space bounds
    const left = -vpt[4] / zoom;
    const top = -vpt[5] / zoom;
    const right = left + w / zoom;
    const bottom = top + h / zoom;

    // Choose grid spacing that looks good at current zoom
    // At very low zoom, skip minor lines to avoid clutter
    const minorSpacing = GRID_MINOR;
    const majorSpacing = GRID_MAJOR;
    const showMinor = zoom * minorSpacing > 6; // only show minor lines if they'd be at least 6px apart

    // Escolher cores da grelha com base no tema atual
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const minorColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.06)';
    const majorColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.10)';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to screen space

    // Draw minor grid lines
    if (showMinor) {
      ctx.strokeStyle = minorColor;
      ctx.lineWidth = 1;
      ctx.beginPath();

      const startX = Math.floor(left / minorSpacing) * minorSpacing;
      const startY = Math.floor(top / minorSpacing) * minorSpacing;

      for (let x = startX; x <= right; x += minorSpacing) {
        // Skip major lines (we'll draw them separately)
        if (x % majorSpacing === 0) continue;
        const screenX = Math.round(x * zoom + vpt[4]) + 0.5;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, h);
      }

      for (let y = startY; y <= bottom; y += minorSpacing) {
        if (y % majorSpacing === 0) continue;
        const screenY = Math.round(y * zoom + vpt[5]) + 0.5;
        ctx.moveTo(0, screenY);
        ctx.lineTo(w, screenY);
      }

      ctx.stroke();
    }

    // Draw major grid lines
    ctx.strokeStyle = majorColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const startMajX = Math.floor(left / majorSpacing) * majorSpacing;
    const startMajY = Math.floor(top / majorSpacing) * majorSpacing;

    for (let x = startMajX; x <= right; x += majorSpacing) {
      const screenX = Math.round(x * zoom + vpt[4]) + 0.5;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, h);
    }

    for (let y = startMajY; y <= bottom; y += majorSpacing) {
      const screenY = Math.round(y * zoom + vpt[5]) + 0.5;
      ctx.moveTo(0, screenY);
      ctx.lineTo(w, screenY);
    }

    ctx.stroke();

    // Draw origin crosshair (subtle)
    const originX = Math.round(vpt[4]) + 0.5;
    const originY = Math.round(vpt[5]) + 0.5;
    if (originX >= 0 && originX <= w) {
      ctx.strokeStyle = "rgba(99, 102, 241, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, h);
      ctx.stroke();
    }
    if (originY >= 0 && originY <= h) {
      ctx.strokeStyle = "rgba(99, 102, 241, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(w, originY);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Desenha a geometria DXF diretamente no Canvas 2D context (lower-canvas)
   * como vectores nativos — NUNCA fica desfocada ao zoom porque não depende
   * de objectCaching do Fabric.js.
   *
   * Apenas desenha as entidades VISÍVEIS no viewport atual, evitando
   * trabalho desnecessário em plantas muito grandes.
   */
  function drawDxfGeometry(canvas) {
    const data = geometriaRef.current;
    const clipRect = floorPlanClipRectRef.current;
    if (!data) return;

    const ctx = canvas.getContext();
    if (!ctx) return;

    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform;
    const w = canvas.getWidth();
    const h = canvas.getHeight();

    // ─── Calcular offset de arrasto (grupo agrupado) ─────────────────────
    let offsetX = 0, offsetY = 0;
    const floorPlanObj = floorPlanGroupRef.current;
    if (floorPlanObj && floorPlanObj.type === "rect") {
      const initLeft = floorPlanObj._floorPlanInitialLeft;
      const initTop = floorPlanObj._floorPlanInitialTop;
      if (initLeft !== undefined && initTop !== undefined) {
        offsetX = floorPlanObj.left - initLeft;
        offsetY = floorPlanObj.top - initTop;
      }
    }

    // Calcular bounds do viewport em espaço-mundo (pixels, não metros)
    const vpLeft = -vpt[4] / zoom;
    const vpTop = -vpt[5] / zoom;
    const vpRight = vpLeft + w / zoom;
    const vpBottom = vpTop + h / zoom;

    // Margem de segurança (para linhas que começam fora mas entram no viewport)
    const margin = 50;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // screen space

    // ─── Clip nativo se crop ativo (coords mundo → ecrã) ──────────────────
    if (clipRect) {
      const sx = (clipRect.left + offsetX) * zoom + vpt[4];
      const sy = (clipRect.top + offsetY) * zoom + vpt[5];
      const sw = clipRect.width * zoom;
      const sh = clipRect.height * zoom;
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.clip();
    }

    // Cor e espessura das linhas — usa strokeUniform mentalmente
    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ─── Linhas individuais ──────────────────────────────────────────────
    ctx.beginPath();
    let hasLines = false;
    for (const l of data.linhas) {
      // Aplicar offset de arrasto
      const ox1 = l.x1 + offsetX, oy1 = l.y1 + offsetY;
      const ox2 = l.x2 + offsetX, oy2 = l.y2 + offsetY;

      // Viewport culling
      if (ox1 < vpLeft - margin && ox2 < vpLeft - margin) continue;
      if (ox1 > vpRight + margin && ox2 > vpRight + margin) continue;
      if (oy1 < vpTop - margin && oy2 < vpTop - margin) continue;
      if (oy1 > vpBottom + margin && oy2 > vpBottom + margin) continue;

      // Converter mundo → ecrã
      const sx1 = ox1 * zoom + vpt[4];
      const sy1 = oy1 * zoom + vpt[5];
      const sx2 = ox2 * zoom + vpt[4];
      const sy2 = oy2 * zoom + vpt[5];

      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      hasLines = true;
    }
    if (hasLines) ctx.stroke();

    // ─── Polilinhas ──────────────────────────────────────────────────────
    ctx.beginPath();
    let hasPolys = false;
    for (const p of data.polilinhas) {
      const pts = p.pontos;
      if (pts.length < 2) continue;

      // Viewport culling simples (bounding box da polilinha)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pt of pts) {
        const px = pt.x + offsetX;
        const py = pt.y + offsetY;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      if (maxX < vpLeft - margin || minX > vpRight + margin) continue;
      if (maxY < vpTop - margin || minY > vpBottom + margin) continue;

      const first = pts[0];
      ctx.moveTo((first.x + offsetX) * zoom + vpt[4], (first.y + offsetY) * zoom + vpt[5]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo((pts[i].x + offsetX) * zoom + vpt[4], (pts[i].y + offsetY) * zoom + vpt[5]);
      }
      if (p.fechada) ctx.closePath();
      hasPolys = true;
    }
    if (hasPolys) ctx.stroke();

    // ─── Círculos ──────────────────────────────────────────────────────────
    for (const c of data.circulos) {
      const cx = c.cx + offsetX;
      const cy = c.cy + offsetY;

      // Viewport culling
      if (cx + c.raio < vpLeft - margin || cx - c.raio > vpRight + margin) continue;
      if (cy + c.raio < vpTop - margin || cy - c.raio > vpBottom + margin) continue;

      const sx = cx * zoom + vpt[4];
      const sy = cy * zoom + vpt[5];
      const sr = c.raio * zoom;

      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(sr, 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Limite de objetos canvas para alternar entre modo individual e agrupado
  const LIMITE_OBJETOS_INDIVIDUAIS = 2000;

  /**
   * Desenha a geometria da planta no canvas.
   * - Quando N < LIMITE: cada linha é um fabric.Line num único fabric.Group
   * - Quando N >= LIMITE: render nativo 2D context + invisible rect
   * Retorna { modo: "individual"|"agrupado", totalObjetos: number }
   */
  function desenharGeometria(geometria) {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !geometria) {
      geometriaRef.current = null;
      floorPlanGroupRef.current = null;
      floorPlanScaleRef.current = 1;
      floorPlanClipRectRef.current = null;
      floorPlanModeRef.current = null;
      return { modo: "individual", totalObjetos: 0 };
    }

    floorPlanScaleRef.current = 1;
    floorPlanClipRectRef.current = null;

    // Guardar a geometria original como referência
    geometriaRef.current = null;

    // Calcular total de objetos que seriam criados
    const nLinhas = (geometria.linhas || []).length;
    let nSegmentosPoli = 0;
    (geometria.polilinhas || []).forEach((poli) => {
      if (!poli.pontos || poli.pontos.length < 2) return;
      nSegmentosPoli += poli.pontos.length - 1;
      if (poli.fechada && poli.pontos.length > 2) nSegmentosPoli += 1;
    });
    const nCirculos = (geometria.circulos || []).length;
    const totalObjetos = nLinhas + nSegmentosPoli + nCirculos;

    if (totalObjetos >= LIMITE_OBJETOS_INDIVIDUAIS) {
      floorPlanModeRef.current = "agrupado";
      return _desenharGeometriaAgrupada(geometria, totalObjetos);
    } else {
      floorPlanModeRef.current = "individual";
      // Manter cópia da geometria para persistir modificações (erase e calibrate)
      geometriaRef.current = JSON.parse(JSON.stringify(geometria));
      return _desenharGeometriaIndividual(geometria, totalObjetos);
    }
  }

  /**
   * Modo individual: todas as linhas/círculos DXF num único fabric.Group
   * com electricalData.type = 'floorplan', para ser detetado pela Sidebar.
   */
  function _desenharGeometriaIndividual(geometria, totalObjetos) {
    const canvas = fabricCanvasRef.current;

    const attrs = {
      stroke: "#4b5563",
      strokeWidth: 1.5,
      strokeUniform: true,
      selectable: false,
      evented: false,
    };

    const dxfObjects = [];

    (geometria.linhas || []).forEach((l) => {
      const line = new fabric.Line(
        [l.x1 * ESCALA_PX_POR_METRO, -l.y1 * ESCALA_PX_POR_METRO,
        l.x2 * ESCALA_PX_POR_METRO, -l.y2 * ESCALA_PX_POR_METRO],
        attrs
      );
      dxfObjects.push(line);
    });

    (geometria.polilinhas || []).forEach((poli) => {
      if (!poli.pontos || poli.pontos.length < 2) return;
      for (let i = 0; i < poli.pontos.length - 1; i++) {
        const p1 = poli.pontos[i];
        const p2 = poli.pontos[i + 1];
        const line = new fabric.Line(
          [p1.x * ESCALA_PX_POR_METRO, -p1.y * ESCALA_PX_POR_METRO,
          p2.x * ESCALA_PX_POR_METRO, -p2.y * ESCALA_PX_POR_METRO],
          attrs
        );
        dxfObjects.push(line);
      }
      if (poli.fechada && poli.pontos.length > 2) {
        const pLast = poli.pontos[poli.pontos.length - 1];
        const pFirst = poli.pontos[0];
        const line = new fabric.Line(
          [pLast.x * ESCALA_PX_POR_METRO, -pLast.y * ESCALA_PX_POR_METRO,
          pFirst.x * ESCALA_PX_POR_METRO, -pFirst.y * ESCALA_PX_POR_METRO],
          attrs
        );
        dxfObjects.push(line);
      }
    });

    (geometria.circulos || []).forEach((c) => {
      const circulo = new fabric.Circle({
        left: c.cx * ESCALA_PX_POR_METRO - c.raio * ESCALA_PX_POR_METRO,
        top: -c.cy * ESCALA_PX_POR_METRO - c.raio * ESCALA_PX_POR_METRO,
        radius: c.raio * ESCALA_PX_POR_METRO,
        fill: "transparent",
        stroke: "#4b5563",
        strokeWidth: 1.5,
        strokeUniform: true,
        selectable: false,
        evented: false,
      });
      dxfObjects.push(circulo);
    });

    // ─── Agrupar tudo num único fabric.Group ───
    const grupo = new fabric.Group(dxfObjects, {
      selectable: true,
      evented: true,
      hoverCursor: "pointer",
      cornerColor: "#6366f1",
      cornerStrokeColor: "#6366f1",
      borderColor: "#6366f180",
      cornerSize: 7,
      cornerStyle: "circle",
      transparentCorners: false,
      padding: 2,
    });
    grupo.electricalData = { type: "floorplan" };
    floorPlanGroupRef.current = grupo;

    canvas.add(grupo);
    canvas.sendObjectToBack(grupo);

    return { modo: "individual", totalObjetos, group: grupo };
  }

  /**
   * Modo agrupado (>= LIMITE_OBJETOS_INDIVIDUAIS linhas):
   * EM VEZ de criar um fabric.Path (que fica desfocado ao zoom porque o
   * objectCaching escala um bitmap), GUARDA os dados DXF num ref para
   * serem renderizados como vectores nativos no Canvas 2D context
   * (after:render). Isto garante linhas sempre nítidas a qualquer zoom.
   */
  function _desenharGeometriaAgrupada(geometria, totalObjetos) {
    const canvas = fabricCanvasRef.current;

    // Converter coordenadas mundo → pixel (sem zoom)
    const converter = (x, y) => ({
      px: x * ESCALA_PX_POR_METRO,
      py: -y * ESCALA_PX_POR_METRO,
    });

    // Armazenar toda a geometria para render nativo 2D
    const data = { linhas: [], polilinhas: [], circulos: [] };

    (geometria.linhas || []).forEach((l) => {
      const p1 = converter(l.x1, l.y1);
      const p2 = converter(l.x2, l.y2);
      data.linhas.push({ x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py });
    });

    (geometria.polilinhas || []).forEach((poli) => {
      if (!poli.pontos || poli.pontos.length < 2) return;
      const pts = poli.pontos.map((p) => {
        const c = converter(p.x, p.y);
        return { x: c.px, y: c.py };
      });
      data.polilinhas.push({ pontos: pts, fechada: poli.fechada });
    });

    (geometria.circulos || []).forEach((c) => {
      const cx = c.cx * ESCALA_PX_POR_METRO;
      const cy = -c.cy * ESCALA_PX_POR_METRO;
      const r = c.raio * ESCALA_PX_POR_METRO;
      if (r < 0.5) return;
      data.circulos.push({ cx, cy, raio: r });
    });

    geometriaRef.current = data;

    // ─── Criar invisible rect para servir de clique/target ───
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const l of data.linhas) {
      if (l.x1 < minX) minX = l.x1;
      if (l.y1 < minY) minY = l.y1;
      if (l.x2 > maxX) maxX = l.x2;
      if (l.y2 > maxY) maxY = l.y2;
    }
    for (const p of data.polilinhas) {
      for (const pt of p.pontos) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
    for (const c of data.circulos) {
      const cx = c.cx, cy = c.cy, r = c.raio;
      if (cx - r < minX) minX = cx - r;
      if (cy - r < minY) minY = cy - r;
      if (cx + r > maxX) maxX = cx + r;
      if (cy + r > maxY) maxY = cy + r;
    }

    const bboxWidth = maxX - minX || 100;
    const bboxHeight = maxY - minY || 100;

    const invisRect = new fabric.Rect({
      left: minX,
      top: minY,
      width: bboxWidth,
      height: bboxHeight,
      fill: "rgba(0,0,0,0.005)",  // quase invisível mas detetável pelo clique
      stroke: "transparent",
      selectable: true,
      evented: true,
      hoverCursor: "pointer",
      cornerColor: "#6366f1",
      cornerStrokeColor: "#6366f1",
      borderColor: "#6366f180",
      cornerSize: 7,
      cornerStyle: "circle",
      transparentCorners: false,
      padding: 2,
    });
    // Guardar posição inicial para calcular offset durante drag
    invisRect._floorPlanInitialLeft = minX;
    invisRect._floorPlanInitialTop = minY;

    invisRect.electricalData = { type: "floorplan" };
    floorPlanGroupRef.current = invisRect;

    canvas.add(invisRect);
    canvas.sendObjectToBack(invisRect);

    return { modo: "agrupado", totalObjetos };
  }

  /** Cria um componente elétrico visual no canvas — símbolos fieis ao padrão WOCA/NBR. */
  function obterFormasDoSimbolo(tipo, cor) {
    const shapes = [];

    // ────────────────────────────────────────────────
    // 1. LÂMPADAS
    // ────────────────────────────────────────────────
    if (tipo.startsWith("lampada")) {

      if (tipo === "lampada_simples" || tipo === "lampada") {
        // 1. Lâmpada: Círculo grande centralizado
        shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }

      else if (tipo === "lampada_arandela") {
        // 2. Arandela: Linha vertical (parede) + D virado para a esquerda (centrado em 0,0)
        shapes.push(new fabric.Line([4.5, -9, 4.5, 9], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Path("M 4.5 -9 A 9 9 0 0 0 4.5 9 Z", {
          fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center"
        }));
      }

      else if (tipo === "lampada_spot") {
        // Spot: Quadrado + círculo preenchido ao centro
        shapes.push(new fabric.Rect({ width: 20, height: 20, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Circle({ radius: 5, fill: cor, stroke: cor, strokeWidth: 1, originX: "center", originY: "center" }));
      }

      else if (tipo === "lampada_tubular") {
        // 3. Tubular: Retângulo estreito inclinado 45° + pinos
        shapes.push(new fabric.Rect({ width: 24, height: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -45 }));
        // Pino 1 (extremidade esquerda do tubo, apontando para fora)
        shapes.push(new fabric.Line([-8.5, 8.5, -8.5, 11.5], { stroke: cor, strokeWidth: 1.5 }));
        // Pino 2 (extremidade direita do tubo, apontando para fora)
        shapes.push(new fabric.Line([8.5, -8.5, 8.5, -11.5], { stroke: cor, strokeWidth: 1.5 }));
      }

      else if (tipo === "lampada_pendente") {
        // Pendente: Dois círculos concêntricos
        shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Circle({ radius: 4, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }

      else if (tipo === "lampada_led" || tipo === "lampada_led_driver") {
        // LED Driver: Dois retângulos diagonais sobrepostos
        shapes.push(new fabric.Rect({ width: 26, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -15, top: -4 }));
        shapes.push(new fabric.Rect({ width: 26, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -15, top: 4 }));
      }

      else if (tipo === "lampada_led_fita") {
        // Fita LED
        shapes.push(new fabric.Rect({ width: 26, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -15, top: -4 }));
        shapes.push(new fabric.Rect({ width: 26, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -15, top: 4 }));
        [-8, 0, 8].forEach(x => {
          shapes.push(new fabric.Circle({ radius: 1.5, fill: "#ef4444", originX: "center", originY: "center", left: x, top: 0 }));
        });
      }

      else {
        // Fallback: círculo simples
        shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
    }

    // ────────────────────────────────────────────────
    // 2. TOMADAS  (triângulo equilátero + linha vertical)
    // ────────────────────────────────────────────────
    else if (tipo.startsWith("tomada")) {

      // Helper: triângulo equilátero apontando para cima
      function triangulo(cx, cy, largura, altura) {
        const mh = altura / 2;
        const mw = largura / 2;
        return new fabric.Path(`M ${cx} ${cy - mh} L ${cx + mw} ${cy + mh} L ${cx - mw} ${cy + mh} Z`, {
          fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center"
        });
      }

      if (tipo === "tomada" || tipo === "tomada_baixa") {
        // 4. Tomada Baixa: triângulo vazio + linha
        shapes.push(triangulo(0, -5, 16, 20));
        shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "tomada_media") {
        // 5. Tomada Média: triângulo + metade esquerda preenchida + linha
        shapes.push(triangulo(0, -5, 16, 20));
        shapes.push(new fabric.Path("M 0 -15 L 0 5 L -8 5 Z", {
          fill: cor, stroke: "transparent", originX: "center", originY: "center"
        }));
        shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "tomada_alta") {
        // 6. Tomada Alta: triângulo preenchido + linha
        shapes.push(new fabric.Path("M 0 -15 L 8 5 L -8 5 Z", {
          fill: cor, stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center"
        }));
        shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "tomada_dupla") {
        // 7. Tomada Dupla: 2 triângulos empilhados + linha
        shapes.push(triangulo(0, -12, 13, 18));
        shapes.push(triangulo(0, 3, 13, 18));
        shapes.push(new fabric.Line([0, 12, 0, 18], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "tomada_piso") {
        // 8. Tomada de Piso: quadrado + triângulo apontando para a direita
        shapes.push(new fabric.Rect({ width: 18, height: 18, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Path("M 5 0 L -9 -7 L -9 7 Z", {
          fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center"
        }));
      }
      else if (tipo === "tomada_tripla") {
        // Tomada Tripla: triângulo + 3 traços em cima
        shapes.push(triangulo(0, -5, 16, 20));
        shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Line([-6, -18, -6, -12], { stroke: cor, strokeWidth: 1.5 }));
        shapes.push(new fabric.Line([0, -20, 0, -14], { stroke: cor, strokeWidth: 1.5 }));
        shapes.push(new fabric.Line([6, -18, 6, -12], { stroke: cor, strokeWidth: 1.5 }));
      }
      else if (tipo === "tomada_trifasica") {
        // Tomada Trifásica: círculo + 3 traços
        shapes.push(new fabric.Circle({ radius: 11, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Circle({ radius: 4, fill: "transparent", stroke: "#ef4444", strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Line([0, 11, 0, 18], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "tomada_sensor") {
        // Tomada c/ Sensor: triângulo + S
        shapes.push(triangulo(0, -5, 16, 20));
        shapes.push(new fabric.Text("S", { fontSize: 7, fill: cor, fontWeight: "bold", originX: "center", originY: "center", top: -5 }));
        shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else {
        // fallback tomada: triângulo vazio + linha
        shapes.push(triangulo(0, -5, 16, 20));
        shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
    }

    // ────────────────────────────────────────────────
    // 3. COMUNICAÇÕES
    // ────────────────────────────────────────────────
    else if (["telefonia", "dados", "tv", "campainha", "camera"].includes(tipo)) {
      // Triângulo base para telecom (como triângulo para cima com haste)
      function triComm() {
        return new fabric.Path("M 0 -11 L 7 1 L -7 1 Z", {
          fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center"
        });
      }

      if (tipo === "telefonia") {
        // Triângulo + símbolo telefone
        shapes.push(triComm());
        shapes.push(new fabric.Path("M -5 -3 Q -5 3 0 3 Q 5 3 5 -3", {
          fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: 6
        }));
        shapes.push(new fabric.Line([0, 1, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "dados") {
        // Triângulo + ícone rede
        shapes.push(triComm());
        shapes.push(new fabric.Circle({ radius: 3, fill: "transparent", stroke: cor, strokeWidth: 1.2, originX: "center", originY: "center", top: 7 }));
        shapes.push(new fabric.Line([0, 1, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "tv") {
        // Triângulo + TV
        shapes.push(triComm());
        shapes.push(new fabric.Rect({ width: 10, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.2, originX: "center", originY: "center", top: 7, rx: 1, ry: 1 }));
        shapes.push(new fabric.Line([0, 1, 0, 7], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "campainha") {
        // Círculo + campainha
        shapes.push(new fabric.Circle({ radius: 9, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Circle({ radius: 3, fill: cor, originX: "center", originY: "center" }));
        shapes.push(new fabric.Text("♪", { fontSize: 8, fill: cor, originX: "center", originY: "center", top: -1 }));
      }
      else if (tipo === "camera") {
        // Câmara de segurança: corpo rectangular + lente + suporte
        shapes.push(new fabric.Rect({ width: 14, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", left: -3 }));
        shapes.push(new fabric.Path("M 4 -3 L 10 -5 L 10 5 L 4 3 Z", { fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Line([-10, 0, -10, 8], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
    }

    // ────────────────────────────────────────────────
    // 4. CAIXAS DE PASSAGEM
    // ────────────────────────────────────────────────
    else if (tipo.startsWith("passagem")) {
      shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));

      if (tipo === "passagem_sobe") {
        // Seta para cima (sobe)
        shapes.push(new fabric.Path("M 0 4 L 0 -6 M -4 -2 L 0 -6 L 4 -2", {
          stroke: cor, strokeWidth: 2, fill: "transparent", originX: "center", originY: "center"
        }));
      } else if (tipo === "passagem_desce") {
        // Seta para baixo (desce)
        shapes.push(new fabric.Path("M 0 -6 L 0 4 M -4 0 L 0 4 L 4 0", {
          stroke: cor, strokeWidth: 2, fill: "transparent", originX: "center", originY: "center"
        }));
      } else {
        // Passagem genérica: X dentro do círculo
        shapes.push(new fabric.Line([-6, -6, 6, 6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Line([-6, 6, 6, -6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
    }

    // ────────────────────────────────────────────────
    // 5. INTERRUPTORES  (círculo pequeno no topo + linha vertical descendo)
    // ────────────────────────────────────────────────
    else if (tipo.startsWith("interruptor")) {

      if (tipo === "interruptor_simples" || tipo === "interruptor") {
        // 9. Interruptor Simples: círculo vazio + linha descendo
        shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "interruptor_duplo") {
        // 10. Interruptor Duplo: círculo + linha vertical ao meio + linha descendo
        shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Line([0, -18, 0, -6], { stroke: cor, strokeWidth: 1.5 }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "interruptor_triplo") {
        // 11. Interruptor Triplo: círculo + 3 fatias + linha descendo
        shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Line([0, -12, 0, -18], { stroke: cor, strokeWidth: 1.5 }));
        shapes.push(new fabric.Line([0, -12, 5.2, -15], { stroke: cor, strokeWidth: 1.5 }));
        shapes.push(new fabric.Line([0, -12, -5.2, -15], { stroke: cor, strokeWidth: 1.5 }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "interruptor_three_way" || tipo === "interruptor_paralelo") {
        // 12. Interruptor Paralelo (Three-way): círculo preenchido + linha
        shapes.push(new fabric.Circle({ radius: 6, fill: cor, stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "interruptor_bipolar") {
        // 13. Interruptor Bipolar: círculo + metade esquerda preenchida + linha
        shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Path("M 0 -18 A 6 6 0 0 0 0 -6 Z", {
          fill: cor, stroke: "transparent", originX: "center", originY: "center"
        }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "interruptor_four_way" || tipo === "interruptor_intermediario") {
        // Interruptor Intermediário: círculo + linha diagonal + linha descendo
        shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Line([-3, -20, 3, -14], { stroke: cor, strokeWidth: 1.5 }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
      else if (tipo === "sensor_presenca" || tipo === "interruptor_dimmer") {
        // Dimmer / Sensor: círculo + linha + semicírculo de ajuste
        shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Path("M 4 -17 A 3 3 0 0 1 7 -14", { stroke: cor, strokeWidth: 1.5 }));
      }
      else if (tipo === "interruptor_pulsador") {
        // Pulsador: círculo com ponto preenchido ao centro
        shapes.push(new fabric.Circle({ radius: 9, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
        shapes.push(new fabric.Circle({ radius: 4, fill: cor, stroke: cor, strokeWidth: 1, originX: "center", originY: "center" }));
      }
      else {
        // Fallback: círculo vazio + linha
        shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
        shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      }
    }

    // ────────────────────────────────────────────────
    // 6. QUADRO GERAL
    // ────────────────────────────────────────────────
    else if (tipo === "quadro") {
      shapes.push(new fabric.Rect({ width: 22, height: 14, fill: "transparent", stroke: cor, strokeWidth: 2, originX: "center", originY: "center" }));
      // Raio/relâmpago dentro
      shapes.push(new fabric.Path("M -2 -5 L -5 1 L 0 1 L 2 5 L 5 -1 L 0 -1 Z", {
        fill: cor, stroke: "transparent", originX: "center", originY: "center"
      }));
    }

    // Fallback universal
    else {
      shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 2, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([-6, -6, 6, 6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([-6, 6, 6, -6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    }

    return shapes;
  }

  function desenharComponente(componente, { onModified } = {}) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    const cores = {
      lampada: "#f59e0b",
      tomada: "#3b82f6",
      telecom: "#ec4899",
      passagem: "#8b5cf6",
      interruptor: "#22c55e",
      quadro: "#ef4444",
      outro: "#6366f1"
    };

    let categoria = "outro";
    if (componente.tipo.startsWith("lampada")) categoria = "lampada";
    else if (componente.tipo.startsWith("tomada")) categoria = "tomada";
    else if (
      componente.tipo === "telefonia" ||
      componente.tipo === "dados" ||
      componente.tipo === "tv" ||
      componente.tipo === "campainha" ||
      componente.tipo === "camera"
    ) {
      categoria = "telecom";
    }
    else if (componente.tipo.startsWith("caixa_passagem")) categoria = "passagem";
    else if (componente.tipo.startsWith("interruptor")) categoria = "interruptor";
    else if (componente.tipo === "quadro") categoria = "quadro";

    const cor = cores[categoria] || cores.outro;

    // Glow suave — sem glow para interruptores
    const usarGlow = categoria !== "interruptor";
    const glow = usarGlow
      ? new fabric.Circle({
        radius: (categoria === "lampada" && (componente.tipo === "lampada" || componente.tipo === "lampada_simples"))
          ? 22
          : 12,
        fill: cor + "15",
        stroke: "transparent",
        originX: "center",
        originY: "center",
      })
      : null;

    // ─── Injetar electricalData com campos padrão ───────────────────────
    // comandoInicial: para caixa de passagem, parsear JSON e usar o nome
    const comandoInicial = (() => {
      if (componente.tipo.startsWith("caixa_passagem") && componente.rotulo) {
        try {
          const parsed = JSON.parse(componente.rotulo);
          if (parsed && typeof parsed === "object" && parsed.nome) {
            return parsed.nome;
          }
        } catch { }
        return componente.rotulo;
      }
      if (categoria === "lampada" || categoria === "interruptor") {
        return componente.rotulo?.length === 1 ? componente.rotulo : "a";
      }
      return componente.rotulo || "";
    })();
    const electricalData = criarElectricalData(componente.tipo, (() => {
      // Para caixa de passagem, parsear rotulo como JSON com os dados extra
      if (componente.tipo.startsWith("caixa_passagem") && componente.rotulo) {
        try {
          const parsed = JSON.parse(componente.rotulo);
          if (parsed && typeof parsed === "object" && "nome" in parsed) {
            return {
              nome: parsed.nome,
              descricao: parsed.descricao,
              altura: parsed.altura,
              tamanho: parsed.tamanho,
            };
          }
        } catch { }
        // Fallback: rotulo é o nome antigo (string simples)
        return { nome: componente.rotulo };
      }
      // Para os outros tipos
      return {
        potencia_va: componente.potencia_w != null ? String(componente.potencia_w) : "100",
        comando: comandoInicial,
        circuito: componente.circuit_id != null ? String(componente.circuit_id) : "",
      };
    })());

    // ─── Usar novo símbolo de lâmpada para lampada_simples/lampada ───
    let grupoCompleto;

    const scaleX = componente.scale_x || 1.0;
    const scaleY = componente.scale_y || 1.0;
    const angle = componente.rotacao || 0.0;

    if (categoria === "lampada" && (componente.tipo === "lampada" || componente.tipo === "lampada_simples")) {
      // Novo símbolo com divisões internas e texto dinâmico ancorado
      const lampGroup = createLampSymbol(electricalData);
      const children = glow ? [glow, lampGroup] : [lampGroup];
      grupoCompleto = new fabric.Group(children, {
        left: componente.x * ESCALA_PX_POR_METRO,
        top: -componente.y * ESCALA_PX_POR_METRO,
        scaleX,
        scaleY,
        angle,
        originX: "center",
        originY: "center",
        cornerColor: "#6366f1",
        cornerStrokeColor: "#6366f1",
        borderColor: "#6366f180",
        cornerSize: 7,
        cornerStyle: "circle",
        transparentCorners: false,
        padding: 4,
      });
    } else if (categoria === "passagem" && componente.tipo === "caixa_passagem") {
      // Caixa de Passagem: quadrado com X dentro + textos
      const passagemGroup = createCaixaPassagemSymbol(electricalData);
      const children = glow ? [glow, passagemGroup] : [passagemGroup];
      grupoCompleto = new fabric.Group(children, {
        left: componente.x * ESCALA_PX_POR_METRO,
        top: -componente.y * ESCALA_PX_POR_METRO,
        scaleX,
        scaleY,
        angle,
        originX: "center",
        originY: "center",
        cornerColor: "#6366f1",
        cornerStrokeColor: "#6366f1",
        borderColor: "#6366f180",
        cornerSize: 7,
        cornerStyle: "rect",
        transparentCorners: false,
        padding: 4,
      });
    } else {
      // ─── Obter shapes do símbolo tradicional ──────────────────────────
      const symbolShapes = obterFormasDoSimbolo(componente.tipo, cor);

      // ─── Adicionar labels de texto (fabric.IText) visíveis no canvas ──
      // Interruptores só mostram o símbolo (sem labels externos)
      if (categoria !== "interruptor") {
        const labelOffsetX = 18;
        const isDark = document.documentElement.getAttribute("data-theme") !== "light";
        const textColor = isDark ? "#cbd5e1" : "#334155";

        function addLabel(key, offsetY) {
          const prop = electricalData[key];
          if (!prop) return;
          const textValue = prop.value != null ? String(prop.value) : "";
          const visible = prop.visible === true;
          if (!visible || !textValue.trim()) return;

          const label = new fabric.IText(textValue, {
            fontSize: 8,
            fontFamily: "Inter, system-ui, sans-serif",
            fill: textColor,
            fontWeight: "500",
            originX: "left",
            originY: "center",
            left: labelOffsetX,
            top: offsetY,
            selectable: false,
            evented: false,
            visible: true,
          });
          label.data = { labelKey: key };
          symbolShapes.push(label);
        }

        if (electricalData.circuito?.value) {
          addLabel("circuito", -6);
        }
        if (electricalData.comando?.value) {
          addLabel("comando", 6);
        }
        if (electricalData.potencia_va?.value && electricalData.potencia_va?.visible) {
          addLabel("potencia_va", 14);
        }
        if (electricalData.nome?.value) {
          addLabel("nome", -14);
        }
      }

      const children = glow ? [glow, ...symbolShapes] : [...symbolShapes];
      grupoCompleto = new fabric.Group(children, {
        left: componente.x * ESCALA_PX_POR_METRO,
        top: -componente.y * ESCALA_PX_POR_METRO,
        scaleX,
        scaleY,
        angle,
        originX: "center",
        originY: "center",
        cornerColor: "#6366f1",
        cornerStrokeColor: "#6366f1",
        borderColor: "#6366f180",
        cornerSize: 7,
        cornerStyle: "circle",
        transparentCorners: false,
        padding: 4,
      });
    }

    grupoCompleto.data = { componentId: componente.id, tipo: componente.tipo };
    grupoCompleto.electricalData = electricalData;

    if (onModified) {
      grupoCompleto.on("modified", () => onModified(grupoCompleto));
    }

    grupoCompleto.on("moving", () => {
      atualizarLinhasDoComponente(componente.id, grupoCompleto.left, grupoCompleto.top);
    });

    canvas.add(grupoCompleto);
    return grupoCompleto;
  }

  /**
   * Atualiza as coordenadas das linhas ligadas a um componente específico.
   * Chamado em tempo real durante o evento 'moving' do Fabric.js.
   */
  /**
   * Atualiza as coordenadas dos paths ligados a um componente específico em tempo real durante o arraste.
   */
  function atualizarLinhasDoComponente(componentId, left, top) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.getObjects().forEach((obj) => {
      if (obj.data?.isConnection || obj.data?.isConnectionGlow) {
        if (obj.data.origemId === componentId || obj.data.destinoId === componentId) {
          const pathArr = obj.path;
          if (!pathArr || pathArr.length < 2) return;

          let origX = pathArr[0][1];
          let origY = pathArr[0][2];

          const lastIdx = pathArr.length - 1;
          const targetCmd = pathArr[lastIdx];
          let destX = targetCmd[0] === 'Q' ? targetCmd[3] : targetCmd[1];
          let destY = targetCmd[0] === 'Q' ? targetCmd[4] : targetCmd[2];

          if (obj.data.origemId === componentId) {
            origX = left;
            origY = top;
          }
          if (obj.data.destinoId === componentId) {
            destX = left;
            destY = top;
          }

          let newPathStr;
          if (targetCmd[0] === 'Q') {
            const hx = targetCmd[1];
            const hy = targetCmd[2];
            newPathStr = `M ${origX} ${origY} Q ${hx} ${hy} ${destX} ${destY}`;
          } else {
            newPathStr = `M ${origX} ${origY} L ${destX} ${destY}`;
          }

          const tempPath = new fabric.Path(newPathStr);
          obj.set({
            path: tempPath.path,
            left: tempPath.left,
            top: tempPath.top,
            width: tempPath.width,
            height: tempPath.height,
            pathOffset: tempPath.pathOffset,
          });
          obj.setCoords();
        }
      }
    });
    canvas.requestRenderAll();
  }

  /**
   * Desenha uma conexão (conduto) entre dois componentes como um fabric.Path (reta ou curva).
   */
  function desenharConexao(conexao, componentes) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    const origem = componentes.find((c) => c.id === conexao.origem_id);
    const destino = componentes.find((c) => c.id === conexao.destino_id);
    if (!origem || !destino) return null;

    const x1 = origem.x * ESCALA_PX_POR_METRO;
    const y1 = -origem.y * ESCALA_PX_POR_METRO;
    const x2 = destino.x * ESCALA_PX_POR_METRO;
    const y2 = -destino.y * ESCALA_PX_POR_METRO;

    const c1_x = conexao.c1_x != null ? conexao.c1_x * ESCALA_PX_POR_METRO : null;
    const c1_y = conexao.c1_y != null ? -conexao.c1_y * ESCALA_PX_POR_METRO : null;

    const isCurved = c1_x != null && c1_y != null;
    const pathData = isCurved
      ? `M ${x1} ${y1} Q ${c1_x} ${c1_y} ${x2} ${y2}`
      : `M ${x1} ${y1} L ${x2} ${y2}`;

    const isSubterraneo = conexao.localizacao === "subterraneo";
    const strokeDashArray = isSubterraneo ? [8, 4] : null;

    // Hit-target transparente por trás para facilitar seleção de condutos estreitos
    const glowPath = new fabric.Path(pathData, {
      stroke: "rgba(0, 0, 0, 0.001)",
      strokeWidth: 14,
      fill: "transparent",
      selectable: false,
      evented: false,
    });
    glowPath.data = {
      isConnectionGlow: true,
      connectionId: conexao.id,
      origemId: conexao.origem_id,
      destinoId: conexao.destino_id,
    };

    // Objeto Path principal do conduto
    const pathObj = new fabric.Path(pathData, {
      stroke: "#000000", // por padrão é preto
      strokeWidth: 3,
      strokeDashArray,
      fill: "transparent",
      selectable: true,
      evented: true,
      hoverCursor: "pointer",
      hasBorders: false,
      hasControls: false,
      padding: 6,
    });

    pathObj.data = {
      isConnection: true,
      connectionId: conexao.id,
      origemId: conexao.origem_id,
      destinoId: conexao.destino_id,
      tipoCabo: conexao.tipo_cabo,
      isCurved,
      c1_x: conexao.c1_x,
      c1_y: conexao.c1_y,
    };

    pathObj.electricalData = {
      type: "conduto",
      connectionId: conexao.id,
      origemId: conexao.origem_id,
      destinoId: conexao.destino_id,
      tipoCabo: conexao.tipo_cabo || "",
      localizacao: conexao.localizacao || "teto_parede",
      circuitos_bloqueados: conexao.circuitos_bloqueados || [],
      c1_x: conexao.c1_x,
      c1_y: conexao.c1_y,
    };

    // Mudança de cor: vermelho quando selecionado, preto quando desselecionado
    pathObj.on("selected", () => {
      pathObj.set("stroke", "#ef4444"); // vermelho quando selecionado
      canvas.requestRenderAll();
    });
    pathObj.on("deselected", () => {
      pathObj.set("stroke", "#000000"); // preto por padrão
      canvas.requestRenderAll();
    });

    canvas.add(glowPath);
    canvas.add(pathObj);

    canvas.sendObjectToBack(glowPath);
    canvas.sendObjectToBack(pathObj);

    return pathObj;
  }

  /**
   * Atualiza as posições de todas as linhas/paths de conexão no canvas.
   */
  function atualizarConexoes(conexoes, componentes) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const existingLines = new Map();
    const existingIds = new Set();
    canvas.getObjects().forEach((obj) => {
      if (obj.data?.isConnection) {
        existingLines.set(obj.data.connectionId, { ...(existingLines.get(obj.data.connectionId) || {}), line: obj });
        existingIds.add(obj.data.connectionId);
      } else if (obj.data?.isConnectionGlow) {
        existingLines.set(obj.data.connectionId, { ...(existingLines.get(obj.data.connectionId) || {}), glow: obj });
        existingIds.add(obj.data.connectionId);
      }
    });

    const targetIds = new Set(conexoes.map((c) => c.id));

    // Remover conexões que já não existem
    for (const id of existingIds) {
      if (!targetIds.has(id)) {
        const entry = existingLines.get(id);
        if (entry?.line) canvas.remove(entry.line);
        if (entry?.glow) canvas.remove(entry.glow);
      }
    }

    const compMap = new Map(componentes.map((c) => [c.id, c]));

    conexoes.forEach((con) => {
      const origem = compMap.get(con.origem_id);
      const destino = compMap.get(con.destino_id);
      if (!origem || !destino) return;

      const x1 = origem.x * ESCALA_PX_POR_METRO;
      const y1 = -origem.y * ESCALA_PX_POR_METRO;
      const x2 = destino.x * ESCALA_PX_POR_METRO;
      const y2 = -destino.y * ESCALA_PX_POR_METRO;

      const c1_x = con.c1_x != null ? con.c1_x * ESCALA_PX_POR_METRO : null;
      const c1_y = con.c1_y != null ? -con.c1_y * ESCALA_PX_POR_METRO : null;
      const isCurved = c1_x != null && c1_y != null;

      const pathDataString = isCurved
        ? `M ${x1} ${y1} Q ${c1_x} ${c1_y} ${x2} ${y2}`
        : `M ${x1} ${y1} L ${x2} ${y2}`;

      const isSubterraneo = con.localizacao === "subterraneo";
      const strokeDashArray = isSubterraneo ? [8, 4] : null;

      const existing = existingLines.get(con.id);
      if (existing?.line) {
        const tempPath = new fabric.Path(pathDataString);
        existing.line.set({
          path: tempPath.path,
          left: tempPath.left,
          top: tempPath.top,
          width: tempPath.width,
          height: tempPath.height,
          pathOffset: tempPath.pathOffset,
          strokeDashArray,
        });
        existing.line.data = {
          ...existing.line.data,
          isCurved,
          c1_x: con.c1_x,
          c1_y: con.c1_y,
        };
        existing.line.electricalData = {
          type: "conduto",
          connectionId: con.id,
          origemId: con.origem_id,
          destinoId: con.destino_id,
          tipoCabo: con.tipo_cabo || "",
          localizacao: con.localizacao || "teto_parede",
          circuitos_bloqueados: con.circuitos_bloqueados || [],
          c1_x: con.c1_x,
          c1_y: con.c1_y,
        };
        existing.line.setCoords();

        if (existing.glow) {
          existing.glow.set({
            path: tempPath.path,
            left: tempPath.left,
            top: tempPath.top,
            width: tempPath.width,
            height: tempPath.height,
            pathOffset: tempPath.pathOffset,
          });
          existing.glow.setCoords();
        }
      } else {
        desenharConexao(con, componentes);
      }
    });

    canvas.requestRenderAll();
  }

  /**
   * Encontra o componente mais próximo do ponto clicado no canvas.
   * Retorna o componentId ou null.
   */
  function encontrarComponenteEm(pointer) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    const objects = canvas.getObjects();
    for (const obj of objects) {
      if (obj.data?.componentId) {
        const bounds = obj.getBoundingRect();
        // Expand hit area slightly for easier clicking
        const margin = 10;
        if (
          pointer.x >= bounds.left - margin &&
          pointer.x <= bounds.left + bounds.width + margin &&
          pointer.y >= bounds.top - margin &&
          pointer.y <= bounds.top + bounds.height + margin
        ) {
          return obj.data.componentId;
        }
      }
    }
    return null;
  }

  /**
   * Desenha uma divisão (Room) no canvas como um retângulo sólido com aspeto de planta.
   * Paredes sólidas, fill subtil por tipo de divisão, label centralizado e legível.
   */
  function desenharRoom(room, { onModified } = {}) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    let left = 150;
    let top = 150;
    let width = 200;
    let height = 150;
    const nomeRaw = room.nome || "Divisão";
    // Mostrar apenas o nome (sem dimensões no label principal)
    const nomeLabel = nomeRaw.replace(/\(\d+m²\)/g, "").trim();

    try {
      const geojson = JSON.parse(room.poligono_geojson);
      if (geojson.coordinates && geojson.coordinates[0]) {
        const coords = geojson.coordinates[0];
        const world_x = coords[0][0];
        const world_y = coords[0][1];
        const world_w = Math.abs(coords[2][0] - coords[0][0]);
        const world_h = Math.abs(coords[0][1] - coords[2][1]);

        left = world_x * ESCALA_PX_POR_METRO;
        top = -world_y * ESCALA_PX_POR_METRO;
        width = world_w * ESCALA_PX_POR_METRO;
        height = world_h * ESCALA_PX_POR_METRO;
      }
    } catch (e) {
      console.error("Erro ao fazer parse do GeoJSON da room:", e);
    }

    // ─── Cor de fill baseada no tipo de divisão ───────────────────────────
    const nome_lower = nomeLabel.toLowerCase();
    let fillColor;
    if (nome_lower.includes("quarto") || nome_lower.includes("suite"))
      fillColor = "rgba(99, 102, 241, 0.07)";  // índigo (dormitório)
    else if (nome_lower.includes("sala"))
      fillColor = "rgba(34, 197, 94, 0.06)";   // verde (sala)
    else if (nome_lower.includes("cozinha"))
      fillColor = "rgba(249, 115, 22, 0.07)"; // laranja (cozinha)
    else if (nome_lower.includes("w.c") || nome_lower.includes("wc") || nome_lower.includes("lavab") || nome_lower.includes("i.s"))
      fillColor = "rgba(56, 189, 248, 0.07)";  // azul (WC)
    else if (nome_lower.includes("varanda") || nome_lower.includes("terraço"))
      fillColor = "rgba(163, 230, 53, 0.06)";  // lima (exterior)
    else if (nome_lower.includes("corredor") || nome_lower.includes("hall"))
      fillColor = "rgba(148, 163, 184, 0.05)"; // cinzento (circulação)
    else
      fillColor = "rgba(148, 163, 184, 0.04)"; // neutro

    // ─── Retângulo da divisão (parede sólida) ────────────────────────────
    const rect = new fabric.Rect({
      left: 0,
      top: 0,
      width: width,
      height: height,
      fill: fillColor,
      stroke: "#94a3b8",
      strokeWidth: 2,
      rx: 0,
      ry: 0,
    });

    // ─── Dimensões em metros ──────────────────────────────────────────────
    const getDimText = (w, h) => {
      const wm = (w / ESCALA_PX_POR_METRO).toFixed(1);
      const hm = (h / ESCALA_PX_POR_METRO).toFixed(1);
      return `${wm}m × ${hm}m`;
    };

    // Nome principal
    const labelFontSize = Math.max(10, Math.min(16, width / 8, height / 4));
    const labelNome = new fabric.Text(nomeLabel, {
      fontSize: labelFontSize,
      fontWeight: "600",
      fill: "#e2e8f0",
      fontFamily: "Inter, system-ui, sans-serif",
      textAlign: "center",
      originX: "center",
      originY: "center",
      left: width / 2,
      top: height / 2 - labelFontSize * 0.7,
      selectable: false,
    });

    // Dimensões (pequenas, abaixo do nome)
    const labelDim = new fabric.Text(getDimText(width, height), {
      fontSize: Math.max(8, Math.min(11, width / 12)),
      fill: "#64748b",
      fontFamily: "Inter, system-ui, sans-serif",
      textAlign: "center",
      originX: "center",
      originY: "center",
      left: width / 2,
      top: height / 2 + labelFontSize * 0.5,
      selectable: false,
    });

    const grupo = new fabric.Group([rect, labelNome, labelDim], {
      left: left,
      top: top,
      cornerColor: "#94a3b8",
      borderColor: "#94a3b8",
      cornerSize: 8,
      cornerStyle: "rect",
      transparentCorners: false,
      padding: 0,
    });
    grupo.data = { roomId: room.id, isRoom: true };

    // Atualiza labels durante redimensionamento
    grupo.on("scaling", () => {
      const cw = rect.width * grupo.scaleX;
      const ch = rect.height * grupo.scaleY;
      labelDim.set({ text: getDimText(cw, ch) });
      canvas.renderAll();
    });

    if (onModified) {
      grupo.on("modified", () => {
        const finalWidth = rect.width * grupo.scaleX;
        const finalHeight = rect.height * grupo.scaleY;
        const finalLeft = grupo.left;
        const finalTop = grupo.top;

        rect.set({ width: finalWidth, height: finalHeight });
        labelNome.set({ left: finalWidth / 2, top: finalHeight / 2 - labelFontSize * 0.7 });
        labelDim.set({ left: finalWidth / 2, top: finalHeight / 2 + labelFontSize * 0.5, text: getDimText(finalWidth, finalHeight) });
        grupo.set({ scaleX: 1, scaleY: 1, left: finalLeft, top: finalTop });
        grupo.addWithUpdate();

        onModified(grupo, finalWidth, finalHeight);
      });
    }

    canvas.add(grupo);
    canvas.sendObjectToBack(grupo);
    // NÃO chamar renderAll() aqui — o chamador faz uma vez no fim
    return grupo;
  }

  function limpar() {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = getCanvasBg();
    geometriaRef.current = null;
    floorPlanGroupRef.current = null;
    floorPlanScaleRef.current = 1;
    floorPlanClipRectRef.current = null;
    floorPlanModeRef.current = null;
  }

  function setGridVisible(visible) {
    gridVisibleRef.current = visible;
    const canvas = fabricCanvasRef.current;
    if (canvas) canvas.requestRenderAll();
  }

  /** Alterna o bloqueio da planta (selectable/evented) */
  const toggleFloorPlanLock = useCallback(() => {
    const grupo = floorPlanGroupRef.current;
    if (!grupo) return false;
    const locked = grupo.selectable === false || grupo.evented === false;
    grupo.set({
      selectable: locked,
      evented: locked,
      hoverCursor: locked ? "pointer" : "default",
    });
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      canvas.discardActiveObject();
      canvas.renderAll();
    }
    return !locked; // retorna o novo estado: true = locked
  }, []);

  return {
    fabricCanvasRef,
    pronto,
    desenharGeometria,
    desenharComponente,
    desenharConexao,
    desenharRoom,
    atualizarConexoes,
    encontrarComponenteEm,
    limpar,
    setGridVisible,
    toggleFloorPlanLock,
    // Floor plan editing refs (for useFloorPlanTools)
    geometriaRef,
    floorPlanGroupRef,
    floorPlanScaleRef,
    floorPlanClipRectRef,
    floorPlanModeRef,
  };
}
