import { useState, useEffect, useCallback } from "react";
import * as fabric from "fabric";
import { updateLampText, updateCaixaPassagemText } from "../components/Canvas/SymbolFactory";

/**
 * Estrutura base do electricalData injetado em cada fabric.Group
 *
 * {
 *   type: "lampada" | "interruptor" | "tomada",
 *   potencia_va: { value: "", visible: false },
 *   tensao: "220",
 *   comando: { value: "", visible: false },
 *   circuito: { value: "", visible: false },
 *   nome: { value: "", visible: false },
 *   tipo_tomada: "baixa",
 *   altura: "Baixa",
 *   incluirLegenda: false,
 * }
 */

/**
 * Gera o electricalData padrão com base no tipo do componente.
 * Cada campo que pode ter toggle de visibilidade segue { value, visible }.
 */
export function criarElectricalData(tipo, dadosExtras = {}) {
  const base = {
    type: tipo,
  };

  if (tipo && tipo === "lampada_led_fita") {
    return {
      ...base,
      localizacao: dadosExtras.localizacao ?? "teto",
      potencia_va: { value: dadosExtras.potencia_va ?? "100", visible: false },
      comando: { value: dadosExtras.comando ?? "", visible: false },
      circuito: { value: dadosExtras.circuito ?? "", visible: false },
    };
  }

  if (tipo && tipo.startsWith("lampada")) {
    return {
      ...base,
      potencia_va: { value: dadosExtras.potencia_va ?? "100", visible: false },
      tensao: dadosExtras.tensao ?? "220",
      comando: { value: dadosExtras.comando ?? "", visible: false },
      circuito: { value: dadosExtras.circuito ?? "", visible: false },
    };
  }

  if (tipo && (tipo === "quadro" || tipo === "quadro_parcial")) {
    return {
      ...base,
      nome: { value: dadosExtras.nome ?? (tipo === "quadro_parcial" ? "QP" : "QGBT"), visible: true },
      incluir_idr: dadosExtras.incluir_idr ?? true,
      incluir_dps: dadosExtras.incluir_dps ?? true,
      quadro_pai_id: dadosExtras.quadro_pai_id ?? null,
    };
  }

  if (tipo && tipo.startsWith("interruptor")) {
    return {
      ...base,
      comando: { value: dadosExtras.comando ?? "", visible: true },
    };
  }

  if (tipo && tipo.startsWith("caixa_passagem")) {
    return {
      ...base,
      nome:      { value: dadosExtras.nome ?? "CX1", visible: true },
      descricao: dadosExtras.descricao ?? "PVC 4x4",
      altura:    { value: dadosExtras.altura ?? "280,00", visible: true },
      tamanho:   dadosExtras.tamanho ?? "100x100",
    };
  }

  if (tipo && tipo.startsWith("tomada")) {
    return {
      ...base,
      nome: { value: dadosExtras.nome ?? "", visible: false },
      tipo_tomada: dadosExtras.tipo_tomada ?? "baixa",
      potencia_va: { value: dadosExtras.potencia_va ?? "100", visible: false },
      tensao: dadosExtras.tensao ?? "220",
      altura: dadosExtras.altura ?? "Baixa",
      circuito: { value: dadosExtras.circuito ?? "", visible: false },
      incluirLegenda: dadosExtras.incluirLegenda ?? false,
    };
  }

  // Fallback: tipo genérico
  return {
    ...base,
    nome: { value: dadosExtras.nome ?? "", visible: false },
    circuito: { value: dadosExtras.circuito ?? "", visible: false },
  };
}

/**
 * useCanvasIntegration
 *
 * Hook que liga a seleção do Fabric.js a um estado React (two-way binding).
 *
 * @param {object|null} canvasInstance — instância do fabric.Canvas (passada diretamente, não ref)
 * @returns {object} {
 *   electricalData,       // dados elétricos do objeto selecionado (ou null)
 *   setElectricalData,    // atualiza o estado local (React)
 *   atualizarNoCanvas,    // sincroniza React → Fabric.js (chamar no "Atualizar")
 *   limparSelecao,        // limpa a seleção
 * }
 */
export function useCanvasIntegration(canvasInstance) {
  const [selectedObject, setSelectedObject] = useState(null);
  const [selectedObjects, setSelectedObjects] = useState([]);
  const [electricalData, setElectricalData] = useState(null);
  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const [selectedComponentIds, setSelectedComponentIds] = useState([]);

  // Limpar seleção
  const limparSelecao = useCallback(() => {
    setSelectedObject(null);
    setSelectedObjects([]);
    setElectricalData(null);
    setSelectedComponentId(null);
    setSelectedComponentIds([]);
    if (canvasInstance) {
      canvasInstance.discardActiveObject();
      canvasInstance.renderAll();
    }
  }, [canvasInstance]);

  // Sincronizar estado React → Fabric.js Groups (em lote para multi-seleção)
  const atualizarNoCanvas = useCallback((novosDados) => {
    if (!canvasInstance || !selectedObjects || selectedObjects.length === 0) return;

    const dataToApply = novosDados || electricalData;
    if (!dataToApply) return;

    selectedObjects.forEach((grupo) => {
      if (!grupo) return;

      if (grupo.electricalData) {
        grupo.electricalData = {
          ...grupo.electricalData,
          ...dataToApply,
        };
      }

      if (typeof grupo.forEachObject !== "function") return;

      grupo.forEachObject((child) => {
        if (child.type === "i-text" && child.data?.labelKey) {
          const key = child.data.labelKey;

          if (key.startsWith("comando_") && grupo.electricalData?.type?.startsWith("interruptor")) {
            const idx = parseInt(key.split("_")[1], 10);
            const cmds = (grupo.electricalData?.comando?.value || "")
              .split(",")
              .map((s) => s.trim());
            const text = cmds[idx] || "";
            child.set("text", text);
            child.set("visible", grupo.electricalData?.comando?.visible === true && text.length > 0);
            return;
          }

          const prop = grupo.electricalData?.[key];
          if (prop && typeof prop === "object" && "value" in prop) {
            child.set("text", String(prop.value ?? ""));
            child.set("visible", prop.visible === true);
          } else if (prop !== undefined) {
            child.set("text", String(prop));
          }
        }

        if (child.type === "group") {
          updateLampText(child, grupo.electricalData);
          updateCaixaPassagemText(child, grupo.electricalData);
        }
      });

      grupo.setCoords();
    });

    canvasInstance.renderAll();
  }, [canvasInstance, selectedObjects, electricalData]);

  // Anexar event listeners do Fabric.js quando canvasInstance fica disponível
  useEffect(() => {
    if (!canvasInstance) return;

    function processSelection(e) {
      const selected = e.selected || (e.target ? [e.target] : []);
      // Resolver objetos pai se um elemento interno do grupo for clicado
      const items = selected
        .map((o) => {
          if (o?.data?.componentId || o?.electricalData) return o;
          if (o?.group?.data?.componentId || o?.group?.electricalData) return o.group;
          return o;
        })
        .filter((o) => o?.data?.componentId || o?.electricalData);

      // Eliminar duplicados no array de itens seleccionados
      const uniqueItems = Array.from(new Set(items));

      if (uniqueItems.length === 0) {
        if (e.target?.electricalData?.type === "floorplan" || e.target?.electricalData?.type === "conduto") {
          setSelectedObject(e.target);
          setSelectedObjects([e.target]);
          setSelectedComponentId(null);
          setSelectedComponentIds([]);
          setElectricalData({ ...e.target.electricalData });
          return;
        }
        setSelectedObject(null);
        setSelectedObjects([]);
        setSelectedComponentId(null);
        setSelectedComponentIds([]);
        setElectricalData(null);
        return;
      }

      if (uniqueItems.length === 1) {
        const obj = uniqueItems[0];
        const compId = obj.data?.componentId || null;
        if (!obj.electricalData && compId) {
          obj.electricalData = criarElectricalData(obj.data?.tipo || "outro");
        }
        setSelectedObject(obj);
        setSelectedObjects([obj]);
        setSelectedComponentId(compId);
        setSelectedComponentIds(compId ? [compId] : []);
        setElectricalData(obj.electricalData ? { ...obj.electricalData } : null);
        return;
      }

      // Multi-seleção (> 1 componentes)
      const ids = uniqueItems.map((o) => o.data?.componentId).filter(Boolean);
      const tipos = uniqueItems.map((o) => o.electricalData?.type || o.data?.tipo || "outro");
      const firstTipo = tipos[0];
      const sameType = tipos.every((t) => t === firstTipo);

      setSelectedObject(uniqueItems[0]);
      setSelectedObjects(uniqueItems);
      setSelectedComponentId(ids[0] || null);
      setSelectedComponentIds(ids);

      setElectricalData({
        type: "multi_selection",
        count: uniqueItems.length,
        sameType,
        commonType: sameType ? firstTipo : null,
        ids,
      });
    }

    canvasInstance.on("selection:created", processSelection);
    canvasInstance.on("selection:updated", processSelection);
    canvasInstance.on("selection:cleared", () => {
      setSelectedObject(null);
      setSelectedObjects([]);
      setElectricalData(null);
      setSelectedComponentId(null);
      setSelectedComponentIds([]);
    });

    return () => {
      canvasInstance.off("selection:created", processSelection);
      canvasInstance.off("selection:updated", processSelection);
      canvasInstance.off("selection:cleared");
    };
  }, [canvasInstance]);

  return {
    electricalData,
    setElectricalData,
    atualizarNoCanvas,
    limparSelecao,
    selectedComponentId,
    selectedComponentIds,
    selectedObjects,
    isMultiSelection: selectedComponentIds.length > 1,
  };
}
