import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * CalibrationModal — Modal que pede a distância real em metros
 * quando o utilizador termina de desenhar a linha de calibração.
 *
 * Usa createPortal para renderizar directamente no <body>,
 * evitando problemas de position: fixed dentro de elementos com CSS transform.
 */
export default function CalibrationModal({ aberto, onConfirm, onCancel }) {
  const [distancia, setDistancia] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (aberto) {
      setDistancia("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [aberto]);

  function handleSubmit(e) {
    e.preventDefault();
    const val = parseFloat(distancia.replace(",", "."));
    if (isNaN(val) || val <= 0) return;
    onConfirm(val);
  }

  if (!aberto) return null;

  return createPortal(
    <div className="calibration-overlay" onClick={onCancel}>
      <div className="calibration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="calibration-header">
          <span className="calibration-icon">📏</span>
          <h3 className="calibration-title">Calibrar Escala</h3>
        </div>
        <p className="calibration-description">
          Qual é a distância real representada pela linha que desenhaste?
        </p>
        <form onSubmit={handleSubmit} className="calibration-form">
          <div className="calibration-input-group">
            <input
              ref={inputRef}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Ex: 0.90"
              value={distancia}
              onChange={(e) => setDistancia(e.target.value)}
              className="calibration-input"
              autoFocus
            />
            <span className="calibration-unit">metros</span>
          </div>
          <div className="calibration-actions">
            <button type="submit" className="btn-calibr-confirm">
              ✓ Aplicar
            </button>
            <button type="button" className="btn-calibr-cancel" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
