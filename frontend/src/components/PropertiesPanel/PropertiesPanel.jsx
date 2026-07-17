import React, { useState } from "react";
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
 * Painel flutuante de propriedades (lado direito).
 * Lista os componentes do projeto, permite editar potência/rótulo,
 * criar circuitos e ver o dimensionamento calculado.
 */
export default function PropertiesPanel({
  aberto,
  projectId,
  componentes,
  circuitos,
  conexoes = [],
  onCircuitoCriado,
  onCircuitoAtualizado,
  onCircuitoApagado,
  onComponenteAtualizado,
}) {
  const [novoCircuitoNome, setNovoCircuitoNome] = useState("");
  const [dimensionamentos, setDimensionamentos] = useState({});
  const [calculating, setCalculating] = useState({});
  const toast = useToast();

  async function atualizarCircuitoFase(circuitId, fase) {
    try {
      const atualizado = await api.atualizarCircuito(circuitId, { fase });
      onCircuitoAtualizado(atualizado);
      toast.success(`Fase do circuito alterada para ${fase}`);
      // Recalcular dimensionamento
      await calcularDimensionamento(circuitId);
    } catch (err) {
      toast.error(`Erro ao atualizar fase: ${err.message}`);
    }
  }

  async function criarCircuito() {
    if (!novoCircuitoNome.trim()) return;
    try {
      const circuito = await api.criarCircuito(projectId, { nome: novoCircuitoNome, fase: "monofasico" });
      onCircuitoCriado(circuito);
      setNovoCircuitoNome("");
    } catch (err) {
      toast.error(`Erro ao criar circuito: ${err.message}`);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") criarCircuito();
  }

  async function calcularDimensionamento(circuitoId) {
    setCalculating((prev) => ({ ...prev, [circuitoId]: true }));
    try {
      const resultado = await api.dimensionarCircuito(circuitoId);
      setDimensionamentos((prev) => ({ ...prev, [circuitoId]: resultado }));
    } catch (err) {
      toast.error(`Erro no cálculo: ${err.message}`);
    } finally {
      setCalculating((prev) => ({ ...prev, [circuitoId]: false }));
    }
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

  async function apagarCircuito(circuitId) {
    try {
      await api.apagarCircuito(circuitId);
      onCircuitoApagado?.(circuitId);
      toast.success("Circuito apagado");
    } catch (err) {
      toast.error(`Erro ao apagar circuito: ${err.message}`);
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

  return (
    <div className={`properties-panel ${aberto ? "open" : "closed"}`}>
      {/* ─── Circuitos ─── */}
      <div className="panel-section">
        <div className="panel-section-header">
          <h3>Circuitos</h3>
          <span className="badge">{circuitos.length}</span>
        </div>

        <div className="new-circuit">
          <input
            placeholder="Nome do circuito..."
            value={novoCircuitoNome}
            onChange={(e) => setNovoCircuitoNome(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={criarCircuito} title="Criar circuito">+</button>
        </div>

        <div className="cards-list">
          {circuitos.map((c) => (
            <div key={c.id} className="circuit-card">
              <div className="circuit-card-header">
                <span className="circuit-indicator" />
                <span className="circuit-title">{c.nome}</span>
                <select
                  className="select-circuit-fase"
                  value={c.fase || "monofasico"}
                  onChange={(e) => atualizarCircuitoFase(c.id, e.target.value)}
                  title="Alterar fase do circuito"
                >
                  <option value="monofasico">Monofásico (220V)</option>
                  <option value="bifasico">Bifásico (380V)</option>
                  <option value="trifasico">Trifásico (380V)</option>
                </select>
              </div>

              <div className="circuit-card-actions">
                <button
                  className="btn-calculate"
                  onClick={() => calcularDimensionamento(c.id)}
                  disabled={calculating[c.id]}
                >
                  {calculating[c.id] ? "A calcular..." : "⚡ Dimensionar"}
                </button>
                <button
                  className="btn-delete-circuit"
                  onClick={() => apagarCircuito(c.id)}
                  title="Apagar circuito"
                >
                  ✕
                </button>
              </div>

              {dimensionamentos[c.id] && (
                <div className="dim-result">
                  <div className="dim-row">
                    <span className="dim-label">Potência</span>
                    <span className="dim-value">{dimensionamentos[c.id].dimensionamento.potencia_total_w} W</span>
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Corrente Nominal</span>
                    <span className="dim-value">{dimensionamentos[c.id].dimensionamento.corrente_a} A</span>
                  </div>
                  {dimensionamentos[c.id].dimensionamento.corrente_corrigida_a > dimensionamentos[c.id].dimensionamento.corrente_a && (
                    <div className="dim-row">
                      <span className="dim-label">Corr. Corrigida</span>
                      <span className="dim-value" title="Corrente considerando agrupamento e temperatura">{dimensionamentos[c.id].dimensionamento.corrente_corrigida_a} A</span>
                    </div>
                  )}
                  <div className="dim-row">
                    <span className="dim-label">Comprimento Max</span>
                    <span className="dim-value">{dimensionamentos[c.id].dimensionamento.comprimento_m} m</span>
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Queda de Tensão</span>
                    <span className="dim-value">{dimensionamentos[c.id].dimensionamento.queda_tensao_pct}%</span>
                  </div>
                  <div className="dim-row text-xs opacity-70">
                    <span className="dim-label">FCA / FCT</span>
                    <span className="dim-value" title="Fator Agrupamento / Fator Temperatura">{dimensionamentos[c.id].dimensionamento.fca} / {dimensionamentos[c.id].dimensionamento.fct}</span>
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Disjuntor</span>
                    <span className="dim-value">{dimensionamentos[c.id].dimensionamento.disjuntor_recomendado_a} A</span>
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Cabo Recomendado</span>
                    <span className="dim-value font-bold">{dimensionamentos[c.id].dimensionamento.cabo_recomendado_mm2} mm²</span>
                  </div>
                  {dimensionamentos[c.id].dimensionamento.avisos?.map((a, i) => (
                    <div key={i} className="aviso">⚠ {a}</div>
                  ))}
                  {dimensionamentos[c.id].avisos_validacao?.map((a, i) => (
                    <div key={`v${i}`} className="aviso">⚠ {a}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Conexões ─── */}
      {conexoes.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-header">
            <h3>Conexões</h3>
            <span className="badge">{conexoes.length}</span>
          </div>

          <div className="cards-list">
            {conexoes.map((con) => {
              const origem = componentes.find((c) => c.id === con.origem_id);
              const destino = componentes.find((c) => c.id === con.destino_id);
              return (
                <div key={con.id} className="connection-card">
                  <span className="connection-line-icon">🔗</span>
                  <span className="connection-label">
                    {origem?.rotulo || LABELS_TIPO[origem?.tipo] || origem?.tipo || "?"}
                  </span>
                  <span className="connection-arrow">→</span>
                  <span className="connection-label">
                    {destino?.rotulo || LABELS_TIPO[destino?.tipo] || destino?.tipo || "?"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Componentes ─── */}
      <div className="panel-section">
        <div className="panel-section-header">
          <h3>Componentes</h3>
          <span className="badge">{componentes.length}</span>
        </div>

        <div className="cards-list">
          {componentes.length === 0 && (
            <p className="hint">Arraste componentes para o canvas.</p>
          )}
          {componentes.map((comp) => (
            <div key={comp.id} className="component-card">
              <div className="component-card-title">
                <span className={`comp-dot comp-dot-${getCategory(comp.tipo)}`} />
                {comp.rotulo && comp.rotulo !== comp.tipo 
                  ? comp.rotulo 
                  : (LABELS_TIPO[comp.tipo] || comp.tipo)
                }
              </div>
              <label>
                <span className="field-label">Rótulo</span>
                <input
                  type="text"
                  defaultValue={comp.rotulo || ""}
                  placeholder={LABELS_TIPO[comp.tipo] || comp.tipo}
                  onBlur={(e) => atualizarRotulo(comp.id, e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Potência (W)</span>
                <input
                  type="number"
                  defaultValue={comp.potencia_w}
                  onBlur={(e) => atualizarPotencia(comp.id, e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Circuito</span>
                <select
                  defaultValue={comp.circuit_id || ""}
                  onChange={(e) => atribuirCircuito(comp.id, e.target.value)}
                >
                  <option value="">Nenhum</option>
                  {circuitos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
