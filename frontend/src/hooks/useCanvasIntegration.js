import { useState, useEffect, useCallback } from "react";
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

  if (tipo && tipo.startsWith("lampada")) {
    return {
      ...base,
      potencia_va: { value: dadosExtras.potencia_va ?? "100", visible: false },
      tensao: dadosExtras.tensao ?? "220",
      comando: { value: dadosExtras.comando ?? "", visible: false },
      circuito: { value: dadosExtras.circuito ?? "", visible: false },
    };
  }

  if (tipo && tipo.startsWith("interruptor")) {
    return {
      ...base,
      comando: { value: dadosExtras.comando ?? "", visible: false },
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
  const [electricalData, setElectricalData] = useState(null);
  const [selectedComponentId, setSelectedComponentId] = useState(null);

  // Limpar seleção
  const limparSelecao = useCallback(() => {
    setSelectedObject(null);
    setElectricalData(null);
    setSelectedComponentId(null);
    if (canvasInstance) {
      canvasInstance.discardActiveObject();
      canvasInstance.renderAll();
    }
  }, [canvasInstance]);

  // Sincronizar estado React → Fabric.js Group
  const atualizarNoCanvas = useCallback(() => {
    if (!canvasInstance || !selectedObject || !electricalData) return;

    const grupo = selectedObject;
    const data = electricalData;

    // 1. Atualizar o electricalData no objeto
    grupo.electricalData = { ...data };

    // Guarda: só fabric.Group tem forEachObject
    if (typeof grupo.forEachObject !== 'function') {
      canvasInstance.renderAll();
      return;
    }

    // 2. Atualizar os fabric.IText children visíveis no grupo
    //    Cada texto tem um campo `data.labelKey` que identifica a que propriedade pertence
    grupo.forEachObject((child) => {
      if (child.type === "i-text" && child.data?.labelKey) {
        const key = child.data.labelKey;
        const prop = data[key];
        // Se for { value, visible }
        if (prop && typeof prop === "object" && "value" in prop) {
          child.set("text", String(prop.value ?? ""));
          child.set("visible", prop.visible === true);
        }
        // Se for valor simples
        else if (prop !== undefined) {
          child.set("text", String(prop));
        }
      }

      // 3. Para símbolos com textos aninhados dentro de sub-grupo
      if (child.type === "group") {
        // Tentar ambos os updaters — cada um ignora grupos que não lhe pertencem
        updateLampText(child, data);
        updateCaixaPassagemText(child, data);
      }
    });

    grupo.setCoords();
    canvasInstance.renderAll();
  }, [canvasInstance, selectedObject, electricalData]);

  // Anexar event listeners do Fabric.js quando canvasInstance fica disponível
  useEffect(() => {
    if (!canvasInstance) return;

    function onSelectionCreated(e) {
      const obj = e.selected?.[0];
      if (obj?.electricalData) {
        setSelectedObject(obj);
        setSelectedComponentId(obj.data?.componentId || null);
        setElectricalData({ ...obj.electricalData });
      } else if (obj?.data?.componentId) {
        // Objeto sem electricalData — criar um default
        const tipo = obj.data?.tipo || "outro";
        const defaultData = criarElectricalData(tipo);
        obj.electricalData = defaultData;
        setSelectedObject(obj);
        setSelectedComponentId(obj.data.componentId);
        setElectricalData({ ...defaultData });
      } else {
        setSelectedObject(null);
        setSelectedComponentId(null);
        setElectricalData(null);
      }
    }

    function onSelectionUpdated(e) {
      onSelectionCreated(e);
    }

    function onSelectionCleared() {
      setSelectedObject(null);
      setSelectedComponentId(null);
      setElectricalData(null);
    }

    canvasInstance.on("selection:created", onSelectionCreated);
    canvasInstance.on("selection:updated", onSelectionUpdated);
    canvasInstance.on("selection:cleared", onSelectionCleared);

    return () => {
      canvasInstance.off("selection:created", onSelectionCreated);
      canvasInstance.off("selection:updated", onSelectionUpdated);
      canvasInstance.off("selection:cleared", onSelectionCleared);
    };
  }, [canvasInstance]);

  return {
    electricalData,
    setElectricalData,
    atualizarNoCanvas,
    limparSelecao,
    selectedComponentId,
  };
}
