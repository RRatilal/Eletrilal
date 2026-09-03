/**
 * useMagneticSnap.js — Funções utilitárias para magnetic snap e grelha espacial.
 * Extraído de useFabricCanvas.js para melhor organização.
 */

// Escala: 1 metro do mundo real = 40 pixels no canvas (ajustável)
export const ESCALA_PX_POR_METRO = 40;

// Grid settings (in world-space pixels, before zoom)
export const GRID_MINOR = 20;  // minor grid every 20px (0.5m)
export const GRID_MAJOR = 100; // major grid every 100px (2.5m)

/**
 * Calcula o ponto mais próximo num segmento de reta AB
 * e a distância ortogonal até ao ponto P(px, py).
 */
export function getClosestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const distance = Math.hypot(px - x1, py - y1);
    return { x: x1, y: y1, distance, lineAngle: 0, dx: 0, dy: 0 };
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const distance = Math.hypot(px - projX, py - projY);
  const lineAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return { x: projX, y: projY, distance, lineAngle, dx, dy };
}

/**
 * Calcula o ângulo de rotação perpendicular (normal à parede)
 * orientado para o lado para onde o utilizador está a arrastar o componente.
 */
export function getPerpendicularSnapAngle(lineAngle, projX, projY, dragX, dragY) {
  const side1 = lineAngle;
  const side2 = lineAngle + 180;

  const vDragX = dragX - projX;
  const vDragY = dragY - projY;

  if (Math.hypot(vDragX, vDragY) < 0.001) {
    return ((side1 % 360) + 360) % 360;
  }

  const dragAngle = (Math.atan2(vDragY, vDragX) * 180) / Math.PI;

  const angleDiff = (a, b) => {
    let diff = ((a - b) % 360 + 540) % 360 - 180;
    return diff;
  };

  // O componente fica orientado pela direção da parede; o lado do arrasto
  // escolhe qual das duas orientações opostas deve ser usada.
  const diff1 = Math.abs(angleDiff(side1, dragAngle));
  const diff2 = Math.abs(angleDiff(side2, dragAngle));

  const chosen = diff1 < diff2 || Math.abs(diff1 - diff2) < 0.0001 && dragY >= projY ? side1 : side2;
  return ((chosen % 360) + 360) % 360;
}

/**
 * Índice as linhas da geometria DXF numa grelha espacial (spatial hash grid)
 * para consultas O(1) durante o magnetic snap a 60 FPS.
 */
export function indexarLinhasGeometria(geometria, wallLinesSpatialGridRef) {
  const grid = new Map();
  const lines = [];
  const cellSize = 150;

  const converter = (x, y) => ({
    px: x * ESCALA_PX_POR_METRO,
    py: -y * ESCALA_PX_POR_METRO,
  });

  const addLine = (x1, y1, x2, y2) => {
    const line = { x1, y1, x2, y2 };
    lines.push(line);

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const minCol = Math.floor(minX / cellSize);
    const maxCol = Math.floor(maxX / cellSize);
    const minRow = Math.floor(minY / cellSize);
    const maxRow = Math.floor(maxY / cellSize);

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const key = `${c}_${r}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(line);
      }
    }
  };

  if (geometria) {
    (geometria.linhas || []).forEach((l) => {
      const p1 = converter(l.x1, l.y1);
      const p2 = converter(l.x2, l.y2);
      addLine(p1.px, p1.py, p2.px, p2.py);
    });

    (geometria.polilinhas || []).forEach((poli) => {
      if (!poli.pontos || poli.pontos.length < 2) return;
      for (let i = 0; i < poli.pontos.length - 1; i++) {
        const p1 = converter(poli.pontos[i].x, poli.pontos[i].y);
        const p2 = converter(poli.pontos[i + 1].x, poli.pontos[i + 1].y);
        addLine(p1.px, p1.py, p2.px, p2.py);
      }
      if (poli.fechada && poli.pontos.length > 2) {
        const pLast = converter(poli.pontos[poli.pontos.length - 1].x, poli.pontos[poli.pontos.length - 1].y);
        const pFirst = converter(poli.pontos[0].x, poli.pontos[0].y);
        addLine(pLast.px, pLast.py, pFirst.px, pFirst.py);
      }
    });
  }

  wallLinesSpatialGridRef.current = { cellSize, grid, lines };
}

/**
 * Consulta linhas próximas de um ponto na grelha espacial.
 * Fallback para lista completa se a grelha estiver vazia.
 */
export function queryWallLinesGrid(px, py, wallLinesSpatialGridRef, radius = 20) {
  const { cellSize, grid, lines } = wallLinesSpatialGridRef.current;
  if (!grid || grid.size === 0) return lines;

  const minCol = Math.floor((px - radius) / cellSize);
  const maxCol = Math.floor((px + radius) / cellSize);
  const minRow = Math.floor((py - radius) / cellSize);
  const maxRow = Math.floor((py + radius) / cellSize);

  const candidatesSet = new Set();
  for (let c = minCol; c <= maxCol; c++) {
    for (let r = minRow; r <= maxRow; r++) {
      const key = `${c}_${r}`;
      const bucket = grid.get(key);
      if (bucket) {
        bucket.forEach((l) => candidatesSet.add(l));
      }
    }
  }

  return Array.from(candidatesSet);
}
