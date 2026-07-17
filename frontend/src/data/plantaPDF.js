/**
 * Planta de referência extraída do PDF "05 - ARQ - HID.pdf"
 * Moradia - Fonte d'Arte, Arquitectura & Construção
 * Terreno: 40.03m × 23.50m
 *
 * Coordenadas em metros, sistema cartesiano:
 *   - Origem (0,0) = canto SW (sul-oeste) do terreno
 *   - X cresce para Este (direita)
 *   - Y cresce para Norte (cima)
 *
 * Posições derivadas da planta arquitectónica:
 *   - Casa começa em x≈7.5m, y≈1.0m (dentro do terreno)
 *   - Piso 0 ocupa y: 1.0 → 13.5m
 *   - Piso 1 ocupa y: 14.5 → 23.0m (representação separada, sobreposta)
 */

export const PLANTA_PDF = {
  meta: {
    titulo: "Moradia (05 - ARQ - HID.pdf)",
    arquiteto: "Fonte d'Arte",
    terreno_w: 40.03,
    terreno_h: 23.50,
  },

  rooms: [
    // ─── Terreno ─────────────────────────────────────────────
    {
      nome: "Terreno",
      x: 0, y: 0, w: 40.03, h: 23.50,
      piso: -1,
    },

    // ─── PISO 0 — Rés-do-chão ────────────────────────────────

    // Fachada Sul (Varanda Principal — frente da casa)
    { nome: "Varanda Principal (28m²)",  x: 9.0,  y: 1.0,  w: 9.0,  h: 3.1,  piso: 0 },

    // Ala Esquerda (Oeste)
    { nome: "Corredor (15m²)",           x: 7.5,  y: 4.2,  w: 2.5,  h: 6.0,  piso: 0 },
    { nome: "Quarto 1 (18m²)",           x: 7.5,  y: 10.2, w: 4.5,  h: 4.0,  piso: 0 },
    { nome: "Vestiário (5m²)",           x: 10.0, y: 12.2, w: 2.5,  h: 2.0,  piso: 0 },
    { nome: "W.C. (4m²)",               x: 10.0, y: 10.2, w: 2.0,  h: 2.0,  piso: 0 },

    // Zona Central-Norte
    { nome: "W.C. (9m²)",               x: 12.5, y: 10.2, w: 3.0,  h: 3.0,  piso: 0 },
    { nome: "Quarto 2 (15m²)",          x: 15.5, y: 10.2, w: 5.0,  h: 3.0,  piso: 0 },
    { nome: "Arrumo (5m²)",             x: 20.5, y: 12.2, w: 2.5,  h: 2.0,  piso: 0 },
    { nome: "Lavabo (7m²)",             x: 20.5, y: 10.2, w: 3.5,  h: 2.0,  piso: 0 },

    // Zona Cozinha (Norte-Centro)
    { nome: "Cozinha (20m²)",           x: 24.0, y: 10.2, w: 5.0,  h: 4.0,  piso: 0 },
    { nome: "Dispensa (4m²)",           x: 29.0, y: 10.2, w: 2.0,  h: 2.0,  piso: 0 },
    { nome: "Varanda Norte (6m²)",      x: 24.0, y: 12.2, w: 3.0,  h: 2.0,  piso: 0 },

    // Corredor Central (liga quartos sul à zona norte)
    { nome: "Corredor Central (11m²)",  x: 12.5, y: 8.4,  w: 8.0,  h: 1.4,  piso: 0 },

    // Quartos Sul
    { nome: "Quarto 3 (11m²)",          x: 12.5, y: 4.2,  w: 3.7,  h: 3.0,  piso: 0 },
    { nome: "Quarto 4 (11m²)",          x: 16.2, y: 4.2,  w: 3.7,  h: 3.0,  piso: 0 },

    // Salas (Este)
    { nome: "Sala de Estar (26m²)",     x: 19.9, y: 4.2,  w: 6.5,  h: 4.0,  piso: 0 },
    { nome: "Sala de Jantar (12m²)",    x: 26.4, y: 4.2,  w: 4.0,  h: 3.0,  piso: 0 },

    // ─── PISO 1 — Andar ──────────────────────────────────────
    // (posicionado acima do piso 0 no canvas, y > 15m)
    { nome: "P1: Quarto (19m²)",        x: 10.5, y: 16.0, w: 4.75, h: 4.0,  piso: 1 },
    { nome: "P1: Sala (24m²)",          x: 15.5, y: 16.0, w: 6.0,  h: 4.0,  piso: 1 },
    { nome: "P1: W.C. (3m²)",           x: 21.5, y: 16.0, w: 1.5,  h: 2.0,  piso: 1 },
    { nome: "P1: Lavandaria (4m²)",     x: 21.5, y: 18.0, w: 2.0,  h: 2.0,  piso: 1 },
    { nome: "P1: Varanda (45m²)",       x: 10.5, y: 20.0, w: 15.0, h: 3.0,  piso: 1 },
  ],
};

/**
 * Converte os dados da planta para o formato GeoJSON Polygon
 * esperado pelo backend (poligono_geojson).
 */
export function roomToGeoJSON(room) {
  const { x, y, w, h } = room;
  return JSON.stringify({
    type: "Polygon",
    coordinates: [[
      [x,     y    ],
      [x + w, y    ],
      [x + w, y - h],  // y decresce para sul (coordenadas cartesianas)
      [x,     y - h],
      [x,     y    ],
    ]],
  });
}
