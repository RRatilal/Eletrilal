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
  lampada_pendente: "Lustre / Pendente",

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
  quadro: "Quadro Geral",
};

function getCategory(tipo) {
  if (tipo.startsWith("lampada")) return "lampada";
  if (tipo.startsWith("tomada")) return "tomada";
  if (tipo.startsWith("interruptor")) return "interruptor";
  if (tipo === "quadro") return "quadro";
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
  conexao,
  circuitos = [],
  onComponenteAtualizado,
  onConexaoAtualizada,
  electricalData,
  setElectricalData,
  atualizarNoCanvas,
  canvasInstance,
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
                // Para outros tipos, mostrar rótulo normal
                return componente.rotulo && componente.rotulo !== componente.tipo 
                  ? componente.rotulo 
                  : (LABELS_TIPO[componente.tipo] || componente.tipo);
              })()}
            </div>
            {/* Interruptor: só Rótulo (1 letra) */}
            {componente.tipo.startsWith("interruptor") ? (
              <label>
                <span className="field-label">Rótulo</span>
                <input
                  type="text"
                  maxLength={1}
                  defaultValue={componente.rotulo?.length === 1 ? componente.rotulo : "a"}
                  placeholder="a"
                  onBlur={(e) => {
                    const val = e.target.value.slice(0, 1) || "a";
                    handleRotulo(componente.id, val);
                  }}
                  disabled={loading["rotulo"]}
                />
              </label>
            ) : componente.tipo.startsWith("lampada") ? (
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
