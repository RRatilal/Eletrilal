/**
 * SymbolFactory — Factories for advanced Fabric.js electrical symbols.
 */
import * as fabric from "fabric";

// ── Shared styling constants ──────────────────────────────────────────────
const LAMP_STROKE = "#FFA500";
const PASSAGEM_STROKE = "#8b5cf6";
const STROKE_WIDTH = 3;
const TEXT_COLOR = "#333";
const TEXT_FONT_SIZE = 16;
const TEXT_FONT_FAMILY = "Arial";

// ═══════════════════════════════════════════════════════════════════════════
//  LÂMPADA (Ceiling Lamp)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a fabric.Group for a ceiling lamp with internal divisions
 * and dynamic text labels anchored inside the symbol.
 *
 * @param {object} electricalData
 * @returns {fabric.Group}
 */
export function createLampSymbol(electricalData) {
  const data = electricalData || {};

  // ── Geometry (Standard 40x40 px size) ─────────────────────────────────
  const circle = new fabric.Circle({
    radius: 20, left: 0, top: 0,
    fill: "rgba(0,0,0,0.001)", stroke: LAMP_STROKE, strokeWidth: STROKE_WIDTH,
    originX: "center", originY: "center",
  });

  const hLine = new fabric.Line([-20, 0, 20, 0], {
    left: 0, top: 0,
    stroke: LAMP_STROKE, strokeWidth: STROKE_WIDTH,
    originX: "center", originY: "center",
  });

  const vLine = new fabric.Line([0, 0, 0, 20], {
    left: 0, top: 10,
    stroke: LAMP_STROKE, strokeWidth: STROKE_WIDTH,
    originX: "center", originY: "center",
  });

  // ── Texts ─────────────────────────────────────────────────────────────
  function makeLabel(id, value, left, top) {
    const t = new fabric.Text(value != null ? String(value) : "", {
      fontSize: 10, fontFamily: TEXT_FONT_FAMILY,
      fill: TEXT_COLOR, originX: "center", originY: "center",
      left, top, visible: true,
    });
    t.id = id;
    return t;
  }

  const texts = [
    makeLabel("label_potencia", data.potencia_va?.value ?? "", 0, -9),
    makeLabel("label_circuito", data.circuito?.value ?? "", -9, 8),
    makeLabel("label_comando",  data.comando?.value ?? "", 9, 8),
  ];

  const group = new fabric.Group([circle, hLine, vLine, ...texts], {
    originX: "center", originY: "center",
  });
  group.electricalData = data;
  return group;
}

const _lampKeyMap = {
  label_potencia: "potencia_va",
  label_circuito: "circuito",
  label_comando:  "comando",
};

/**
 * Updates text labels inside a lamp group.
 */
export function updateLampText(lampGroup, newData) {
  _updateGroupTexts(lampGroup, newData, _lampKeyMap);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAIXA DE PASSAGEM (Junction Box)
// ═══════════════════════════════════════════════════════════════════════════

const BOX_SIZE = 40; // side length in px
const HALF = BOX_SIZE / 2;

/**
 * Creates a fabric.Group for a junction box: plain square without
 * diagonals or text labels (clean symbol on the canvas).
 *
 * Text labels (nome, descricao, altura) are NOT rendered on the canvas
 * but remain available in the electricalData for the properties panel.
 *
 * Expected electricalData:
 *   {
 *     type: "caixa_passagem",
 *     nome:      { value: "CX1", visible: true },
 *     descricao: "PVC 4x4",                       // plain string
 *     altura:    { value: "280,00", visible: true },
 *     tamanho:   "100x100",                       // plain string (data only)
 *   }
 *
 * @param {object} electricalData
 * @returns {fabric.Group}
 */
export function createCaixaPassagemSymbol(electricalData) {
  const data = electricalData || {};

  // ── Geometry: square + X (no text labels on canvas) ───────────────────
  const square = new fabric.Rect({
    width: BOX_SIZE, height: BOX_SIZE,
    left: 0, top: 0,
    fill: "transparent", stroke: PASSAGEM_STROKE, strokeWidth: STROKE_WIDTH,
    originX: "center", originY: "center",
  });

  const diag1 = new fabric.Line([-HALF, -HALF, HALF, HALF], {
    left: 0, top: 0,
    stroke: PASSAGEM_STROKE, strokeWidth: STROKE_WIDTH,
    originX: "center", originY: "center",
  });

  const diag2 = new fabric.Line([-HALF, HALF, HALF, -HALF], {
    left: 0, top: 0,
    stroke: PASSAGEM_STROKE, strokeWidth: STROKE_WIDTH,
    originX: "center", originY: "center",
  });

  const group = new fabric.Group([square, diag1, diag2], {
    originX: "center", originY: "center",
  });
  group.electricalData = data;
  return group;
}

const _passagemKeyMap = {
  label_nome:      "nome",
  label_descricao: "descricao",
  label_altura:    "altura",
};

/**
 * Updates text labels inside a caixa de passagem group.
 */
export function updateCaixaPassagemText(passagemGroup, newData) {
  _updateGroupTexts(passagemGroup, newData, _passagemKeyMap);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generic text updater used by all symbol update functions.
 * Iterates children, finds fabric.Text by `.id`, and updates text + visible.
 *
 * @param {fabric.Group} group
 * @param {object} newData  — new electricalData
 * @param {object} keyMap   — { id_value: "field_name", ... }
 */
function _updateGroupTexts(group, newData, keyMap) {
  if (!group || !newData || !keyMap) return;

  group.forEachObject((child) => {
    if (child.type !== "text" && child.type !== "i-text") return;
    const labelId = child.id;
    if (!labelId || !keyMap[labelId]) return;

    const dataKey = keyMap[labelId];
    const prop = newData[dataKey];

    if (prop && typeof prop === "object" && "value" in prop) {
      child.set("text", String(prop.value ?? ""));
      child.set("visible", prop.visible === true);
    } else if (prop !== undefined) {
      child.set("text", String(prop));
      child.set("visible", true);
    }
  });

  group.setCoords();
}
