import React, { useState, useRef, useEffect } from "react";
import {
  IconRenderer,
  IconLampada, IconLampadaArandela, IconLampadaSpot,
  IconLampadaTubular, IconLampadaLed, IconLampadaPendente,
  IconTomada, IconTomadaMedia, IconTomadaAlta,
  IconTomadaTrifasica, IconTomadaSensor, IconTomadaDupla, IconTomadaTripla,
  IconTelefonia, IconDados, IconTv, IconCampainha, IconCamera,
  IconPassagemSobe, IconPassagemDesce,
  IconCaixaPassagem,
  IconInterruptorSimples, IconInterruptorDuplo, IconInterruptorTriplo,
  IconInterruptorIntermediario, IconInterruptorParalelo,
  IconInterruptorDimmer, IconInterruptorPulsador,
  IconQuadro,
} from "../Icons/ElectricalIcons";
import "./ComponentToolbar.css";

const CATEGORIAS = [
  {
    id: "lampadas",
    label: "Lâmpadas",
    icon: IconLampada,
    items: [
      { tipo: "lampada_simples", label: "Ponto de Luz (Teto)", icon: IconLampada },
      { tipo: "lampada_arandela", label: "Arandela (Parede)", icon: IconLampadaArandela },
      { tipo: "lampada_spot", label: "Spot / Olho de Boi", icon: IconLampadaSpot },
      { tipo: "lampada_tubular", label: "Lâmpada Tubular", icon: IconLampadaTubular },
      { tipo: "lampada_led", label: "Fita de LED", icon: IconLampadaLed },
      { tipo: "lampada_pendente", label: "Lustre / Pendente", icon: IconLampadaPendente },
    ]
  },
  {
    id: "tomadas",
    label: "Tomadas",
    icon: IconTomada,
    items: [
      { tipo: "tomada_baixa", label: "Tomada Baixa", icon: IconTomada },
      { tipo: "tomada_media", label: "Tomada Média", icon: IconTomadaMedia },
      { tipo: "tomada_alta", label: "Tomada Alta", icon: IconTomadaAlta },
      { tipo: "tomada_trifasica", label: "Tomada Trifásica", icon: IconTomadaTrifasica },
      { tipo: "tomada_sensor", label: "Tomada c/ Sensor", icon: IconTomadaSensor },
      { tipo: "tomada_dupla", label: "Tomada Dupla", icon: IconTomadaDupla },
      { tipo: "tomada_tripla", label: "Tomada Tripla", icon: IconTomadaTripla },
    ]
  },
  {
    id: "telecom",
    label: "Comunicações",
    icon: IconTelefonia,
    items: [
      { tipo: "telefonia", label: "Telefone (RJ11)", icon: IconTelefonia },
      { tipo: "dados", label: "Rede Dados (RJ45)", icon: IconDados },
      { tipo: "tv", label: "Tomada TV", icon: IconTv },
      { tipo: "campainha", label: "Campainha / Interfone", icon: IconCampainha },
      { tipo: "camera", label: "Câmara CCTV", icon: IconCamera },
    ]
  },
  {
    id: "passagem",
    label: "Caixas de Passagem",
    icon: IconPassagemSobe,
    items: [
      { tipo: "caixa_passagem", label: "Caixa de Passagem", icon: IconCaixaPassagem },
      { tipo: "passagem_sobe", label: "Passagem Sobe", icon: IconPassagemSobe },
      { tipo: "passagem_desce", label: "Passagem Desce", icon: IconPassagemDesce },
    ]
  },
  {
    id: "interruptores",
    label: "Interruptores",
    icon: IconInterruptorSimples,
    items: [
      { tipo: "interruptor_simples", label: "Interruptor Simples", icon: IconInterruptorSimples },
      { tipo: "interruptor_duplo", label: "Interruptor Duplo", icon: IconInterruptorDuplo },
      { tipo: "interruptor_triplo", label: "Interruptor Triplo", icon: IconInterruptorTriplo },
      { tipo: "interruptor_intermediario", label: "Interruptor Interm.", icon: IconInterruptorIntermediario },
      { tipo: "interruptor_paralelo", label: "Interruptor Paralelo", icon: IconInterruptorParalelo },
      { tipo: "interruptor_dimmer", label: "Interruptor Dimmer", icon: IconInterruptorDimmer },
      { tipo: "interruptor_pulsador", label: "Pulsador Campainha", icon: IconInterruptorPulsador },
    ]
  }
];

export default function ComponentToolbar({ onCriarRoom }) {
  const [dropdownAberto, setDropdownAberto] = useState(null); // id de categoria ou "divisao"
  const [roomNome, setRoomNome] = useState("");
  const [roomLargura, setRoomLargura] = useState("4.00");
  const [roomAltura, setRoomAltura] = useState("4.00");
  
  const toolbarRef = useRef(null);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    function clickOutside(e) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setDropdownAberto(null);
      }
    }
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

  function handleDragStart(e, tipo) {
    e.dataTransfer.setData("tipo-componente", tipo);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleCriarRoom() {
    if (!roomNome.trim() || !roomLargura || !roomAltura) return;
    onCriarRoom?.({
      nome: roomNome.trim(),
      largura: parseFloat(roomLargura),
      altura: parseFloat(roomAltura),
    });
    setRoomNome("");
    setDropdownAberto(null);
  }

  function toggleDropdown(id) {
    setDropdownAberto(dropdownAberto === id ? null : id);
  }

  return (
    <div className="component-toolbar" ref={toolbarRef}>
      {/* 🧱 DIVISÃO MANUAL */}
      <div className="toolbar-item-wrapper">
        <button
          className={`toolbar-category-btn ${dropdownAberto === "divisao" ? "active" : ""}`}
          onClick={() => toggleDropdown("divisao")}
          title="Criar divisão retangular manual"
        >
          <span className="btn-icon">🧱</span>
          <span className="btn-label">Divisão Manual</span>
        </button>

        {dropdownAberto === "divisao" && (
          <div className="toolbar-dropdown-menu room-creator-dropdown">
            <h4>Criar Divisão Manual</h4>
            <div className="dropdown-field">
              <label>Nome da Divisão</label>
              <input
                placeholder="Ex: Sala, Quarto..."
                value={roomNome}
                onChange={(e) => setRoomNome(e.target.value)}
              />
            </div>
            <div className="dropdown-row">
              <div className="dropdown-field">
                <label>Largura (m)</label>
                <input
                  type="number"
                  step="0.01"
                  value={roomLargura}
                  onChange={(e) => setRoomLargura(e.target.value)}
                />
              </div>
              <div className="dropdown-field">
                <label>Comprimento (m)</label>
                <input
                  type="number"
                  step="0.01"
                  value={roomAltura}
                  onChange={(e) => setRoomAltura(e.target.value)}
                />
              </div>
            </div>
            <button className="dropdown-action-btn" onClick={handleCriarRoom}>
              ＋ Adicionar ao Canvas
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-vertical-divider" />

      {/* CATEGORIAS DROPDOWN */}
      {CATEGORIAS.map((cat) => (
        <div key={cat.id} className="toolbar-item-wrapper">
          <button
            className={`toolbar-category-btn ${dropdownAberto === cat.id ? "active" : ""}`}
            onClick={() => toggleDropdown(cat.id)}
          >
            <span className="btn-icon">
              <IconRenderer IconComponent={cat.icon} size={22} />
            </span>
            <span className="btn-label">{cat.label}</span>
            <span className="btn-arrow">▾</span>
          </button>

          {dropdownAberto === cat.id && (
            <div className="toolbar-dropdown-menu components-grid-dropdown">
              <div className="dropdown-hint">Arraste os símbolos para a planta:</div>
              <div className="dropdown-grid">
                {cat.items.map((item) => (
                  <div
                    key={item.tipo}
                    className="dropdown-component-item"
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.tipo)}
                    title="Arraste para a planta"
                  >
                    <div className={`dropdown-component-icon type-${cat.id}`}>
                      <IconRenderer IconComponent={item.icon} size={32} />
                    </div>
                    <span className="dropdown-component-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="toolbar-vertical-divider" />

      {/* ⚡ QUADRO GERAL (Único) */}
      <div className="toolbar-item-wrapper">
        <div
          className="toolbar-category-btn single-btn"
          draggable
          onDragStart={(e) => handleDragStart(e, "quadro")}
          title="Arraste o Quadro Geral para o canvas"
        >
          <span className="btn-icon">
            <IconRenderer IconComponent={IconQuadro} size={22} />
          </span>
          <span className="btn-label">Quadro Geral</span>
        </div>
      </div>

      <div className="toolbar-hint-text">
        💡 Arraste qualquer símbolo para posicionar no desenho.
      </div>
    </div>
  );
}
