import React from "react";
import "./NixieDisplay.css";

const DIGIT_RE = /[0-9]/;

/**
 * NixieDisplay — mostra um valor elétrico como algarismos âmbar em tubos de vidro.
 * Assinatura do mundo «O Contador de Tubos Néon».
 *
 * @param {string|number} value  - valor a mostrar (ex: "2.5", "1450", "16")
 * @param {string} [unit]        - unidade gravada à direita (ex: "A", "mm²", "W")
 * @param {string} [size]        - "sm" | "md" | "lg" (padrão "sm")
 * @param {number} [decimals]    - casas decimais (se value for número)
 */
export default function NixieDisplay({ value = "", unit = "", size = "sm", decimals }) {
  const displayValue = typeof value === "number" && decimals != null
    ? value.toFixed(decimals)
    : value;
  const chars = String(displayValue).split("");

  return (
    <span
      className={`nixie-display nixie-${size}`}
      role="text"
      aria-label={`${displayValue} ${unit}`.trim()}
    >
      {chars.map((ch, i) => {
        if (ch === " ") {
          return <span key={i} className="nixie-gap" aria-hidden="true" />;
        }
        if (DIGIT_RE.test(ch)) {
          return (
            <span key={`${i}-${ch}`} className="nixie-tube" aria-hidden="true">
              <span className="nixie-ghost nixie-ghost-1">{ch}</span>
              <span className="nixie-ghost nixie-ghost-2">{ch}</span>
              <span className="nixie-digit">{ch}</span>
            </span>
          );
        }
        // Pontuação: . , - % etc.
        return (
          <span key={`${i}-${ch}`} className="nixie-tube nixie-tube-punct" aria-hidden="true">
            <span className="nixie-digit nixie-punct">{ch}</span>
          </span>
        );
      })}
      {unit ? <span className="nixie-unit">{unit}</span> : null}
    </span>
  );
}
