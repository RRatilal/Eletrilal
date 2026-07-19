import React, { useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import "./CircuitosPanel.css";

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

const BITOLAS_CABO = ["1.5 mm²", "2.5 mm²", "4.0 mm²", "6.0 mm²", "10.0 mm²", "16.0 mm²", "25.0 mm²", "35.0 mm²"];

/**
 * CircuitosPanel — Painel de gestão de circuitos e conexões.
 * Aparece no lado direito quando o botão ⚙ está activo.
 */
export default function CircuitosPanel({
  aberto,
  projectId,
  componentes,
  circuitos,
  conexoes = [],
  onCircuitoCriado,
  onCircuitoAtualizado,
  onCircuitoApagado,
  onComponenteAtualizado,
  onConexaoAtualizada,
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
      await calcularDimensionamento(circuitId);
    } catch (err) {
      toast.error(`Erro ao atualizar fase: ${err.message}`);
    }
  }

  async function atualizarCircuitoParam(circuitId, campo, valor) {
    try {
      const atualizado = await api.atualizarCircuito(circuitId, { [campo]: Number(valor) });
      onCircuitoAtualizado(atualizado);
      await calcularDimensionamento(circuitId);
    } catch (err) {
      toast.error(`Erro ao atualizar ${campo}: ${err.message}`);
    }
  }

  async function atualizarTipoCabo(connectionId, tipoCabo) {
    try {
      const atualizado = await api.atualizarConexao(connectionId, { tipo_cabo: tipoCabo || null });
      onConexaoAtualizada?.(atualizado);
      toast.success("Tipo de cabo atualizado");
    } catch (err) {
      toast.error(`Erro ao atualizar cabo: ${err.message}`);
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

  async function apagarCircuito(circuitId) {
    try {
      await api.apagarCircuito(circuitId);
      onCircuitoApagado?.(circuitId);
      toast.success("Circuito apagado");
    } catch (err) {
      toast.error(`Erro ao apagar circuito: ${err.message}`);
    }
  }

  return (
    <div className={`circuitos-panel ${aberto ? "open" : "closed"}`}>
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

              {/* Parâmetros de dimensionamento dinâmico */}
              <div className="dim-params">
                <label className="dim-param">
                  <span className="dim-param-label">Temp. (°C)</span>
                  <input
                    type="number"
                    className="dim-param-input"
                    defaultValue={c.temperatura_c ?? 30}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v > 0 && v !== (c.temperatura_c ?? 30)) {
                        atualizarCircuitoParam(c.id, "temperatura_c", v);
                      }
                    }}
                    min={0}
                    max={60}
                    step={1}
                  />
                </label>
                <label className="dim-param">
                  <span className="dim-param-label">Queda max (%)</span>
                  <input
                    type="number"
                    className="dim-param-input"
                    defaultValue={c.queda_tensao_max_pct ?? 4}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v > 0 && v !== (c.queda_tensao_max_pct ?? 4)) {
                        atualizarCircuitoParam(c.id, "queda_tensao_max_pct", v);
                      }
                    }}
                    min={0.5}
                    max={10}
                    step={0.5}
                  />
                </label>
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
                  <div className="connection-card-row">
                    <span className="connection-line-icon">🔗</span>
                    <span className="connection-label">
                      {origem?.rotulo || LABELS_TIPO[origem?.tipo] || origem?.tipo || "?"}
                    </span>
                    <span className="connection-arrow">→</span>
                    <span className="connection-label">
                      {destino?.rotulo || LABELS_TIPO[destino?.tipo] || destino?.tipo || "?"}
                    </span>
                  </div>
                  <label className="connection-tipo-label">
                    <span className="field-label">Tipo de Cabo</span>
                    <select
                      className="connection-tipo-select"
                      defaultValue={con.tipo_cabo || ""}
                      onChange={(e) => atualizarTipoCabo(con.id, e.target.value)}
                    >
                      <option value="">Automático</option>
                      {BITOLAS_CABO.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
