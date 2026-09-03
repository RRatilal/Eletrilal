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
  ctx.strokeStyle = "rgba(255, 166, 43, 0.22)";
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

/**
 * Devolve o ponto médio de um conduto (fabric.Path) em coordenadas de mundo (px)
 * e o ângulo do eixo do conduto. Para curvas de Bézier (Q) usa o ponto médio
 * geométrico em t=0.5 — a tangente nesse ponto é paralela ao segmento reto entre
 * os extremos, logo a perpendicular calculada a partir do ângulo é a correta.
 */
function obterPontoMedioConduto(pathArr) {
  if (!pathArr || pathArr.length < 2) return null;
  const start = pathArr[0];
  const last = pathArr[pathArr.length - 1];
  if (!start || !last) return null;

  const x1 = start[1], y1 = start[2];
  let x2, y2, cx, cy;
  if (last[0] === "Q") {
    cx = last[1]; cy = last[2]; x2 = last[3]; y2 = last[4];
  } else {
    x2 = last[1]; y2 = last[2];
  }

  let x, y;
  if (last[0] === "Q") {
    x = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
    y = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  } else {
    x = (x1 + x2) / 2;
    y = (y1 + y2) / 2;
  }
  return { x, y, angle: Math.atan2(y2 - y1, x2 - x1) };
}

const ZOOM_MINIMO_FIACAO = 0.5; // abaixo disto os rótulos viram ruído — esconder

function rectsColidem(a, b, folga = 2) {
  return !(
    a.x2 + folga < b.x1 ||
    b.x2 + folga < a.x1 ||
    a.y2 + folga < b.y1 ||
    b.y2 + folga < a.y1
  );
}

/**
 * Desenha a indicação de fiação de cada conduto (Connection): uma única linha
 * de chamada oblíqua sai do conduto e termina no INÍCIO de uma régua horizontal,
 * onde cada circuito é um slash vertical (número por cima, secção mm² por baixo)
 * mais um slash "T" de terra. Só rotula onde a composição muda (mostrar_rotulo).
 *
 * Os rótulos são colocados com deteção de colisão (réguas entre si e contra os
 * condutos) e escondidos quando o zoom está demasiado afastado.
 */
export function drawFiacaoTicks(canvas, fiacaoRef, fiacaoVisivelRef) {
  if (!fiacaoVisivelRef.current || !fiacaoRef.current) return;
  const ctx = canvas.getContext();
  if (!ctx) return;

  const zoom = canvas.getZoom();
  const vpt = canvas.viewportTransform;

  // Zoom muito afastado → esconder para não virar uma "bagunça" ilegível.
  if (zoom < ZOOM_MINIMO_FIACAO) return;

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const corTinta = isDark ? "#e5e7eb" : "#111827";

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "10px 'Spline Sans Mono', monospace";
  ctx.textAlign = "center";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = corTinta;
  ctx.fillStyle = corTinta;

  // 1) Recolhe os condutos a rotular e a caixa de colisão de cada conduto (ecrã).
  const candidatos = [];
  canvas.getObjects().forEach((obj) => {
    if (!obj.data?.isConnection) return;
    const info = fiacaoRef.current[obj.data.connectionId];
    if (!info || info.circuitos.length === 0) return;
    if (info.mostrar_rotulo === false) return;

    const mid = obterPontoMedioConduto(obj.path);
    if (!mid) return;

    const br = obj.getBoundingRect();
    candidatos.push({
      connectionId: obj.data.connectionId,
      mid,
      info,
      condutoBox: {
        x1: br.left * zoom + vpt[4],
        y1: br.top * zoom + vpt[5],
        x2: (br.left + br.width) * zoom + vpt[4],
        y2: (br.top + br.height) * zoom + vpt[5],
      },
    });
  });

  // 2) Rótulos maiores (mais circuitos) primeiro — têm prioridade de espaço.
  candidatos.sort((a, b) => b.info.circuitos.length - a.info.circuitos.length);

  // 3) Colocação greedy: desenha só se não colidir com réguas já colocadas
  //    nem com os condutos (exceto o seu próprio).
  const colocados = [];
  const margem = 8;
  const slashLen = 6;

  candidatos.forEach((cond) => {
    const mid = cond.mid;
    const scx = mid.x * zoom + vpt[4];
    const scy = mid.y * zoom + vpt[5];

    // Um slash por circuito (o número representa o par F+N), mais um "T" no fim.
    const itens = [
      ...cond.info.circuitos.map((c) => ({
        label: c.numero != null ? String(c.numero) : "?",
        bitola: c.bitola_mm2 != null ? String(c.bitola_mm2) : null,
      })),
      { label: "T", bitola: null },
    ];

    // Espaçamento adaptativo: considera a maior largura entre números e bitolas
    // para os valores (bitola) por baixo não se sobreporem.
    let maxTextoWidth = 0;
    itens.forEach((item) => {
      const wLabel = ctx.measureText(item.label).width;
      const wBitola = item.bitola ? ctx.measureText(item.bitola).width : 0;
      maxTextoWidth = Math.max(maxTextoWidth, wLabel, wBitola);
    });
    const espacamento = Math.max(16, maxTextoWidth + 6); // px entre slashes
    const totalLargura = (itens.length - 1) * espacamento;
    const rulerLen = margem + totalLargura + margem;
    const leadLen = 24; // px no ecrã

    // Tenta colocar primeiro para cima/direita, depois para cima/esquerda.
    for (const dir of [1, -1]) {
      const ex = scx + dir * leadLen * Math.SQRT1_2;
      const ey = scy - leadLen * Math.SQRT1_2;

      const labelBox = {
        x1: Math.min(ex, ex + dir * rulerLen) - 6,
        y1: ey - 24,
        x2: Math.max(ex, ex + dir * rulerLen) + 6,
        y2: ey + 22,
      };

      // Colisão com réguas já colocadas
      if (colocados.some((b) => rectsColidem(labelBox, b))) continue;
      // Colisão com outros condutos
      if (
        candidatos.some(
          (o) => o.connectionId !== cond.connectionId && rectsColidem(labelBox, o.condutoBox, 4)
        )
      ) {
        continue;
      }

      // Linha de chamada (uma só) desde o conduto até ao início da régua
      ctx.beginPath();
      ctx.moveTo(scx, scy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Régua horizontal
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + dir * rulerLen, ey);
      ctx.stroke();

      itens.forEach((item, i) => {
        const ix = ex + dir * (margem + i * espacamento);

        // Slash vertical a cruzar a régua
        ctx.beginPath();
        ctx.moveTo(ix, ey - slashLen);
        ctx.lineTo(ix, ey + slashLen);
        ctx.stroke();

        // Número do circuito por cima da régua
        ctx.fillText(item.label, ix, ey - slashLen - 3);
        // Secção (mm²) por baixo da régua
        if (item.bitola) {
          ctx.fillText(item.bitola, ix, ey + slashLen + 10);
        }
      });

      colocados.push(labelBox);
      break; // colocado com sucesso
    }
  });

  ctx.restore();
}
