import React from "react";
import FormLampada from "./FormLampada";
import FormInterruptor from "./FormInterruptor";
import FormTomada from "./FormTomada";
import FormCaixaPassagem from "./FormCaixaPassagem";
import PainelPlanta from "./PainelPlanta";
import { ICON_MAP } from "../Icons/ElectricalIcons";
import "./Sidebar.css";

/**
 * Tenta obter o tipo base a partir do tipo do componente.
 * Ex: "lampada_arandela" → "lampada"
 */
function getBaseType(tipo) {
  if (!tipo) return "outro";
  if (tipo.startsWith("lampada")) return "lampada";
  if (tipo.startsWith("tomada")) return "tomada";
  if (tipo.startsWith("interruptor")) return "interruptor";
  if (["telefonia", "dados", "tv", "campainha", "camera"].includes(tipo)) return "telecom";
  if (tipo.startsWith("passagem")) return "passagem";
  if (tipo === "quadro") return "quadro";
  return "outro";
}

const LABELS_TIPO = {
  lampada: "Lâmpada",
  lampada_simples: "Ponto de Luz (Teto)",
  lampada_arandela: "Arandela (Parede)",
  lampada_spot: "Spot / Olho de Boi",
  lampada_tubular: "Lâmpada Tubular",
  lampada_led: "Fita de LED",
  lampada_led_fita: "Fita de LED",
  lampada_pendente: "Lustre / Pendente",

  tomada: "Tomada",
  tomada_baixa: "Tomada Baixa",
  tomada_media: "Tomada Média",
  tomada_alta: "Tomada Alta",
  tomada_trifasica: "Tomada Trifásica",
  tomada_sensor: "Tomada com Sensor",
  tomada_dupla: "Tomada Dupla",
  tomada_tripla: "Tomada Tripla",
  tomada_piso: "Tomada de Piso",

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
  interruptor_paralelo: "Interruptor Paralelo (Three-way)",
  interruptor_dimmer: "Interruptor Dimmer",
  interruptor_pulsador: "Pulsador de Campainha",
  interruptor_bipolar: "Interruptor Bipolar",

  quadro: "Quadro Geral",
};

const COLORS_CATEGORIA = {
  lampada: "var(--color-lampada)",
  tomada: "var(--color-tomada)",
  interruptor: "var(--color-interruptor)",
  telecom: "var(--color-telecom)",
  passagem: "var(--color-passagem)",
  quadro: "var(--color-quadro)",
  outro: "var(--accent-primary)",
};

/**
 * Painel Geral — Mostrado quando nenhum objeto está selecionado.
 * Exibe informações gerais do projeto e uma mensagem de ajuda.
 */
function PainelGeral() {
  return (
    <div className="painel-geral">
      <div className="painel-geral-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>
      <h4 className="painel-geral-title">Painel de Propriedades</h4>
      <p className="painel-geral-msg">
        Selecione um símbolo na planta para editar as suas propriedades elétricas.
      </p>
      <div className="painel-geral-dicas">
        <div className="dica-item">
          <kbd>Clique</kbd> para selecionar
        </div>
        <div className="dica-item">
          <kbd>Delete</kbd> para remover
        </div>
        <div className="dica-item">
          <kbd>Espaço</kbd> + arrastar para pan
        </div>
        <div className="dica-item">
          <kbd>Scroll</kbd> para zoom
        </div>
      </div>
    </div>
  );
}

/**
 * PainelPropriedades — Mostra o formulário dinâmico do tipo do objeto selecionado.
 */
function PainelPropriedades({
  electricalData,
  setElectricalData,
  atualizarNoCanvas,
  limparSelecao,
}) {
  if (!electricalData) return null;

  const tipo = electricalData.type || "outro";
  const baseType = getBaseType(tipo);
  const IconComponent = ICON_MAP[tipo] || null;
  const nomeTipo = LABELS_TIPO[tipo] || tipo;
  const corCategoria = COLORS_CATEGORIA[baseType] || "var(--accent-primary)";

  // Handler unificado: atualiza o estado React
  function handleChange(campo, valor) {
    setElectricalData((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  // Toggle de visibilidade
  function handleToggleVisibility(campo) {
    setElectricalData((prev) => {
      const prop = prev[campo];
      if (prop && typeof prop === "object" && "visible" in prop) {
        return {
          ...prev,
          [campo]: { ...prop, visible: !prop.visible },
        };
      }
      return prev;
    });
  }

  function renderForm() {
    // Fita de LED tem formulário especial (não usa FormLampada genérico)
    if (tipo === "lampada_led_fita") {
      return (
        <div className="dynamic-form">
          <div className="form-field">
            <label className="field-label">Localização</label>
            <select
              value={electricalData.localizacao || "teto"}
              onChange={(e) => handleChange("localizacao", e.target.value)}
            >
              <option value="teto">Teto</option>
              <option value="parede">Parede</option>
            </select>
          </div>
          <FormLampada
            data={electricalData}
            onChange={handleChange}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>
      );
    }
    switch (baseType) {
      case "lampada":
        return (
          <FormLampada
            data={electricalData}
            onChange={handleChange}
            onToggleVisibility={handleToggleVisibility}
          />
        );
      case "interruptor":
        return (
          <FormInterruptor
            data={electricalData}
            onChange={handleChange}
            onToggleVisibility={handleToggleVisibility}
          />
        );
      case "tomada":
        return (
          <FormTomada
            data={electricalData}
            onChange={handleChange}
            onToggleVisibility={handleToggleVisibility}
          />
        );
      case "passagem":
        return (
          <FormCaixaPassagem
            data={electricalData}
            onChange={handleChange}
            onToggleVisibility={handleToggleVisibility}
          />
        );
      default:
        // Fallback: mostra um field genérico
        return (
          <div className="dynamic-form">
            <p className="form-fallback-msg">
              Este tipo de componente ({tipo}) não possui campos editáveis específicos.
            </p>
          </div>
        );
    }
  }

  return (
    <div className="painel-propriedades">
      {/* Cabeçalho com ícone e tipo */}
      <div className="prop-header">
        <div
          className="prop-header-icon"
          style={{ borderColor: corCategoria }}
        >
          {IconComponent ? <IconComponent /> : <span className="prop-header-emoji">⚡</span>}
        </div>
        <div className="prop-header-info">
          <span className="prop-header-badge" style={{ background: corCategoria }}>
            {baseType}
          </span>
          <h4 className="prop-header-title">{nomeTipo}</h4>
        </div>
      </div>

      {/* Formulário dinâmico */}
      {renderForm()}

      {/* Botão "Atualizar" */}
      <div className="prop-actions">
        <button
          className="btn-atualizar"
          onClick={atualizarNoCanvas}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Atualizar
        </button>
        <button
          className="btn-cancelar"
          onClick={limparSelecao}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Sidebar — Painel Dinâmico de Propriedades.
 *
 * Quando nada está selecionado: mostra PainelGeral.
 * Quando um objeto está selecionado: mostra PainelPropriedades com formulário dinâmico.
 */
export default function Sidebar({
  aberto,
  electricalData,
  setElectricalData,
  atualizarNoCanvas,
  limparSelecao,
  // Floor plan editing tools
  activeTool,
  calibResult,
  tempSelection,
  iniciarCrop,
  iniciarCalibracao,
  iniciarLimpeza,
  confirmarCrop,
  confirmarLimpeza,
  confirmarCalibracao,
  desativarFerramenta,
  escalaAtual,
}) {
  function renderConteudo() {
    // Se uma ferramenta da planta está ativa, mostrar PainelPlanta sempre
    if (activeTool) {
      return (
        <PainelPlanta
          activeTool={activeTool}
          calibResult={calibResult}
          tempSelection={tempSelection}
          iniciarCrop={iniciarCrop}
          iniciarCalibracao={iniciarCalibracao}
          iniciarLimpeza={iniciarLimpeza}
          confirmarCrop={confirmarCrop}
          confirmarLimpeza={confirmarLimpeza}
          confirmarCalibracao={confirmarCalibracao}
          desativarFerramenta={desativarFerramenta}
          escalaAtual={escalaAtual}
        />
      );
    }

    if (!electricalData) return <PainelGeral />;

    // Se for o floor plan (tipo 'floorplan'), mostrar PainelPlanta
    if (electricalData.type === "floorplan") {
      return (
        <PainelPlanta
          activeTool={activeTool}
          calibResult={calibResult}
          tempSelection={tempSelection}
          iniciarCrop={iniciarCrop}
          iniciarCalibracao={iniciarCalibracao}
          iniciarLimpeza={iniciarLimpeza}
          confirmarCrop={confirmarCrop}
          confirmarLimpeza={confirmarLimpeza}
          confirmarCalibracao={confirmarCalibracao}
          desativarFerramenta={desativarFerramenta}
          escalaAtual={escalaAtual}
        />
      );
    }

    // Caso contrário, mostrar PainelPropriedades normal
    return (
      <PainelPropriedades
        electricalData={electricalData}
        setElectricalData={setElectricalData}
        atualizarNoCanvas={atualizarNoCanvas}
        limparSelecao={limparSelecao}
      />
    );
  }

  return (
    <div className={`sidebar-panel ${aberto ? "open" : "closed"}`}>
      {renderConteudo()}
    </div>
  );
}
