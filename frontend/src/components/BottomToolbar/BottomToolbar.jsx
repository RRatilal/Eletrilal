import React, { useState } from "react";
import "./BottomToolbar.css";

/**
 * BottomToolbar — Barra de ferramentas inferior.
 *
 * Funcionalidades:
 * - Zoom +/- (centralizado no centro do canvas)
 * - Toggle "Planta Travada/Destravada" (selectable/evented no floorPlanGroup)
 * - Indicador de grid (placeholder)
 */
export default function BottomToolbar({
  onZoomIn,
  onZoomOut,
  onToggleLock,
  plantaTravada,
  zoomValue, // ex: 1.5 (150%)
}) {
  return (
    <div className="bottom-toolbar">
      {/* ─── Zoom Controls ─── */}
      <div className="bottom-toolbar-group">
        <button
          className="bottom-btn"
          onClick={onZoomOut}
          title="Afastar zoom"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>

        <span className="bottom-label zoom-label">
          {zoomValue != null ? `${Math.round(zoomValue * 100)}%` : "100%"}
        </span>

        <button
          className="bottom-btn"
          onClick={onZoomIn}
          title="Aproximar zoom"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      </div>

      <div className="bottom-divider" />

      {/* ─── Lock/Unlock Floor Plan ─── */}
      <div className="bottom-toolbar-group">
        <button
          className={`bottom-btn lock-btn ${plantaTravada ? "locked" : "unlocked"}`}
          onClick={onToggleLock}
          title={plantaTravada ? "Planta travada — clicar para destravar" : "Planta destravada — clicar para travar"}
        >
          {plantaTravada ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
          <span className="lock-text">
            {plantaTravada ? "Travada" : "Destravada"}
          </span>
        </button>
      </div>

      <div className="bottom-divider" />

      {/* ─── Grid Indicator ─── */}
      <div className="bottom-toolbar-group">
        <span className="bottom-label grid-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: "middle" }}>
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Grid: 0.5 m
        </span>
      </div>
    </div>
  );
}
