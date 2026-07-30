/**
 * useDxfRenderer.js — Render nativo 2D de grelha e geometria DXF no canvas.
 * Extraído de useFabricCanvas.js para melhor organização.
 *
 * Desenha diretamente no Canvas 2D context (lower-canvas) como vectores nativos
 * que NUNCA ficam desfocados ao zoom, ao contrário de fabric.Path/Group.
 */
import { ESCALA_PX_POR_METRO, GRID_MINOR, GRID_MAJOR } from "./useMagneticSnap";

/**
 * Desenha a grelha adaptativa no contexto 2D do canvas.
 * A grelha acompanha zoom e pan, com linhas minor/major e crosshair na origem.
 */
export function drawDynamicGrid(canvas, gridVisibleRef) {
  if (!gridVisibleRef.current) return;
  const ctx = canvas.getContext();
  if (!ctx) return;

  const zoom = canvas.getZoom();
  const vpt = canvas.viewportTransform;
  const w = canvas.getWidth();
  const h = canvas.getHeight();

  const left = -vpt[4] / zoom;
  const top = -vpt[5] / zoom;
  const right = left + w / zoom;
  const bottom = top + h / zoom;

  const minorSpacing = GRID_MINOR;
  const majorSpacing = GRID_MAJOR;
  const showMinor = zoom * minorSpacing > 6;

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const minorColor = isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.06)";
  const majorColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.10)";

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (showMinor) {
    ctx.strokeStyle = minorColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const startX = Math.floor(left / minorSpacing) * minorSpacing;
    const startY = Math.floor(top / minorSpacing) * minorSpacing;

    for (let x = startX; x <= right; x += minorSpacing) {
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

  // Crosshair na origem
  const originX = Math.round(vpt[4]) + 0.5;
  const originY = Math.round(vpt[5]) + 0.5;
  ctx.strokeStyle = "rgba(99, 102, 241, 0.2)";
  ctx.lineWidth = 1;
  if (originX >= 0 && originX <= w) {
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, h);
    ctx.stroke();
  }
  if (originY >= 0 && originY <= h) {
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(w, originY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Desenha a geometria DXF diretamente no contexto 2D nativo (lower-canvas).
 * Apenas desenha entidades VISÍVEIS no viewport (viewport culling).
 * Suporta crop nativo, offset de arrasto e clipRect.
 */
export function drawDxfGeometry(canvas, geometriaRef, floorPlanGroupRef, floorPlanClipRectRef) {
  const data = geometriaRef.current;
  const clipRect = floorPlanClipRectRef.current;
  if (!data) return;

  const ctx = canvas.getContext();
  if (!ctx) return;

  const zoom = canvas.getZoom();
  const vpt = canvas.viewportTransform;
  const w = canvas.getWidth();
  const h = canvas.getHeight();

  // Calcular offset de arrasto (grupo agrupado)
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

  const vpLeft = -vpt[4] / zoom;
  const vpTop = -vpt[5] / zoom;
  const vpRight = vpLeft + w / zoom;
  const vpBottom = vpTop + h / zoom;

  const margin = 50;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Clip nativo se crop ativo
  if (clipRect) {
    const sx = (clipRect.left + offsetX) * zoom + vpt[4];
    const sy = (clipRect.top + offsetY) * zoom + vpt[5];
    const sw = clipRect.width * zoom;
    const sh = clipRect.height * zoom;
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
  }

  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Linhas individuais
  ctx.beginPath();
  let hasLines = false;
  for (const l of data.linhas) {
    const ox1 = l.x1 + offsetX, oy1 = l.y1 + offsetY;
    const ox2 = l.x2 + offsetX, oy2 = l.y2 + offsetY;

    if (ox1 < vpLeft - margin && ox2 < vpLeft - margin) continue;
    if (ox1 > vpRight + margin && ox2 > vpRight + margin) continue;
    if (oy1 < vpTop - margin && oy2 < vpTop - margin) continue;
    if (oy1 > vpBottom + margin && oy2 > vpBottom + margin) continue;

    ctx.moveTo(ox1 * zoom + vpt[4], oy1 * zoom + vpt[5]);
    ctx.lineTo(ox2 * zoom + vpt[4], oy2 * zoom + vpt[5]);
    hasLines = true;
  }
  if (hasLines) ctx.stroke();

  // Polilinhas
  ctx.beginPath();
  let hasPolys = false;
  for (const p of data.polilinhas) {
    const pts = p.pontos;
    if (pts.length < 2) continue;

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

    ctx.moveTo((pts[0].x + offsetX) * zoom + vpt[4], (pts[0].y + offsetY) * zoom + vpt[5]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo((pts[i].x + offsetX) * zoom + vpt[4], (pts[i].y + offsetY) * zoom + vpt[5]);
    }
    if (p.fechada) ctx.closePath();
    hasPolys = true;
  }
  if (hasPolys) ctx.stroke();

  // Círculos
  for (const c of data.circulos) {
    const cx = c.cx + offsetX;
    const cy = c.cy + offsetY;

    if (cx + c.raio < vpLeft - margin || cx - c.raio > vpRight + margin) continue;
    if (cy + c.raio < vpTop - margin || cy - c.raio > vpBottom + margin) continue;

    ctx.beginPath();
    ctx.arc(cx * zoom + vpt[4], cy * zoom + vpt[5], Math.max(c.raio * zoom, 0.5), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
