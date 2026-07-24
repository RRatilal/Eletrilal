import React, { useRef } from "react";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import { useTema } from "../../hooks/ThemeContext";
import "./Toolbar.css";

const SAVE_LABELS = {
  "guardado": "✓ Guardado",
  "pendente": "● A guardar...",
  "a-guardar": "● A guardar...",
};

export default function Toolbar({
  projeto,
  onUploadDxf,
  onImportarPlantaPDF,
  onPdfToDxf,
  onVoltar,
  painelEsquerdoAberto,
  onTogglePainelEsquerdo,
  painelDireitoAberto,
  onTogglePainelDireito,
  autosaveEstado,
  modoCabo,
  onToggleModoCabo,
  modo3D,
  onToggleModo3D,
  gridVisivel,
  onToggleGrid,
  onExportarPNG,
}) {
  const inputRef = useRef(null);
  const toast = useToast();
  const { tema, alternarTema } = useTema();

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file || !projeto) return;
    try {
      const resultado = await api.uploadDxf(projeto.id, file);
      onUploadDxf(resultado.geometria);
    } catch (err) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      e.target.value = "";
    }
  }

  function handleExportar() {
    if (!projeto) return;
    window.open(api.exportarDxfUrl(projeto.id), "_blank");
    toast.info("A exportar DXF...");
  }

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button
          className="toolbar-btn toolbar-btn-icon"
          onClick={onVoltar}
          title="Voltar aos projetos"
        >
          ←
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn toolbar-btn-icon ${painelEsquerdoAberto ? "active" : ""}`}
          onClick={onTogglePainelEsquerdo}
          title="Painel de componentes"
        >
          ☰
        </button>

        <div className="toolbar-breadcrumb">
          <span className="breadcrumb-label">Electrilal</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{projeto?.nome}</span>
        </div>
      </div>

      <div className="toolbar-center">
        <button
          className="toolbar-btn"
          onClick={() => inputRef.current.click()}
          disabled={!projeto}
        >
          📂 Carregar .dxf
        </button>
        <input
          type="file"
          accept=".dxf"
          ref={inputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <button
          className="toolbar-btn toolbar-btn-pdf"
          onClick={onImportarPlantaPDF}
          disabled={!projeto}
          title="Importar planta arquitetónica a partir de PDF"
        >
          📄 Importar Planta PDF
        </button>

        <button
          className="toolbar-btn toolbar-btn-pdf"
          onClick={onPdfToDxf}
          disabled={!projeto}
          title="Converter páginas de um PDF para DXF"
        >
          🔄 PDF → DXF
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${modoCabo ? "toolbar-btn-active" : ""}`}
          onClick={onToggleModoCabo}
          disabled={!projeto}
          title={modoCabo ? "Sair do modo cabo (Esc)" : "Desenhar cabo entre componentes"}
        >
          🔗 {modoCabo ? "Modo Cabo ✓" : "Desenhar Cabo"}
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${modo3D ? "toolbar-btn-active" : ""}`}
          onClick={onToggleModo3D}
          disabled={!projeto}
          title="Alternar para visualização tridimensional e interativa da planta e circuitos elétricos"
        >
          👁️ {modo3D ? "Vista 2D (Edição)" : "Ver em 3D"}
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${gridVisivel ? "" : "toolbar-btn-active"}`}
          onClick={onToggleGrid}
          disabled={!projeto}
          title={gridVisivel ? "Ocultar grelha" : "Mostrar grelha"}
        >
          {gridVisivel ? "▦" : "▢"} Grelha
        </button>

        <button
          className="toolbar-btn"
          onClick={handleExportar}
          disabled={!projeto}
          title="Exportar projeto em formato DXF"
        >
          💾 Exportar DXF
        </button>

        <button
          className="toolbar-btn"
          onClick={onExportarPNG}
          disabled={!projeto || modo3D}
          title="Exportar imagem da planta em alta resolução (PNG)"
        >
          🖼️ Exportar PNG
        </button>
      </div>

      <div className="toolbar-right">
        {autosaveEstado && (
          <span className={`autosave-indicator ${autosaveEstado}`}>
            {SAVE_LABELS[autosaveEstado]}
          </span>
        )}

        <button
          className="toolbar-btn toolbar-btn-icon theme-toggle"
          onClick={alternarTema}
          title={tema === "dark" ? "Modo Claro" : "Modo Escuro"}
        >
          {tema === "dark" ? "☀️" : "🌙"}
        </button>

        <button
          className={`toolbar-btn toolbar-btn-icon ${painelDireitoAberto ? "active" : ""}`}
          onClick={onTogglePainelDireito}
          title="Painel de propriedades"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
