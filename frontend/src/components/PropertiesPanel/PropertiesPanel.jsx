import React, { useState, useEffect, useRef } from "react";
import { ESCALA_PX_POR_METRO } from "../../hooks/useFabricCanvas";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import "./PropertiesPanel.css";

const LABELS_TIPO = {
  lampada: "Lâmpada",
  lampada_simples: "Ponto de Luz (Teto)",
  lampada_arandela: "Arandela (Parede)",
  lampada_spot: "Spot / Olho de Boi",
  lampada_tubular: "Lâmpada Tubular",
  lampada_led: "Fita de LED",
  lampada_led_fita: "Fita de LED",
  lampada_pendente: "Lustre / Pendente",
  lampada_jardim: "LED Jardim / Espeto",

  tomada: "Tomada",
  tomada_baixa: "Tomada Baixa",
  tomada_media: "Tomada Média",
  tomada_alta: "Tomada Alta",
  tomada_trifasica: "Tomada Trifásica",
  tomada_sensor: "Tomada com Sensor",
  tomada_dupla: "Tomada Dupla",
  tomada_tripla: "Tomada Tripla",

  telefonia: "Telefone (RJ11)",
  dados: "Rede de Dados (RJ45)",
  tv: "Tomada TV Coaxial",
  campainha: "Campainha / Interfone",
  camera: "Câmara CCTV",

  caixa_passagem: "Caixa de Passagem",
  passagem_sobe: "Caixa de Passagem (Sobe)",
  passagem_desce: "Caixa de Passagem (Desce)",

  interruptor: "Interruptor",
  interruptor_simples: "Interruptor Simples",
  interruptor_duplo: "Interruptor Duplo",
  interruptor_triplo: "Interruptor Triplo",
  interruptor_intermediario: "Interruptor Intermediário",
  interruptor_paralelo: "Interruptor Paralelo",
  interruptor_dimmer: "Interruptor Dimmer",
  interruptor_pulsador: "Pulsador de Campainha",
  quadro: "Quadro Geral (QGBT)",
  quadro_parcial: "Quadro Parcial (QP)",
};

function getCategory(tipo) {
  if (tipo.startsWith("lampada")) return "lampada";
  if (tipo.startsWith("tomada")) return "tomada";
  if (tipo.startsWith("interruptor")) return "interruptor";
  if (tipo.startsWith("quadro")) return "quadro";
  if (["telefonia", "dados", "tv", "campainha", "camera"].includes(tipo)) return "telecom";
  if (tipo.startsWith("passagem")) return "passagem";
  return "outro";
}

/**
 * PropertiesPanel — Painel do componente seleccionado.
 * Mostra apenas o componente que está seleccionado no canvas.
 */
export default function PropertiesPanel({
  aberto,
  componente,
  selectedComponents = [],
  selectedComponentIds = [],
  isMultiSelection = false,
  componentes = [],
  conexao,
  circuitos = [],
  onComponenteAtualizado,
  onComponenteApagado,
  onConexaoAtualizada,
  electricalData,
  setElectricalData,
  atualizarNoCanvas,
  canvasInstance,
  limparSelecao,
  onRefreshData,
}) {
  const toast = useToast();
  const [loading, setLoading] = useState({});

  function withLoading(key, fn) {
    return async (...args) => {
      setLoading((prev) => ({ ...prev, [key]: true }));
      try {
        await fn(...args);
      } finally {
        setLoading((prev) => ({ ...prev, [key]: false }));
      }
    };
  }

  async function atualizarPotencia(componentId, potencia) {
    try {
      const atualizado = await api.atualizarComponente(componentId, { potencia_w: Number(potencia) });
      onComponenteAtualizado(atualizado);
    } catch (err) {
      toast.error(`Erro ao atualizar: ${err.message}`);
    }
  }

  async function atualizarRotulo(componentId, rotulo) {
    try {
      const atualizado = await api.atualizarComponente(componentId, { rotulo });
      onComponenteAtualizado(atualizado);
    } catch (err) {
      toast.error(`Erro ao atualizar rótulo: ${err.message}`);
    }
  }

  async function atribuirCircuito(componentId, circuitId) {
    try {
      const atualizado = await api.atualizarComponente(componentId, {
        circuit_id: circuitId ? Number(circuitId) : null,
      });
      onComponenteAtualizado(atualizado);
    } catch (err) {
      toast.error(`Erro ao atribuir circuito: ${err.message}`);
    }
  }

  const handlePotencia = withLoading("potencia", atualizarPotencia);
  const handleRotulo = withLoading("rotulo", atualizarRotulo);
  const handleCircuito = withLoading("circuito", atribuirCircuito);

  // ─── Sincronizar canvas quando electricalData muda ─────────────────────
  const isFirstRender = useRef(true);
  useEffect(() => {
    // Skip on initial mount (electricalData being set when component selected)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (atualizarNoCanvas && electricalData) {
      atualizarNoCanvas();
    }
  }, [electricalData]);

  // ─── Helpers para guardar dados extra da caixa de passagem ─────────────
  function getCaixaDados() {
    // Tenta parsear rotulo como JSON; se falhar, assume que é o nome antigo
    try {
      const parsed = JSON.parse(componente.rotulo || "{}");
      if (parsed && typeof parsed === "object" && "nome" in parsed) {
        return parsed;
      }
    } catch {}
    // Fallback: rotulo é o nome antigo (string simples)
    return {
      nome: componente.rotulo || "CX1",
      descricao: "PVC 4x4",
      altura: "280,00",
      tamanho: "100x100",
    };
  }

  const handleSalvarCaixa = withLoading("caixa", async (dados) => {
    try {
      const atualizado = await api.atualizarComponente(componente.id, {
        rotulo: JSON.stringify(dados),
      });
      onComponenteAtualizado(atualizado);
    } catch (err) {
      toast.error(`Erro ao guardar: ${err.message}`);
    }
  });

  // ─── CaixaPassagemFields ────────────────────────────────────────────
  function CaixaPassagemFields({ electricalData: ed, setElectricalData: setEd, loading: ld }) {
    const dados = getCaixaDados();
    function onSave(novosDados) {
      handleSalvarCaixa(novosDados);
    }
    return (
      <>
        <label>
          <span className="field-label">Nome</span>
          <input
            type="text"
            defaultValue={ed?.nome?.value ?? dados.nome}
            placeholder="CX1"
            onBlur={(e) => {
              const val = e.target.value || "CX1";
              const novosDados = { ...getCaixaDados(), nome: val };
              onSave(novosDados);
              if (setEd) {
                setEd((prev) => ({
                  ...prev,
                  nome: { ...(prev?.nome || {}), value: val },
                }));
              }
            }}
            disabled={ld["caixa"]}
          />
        </label>
        <label>
          <span className="field-label">Descrição</span>
          <input
            type="text"
            defaultValue={ed?.descricao ?? dados.descricao}
            placeholder="PVC 4x4"
            onBlur={(e) => {
              const val = e.target.value || "PVC 4x4";
              const novosDados = { ...getCaixaDados(), descricao: val };
              onSave(novosDados);
              if (setEd) {
                setEd((prev) => ({ ...prev, descricao: val }));
              }
            }}
            disabled={ld["caixa"]}
          />
        </label>
        <label>
          <span className="field-label">Altura (mm)</span>
          <input
            type="text"
            defaultValue={ed?.altura?.value ?? dados.altura}
            placeholder="280,00"
            onBlur={(e) => {
              const val = e.target.value || "280,00";
              const novosDados = { ...getCaixaDados(), altura: val };
              onSave(novosDados);
              if (setEd) {
                setEd((prev) => ({
                  ...prev,
                  altura: { ...(prev?.altura || {}), value: val },
                }));
              }
            }}
            disabled={ld["caixa"]}
          />
        </label>
        <label>
          <span className="field-label">Tamanho</span>
          <input
            type="text"
            defaultValue={ed?.tamanho ?? dados.tamanho}
            placeholder="100x100"
            onBlur={(e) => {
              const val = e.target.value || "100x100";
              const novosDados = { ...getCaixaDados(), tamanho: val };
              onSave(novosDados);
              if (setEd) {
                setEd((prev) => ({ ...prev, tamanho: val }));
              }
            }}
            disabled={ld["caixa"]}
          />
        </label>
      </>
    );
  }

  // ─── QuadroFields ───────────────────────────────────────────────────
  function QuadroFields({ electricalData: ed, setElectricalData: setEd }) {
    const isParcial = componente?.tipo === "quadro_parcial";
    const titulo = isParcial ? "Quadro Parcial (QP)" : "Quadro Geral (QGBT)";

    let parsedData = {
      rotulo: componente?.rotulo || (isParcial ? "QP - Anexo" : "QGBT"),
      incluir_idr: true,
      incluir_dps: true,
      tipo_fase: "trifasico",
      quadro_pai_id: null,
    };
    if (componente?.rotulo) {
      try {
        const obj = JSON.parse(componente.rotulo);
        if (obj && typeof obj === "object") {
          parsedData = { ...parsedData, ...obj };
        }
      } catch {}
    }

    const [rotuloVal, setRotuloVal] = useState(parsedData.rotulo || (isParcial ? "QP - Anexo" : "QGBT"));
    const [incluirIdr, setIncluirIdr] = useState(ed?.incluir_idr ?? parsedData.incluir_idr ?? true);
    const [incluirDps, setIncluirDps] = useState(ed?.incluir_dps ?? parsedData.incluir_dps ?? true);
    const [tipoFase, setTipoFase] = useState(ed?.tipo_fase ?? parsedData.tipo_fase ?? "trifasico");
    const [quadroPaiId, setQuadroPaiId] = useState(ed?.quadro_pai_id ?? parsedData.quadro_pai_id ?? "");

    const quadrosDisponiveis = componentes.filter(
      (c) => (c.tipo === "quadro" || c.tipo === "quadro_parcial") && c.id !== componente?.id
    );

    async function handleSalvarQuadro() {
      const novosDadosJson = JSON.stringify({
        nome: rotuloVal,
        rotulo: rotuloVal,
        incluir_idr: incluirIdr,
        incluir_dps: incluirDps,
        tipo_fase: tipoFase,
        quadro_pai_id: quadroPaiId ? parseInt(quadroPaiId, 10) : null,
      });

      try {
        const atualizado = await api.atualizarComponente(componente.id, {
          rotulo: novosDadosJson,
        });
        onComponenteAtualizado?.(atualizado);
        if (setEd) {
          setEd((prev) => ({
            ...prev,
            nome: { value: rotuloVal, visible: true },
            incluir_idr: incluirIdr,
            incluir_dps: incluirDps,
            tipo_fase: tipoFase,
            quadro_pai_id: quadroPaiId ? parseInt(quadroPaiId, 10) : null,
          }));
        }
        atualizarNoCanvas?.({
          comando: { value: rotuloVal, visible: true },
          rotulo: rotuloVal,
        });
        toast.success(`${titulo} atualizado com sucesso!`);
      } catch (err) {
        toast.error(`Erro ao atualizar quadro: ${err.message}`);
      }
    }

    return (
      <div className="quadro-form-box">
        <div className="quadro-form-group">
          <label className="quadro-field-label">Rótulo / Nome</label>
          <input
            type="text"
            className="quadro-input-text"
            value={rotuloVal}
            onChange={(e) => setRotuloVal(e.target.value)}
            placeholder={isParcial ? "QP - Anexo" : "QGBT"}
          />
        </div>

        <div className="quadro-checkbox-row">
          <span className="quadro-checkbox-text">
            {isParcial ? "Incluir IDR parcial" : "Incluir IDR geral"}
          </span>
          <input
            type="checkbox"
            className="quadro-custom-checkbox"
            checked={incluirIdr}
            onChange={(e) => setIncluirIdr(e.target.checked)}
          />
        </div>

        <div className="quadro-checkbox-row">
          <span className="quadro-checkbox-text">Incluir DPS</span>
          <input
            type="checkbox"
            className="quadro-custom-checkbox"
            checked={incluirDps}
            onChange={(e) => setIncluirDps(e.target.checked)}
          />
        </div>

        <fieldset className="quadro-phase-fieldset">
          <legend className="quadro-field-label">Tipo de fase da alimentação</legend>
          {[
            ["monofasico", "Monofásico · 1P+N · 230 V"],
            ["bifasico", "Bifásico · 2P · 400 V"],
            ["trifasico", "Trifásico · 3P+N · 400/230 V"],
          ].map(([valor, texto]) => (
            <label key={valor} className="radio-label quadro-phase-option">
              <input
                type="radio"
                name={`tipo-fase-quadro-${componente.id}`}
                value={valor}
                checked={tipoFase === valor}
                onChange={() => setTipoFase(valor)}
              />
              <span>{texto}</span>
            </label>
          ))}
        </fieldset>

        {isParcial && (
          <div className="quadro-form-group" style={{ marginTop: "12px" }}>
            <label className="quadro-field-label">Alimentado por (Quadro Pai)</label>
            <select
              className="quadro-select"
              value={quadroPaiId || ""}
              onChange={(e) => setQuadroPaiId(e.target.value)}
            >
              <option value="">Nenhum (Direto da Rede)</option>
              {quadrosDisponiveis.map((q) => {
                let labelQ = q.rotulo || q.tipo;
                try {
                  const p = JSON.parse(q.rotulo);
                  if (p?.nome) labelQ = p.nome;
                } catch {}
                return (
                  <option key={q.id} value={q.id}>
                    {labelQ} ({q.tipo === "quadro" ? "Quadro Geral" : "Quadro Parcial"})
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <button
          type="button"
          className="btn-quadro-submit"
          onClick={handleSalvarQuadro}
        >
          Atualizar
        </button>
      </div>
    );
  }

  // ─── CondutoFields ──────────────────────────────────────────────────
  function CondutoFields() {
    const conn = conexao;
    const [circuitoParaBloquear, setCircuitoParaBloquear] = useState("");

    const localizacao = electricalData?.localizacao || conn?.localizacao || "teto_parede";
    const circuitosBloqueados = electricalData?.circuitos_bloqueados || conn?.circuitos_bloqueados || [];
    const isCurved = electricalData?.c1_x != null && electricalData?.c1_y != null;

    async function handleCurvar() {
      if (!canvasInstance || !electricalData?.connectionId) return;
      const targetObj = canvasInstance.getObjects().find(
        (o) => o.data?.isConnection && o.data?.connectionId === electricalData.connectionId
      );
      if (!targetObj || !targetObj.path || targetObj.path.length < 2) return;

      const origX = targetObj.path[0][1];
      const origY = targetObj.path[0][2];
      const lastIdx = targetObj.path.length - 1;
      const destX = targetObj.path[lastIdx][3] ?? targetObj.path[lastIdx][1];
      const destY = targetObj.path[lastIdx][4] ?? targetObj.path[lastIdx][2];

      const mx = (origX + destX) / 2;
      const my = (origY + destY) / 2;
      const dx = destX - origX;
      const dy = destY - origY;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const c1_px = mx + nx * 40;
      const c1_py = my + ny * 40;

      const worldX = c1_px / ESCALA_PX_POR_METRO;
      const worldY = -c1_py / ESCALA_PX_POR_METRO;

      try {
        const atualizado = await api.atualizarConexao(electricalData.connectionId, {
          c1_x: worldX,
          c1_y: worldY,
        });
        onConexaoAtualizada?.(atualizado);
        if (setElectricalData) {
          setElectricalData((prev) => ({
            ...prev,
            c1_x: worldX,
            c1_y: worldY,
          }));
        }
        toast.success("Conduto curvado com sucesso!");
      } catch (err) {
        toast.error(`Erro ao curvar conduto: ${err.message}`);
      }
    }

    async function handleRemoverCurva() {
      if (!electricalData?.connectionId) return;
      try {
        const atualizado = await api.atualizarConexao(electricalData.connectionId, {
          c1_x: null,
          c1_y: null,
        });
        onConexaoAtualizada?.(atualizado);
        if (setElectricalData) {
          setElectricalData((prev) => ({
            ...prev,
            c1_x: null,
            c1_y: null,
          }));
        }
        toast.success("Curva removida do conduto");
      } catch (err) {
        toast.error(`Erro ao remover curva: ${err.message}`);
      }
    }

    function handleToggleEditarHandle() {
      if (!canvasInstance || !electricalData?.connectionId) return;
      const handleObj = canvasInstance.getObjects().find(
        (o) => o.data?.isCurveHandle && o.data?.connectionId === electricalData.connectionId
      );
      if (handleObj) {
        handleObj.set("visible", !handleObj.visible);
        canvasInstance.requestRenderAll();
        toast.info(handleObj.visible ? "Alça de edição exibida" : "Alça de edição oculta");
      } else {
        toast.info("Selecione novamente o conduto para exibir a alça de edição");
      }
    }

    function handleLocalizacaoChange(val) {
      if (setElectricalData) {
        setElectricalData((prev) => ({ ...prev, localizacao: val }));
      }
    }

    function handleAdicionarBloqueio() {
      if (!circuitoParaBloquear) return;
      if (circuitosBloqueados.includes(circuitoParaBloquear)) {
        toast.warning("Este circuito já está bloqueado neste conduto.");
        return;
      }
      const novaLista = [...circuitosBloqueados, circuitoParaBloquear];
      if (setElectricalData) {
        setElectricalData((prev) => ({ ...prev, circuitos_bloqueados: novaLista }));
      }
      setCircuitoParaBloquear("");
    }

    function handleRemoverBloqueio(item) {
      const novaLista = circuitosBloqueados.filter((c) => c !== item);
      if (setElectricalData) {
        setElectricalData((prev) => ({ ...prev, circuitos_bloqueados: novaLista }));
      }
    }

    const handleSalvarConduto = withLoading("conduto", async () => {
      if (!electricalData?.connectionId) return;
      try {
        const atualizado = await api.atualizarConexao(electricalData.connectionId, {
          localizacao,
          circuitos_bloqueados: circuitosBloqueados,
        });
        onConexaoAtualizada?.(atualizado);
        toast.success("Conduto atualizado com sucesso!");
      } catch (err) {
        toast.error(`Erro ao atualizar conduto: ${err.message}`);
      }
    });

    return (
      <div className="conduto-fields">
        {/* ─── Localização do Eletroduto ─── */}
        <div className="field-group">
          <span className="field-group-title">Localização do Eletroduto</span>
          <label className="radio-label">
            <input
              type="radio"
              name="localizacao"
              value="teto_parede"
              checked={localizacao === "teto_parede"}
              onChange={() => handleLocalizacaoChange("teto_parede")}
            />
            <span>Teto/parede</span>
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="localizacao"
              value="subterraneo"
              checked={localizacao === "subterraneo"}
              onChange={() => handleLocalizacaoChange("subterraneo")}
            />
            <span>Subterrâneo</span>
          </label>
        </div>

        {/* ─── Curvas ─── */}
        <div className="field-group">
          <span className="field-group-title">Curvas</span>
          <div className="button-row">
            {!isCurved ? (
              <button type="button" className="btn-action primary" onClick={handleCurvar}>
                ╭ Curvar
              </button>
            ) : (
              <>
                <button type="button" className="btn-action secondary" onClick={handleToggleEditarHandle}>
                  ✏ Editar
                </button>
                <button type="button" className="btn-action danger" onClick={handleRemoverCurva}>
                  🗑 Remover curva
                </button>
              </>
            )}
          </div>
        </div>

        {/* ─── Bloquear passagem de circuito ─── */}
        <div className="field-group">
          <span className="field-group-title">Bloquear passagem de circuito</span>
          <div className="select-add-row">
            <select
              value={circuitoParaBloquear}
              onChange={(e) => setCircuitoParaBloquear(e.target.value)}
            >
              <option value="">Selecione um circuito...</option>
              {circuitos.map((c) => (
                <option key={c.id} value={c.nome || String(c.id)}>
                  {c.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-add"
              onClick={handleAdicionarBloqueio}
              disabled={!circuitoParaBloquear}
            >
              + Adicionar
            </button>
          </div>

          <div className="blocked-list-container">
            <span className="field-sublabel">Circuitos bloqueados:</span>
            {circuitosBloqueados.length === 0 ? (
              <span className="empty-hint">Nenhum circuito bloqueado</span>
            ) : (
              <ul className="blocked-list">
                {circuitosBloqueados.map((item) => (
                  <li key={item} className="blocked-item">
                    <span>Circuito {item}</span>
                    <button
                      type="button"
                      className="btn-remove-blocked"
                      onClick={() => handleRemoverBloqueio(item)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ─── Botão Atualizar ─── */}
        <button
          type="button"
          className="btn-submit-atualizar"
          onClick={handleSalvarConduto}
          disabled={loading["conduto"]}
        >
          {loading["conduto"] ? "A atualizar..." : "Atualizar"}
        </button>
      </div>
    );
  }

  if (electricalData?.type === "conduto") {
    return (
      <div className={`properties-panel ${aberto ? "open" : "closed"}`}>
        <div className="panel-section">
          <div className="panel-section-header">
            <h3>Conduto</h3>
            <span className="badge">1</span>
          </div>
          <div className="cards-list">
            <div className="component-card">
              <CondutoFields />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Multi-Seleção ────────────────────────────────────────────────────────
  if (isMultiSelection || selectedComponents.length > 1) {
    const list = selectedComponents.length > 0 ? selectedComponents : [];
    const count = list.length;
    const sameType = count > 0 && list.every((c) => c.tipo === list[0].tipo);
    const commonTipo = sameType ? list[0].tipo : null;

    // Calcular valores comuns
    const allCircuits = list.map((c) => c.circuit_id);
    const commonCircuitId = allCircuits.every((c) => c === allCircuits[0]) ? allCircuits[0] : "__VARIOUS__";

    const allPowers = list.map((c) => c.potencia_w);
    const commonPotencia = allPowers.every((p) => p === allPowers[0]) ? allPowers[0] : "";

    const allRotations = list.map((c) => c.rotacao);
    const commonRotacao = allRotations.every((r) => r === allRotations[0]) ? allRotations[0] : "";

    const allLabels = list.map((c) => c.rotulo || "");
    const commonRotulo = allLabels.every((l) => l === allLabels[0]) ? allLabels[0] : "";

    async function atualizarEmLote(dadosNovos) {
      const targetIds = selectedComponentIds.length > 0 ? selectedComponentIds : list.map((c) => c.id);
      if (!targetIds || targetIds.length === 0) return;

      try {
        const atualizados = await api.atualizarComponentesLote(targetIds, dadosNovos);
        for (const item of atualizados) {
          onComponenteAtualizado?.(item);
        }
        if (dadosNovos.circuit_id !== undefined) {
          atualizarNoCanvas?.({ circuito: { value: dadosNovos.circuit_id, visible: false } });
        }
        if (dadosNovos.potencia_w !== undefined) {
          atualizarNoCanvas?.({ potencia_va: { value: String(dadosNovos.potencia_w), visible: false } });
        }
        if (dadosNovos.rotulo !== undefined) {
          atualizarNoCanvas?.({ comando: { value: dadosNovos.rotulo, visible: true }, rotulo: dadosNovos.rotulo });
        }
        if (onRefreshData) await onRefreshData();
        toast.success(`Propriedades atualizadas em ${targetIds.length} componentes!`);
      } catch (err) {
        toast.error(`Erro ao atualizar em lote: ${err.message}`);
      }
    }

    async function apagarSelecaoLote() {
      const targetIds = selectedComponentIds.length > 0 ? selectedComponentIds : list.map((c) => c.id);
      if (!targetIds || targetIds.length === 0) return;

      if (!window.confirm(`Tem a certeza que deseja apagar os ${targetIds.length} componentes seleccionados?`)) return;

      try {
        await Promise.all(targetIds.map((id) => api.apagarComponente(id)));
        for (const id of targetIds) {
          onComponenteApagado?.(id);
        }
        if (onRefreshData) await onRefreshData();
        limparSelecao?.();
        toast.success(`${targetIds.length} componentes apagados com sucesso.`);
      } catch (err) {
        toast.error(`Erro ao apagar componentes: ${err.message}`);
      }
    }

    const tipoCounts = list.reduce((acc, c) => {
      acc[c.tipo] = (acc[c.tipo] || 0) + 1;
      return acc;
    }, {});

    return (
      <div className={`properties-panel ${aberto ? "open" : "closed"}`}>
        <div className="panel-section">
          <div className="panel-section-header">
            <h3>
              {sameType
                ? `${count}x ${LABELS_TIPO[commonTipo] || commonTipo}`
                : `${count} Componentes`}
            </h3>
            <span className="badge multi-badge">{count}</span>
          </div>

          <div className="multi-selection-info" style={{ marginBottom: "12px" }}>
            {sameType ? (
              <div className="multi-type-tag" style={{ fontSize: "11px", color: "var(--accent-primary-hover)", fontWeight: 500 }}>
                ⚡ Todos do mesmo tipo ({LABELS_TIPO[commonTipo] || commonTipo})
              </div>
            ) : (
              <div className="multi-type-summary" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {Object.entries(tipoCounts).map(([t, cnt]) => (
                  <span key={t} className="type-chip" style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                    {cnt}x {LABELS_TIPO[t] || t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="cards-list">
            <div className="component-card multi-card">
              <span className="field-group-title">Propriedades Partilhadas ({count} seleccionados)</span>

              {/* Circuito */}
              <label>
                <span className="field-label">Circuito</span>
                <select
                  value={commonCircuitId === "__VARIOUS__" ? "__VARIOUS__" : (commonCircuitId || "")}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__VARIOUS__") return;
                    atualizarEmLote({ circuit_id: val ? Number(val) : null });
                  }}
                >
                  {commonCircuitId === "__VARIOUS__" && (
                    <option value="__VARIOUS__" disabled>
                      — Vários Circuitos —
                    </option>
                  )}
                  <option value="">Nenhum (Sem circuito)</option>
                  {circuitos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>

              {/* Potência */}
              <label>
                <span className="field-label">Potência (W)</span>
                <input
                  type="number"
                  key={`pot-${commonPotencia}`}
                  defaultValue={commonPotencia}
                  placeholder="— Vários —"
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== "" && Number(val) !== commonPotencia) {
                      atualizarEmLote({ potencia_w: Number(val) });
                    }
                  }}
                />
              </label>

              {/* Rotação */}
              <label>
                <span className="field-label">Rotação (º)</span>
                <input
                  type="number"
                  key={`rot-${commonRotacao}`}
                  defaultValue={commonRotacao}
                  placeholder="— Vários —"
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== "" && Number(val) !== commonRotacao) {
                      atualizarEmLote({ rotacao: Number(val) });
                    }
                  }}
                />
              </label>

              {/* Rótulo / Comandos */}
              {sameType && commonTipo && (
                <label>
                  <span className="field-label">
                    {commonTipo.startsWith("interruptor") ? "Comando(s)" : "Rótulo"}
                  </span>
                  <input
                    type="text"
                    key={`lbl-${commonRotulo}`}
                    defaultValue={commonRotulo}
                    placeholder="— Vários —"
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== "" && val !== commonRotulo) {
                        atualizarEmLote({ rotulo: val });
                      }
                    }}
                  />
                </label>
              )}

              {/* Botão de Apagar Em Lote */}
              <div className="multi-actions" style={{ marginTop: "16px" }}>
                <button
                  className="btn-delete-circuit"
                  style={{ width: "100%" }}
                  onClick={apagarSelecaoLote}
                  title="Apagar todos os componentes seleccionados"
                >
                  ✕ Apagar Seleção ({count})
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!componente) {
    return (
      <div className={`properties-panel ${aberto ? "open" : "closed"}`}>
        <div className="panel-section">
          <div className="panel-section-header">
            <h3>Componente</h3>
            <span className="badge">0</span>
          </div>
          <p className="hint">Seleccione um componente no canvas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`properties-panel ${aberto ? "open" : "closed"}`}>
      {/* ─── Componente Seleccionado ─── */}
      <div className="panel-section">
        <div className="panel-section-header">
          <h3>{LABELS_TIPO[componente.tipo] || componente.tipo}</h3>
          <span className="badge">1</span>
        </div>

        <div className="cards-list">
          <div className="component-card" key={componente.id}>
            <div className="component-card-title">
              <span className={`comp-dot comp-dot-${getCategory(componente.tipo)}`} />
              {(() => {
                // Para caixa de passagem, parsear JSON e mostrar apenas o nome
                if (componente.tipo.startsWith("caixa_passagem") && componente.rotulo) {
                  try {
                    const parsed = JSON.parse(componente.rotulo);
                    if (parsed?.nome) return parsed.nome;
                  } catch {}
                  return componente.rotulo;
                }
                // Para fita LED, parsear JSON e mostrar apenas a localização
                if (componente.tipo === "lampada_led_fita" && componente.rotulo) {
                  try {
                    const parsed = JSON.parse(componente.rotulo);
                    if (parsed?.localizacao) {
                      return `Fita de LED (${parsed.localizacao === "teto" ? "Teto" : "Parede"})`;
                    }
                  } catch {}
                }
                // Para quadros, parsear JSON e mostrar apenas o nome
                if (componente.tipo.startsWith("quadro") && componente.rotulo) {
                  try {
                    const parsed = JSON.parse(componente.rotulo);
                    if (parsed?.nome) return parsed.nome;
                  } catch {}
                  return componente.rotulo;
                }
                // Para outros tipos, mostrar rótulo normal
                return componente.rotulo && componente.rotulo !== componente.tipo 
                  ? componente.rotulo 
                  : (LABELS_TIPO[componente.tipo] || componente.tipo);
              })()}
            </div>
            {/* Interruptor: inputs individuais por comando (simples=1, duplo=2, triplo=3) */}
            {componente.tipo.startsWith("interruptor") ? (() => {
              const getNumComandos = (tipo) => {
                if (!tipo || tipo === "interruptor_simples" || tipo === "interruptor") return 1;
                if (tipo === "interruptor_duplo") return 2;
                if (tipo === "interruptor_triplo") return 3;
                return 1;
              };
              const numComandos = getNumComandos(componente.tipo);
              const rotuloAtual = componente.rotulo || "";
              const comandos = rotuloAtual
                .split(",")
                .map((s) => s.trim())
                .slice(0, numComandos);
              while (comandos.length < numComandos) {
                comandos.push(String.fromCharCode(97 + comandos.length));
              }
              const LABELS = ["1.º Comando", "2.º Comando", "3.º Comando"];
              return (
                <div className="comandos-group">
                  <span className="field-group-title">Comandos ({numComandos})</span>
                  {comandos.map((cmd, idx) => (
                    <label key={idx}>
                      <span className="field-label">{LABELS[idx] || `${idx+1}.º Comando`}</span>
                      <input
                        type="text"
                        maxLength={1}
                        defaultValue={cmd}
                        placeholder={String.fromCharCode(97 + idx).toUpperCase()}
                        onBlur={(e) => {
                          const novos = [...comandos];
                          novos[idx] = e.target.value.slice(0, 1) || String.fromCharCode(97 + idx);
                          handleRotulo(componente.id, novos.join(","));
                        }}
                        disabled={loading["rotulo"]}
                      />
                    </label>
                  ))}
                </div>
              );
            })() : componente.tipo === "lampada_led_fita" ? (() => {
              // Parse do rotulo JSON (pontos, localizacao)
              let fitaDados = { localizacao: "teto", pontos: [] };
              try {
                const parsed = JSON.parse(componente.rotulo || "{}");
                if (parsed && typeof parsed === "object") {
                  fitaDados = { ...fitaDados, ...parsed };
                }
              } catch {}
              // Calcular comprimento total somando segmentos
              const pontos = fitaDados.pontos || [];
              let comprimentoTotal = 0;
              for (let i = 1; i < pontos.length; i++) {
                const dx = pontos[i].x - pontos[i-1].x;
                const dy = pontos[i].y - pontos[i-1].y;
                comprimentoTotal += Math.hypot(dx, dy);
              }
              const localizacao = fitaDados.localizacao || "teto";
              const comando = fitaDados.comando || "a";
              return (
                <>
                  <label>
                    <span className="field-label">Localização</span>
                    <select
                      defaultValue={localizacao}
                      onChange={async (e) => {
                        const val = e.target.value;
                        const novosDados = { ...fitaDados, localizacao: val };
                        handleRotulo(componente.id, JSON.stringify(novosDados));
                      }}
                      disabled={loading["rotulo"]}
                    >
                      <option value="teto">Teto</option>
                      <option value="parede">Parede</option>
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Comprimento</span>
                    <input
                      type="text"
                      value={`${comprimentoTotal.toFixed(2)} m`}
                      disabled
                      readOnly
                      className="field-readonly"
                    />
                  </label>
                  <label>
                    <span className="field-label">Comando</span>
                    <input
                      type="text"
                      maxLength={1}
                      defaultValue={comando}
                      placeholder="A"
                      onBlur={(e) => {
                        const val = e.target.value.slice(0, 1) || "a";
                        const novosDados = { ...fitaDados, comando: val };
                        handleRotulo(componente.id, JSON.stringify(novosDados));
                      }}
                      disabled={loading["rotulo"]}
                    />
                  </label>
                  <label>
                    <span className="field-label">Potência (W)</span>
                    <input
                      type="number"
                      defaultValue={componente.potencia_w}
                      onBlur={(e) => handlePotencia(componente.id, e.target.value)}
                      disabled={loading["potencia"]}
                    />
                  </label>
                  <label>
                    <span className="field-label">Circuito</span>
                    <select
                      defaultValue={componente.circuit_id || ""}
                      onChange={(e) => handleCircuito(componente.id, e.target.value)}
                      disabled={loading["circuito"]}
                    >
                      <option value="">Nenhum</option>
                      {circuitos.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                </>
              );
            })() : componente.tipo.startsWith("lampada") ? (
              <>
                <label>
                  <span className="field-label">Interruptor(es)</span>
                  <input
                    type="text"
                    defaultValue={componente.rotulo || "a"}
                    placeholder="Ex: a, b"
                    onBlur={(e) => {
                      const val = e.target.value.trim() || "a";
                      handleRotulo(componente.id, val);
                    }}
                    disabled={loading["rotulo"]}
                  />
                </label>
                <label>
                  <span className="field-label">Potência (W)</span>
                  <input
                    type="number"
                    defaultValue={componente.potencia_w}
                    onBlur={(e) => handlePotencia(componente.id, e.target.value)}
                    disabled={loading["potencia"]}
                  />
                </label>
                <label>
                  <span className="field-label">Circuito</span>
                  <select
                    defaultValue={componente.circuit_id || ""}
                    onChange={(e) => handleCircuito(componente.id, e.target.value)}
                    disabled={loading["circuito"]}
                  >
                    <option value="">Nenhum</option>
                    {circuitos.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : componente.tipo.startsWith("caixa_passagem") ? (
              <CaixaPassagemFields
                electricalData={electricalData}
                setElectricalData={setElectricalData}
                loading={loading}
              />
            ) : componente.tipo.startsWith("quadro") ? (
              <QuadroFields
                electricalData={electricalData}
                setElectricalData={setElectricalData}
                loading={loading}
              />
            ) : (
              <>
                <label>
                  <span className="field-label">Rótulo</span>
                  <input
                    type="text"
                    defaultValue={componente.rotulo || ""}
                    placeholder={LABELS_TIPO[componente.tipo] || componente.tipo}
                    onBlur={(e) => handleRotulo(componente.id, e.target.value)}
                    disabled={loading["rotulo"]}
                  />
                </label>
                <label>
                  <span className="field-label">Potência (W)</span>
                  <input
                    type="number"
                    defaultValue={componente.potencia_w}
                    onBlur={(e) => handlePotencia(componente.id, e.target.value)}
                    disabled={loading["potencia"]}
                  />
                </label>
                <label>
                  <span className="field-label">Circuito</span>
                  <select
                    defaultValue={componente.circuit_id || ""}
                    onChange={(e) => handleCircuito(componente.id, e.target.value)}
                    disabled={loading["circuito"]}
                  >
                    <option value="">Nenhum</option>
                    {circuitos.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
