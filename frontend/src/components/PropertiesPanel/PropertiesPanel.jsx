import React from "react";
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
 * ComponentesPanel — Painel de componentes.
 * Lista os componentes do projecto, permite editar rótulo/potência/atribuir circuito.
 */
export default function PropertiesPanel({
  aberto,
  componentes,
  circuitos,
  onComponenteAtualizado,
}) {
  const toast = useToast();

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

  return (
    <div className={`properties-panel ${aberto ? "open" : "closed"}`}>
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
