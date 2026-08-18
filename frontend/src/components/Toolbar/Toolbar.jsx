import React, { useRef, useEffect, useMemo } from "react";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import { useTema } from "../../hooks/ThemeContext";
import "./Toolbar.css";

const SAVE_LABELS = {
  "guardado": "✓ Guardado",
  "pendente": "● A guardar...",
  "a-guardar": "● A guardar...",
};

const IconPack = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

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
  modoFitaLed,
  onToggleModoFitaLed,
  modo3D,
  onToggleModo3D,
  gridVisivel,
  onToggleGrid,
  fiacaoVisivel,
  onToggleFiacao,
  onExportarPNG,
  onExportarPDF,
}) {
  const inputRef = useRef(null);
  const panelRef = useRef(null);
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

  // Fechar painel ao clicar fora
  useEffect(() => {
    function clickOutside(e) {
      if (painelEsquerdoAberto && panelRef.current && !panelRef.current.contains(e.target)) {
        // Ignorar cliques no toggle flutuante e no ☰ da toolbar mínima
        const toggleBtns = document.querySelectorAll(".toolbar-minimal-hamburger");
        for (const btn of toggleBtns) {
          if (btn.contains(e.target)) return;
        }
        onTogglePainelEsquerdo?.();
      }
    }
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, [painelEsquerdoAberto, onTogglePainelEsquerdo]);

  return (
    <>
      {/* ─── Minimal Top Bar ─────────────────────────────────────── */}
      <div className="toolbar-minimal">
        <div className="toolbar-minimal-left">
          <button
            className="toolbar-minimal-btn"
            onClick={onVoltar}
            title="Voltar aos projetos"
          >
            ←
          </button>

          <button
            className={`toolbar-minimal-btn toolbar-minimal-hamburger ${painelEsquerdoAberto ? "active" : ""}`}
            onClick={onTogglePainelEsquerdo}
            title="Ferramentas e ficheiros"
          >
            {IconPack}
          </button>

          <div className="toolbar-minimal-divider" />

          <div className="toolbar-minimal-breadcrumb">
            <span className="breadcrumb-label">Electrilal</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{projeto?.nome}</span>
          </div>
        </div>

        <div className="toolbar-minimal-right">
          {autosaveEstado && (
            <span className={`autosave-indicator ${autosaveEstado}`}>
              {SAVE_LABELS[autosaveEstado]}
            </span>
          )}

          <button
            className="toolbar-minimal-btn theme-toggle"
            onClick={alternarTema}
            title={tema === "dark" ? "Modo Claro" : "Modo Escuro"}
          >
            {tema === "dark" ? "☀️" : "🌙"}
          </button>

          <button
            className={`toolbar-minimal-btn ${painelDireitoAberto ? "active" : ""}`}
            onClick={onTogglePainelDireito}
            title="Painel de propriedades"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ─── Floating Left Panel ─────────────────────────────────── */}
      <aside
        ref={panelRef}
        className={`toolbar-floating-panel ${painelEsquerdoAberto ? "is-open" : ""}`}
      >
        {/* Cabeçalho */}
        <div className="panel-header">
          <div className="panel-header-left">
            {IconPack}
            <span className="panel-title">Ferramentas</span>
          </div>
          <button className="panel-close-btn" onClick={onTogglePainelEsquerdo} title="Fechar painel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Grupo: Ficheiros */}
        <div className="panel-group">
          <div className="panel-group-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Ficheiros</span>
          </div>
          <button
            className="panel-tool-btn"
            onClick={() => inputRef.current.click()}
            disabled={!projeto}
          >
            <span className="panel-tool-icon">📂</span>
            <span className="panel-tool-label">Carregar .dxf</span>
          </button>
          <input
            type="file"
            accept=".dxf"
            ref={inputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            className="panel-tool-btn"
            onClick={onImportarPlantaPDF}
            disabled={!projeto}
            title="Importar planta arquitetónica a partir de PDF"
          >
            <span className="panel-tool-icon">📄</span>
            <span className="panel-tool-label">Importar Planta PDF</span>
          </button>
          <button
            className="panel-tool-btn"
            onClick={onPdfToDxf}
            disabled={!projeto}
            title="Converter páginas de um PDF para DXF"
          >
            <span className="panel-tool-icon">🔄</span>
            <span className="panel-tool-label">PDF → DXF</span>
          </button>
        </div>

        <div className="panel-divider" />

        {/* Grupo: Ferramentas */}
        <div className="panel-group">
          <div className="panel-group-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span>Ferramentas de Desenho</span>
          </div>
          <button
            className={`panel-tool-btn ${modoCabo ? "active" : ""}`}
            onClick={onToggleModoCabo}
            disabled={!projeto}
            title={modoCabo ? "Sair do modo cabo (Esc)" : "Desenhar cabo entre componentes"}
          >
            <span className="panel-tool-icon">🔗</span>
            <span className="panel-tool-label">{modoCabo ? "Modo Cabo ✓" : "Desenhar Cabo"}</span>
          </button>
          <button
            className={`panel-tool-btn ${modoFitaLed ? "active" : ""}`}
            onClick={onToggleModoFitaLed}
            disabled={!projeto}
            title={modoFitaLed ? "Sair do modo Fita LED (Esc)" : "Desenhar fita de LED (polyline)"}
          >
            <span className="panel-tool-icon">💡</span>
            <span className="panel-tool-label">{modoFitaLed ? "Modo Fita LED ✓" : "Fita de LED"}</span>
          </button>
        </div>

        <div className="panel-divider" />

        {/* Grupo: Vista */}
        <div className="panel-group">
          <div className="panel-group-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Vista</span>
          </div>
          <button
            className={`panel-tool-btn ${modo3D ? "active" : ""}`}
            onClick={onToggleModo3D}
            disabled={!projeto}
            title="Alternar para visualização 3D"
          >
            <span className="panel-tool-icon">👁️</span>
            <span className="panel-tool-label">{modo3D ? "Vista 2D (Edição)" : "Ver em 3D"}</span>
          </button>
          <button
            className={`panel-tool-btn ${!gridVisivel ? "active" : ""}`}
            onClick={onToggleGrid}
            disabled={!projeto}
            title={gridVisivel ? "Ocultar grelha" : "Mostrar grelha"}
          >
            <span className="panel-tool-icon">{gridVisivel ? "▦" : "▢"}</span>
            <span className="panel-tool-label">Grelha</span>
          </button>
          <button
            className={`panel-tool-btn ${fiacaoVisivel ? "active" : ""}`}
            onClick={onToggleFiacao}
            disabled={!projeto || modo3D}
            title={fiacaoVisivel ? "Ocultar fiação dos eletrodutos" : "Mostrar fiação dos eletrodutos (chicote de condutores)"}
          >
            <span className="panel-tool-icon">≡</span>
            <span className="panel-tool-label">Fiação</span>
          </button>
        </div>

        <div className="panel-divider" />

        {/* Grupo: Exportar */}
        <div className="panel-group">
          <div className="panel-group-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Exportar</span>
          </div>
          <button
            className="panel-tool-btn"
            onClick={handleExportar}
            disabled={!projeto}
            title="Exportar projeto em formato DXF"
          >
            <span className="panel-tool-icon">💾</span>
            <span className="panel-tool-label">Exportar DXF</span>
          </button>
          <button
            className="panel-tool-btn panel-tool-btn-pdf"
            onClick={onExportarPDF}
            disabled={!projeto}
            title="Gerar folha técnica vectorial em PDF"
          >
            <span className="panel-tool-icon">▤</span>
            <span className="panel-tool-label">Exportar PDF</span>
          </button>
          <button
            className="panel-tool-btn"
            onClick={onExportarPNG}
            disabled={!projeto || modo3D}
            title="Exportar imagem da planta em alta resolução (PNG)"
          >
            <span className="panel-tool-icon">🖼️</span>
            <span className="panel-tool-label">Exportar PNG</span>
          </button>
        </div>
      {/* Rodapé */}
        <div className="panel-footer">
          <span>{projeto?.nome || "Nenhum projeto"}</span>
        </div>
      </aside>
    </>
  );
}
