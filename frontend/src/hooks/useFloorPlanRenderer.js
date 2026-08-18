/**
 * useFloorPlanRenderer.js — Renderização de planta, componentes, conexões e divisões.
 * Extraído de useFabricCanvas.js para melhor organização.
 *
 * Depende de: useMagneticSnap (ESCALA_PX_POR_METRO, indexarLinhasGeometria)
 */
import { useCallback, useRef } from "react";
import * as fabric from "fabric";
import { ESCALA_PX_POR_METRO, indexarLinhasGeometria } from "./useMagneticSnap";
import { criarElectricalData } from "./useCanvasIntegration";
import { createLampSymbol, createCaixaPassagemSymbol } from "../components/Canvas/SymbolFactory";

const CORES_SIMBOLOS = {
  lampada: "#f59e0b",
  tomada: "#3b82f6",
  telecom: "#ec4899",
  passagem: "#8b5cf6",
  interruptor: "#22c55e",
  quadro: "#ef4444",
  outro: "#ffa62b",
};

const LIMITE_OBJETOS_INDIVIDUAIS = 2000;

// ─── Helpers de símbolos ─────────────────────────────────────────────────

function triangulo(cx, cy, largura, altura, cor) {
  const mh = altura / 2;
  const mw = largura / 2;
  return new fabric.Path(
    `M ${cx} ${cy - mh} L ${cx + mw} ${cy + mh} L ${cx - mw} ${cy + mh} Z`,
    { fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }
  );
}

function triComm(cor) {
  return new fabric.Path("M 0 -11 L 7 1 L -7 1 Z", {
    fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center",
  });
}

/**
 * Cria as formas visuais (fabric objects) para um dado tipo de componente.
 */
function obterFormasDoSimbolo(tipo, cor) {
  const shapes = [];

  // ─── LÂMPADAS ──────────────────────────────────────
  if (tipo.startsWith("lampada")) {
    if (tipo === "lampada_simples" || tipo === "lampada") {
      shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "lampada_arandela") {
      shapes.push(new fabric.Line([4.5, -9, 4.5, 9], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Path("M 4.5 -9 A 9 9 0 0 0 4.5 9 Z", { fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "lampada_spot") {
      shapes.push(new fabric.Rect({ width: 20, height: 20, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Circle({ radius: 5, fill: cor, stroke: cor, strokeWidth: 1, originX: "center", originY: "center" }));
    } else if (tipo === "lampada_tubular") {
      shapes.push(new fabric.Rect({ width: 24, height: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -45 }));
      shapes.push(new fabric.Line([-8.5, 8.5, -8.5, 11.5], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([8.5, -8.5, 8.5, -11.5], { stroke: cor, strokeWidth: 1.5 }));
    } else if (tipo === "lampada_pendente") {
      shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Circle({ radius: 4, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "lampada_led" || tipo === "lampada_led_driver") {
      shapes.push(new fabric.Rect({ width: 26, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -15, top: -4 }));
      shapes.push(new fabric.Rect({ width: 26, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", angle: -15, top: 4 }));
    } else if (tipo === "lampada_led_fita") {
      // Símbolo simplificado: um pequeno traço tracejado para representar fita LED
      shapes.push(new fabric.Line([-10, 0, 10, 0], { stroke: cor, strokeWidth: 3, strokeDashArray: [3, 4], originX: "center", originY: "center" }));
    } else if (tipo === "lampada_jardim") {
      // LED de jardim: espeto + seta a apontar para cima (luz ascendente)
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([0, 6, 0, -6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Triangle({ width: 10, height: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([0, -7, 0, -12], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else {
      shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    }
  }

  // ─── TOMADAS ────────────────────────────────────────
  else if (tipo.startsWith("tomada")) {
    if (tipo === "tomada" || tipo === "tomada_baixa") {
      shapes.push(triangulo(0, -5, 16, 20, cor));
      shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "tomada_media") {
      shapes.push(triangulo(0, -5, 16, 20, cor));
      shapes.push(new fabric.Path("M 0 -15 L 0 5 L -8 5 Z", { fill: cor, stroke: "transparent", originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "tomada_alta") {
      shapes.push(new fabric.Path("M 0 -15 L 8 5 L -8 5 Z", { fill: cor, stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "tomada_dupla") {
      shapes.push(triangulo(0, -12, 13, 18, cor));
      shapes.push(triangulo(0, 3, 13, 18, cor));
      shapes.push(new fabric.Line([0, 12, 0, 18], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "tomada_piso") {
      shapes.push(new fabric.Rect({ width: 18, height: 18, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Path("M 5 0 L -9 -7 L -9 7 Z", { fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "tomada_tripla") {
      shapes.push(triangulo(0, -5, 16, 20, cor));
      shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([-6, -18, -6, -12], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([0, -20, 0, -14], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([6, -18, 6, -12], { stroke: cor, strokeWidth: 1.5 }));
    } else if (tipo === "tomada_trifasica") {
      shapes.push(new fabric.Circle({ radius: 11, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Circle({ radius: 4, fill: "transparent", stroke: "#ef4444", strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([0, 11, 0, 18], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "tomada_sensor") {
      shapes.push(triangulo(0, -5, 16, 20, cor));
      shapes.push(new fabric.Text("S", { fontSize: 7, fill: cor, fontWeight: "bold", originX: "center", originY: "center", top: -5 }));
      shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else {
      shapes.push(triangulo(0, -5, 16, 20, cor));
      shapes.push(new fabric.Line([0, 5, 0, 16], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    }
  }

  // ─── COMUNICAÇÕES ────────────────────────────────────
  else if (["telefonia", "dados", "tv", "campainha", "camera"].includes(tipo)) {
    if (tipo === "telefonia") {
      shapes.push(triComm(cor));
      shapes.push(new fabric.Path("M -5 -3 Q -5 3 0 3 Q 5 3 5 -3", { fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: 6 }));
      shapes.push(new fabric.Line([0, 1, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "dados") {
      shapes.push(triComm(cor));
      shapes.push(new fabric.Circle({ radius: 3, fill: "transparent", stroke: cor, strokeWidth: 1.2, originX: "center", originY: "center", top: 7 }));
      shapes.push(new fabric.Line([0, 1, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "tv") {
      shapes.push(triComm(cor));
      shapes.push(new fabric.Rect({ width: 10, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.2, originX: "center", originY: "center", top: 7, rx: 1, ry: 1 }));
      shapes.push(new fabric.Line([0, 1, 0, 7], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "campainha") {
      shapes.push(new fabric.Circle({ radius: 9, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Circle({ radius: 3, fill: cor, originX: "center", originY: "center" }));
      shapes.push(new fabric.Text("♪", { fontSize: 8, fill: cor, originX: "center", originY: "center", top: -1 }));
    } else if (tipo === "camera") {
      shapes.push(new fabric.Rect({ width: 14, height: 8, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", left: -3 }));
      shapes.push(new fabric.Path("M 4 -3 L 10 -5 L 10 5 L 4 3 Z", { fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([-10, 0, -10, 8], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    }
  }

  // ─── CAIXAS DE PASSAGEM ────────────────────────────────
  else if (tipo.startsWith("passagem")) {
    shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    if (tipo === "passagem_sobe") {
      shapes.push(new fabric.Path("M 0 4 L 0 -6 M -4 -2 L 0 -6 L 4 -2", { stroke: cor, strokeWidth: 2, fill: "transparent", originX: "center", originY: "center" }));
    } else if (tipo === "passagem_desce") {
      shapes.push(new fabric.Path("M 0 -6 L 0 4 M -4 0 L 0 4 L 4 0", { stroke: cor, strokeWidth: 2, fill: "transparent", originX: "center", originY: "center" }));
    } else {
      shapes.push(new fabric.Line([-6, -6, 6, 6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([-6, 6, 6, -6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    }
  }

  // ─── INTERRUPTORES ──────────────────────────────────────
  else if (tipo.startsWith("interruptor")) {
    if (tipo === "interruptor_simples" || tipo === "interruptor") {
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "interruptor_duplo") {
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([0, -18, 0, -6], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "interruptor_triplo") {
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([0, -12, 0, -18], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([0, -12, 5.2, -15], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([0, -12, -5.2, -15], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "interruptor_three_way" || tipo === "interruptor_paralelo") {
      shapes.push(new fabric.Circle({ radius: 6, fill: cor, stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "interruptor_bipolar") {
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Path("M 0 -18 A 6 6 0 0 0 0 -6 Z", { fill: cor, stroke: "transparent", originX: "center", originY: "center" }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "interruptor_four_way" || tipo === "interruptor_intermediario") {
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([-3, -20, 3, -14], { stroke: cor, strokeWidth: 1.5 }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    } else if (tipo === "sensor_presenca" || tipo === "interruptor_dimmer") {
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Path("M 4 -17 A 3 3 0 0 1 7 -14", { stroke: cor, strokeWidth: 1.5 }));
    } else if (tipo === "interruptor_pulsador") {
      shapes.push(new fabric.Circle({ radius: 9, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Circle({ radius: 4, fill: cor, stroke: cor, strokeWidth: 1, originX: "center", originY: "center" }));
    } else {
      shapes.push(new fabric.Circle({ radius: 6, fill: "transparent", stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center", top: -12 }));
      shapes.push(new fabric.Line([0, -6, 0, 10], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    }
  }

  // ─── QUADRO GERAL E PARCIAL ───────────────────────────
  else if (tipo === "quadro" || tipo === "quadro_parcial") {
    const isParcial = tipo === "quadro_parcial";
    const qCor = isParcial ? "#f97316" : cor;
    shapes.push(new fabric.Rect({ width: 24, height: 16, fill: "rgba(0,0,0,0.001)", stroke: qCor, strokeWidth: 2, originX: "center", originY: "center" }));
    if (isParcial) {
      shapes.push(new fabric.Path("M -12 8 L 12 -8", { stroke: qCor, strokeWidth: 1.5, originX: "center", originY: "center" }));
      shapes.push(new fabric.Path("M -2 -5 L -5 1 L 0 1 L 2 5 L 5 -1 L 0 -1 Z", { fill: qCor, stroke: "transparent", originX: "center", originY: "center" }));
    } else {
      shapes.push(new fabric.Path("M -2 -5 L -5 1 L 0 1 L 2 5 L 5 -1 L 0 -1 Z", { fill: qCor, stroke: "transparent", originX: "center", originY: "center" }));
    }
  }

  // ─── FALLBACK ────────────────────────────────────────
  else {
    shapes.push(new fabric.Circle({ radius: 10, fill: "transparent", stroke: cor, strokeWidth: 2, originX: "center", originY: "center" }));
    shapes.push(new fabric.Line([-6, -6, 6, 6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
    shapes.push(new fabric.Line([-6, 6, 6, -6], { stroke: cor, strokeWidth: 1.5, originX: "center", originY: "center" }));
  }

  return shapes;
}

/**
   * Cria um fabric.Group com o símbolo do componente e dados associados.
   * Usa createLampSymbol / createCaixaPassagemSymbol para tipos específicos.
   * Adiciona labels de texto (circuito, comando, potência) conforme o tipo.
   * Para interruptores: mostra um label por comando (simples=1, duplo=2, triplo=3).
   */
  function criarGrupoComponente(componente, onModified) {
    const tipo = componente.tipo;
    let categoria = "outro";
    if (tipo.startsWith("lampada")) categoria = "lampada";
    else if (tipo.startsWith("tomada")) categoria = "tomada";
    else if (["telefonia", "dados", "tv", "campainha", "camera"].includes(tipo)) categoria = "telecom";
    else if (tipo.startsWith("caixa_passagem")) categoria = "passagem";
    else if (tipo.startsWith("interruptor")) categoria = "interruptor";
    else if (tipo.startsWith("quadro")) categoria = "quadro";

    const cor = CORES_SIMBOLOS[categoria] || CORES_SIMBOLOS.outro;

    // ─── Comando inicial ──────────────────────────────────────────────────
    const comandoInicial = (() => {
      if (tipo.startsWith("caixa_passagem") && componente.rotulo) {
        try {
          const parsed = JSON.parse(componente.rotulo);
          if (parsed && typeof parsed === "object" && parsed.nome) return parsed.nome;
        } catch {}
        return componente.rotulo;
      }
      if (categoria === "lampada") {
        return componente.rotulo?.length === 1 ? componente.rotulo : "a";
      }
      if (categoria === "interruptor") {
        // Preservar o rotulo completo (pode ser "a,b,c") para os labels
        return componente.rotulo || "a";
      }
      return componente.rotulo || "";
    })();

    // ─── ElectricalData ───────────────────────────────────────────────────
    const electricalData = criarElectricalData(componente.tipo, (() => {
      if (tipo.startsWith("caixa_passagem") && componente.rotulo) {
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
        } catch {}
        return { nome: componente.rotulo };
      }
      return {
        potencia_va: componente.potencia_w != null ? String(componente.potencia_w) : "100",
        tensao: "220",
        comando: comandoInicial,
        circuito: componente.circuit_id != null ? String(componente.circuit_id) : "",
        nome: comandoInicial,
        tipo_tomada: componente.rotulo?.toLowerCase().includes("media")
          ? "media" : componente.rotulo?.toLowerCase().includes("alta") ? "alta" : "baixa",
        altura: componente.rotulo || "Baixa",
      };
    })());

    const scaleX = componente.scale_x ?? 1.0;
    const scaleY = componente.scale_y ?? 1.0;
    const angle = componente.rotacao || 0.0;

    let grupoCompleto;

    // O próprio símbolo define os limites da seleção. Não adicionar uma área
    // transparente auxiliar: ela torna a caixa de seleção maior do que o desenho.

    // ─── Símbolo de lâmpada especializado ─────────────────────────────────
    if (categoria === "lampada" && (tipo === "lampada" || tipo === "lampada_simples")) {
      const lampGroup = createLampSymbol(electricalData);
      const children = [lampGroup];
      grupoCompleto = new fabric.Group(children, {
        left: componente.x * ESCALA_PX_POR_METRO,
        top: -componente.y * ESCALA_PX_POR_METRO,
        scaleX,
        scaleY,
        angle,
        originX: "center",
        originY: "center",
        cornerColor: "#ffa62b", cornerStrokeColor: "#ffa62b", borderColor: "#ffa62b80",
        cornerSize: 7,
        cornerStyle: "circle",
        transparentCorners: false,
        padding: 0,
        selectable: true,
        evented: true,
        subTargetCheck: false,
        hoverCursor: "pointer",
        hasControls: true,
        hasBorders: true,
        lockRotation: false,
      });
    }

    // ─── Caixa de passagem especializada ────────────────────────────────────
    else if (categoria === "passagem" && tipo === "caixa_passagem") {
      const passagemGroup = createCaixaPassagemSymbol(electricalData);
      const children = [passagemGroup];
      grupoCompleto = new fabric.Group(children, {
        left: componente.x * ESCALA_PX_POR_METRO,
        top: -componente.y * ESCALA_PX_POR_METRO,
        scaleX,
        scaleY,
        angle,
        originX: "center",
        originY: "center",
        cornerColor: "#ffa62b", cornerStrokeColor: "#ffa62b", borderColor: "#ffa62b80",
        cornerSize: 7,
        cornerStyle: "rect",
        transparentCorners: false,
        padding: 0,
        selectable: true,
        evented: true,
        subTargetCheck: false,
        hoverCursor: "pointer",
        hasControls: true,
        hasBorders: true,
        lockRotation: false,
      });
    }

    // ─── Símbolo tradicional + labels ─────────────────────────────────────
    else {
      const symbolShapes = obterFormasDoSimbolo(tipo, cor);

      // Labels de texto visíveis no canvas
      const labelOffsetX = 18;
      const isDark = document.documentElement.getAttribute("data-theme") !== "light";
      const textColor = isDark ? "#cbd5e1" : "#334155";

      /**
       * Adiciona um label de texto a um dado offset vertical.
       * Para interruptores, o labelKey tem formato "comando_N" (ex: comando_0).
       */
      function addLabel(key, offsetY, textOverride) {
        const prop = electricalData[key];
        const textValue = textOverride != null
          ? String(textOverride)
          : (prop && prop.value != null ? String(prop.value) : "");
        const visible = prop ? (prop.visible === true) : true;
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

      // Labels de texto visíveis no canvas (exceto interruptores e quadros)
      if (categoria !== "interruptor" && categoria !== "quadro") {
        // Labels padrão para lâmpadas, tomadas, etc.
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

      const children = symbolShapes;
      grupoCompleto = new fabric.Group(children, {
        left: componente.x * ESCALA_PX_POR_METRO,
        top: -componente.y * ESCALA_PX_POR_METRO,
        scaleX,
        scaleY,
        angle,
        originX: "center",
        originY: "center",
        cornerColor: "#ffa62b", cornerStrokeColor: "#ffa62b", borderColor: "#ffa62b80",
        cornerSize: 7,
        cornerStyle: "circle",
        transparentCorners: false,
        padding: 0,
        selectable: true,
        evented: true,
        subTargetCheck: false,
        hoverCursor: "pointer",
        hasControls: true,
        hasBorders: true,
        lockRotation: false,
      });
    }

    grupoCompleto.data = { componentId: componente.id, tipo: componente.tipo };
    grupoCompleto.electricalData = electricalData;

    if (onModified) {
      grupoCompleto.on("modified", () => onModified(grupoCompleto));
    }

    return grupoCompleto;
  }

/**
 * Hook com as funções de renderização da planta, componentes, conexões e divisões.
 */
export function useFloorPlanRenderer(fabricCanvasRef, geometriaRef, floorPlanGroupRef, floorPlanScaleRef, floorPlanClipRectRef, floorPlanModeRef, wallLinesSpatialGridRef) {
  /**
   * Desenha a geometria da planta no canvas.
   * Modo individual (< 2000 objetos): cada linha é um fabric.Line num fabric.Group.
   * Modo agrupado (>= 2000 objetos): render nativo 2D context + invisible rect.
   */
  const desenharGeometria = useCallback((geometria) => {
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

    // Indexar linhas para magnetic snap
    indexarLinhasGeometria(geometria, wallLinesSpatialGridRef);

    geometriaRef.current = null;

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
      return _desenharGeometriaAgrupada(geometria, totalObjetos, canvas);
    } else {
      floorPlanModeRef.current = "individual";
      geometriaRef.current = structuredClone(geometria);
      return _desenharGeometriaIndividual(geometria, totalObjetos, canvas);
    }
  }, [fabricCanvasRef, geometriaRef, floorPlanGroupRef, floorPlanScaleRef, floorPlanClipRectRef, floorPlanModeRef, wallLinesSpatialGridRef]);

  /** Modo individual: fabric.Lines num fabric.Group */
  function _desenharGeometriaIndividual(geometria, totalObjetos, canvas) {
    const attrs = { stroke: "#4b5563", strokeWidth: 1.5, strokeUniform: true, selectable: false, evented: false };
    const dxfObjects = [];

    (geometria.linhas || []).forEach((l) => {
      dxfObjects.push(new fabric.Line(
        [l.x1 * ESCALA_PX_POR_METRO, -l.y1 * ESCALA_PX_POR_METRO, l.x2 * ESCALA_PX_POR_METRO, -l.y2 * ESCALA_PX_POR_METRO],
        attrs
      ));
    });

    (geometria.polilinhas || []).forEach((poli) => {
      if (!poli.pontos || poli.pontos.length < 2) return;
      for (let i = 0; i < poli.pontos.length - 1; i++) {
        const p1 = poli.pontos[i], p2 = poli.pontos[i + 1];
        dxfObjects.push(new fabric.Line(
          [p1.x * ESCALA_PX_POR_METRO, -p1.y * ESCALA_PX_POR_METRO, p2.x * ESCALA_PX_POR_METRO, -p2.y * ESCALA_PX_POR_METRO],
          attrs
        ));
      }
      if (poli.fechada && poli.pontos.length > 2) {
        const pLast = poli.pontos[poli.pontos.length - 1], pFirst = poli.pontos[0];
        dxfObjects.push(new fabric.Line(
          [pLast.x * ESCALA_PX_POR_METRO, -pLast.y * ESCALA_PX_POR_METRO, pFirst.x * ESCALA_PX_POR_METRO, -pFirst.y * ESCALA_PX_POR_METRO],
          attrs
        ));
      }
    });

    (geometria.circulos || []).forEach((c) => {
      dxfObjects.push(new fabric.Circle({
        left: c.cx * ESCALA_PX_POR_METRO - c.raio * ESCALA_PX_POR_METRO,
        top: -c.cy * ESCALA_PX_POR_METRO - c.raio * ESCALA_PX_POR_METRO,
        radius: c.raio * ESCALA_PX_POR_METRO,
        fill: "transparent", stroke: "#4b5563", strokeWidth: 1.5, strokeUniform: true, selectable: false, evented: false,
      }));
    });

    const grupo = new fabric.Group(dxfObjects, {
      selectable: true, evented: true, hoverCursor: "pointer",
      cornerColor: "#ffa62b", cornerStrokeColor: "#ffa62b", borderColor: "#ffa62b80",
      cornerSize: 7, cornerStyle: "circle", transparentCorners: false, padding: 2,
    });
    grupo.electricalData = { type: "floorplan" };
    floorPlanGroupRef.current = grupo;
    canvas.add(grupo);
    canvas.sendObjectToBack(grupo);
    return { modo: "individual", totalObjetos, group: grupo };
  }

  /** Modo agrupado: guarda dados para render nativo 2D + invisible rect */
  function _desenharGeometriaAgrupada(geometria, totalObjetos, canvas) {
    const converter = (x, y) => ({ px: x * ESCALA_PX_POR_METRO, py: -y * ESCALA_PX_POR_METRO });
    const data = { linhas: [], polilinhas: [], circulos: [] };

    (geometria.linhas || []).forEach((l) => {
      const p1 = converter(l.x1, l.y1), p2 = converter(l.x2, l.y2);
      data.linhas.push({ x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py });
    });

    (geometria.polilinhas || []).forEach((poli) => {
      if (!poli.pontos || poli.pontos.length < 2) return;
      const pts = poli.pontos.map((p) => { const c = converter(p.x, p.y); return { x: c.px, y: c.py }; });
      data.polilinhas.push({ pontos: pts, fechada: poli.fechada });
    });

    (geometria.circulos || []).forEach((c) => {
      const cx = c.cx * ESCALA_PX_POR_METRO, cy = -c.cy * ESCALA_PX_POR_METRO, r = c.raio * ESCALA_PX_POR_METRO;
      if (r >= 0.5) data.circulos.push({ cx, cy, raio: r });
    });

    geometriaRef.current = data;

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
      if (c.cx - c.raio < minX) minX = c.cx - c.raio;
      if (c.cy - c.raio < minY) minY = c.cy - c.raio;
      if (c.cx + c.raio > maxX) maxX = c.cx + c.raio;
      if (c.cy + c.raio > maxY) maxY = c.cy + c.raio;
    }

    const bboxWidth = maxX - minX || 100;
    const bboxHeight = maxY - minY || 100;

    const invisRect = new fabric.Rect({
      left: minX, top: minY, width: bboxWidth, height: bboxHeight,
      fill: "rgba(0,0,0,0.005)", stroke: "transparent",
      selectable: true, evented: true, hoverCursor: "pointer",
      cornerColor: "#ffa62b", cornerStrokeColor: "#ffa62b", borderColor: "#ffa62b80",
      cornerSize: 7, cornerStyle: "circle", transparentCorners: false, padding: 2,
    });
    invisRect._floorPlanInitialLeft = minX;
    invisRect._floorPlanInitialTop = minY;
    invisRect.electricalData = { type: "floorplan" };
    floorPlanGroupRef.current = invisRect;
    canvas.add(invisRect);
    canvas.sendObjectToBack(invisRect);
    return { modo: "agrupado", totalObjetos };
  }

  const componentObjectsMapRef = useRef(new Map());
  const connectionObjectsMapRef = useRef(new Map());

  const registrarConexaoNoMap = (origemId, destinoId, pathObj) => {
    if (!connectionObjectsMapRef.current.has(origemId)) {
      connectionObjectsMapRef.current.set(origemId, new Set());
    }
    if (!connectionObjectsMapRef.current.has(destinoId)) {
      connectionObjectsMapRef.current.set(destinoId, new Set());
    }
    connectionObjectsMapRef.current.get(origemId).add(pathObj);
    connectionObjectsMapRef.current.get(destinoId).add(pathObj);
  };

  /**
   * Desenha um componente elétrico no canvas.
   * Anexa evento 'moving' para atualizar conexões em tempo real.
   */
  const desenhorComponente = useCallback((componente, { onModified } = {}) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;
    const grupo = criarGrupoComponente(componente, onModified);
    componentObjectsMapRef.current.set(componente.id, grupo);

    // Atualizar conexões em tempo real durante o arraste
    grupo.on("moving", () => {
      atualizarLinhasDoComponente(componente.id, grupo.left, grupo.top);
    });
    canvas.add(grupo);
    return grupo;
  }, [fabricCanvasRef]);

  /**
   * Atualiza as coordenadas dos paths ligados a um componente específico em tempo real durante o arraste.
   * Utiliza connectionObjectsMapRef para lookup O(1) e evita alocações desnecessárias.
   */
  function atualizarLinhasDoComponente(componentId, left, top) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const conexoesDoComp = connectionObjectsMapRef.current.get(componentId);
    if (!conexoesDoComp || conexoesDoComp.size === 0) return;

    conexoesDoComp.forEach((obj) => {
      const pathArr = obj.path;
      if (!pathArr || pathArr.length < 2) return;

      let origX = pathArr[0][1];
      let origY = pathArr[0][2];

      const lastIdx = pathArr.length - 1;
      const targetCmd = pathArr[lastIdx];
      let destX = targetCmd[0] === "Q" ? targetCmd[3] : targetCmd[1];
      let destY = targetCmd[0] === "Q" ? targetCmd[4] : targetCmd[2];

      if (obj.data.origemId === componentId) {
        origX = left;
        origY = top;
      }
      if (obj.data.destinoId === componentId) {
        destX = left;
        destY = top;
      }

      let minX, maxX, minY, maxY;
      if (targetCmd[0] === "Q") {
        const hx = targetCmd[1];
        const hy = targetCmd[2];
        pathArr[0][1] = origX;
        pathArr[0][2] = origY;
        pathArr[lastIdx][3] = destX;
        pathArr[lastIdx][4] = destY;
        minX = Math.min(origX, destX, hx);
        maxX = Math.max(origX, destX, hx);
        minY = Math.min(origY, destY, hy);
        maxY = Math.max(origY, destY, hy);
      } else {
        pathArr[0][1] = origX;
        pathArr[0][2] = origY;
        pathArr[1][1] = destX;
        pathArr[1][2] = destY;
        minX = Math.min(origX, destX);
        maxX = Math.max(origX, destX);
        minY = Math.min(origY, destY);
        maxY = Math.max(origY, destY);
      }

      const w = Math.max(maxX - minX, 1);
      const h = Math.max(maxY - minY, 1);
      obj.set({
        left: minX,
        top: minY,
        width: w,
        height: h,
        pathOffset: new fabric.Point(w / 2, h / 2),
      });
      obj.setCoords();
    });
    canvas.requestRenderAll();
  }

  /**
   * Desenha uma conexão (conduto) entre dois componentes como um fabric.Path (reta ou curva).
   */
  const desenharConexao = useCallback((conexao, componentes) => {
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

    // Hit-target transparente para facilitar seleção de condutos estreitos.
    // perPixelTargetFind: hit-testing por PIXEL do traço (14px), sem bounding box
    // retangular — resolve o problema de clicar num conduto e selecionar outro
    // quando os bounding boxes de condutos próximos/cruzados se sobrepõem.
    const glowPath = new fabric.Path(pathData, {
      stroke: "rgba(0, 0, 0, 0.02)", // alpha > 0 (margem segura) para o teste de pixel funcionar
      strokeWidth: 14,
      fill: "transparent",
      selectable: true,
      evented: true,
      perPixelTargetFind: true,
      hasBorders: false,
      hasControls: false,
      hoverCursor: "pointer",
    });
    glowPath.data = {
      isConnectionGlow: true,
      connectionId: conexao.id,
      origemId: conexao.origem_id,
      destinoId: conexao.destino_id,
    };

    // Delegação: clicar no glow seleciona o conduto visível real (pathObj)
    glowPath.on("selected", () => {
      const realPath = canvas.getObjects().find(
        (o) => o.data?.isConnection && o.data.connectionId === glowPath.data.connectionId
      );
      if (realPath && realPath !== glowPath) {
        canvas.setActiveObject(realPath);
        canvas.requestRenderAll();
      }
    });

    // Objeto Path principal do conduto
    const pathObj = new fabric.Path(pathData, {
      stroke: "#000000",
      strokeWidth: 3,
      strokeDashArray,
      fill: "transparent",
      selectable: true,
      evented: true,
      // Hit-testing por pixel: só o traço real (3px) é clicável, nunca o
      // bounding box retangular — condutos cruzados não roubam cliques
      perPixelTargetFind: true,
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
      pathObj.set("stroke", "#ef4444");
      canvas.requestRenderAll();
    });
    pathObj.on("deselected", () => {
      pathObj.set("stroke", "#000000");
      canvas.requestRenderAll();
    });

    canvas.add(glowPath);
    canvas.add(pathObj);
    canvas.sendObjectToBack(glowPath);
    canvas.sendObjectToBack(pathObj);

    registrarConexaoNoMap(conexao.origem_id, conexao.destino_id, pathObj);
    if (glowPath) registrarConexaoNoMap(conexao.origem_id, conexao.destino_id, glowPath);

    return pathObj;
  }, [fabricCanvasRef]);

  /**
   * Atualiza as posições de todas as conexões no canvas.
   * Reutiliza objetos existentes quando possível (evita flickering).
   */
  const atualizarConexoes = useCallback((conexoes, componentes) => {
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
        registrarConexaoNoMap(con.origem_id, con.destino_id, existing.line);

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
          registrarConexaoNoMap(con.origem_id, con.destino_id, existing.glow);
        }

        // Garantir ordem z
        canvas.sendObjectToBack(existing.line);
        canvas.sendObjectToBack(existing.glow || existing.line);
      } else {
        // Não existe ainda, desenhar novo
        desenharConexao(con, componentes);
      }
    });

    canvas.requestRenderAll();
  }, [fabricCanvasRef, desenharConexao]);

  /**
   * Encontra um componente no ponto do canvas utilizando a Map indexada componentObjectsMapRef.
   */
  const encontrarComponenteEm = useCallback((pointer, optTarget = null) => {
    if (optTarget && optTarget.data?.componentId) {
      return optTarget.data.componentId;
    }
    if (optTarget && optTarget.group?.data?.componentId) {
      return optTarget.group.data.componentId;
    }

    const ponto = new fabric.Point(pointer.x, pointer.y);
    for (const [id, obj] of componentObjectsMapRef.current.entries()) {
      if (obj.containsPoint && obj.containsPoint(ponto)) {
        return id;
      }
      const bounds = obj.getBoundingRect();
      if (pointer.x >= bounds.left && pointer.x <= bounds.left + bounds.width &&
          pointer.y >= bounds.top && pointer.y <= bounds.top + bounds.height) {
        return id;
      }
    }
    return null;
  }, []);

  /**
   * Desenha uma divisão (room) como retângulo semi-transparente no canvas.
   */
  const desenharRoom = useCallback((room, { onModified } = {}) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    let geojson;
    try {
      geojson = JSON.parse(room.poligono_geojson);
    } catch {
      console.error("Erro ao fazer parse do GeoJSON da room:", room.poligono_geojson);
      return;
    }

    const coords = geojson.coordinates?.[0];
    if (!coords || coords.length < 4) return;

    // Usar primeiro e terceiro ponto para bounding box retangular
    const x0 = coords[0][0], y0 = coords[0][1];
    const x2 = coords[2][0], y2 = coords[2][1];

    const left = Math.min(x0, x2) * ESCALA_PX_POR_METRO;
    const top = -Math.max(y0, y2) * ESCALA_PX_POR_METRO;
    const width = Math.abs(x2 - x0) * ESCALA_PX_POR_METRO;
    const height = Math.abs(y2 - y0) * ESCALA_PX_POR_METRO;

    if (width < 2 || height < 2) return;

    const rect = new fabric.Rect({
      left, top, width, height,
      fill: "rgba(59, 130, 246, 0.05)",
      stroke: "rgba(59, 130, 246, 0.3)",
      strokeWidth: 1.5,
      strokeDashArray: [5, 5],
      cornerColor: "#ffa62b",
      cornerStrokeColor: "#ffa62b",
      borderColor: "#ffa62b80",
      cornerSize: 6,
      cornerStyle: "circle",
      transparentCorners: false,
      padding: 2,
      selectable: true,
      evented: true,
      hoverCursor: "pointer",
    });
    rect.data = { roomId: room.id };

    // Adicionar label
    const label = new fabric.Text(room.nome || "Divisão", {
      fontSize: 12,
      fill: "#ffa62b",
      fontWeight: "bold",
      originX: "center",
      originY: "center",
      top: 0,
    });

    const group = new fabric.Group([rect, label], {
      left: rect.left, top: rect.top,
      selectable: true, evented: true,
    });
    group.data = { roomId: room.id };

    if (onModified) {
      group.on("modified", () => onModified(group, width, height));
    }

    canvas.add(group);
  }, [fabricCanvasRef]);

  /**
   * Limpa o canvas (remove todos os objetos, exceto o fundo).
   */
  const limpar = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = (() => {
      try { return getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas").trim() || "#e8ecf0"; }
      catch { return "#e8ecf0"; }
    })();
    componentObjectsMapRef.current.clear();
    connectionObjectsMapRef.current.clear();
    geometriaRef.current = null;
    floorPlanGroupRef.current = null;
    floorPlanScaleRef.current = 1;
    floorPlanClipRectRef.current = null;
    floorPlanModeRef.current = null;
  }, [fabricCanvasRef, geometriaRef, floorPlanGroupRef, floorPlanScaleRef, floorPlanClipRectRef, floorPlanModeRef]);

  /**
   * Desenha uma fita LED a partir de uma polyline de pontos.
   * Usa um fabric.Path com strokeDashArray para representar os LEDs (como conduto tracejado).
   */
  const desenharFitaLed = useCallback((pontos, componentId) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !pontos || pontos.length < 2) return null;

    // Converter pontos mundo → pixels
    const pts = pontos.map((p) => ({
      x: p.x * ESCALA_PX_POR_METRO,
      y: -p.y * ESCALA_PX_POR_METRO,
    }));

    // Path da polyline
    const pathParts = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`);
    const pathStr = pathParts.join(' ');

    // Glow transparente para facilitar seleção (como conduto)
    const glow = new fabric.Path(pathStr, {
      stroke: "rgba(0,0,0,0.001)",
      strokeWidth: 14,
      fill: "transparent",
      selectable: false,
      evented: false,
    });
    glow.data = { componentId, isLedStripGlow: true };

    // Linha tracejada laranja — o dashed representa os LEDs ao longo da fita
    const line = new fabric.Path(pathStr, {
      stroke: "#f59e0b",
      strokeWidth: 4,
      strokeDashArray: [3, 8],
      fill: "transparent",
      selectable: true,
      evented: true,
      hoverCursor: "pointer",
      hasBorders: false,
      hasControls: false,
      padding: 6,
    });
    line.data = { componentId, isLedStrip: true };
    line.electricalData = { type: "lampada_led_fita", componentId };

    // Mudança de cor: vermelho quando selecionado (como conduto)
    line.on("selected", () => {
      line.set("stroke", "#ef4444");
      canvas.requestRenderAll();
    });
    line.on("deselected", () => {
      line.set("stroke", "#f59e0b");
      canvas.requestRenderAll();
    });

    canvas.add(glow);
    canvas.add(line);
    canvas.sendObjectToBack(glow);
    canvas.sendObjectToBack(line);

    canvas.requestRenderAll();
    return line;
  }, [fabricCanvasRef]);

  return {
    desenharGeometria,
    desenharComponente: desenhorComponente,
    desenharConexao,
    atualizarConexoes,
    encontrarComponenteEm,
    desenharRoom,
    desenharFitaLed,
    limpar,
    atualizarLinhasDoComponente,
  };
}
