import React, { useState } from "react";
import CalibrationModal from "./CalibrationModal";

/**
 * PainelPlanta — Painel de Edição da Planta (Acordeão).
 *
 * Cada ferramenta (Crop, Escala, Limpar) é um item expansível.
 * Fluxo Two-Step:
 *   1. Utilizador ativa ferramenta e desenha no Canvas
 *   2. Sidebar mostra detalhes + botão "Confirmar" para executar
 */
export default function PainelPlanta({
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
  // Controles de expansão (acordeão)
  const [expandido, setExpandido] = useState(null);

  function toggleExpand(tool) {
    setExpandido((prev) => (prev === tool ? null : tool));
  }

  const temSelecao = tempSelection !== null;
  const isExpanded = (tool) => expandido === tool;

  return (
    <div className="painel-planta">
      {/* Cabeçalho */}
      <div className="prop-header">
        <div
          className="prop-header-icon"
          style={{ borderColor: "var(--color-lampada, #f59e0b)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        </div>
        <div className="prop-header-info">
          <span className="prop-header-badge" style={{ background: "var(--color-lampada, #f59e0b)" }}>
            planta
          </span>
          <h4 className="prop-header-title">Edição da Planta</h4>
        </div>
      </div>

      <p className="painel-planta-desc">
        Ferramentas para editar a planta arquitectónica.
      </p>

      {/* ─── Acordeão ──────────────────────────────────────────────── */}
      <div className="planta-accordion">
        {/* ═══ CROP ═══ */}
        <div className={`accordion-item ${isExpanded("crop") ? "expanded" : ""} ${activeTool === "crop" ? "tool-active" : ""}`}>
          <button
            className="accordion-header"
            onClick={() => {
              toggleExpand("crop");
              if (activeTool !== "crop") iniciarCrop();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 6.5h11v11" />
              <line x1="2" y1="2" x2="6.5" y2="6.5" />
              <line x1="22" y1="22" x2="17.5" y2="17.5" />
            </svg>
            <span>Cortar (Crop)</span>
            <svg className={`accordion-chevron ${isExpanded("crop") ? "rotated" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isExpanded("crop") && (
            <div className="accordion-body">
              <p className="accordion-desc">
                Clique e arraste no canvas para desenhar um retângulo. A planta
                será cortada para mostrar apenas a área selecionada.
              </p>
              {activeTool === "crop" && !temSelecao && (
                <p className="accordion-hint">✂️ Desenhe um retângulo no canvas...</p>
              )}
              {temSelecao && activeTool === "crop" && (
                <div className="accordion-selection-info">
                  <span>Rect: {Math.round(tempSelection.w / 40 * 100) / 100}m × {Math.round(tempSelection.h / 40 * 100) / 100}m</span>
                </div>
              )}
              <div className="accordion-buttons">
                <button
                  className="btn-confirm-tool btn-crop"
                  disabled={!temSelecao || activeTool !== "crop"}
                  onClick={confirmarCrop}
                >
                  ✂️ Aplicar Corte
                </button>
                {activeTool === "crop" && (
                  <button className="btn-cancel-tool-sm" onClick={desativarFerramenta}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══ CALIBRAR ═══ */}
        <div className={`accordion-item ${isExpanded("calibr") ? "expanded" : ""} ${activeTool === "calibr" ? "tool-active" : ""}`}>
          <button
            className="accordion-header"
            onClick={() => {
              toggleExpand("calibr");
              if (activeTool !== "calibr") iniciarCalibracao();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <span>Calibrar Escala</span>
            <svg className={`accordion-chevron ${isExpanded("calibr") ? "rotated" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isExpanded("calibr") && (
            <div className="accordion-body">
              <p className="accordion-desc">
                Desenhe uma linha sobre uma medida conhecida (ex: largura de porta)
                e indique a distância real em metros.
              </p>
              <div className="accordion-selection-info">
                <span>Escala atual: {Math.round((escalaAtual || 1) * 100)}%</span>
              </div>
              {activeTool === "calibr" && !temSelecao && (
                <p className="accordion-hint">📏 Desenhe uma linha no canvas...</p>
              )}
              {temSelecao && calibResult && (
                <div className="accordion-selection-info">
                  <span>Linha: {Math.round(calibResult.distanciaPixeis * 10) / 10}px</span>
                </div>
              )}
              {temSelecao && calibResult && (
                <div className="accordion-modal-note">
                  <span>📋 Indique a distância real no modal que apareceu abaixo</span>
                </div>
              )}
              {activeTool === "calibr" && (
                <button className="btn-cancel-tool-sm" onClick={desativarFerramenta} style={{ width: '100%' }}>
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>

        {/* ═══ LIMPAR ═══ */}
        <div className={`accordion-item ${isExpanded("erase") ? "expanded" : ""} ${activeTool === "erase" ? "tool-active" : ""}`}>
          <button
            className="accordion-header"
            onClick={() => {
              toggleExpand("erase");
              if (activeTool !== "erase") iniciarLimpeza();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18" />
              <rect x="7" y="3" width="10" height="18" rx="1" ry="1" />
              <line x1="7" y1="3" x2="17" y2="3" />
              <line x1="10" y1="3" x2="10" y2="21" />
            </svg>
            <span>Apagar Área</span>
            <svg className={`accordion-chevron ${isExpanded("erase") ? "rotated" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isExpanded("erase") && (
            <div className="accordion-body">
              <p className="accordion-desc">
                Clique e arraste sobre elementos que deseja remover (móveis, lixo
                arquitetónico). Apenas objetos 100% contidos serão apagados.
              </p>
              {activeTool === "erase" && !temSelecao && (
                <p className="accordion-hint">🧹 Desenhe um retângulo sobre a área a limpar...</p>
              )}
              {temSelecao && activeTool === "erase" && (
                <div className="accordion-selection-info">
                  <span>Área: {Math.round(tempSelection.w / 40 * 100) / 100}m × {Math.round(tempSelection.h / 40 * 100) / 100}m</span>
                </div>
              )}
              <div className="accordion-buttons">
                <button
                  className="btn-confirm-tool btn-erase"
                  disabled={!temSelecao || activeTool !== "erase"}
                  onClick={confirmarLimpeza}
                >
                  🧹 Apagar elementos contidos na seleção
                </button>
                {activeTool === "erase" && (
                  <button className="btn-cancel-tool-sm" onClick={desativarFerramenta}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Opção "Fechar" quando nada está ativo */}
      {!activeTool && (
        <div className="prop-actions">
          <button className="btn-cancelar" onClick={desativarFerramenta}>
            Fechar
          </button>
        </div>
      )}

      {/* Modal de calibração */}
      <CalibrationModal
        aberto={calibResult !== null && activeTool === "calibr"}
        onConfirm={(distancia) => confirmarCalibracao(distancia)}
        onCancel={desativarFerramenta}
      />
    </div>
  );
}
