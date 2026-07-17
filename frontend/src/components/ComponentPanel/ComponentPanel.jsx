import React, { useState } from "react";
import {
  IconRenderer,
  IconTomada, IconInterruptorSimples,
  IconLampada, IconQuadro,
} from "../Icons/ElectricalIcons";
import "./ComponentPanel.css";

const TIPOS = [
  { tipo: "tomada", label: "Tomada", icon: IconTomada, cor: "var(--color-tomada)" },
  { tipo: "interruptor", label: "Interruptor", icon: IconInterruptorSimples, cor: "var(--color-interruptor)" },
  { tipo: "luminaria", label: "Luminária", icon: IconLampada, cor: "var(--color-luminaria)" },
  { tipo: "quadro", label: "Quadro", icon: IconQuadro, cor: "var(--color-quadro)" },
];

/**
 * Painel flutuante de componentes elétricos arrastáveis para o canvas
 * e criador manual de divisões de planta (geometria).
 */
export default function ComponentPanel({ aberto, onCriarRoom }) {
  const [nome, setNome] = useState("");
  const [largura, setLargura] = useState("4.00");
  const [altura, setAltura] = useState("4.00");

  function handleDragStart(e, tipo) {
    e.dataTransfer.setData("tipo-componente", tipo);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleCriarRoom() {
    if (!nome.trim() || !largura || !altura) return;
    onCriarRoom?.({
      nome: nome.trim(),
      largura: parseFloat(largura),
      altura: parseFloat(altura),
    });
    setNome("");
  }

  return (
    <div className={`component-panel ${aberto ? "open" : "closed"}`}>
      <div className="panel-header">
        <h3>Componentes</h3>
      </div>

      <div className="panel-body">
        {TIPOS.map((item) => (
          <div
            key={item.tipo}
            className="component-item"
            draggable
            onDragStart={(e) => handleDragStart(e, item.tipo)}
            title={`Arrastar ${item.label} para o canvas`}
          >
            <div className="component-icon" style={{ background: item.cor }}>
              <IconRenderer IconComponent={item.icon} size={28} />
            </div>
            <div className="component-label">{item.label}</div>
          </div>
        ))}
      </div>

      {/* ─── Planta Manual ─── */}
      <div className="panel-section-divider" />
      <div className="panel-header">
        <h3>Planta Manual</h3>
      </div>
      <div className="room-creator-body">
        <label>
          <span className="creator-field-label">Nome da Divisão</span>
          <input
            placeholder="Ex: Terreno, Sala..."
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
        <div className="creator-row">
          <label>
            <span className="creator-field-label">Largura (m)</span>
            <input
              type="number"
              step="0.01"
              value={largura}
              onChange={(e) => setLargura(e.target.value)}
            />
          </label>
          <label>
            <span className="creator-field-label">Altura (m)</span>
            <input
              type="number"
              step="0.01"
              value={altura}
              onChange={(e) => setAltura(e.target.value)}
            />
          </label>
        </div>
        <button className="creator-btn" onClick={handleCriarRoom}>
          ＋ Criar Divisão
        </button>
      </div>

      <div className="panel-footer">
        <span className="hint">Arraste para o desenho</span>
      </div>
    </div>
  );
}
