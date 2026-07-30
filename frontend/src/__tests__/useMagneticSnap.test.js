/**
 * Testes unitários para useMagneticSnap.js
 *
 * Testa funções matemáticas puras (sem dependências de React ou DOM):
 * - getClosestPointOnSegment
 * - getPerpendicularSnapAngle
 * - indexarLinhasGeometria
 * - queryWallLinesGrid
 * - Constantes (ESCALA_PX_POR_METRO, GRID_MINOR, GRID_MAJOR)
 */
import { describe, it, expect } from "vitest";
import {
  ESCALA_PX_POR_METRO,
  GRID_MINOR,
  GRID_MAJOR,
  getClosestPointOnSegment,
  getPerpendicularSnapAngle,
  indexarLinhasGeometria,
  queryWallLinesGrid,
} from "../hooks/useMagneticSnap";

// ─── Constantes ───────────────────────────────────────────────────────────

describe("Constantes", () => {
  it("ESCALA_PX_POR_METRO deve ser 40", () => {
    expect(ESCALA_PX_POR_METRO).toBe(40);
  });

  it("GRID_MINOR deve ser 20", () => {
    expect(GRID_MINOR).toBe(20);
  });

  it("GRID_MAJOR deve ser 100", () => {
    expect(GRID_MAJOR).toBe(100);
  });
});

// ─── getClosestPointOnSegment ─────────────────────────────────────────────

describe("getClosestPointOnSegment", () => {
  it("deve retornar o ponto inicial quando o segmento é degenerado (lenSq === 0)", () => {
    const result = getClosestPointOnSegment(5, 5, 2, 3, 2, 3);
    expect(result.x).toBe(2);
    expect(result.y).toBe(3);
    expect(result.distance).toBeCloseTo(Math.hypot(3, 2));
    expect(result.lineAngle).toBe(0);
  });

  it("deve retornar o ponto mais próximo no meio do segmento horizontal", () => {
    // Segmento horizontal de (0,0) a (10,0), ponto P(5, 5)
    const result = getClosestPointOnSegment(5, 5, 0, 0, 10, 0);
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(0);
    expect(result.distance).toBeCloseTo(5);
    expect(result.lineAngle).toBeCloseTo(0);
  });

  it("deve retornar o ponto mais próximo no meio do segmento vertical", () => {
    // Segmento vertical de (0,0) a (0,10), ponto P(3, 5)
    const result = getClosestPointOnSegment(3, 5, 0, 0, 0, 10);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(5);
    expect(result.distance).toBeCloseTo(3);
    expect(Math.abs(result.lineAngle)).toBeCloseTo(90);
  });

  it("deve retornar o ponto inicial quando P está antes do segmento", () => {
    // Segmento horizontal de (5,0) a (10,0), ponto P(0, 0)
    const result = getClosestPointOnSegment(0, 0, 5, 0, 10, 0);
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(0);
    expect(result.distance).toBeCloseTo(5);
  });

  it("deve retornar o ponto final quando P está depois do segmento", () => {
    // Segmento horizontal de (0,0) a (5,0), ponto P(10, 0)
    const result = getClosestPointOnSegment(10, 0, 0, 0, 5, 0);
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(0);
    expect(result.distance).toBeCloseTo(5);
  });

  it("deve calcular o ângulo correto para segmento diagonal", () => {
    // Segmento diagonal 45° de (0,0) a (10,10)
    const result = getClosestPointOnSegment(5, 5, 0, 0, 10, 10);
    expect(result.lineAngle).toBeCloseTo(45);
    expect(result.distance).toBeCloseTo(0);
  });
});

// ─── getPerpendicularSnapAngle ────────────────────────────────────────────

describe("getPerpendicularSnapAngle", () => {
  it("deve retornar o ângulo da parede quando o arrasto está desse lado", () => {
    // Parede horizontal (0°), arrasto para cima (dragAngle ~90°)
    const result = getPerpendicularSnapAngle(0, 5, 0, 5, 5);
    expect(result).toBeCloseTo(0);
  });

  it("deve retornar ângulo+180 quando o arrasto está do lado oposto", () => {
    // Parede horizontal (0°), arrasto para baixo (dragAngle ~-90° ou 270°)
    const result = getPerpendicularSnapAngle(0, 5, 0, 5, -5);
    expect(result).toBeCloseTo(180);
  });

  it("deve lidar com arrasto de magnitude zero (retornar side1 normalizado)", () => {
    const result = getPerpendicularSnapAngle(45, 5, 5, 5, 5);
    expect(result).toBeCloseTo(45);
  });

  it("deve escolher o lado correto para parede vertical", () => {
    // Parede vertical (90°), arrasto para a direita (dragAngle ~0°)
    const result = getPerpendicularSnapAngle(90, 5, 5, 10, 5);
    expect(result).toBeCloseTo(90);
  });

  it("deve retornar ângulos normalizados entre 0 e 360", () => {
    const result = getPerpendicularSnapAngle(-90, 5, 5, 5, 10);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
  });
});

// ─── indexarLinhasGeometria + queryWallLinesGrid ──────────────────────────

describe("indexarLinhasGeometria e queryWallLinesGrid", () => {
  it("deve indexar linhas simples e permitir consulta por proximidade", () => {
    const ref = { current: { cellSize: 150, grid: new Map(), lines: [] } };
    const geometria = {
      linhas: [
        { x1: 0, y1: 0, x2: 10, y2: 0 },   // linha horizontal
        { x1: 5, y1: -5, x2: 5, y2: 5 },     // linha vertical
      ],
    };

    indexarLinhasGeometria(geometria, ref);

    // Verificar que as linhas foram indexadas
    expect(ref.current.grid.size).toBeGreaterThan(0);
    expect(ref.current.lines.length).toBe(2);

    // Consultar perto da origem (deve encontrar ambas)
    const candidates = queryWallLinesGrid(0, 0, ref, 200);
    expect(candidates.length).toBe(2);
  });

  it("deve indexar polilinhas e consultar corretamente", () => {
    const ref = { current: { cellSize: 150, grid: new Map(), lines: [] } };
    const geometria = {
      polilinhas: [
        { pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], fechada: false },
      ],
    };

    indexarLinhasGeometria(geometria, ref);

    // Deve ter 2 segmentos (0→10, 10→10)
    expect(ref.current.lines.length).toBe(2);
  });

  it("deve indexar polilinhas fechadas com segmento extra", () => {
    const ref = { current: { cellSize: 150, grid: new Map(), lines: [] } };
    const geometria = {
      polilinhas: [
        { pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], fechada: true },
      ],
    };

    indexarLinhasGeometria(geometria, ref);

    // 2 segmentos normais + 1 de fecho = 3
    expect(ref.current.lines.length).toBe(3);
  });

  it("deve retornar array vazio se não houver linhas perto", () => {
    const ref = { current: { cellSize: 150, grid: new Map(), lines: [] } };
    const geometria = { linhas: [{ x1: 0, y1: 0, x2: 10, y2: 0 }] };

    indexarLinhasGeometria(geometria, ref);

    // Consultar longe — deve retornar vazio pois a grelha não tem células na área
    const candidates = queryWallLinesGrid(9999, 9999, ref, 20);
    expect(candidates.length).toBe(0);
  });

  it("deve ignorar polilinhas com < 2 pontos", () => {
    const ref = { current: { cellSize: 150, grid: new Map(), lines: [] } };
    const geometria = {
      polilinhas: [
        { pontos: [{ x: 0, y: 0 }], fechada: false }, // só 1 ponto
      ],
    };

    indexarLinhasGeometria(geometria, ref);
    expect(ref.current.lines.length).toBe(0);
  });

  it("deve lidar com geometria null/undefined graciosamente", () => {
    const ref = { current: { cellSize: 150, grid: new Map(), lines: [] } };

    indexarLinhasGeometria(null, ref);
    expect(ref.current.lines.length).toBe(0);

    indexarLinhasGeometria(undefined, ref);
    expect(ref.current.lines.length).toBe(0);
  });
});

// ─── Casos extremos ───────────────────────────────────────────────────────

describe("Casos extremos", () => {
  it("getClosestPointOnSegment com valores negativos", () => {
    const result = getClosestPointOnSegment(-5, -5, -10, -10, 0, 0);
    expect(result.x).toBeCloseTo(-5);
    expect(result.y).toBeCloseTo(-5);
    expect(result.distance).toBeCloseTo(0);
  });

  it("getPerpendicularSnapAngle com ângulos negativos", () => {
    // -45° deve normalizar para 315°
    const result = getPerpendicularSnapAngle(-45, 0, 0, 1, 1);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
  });

  it("indexarLinhasGeometria com dados vazios", () => {
    const ref = { current: { cellSize: 150, grid: new Map(), lines: [] } };
    indexarLinhasGeometria({ linhas: [], polilinhas: [] }, ref);
    expect(ref.current.lines.length).toBe(0);
  });
});
