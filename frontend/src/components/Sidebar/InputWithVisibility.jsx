import React from "react";

/**
 * InputWithVisibility
 *
 * Input de texto/label com um botão "olho" ao lado que alterna a visibilidade.
 *
 * Props:
 * - label: string — texto da label
 * - value: string — valor atual
 * - visible: boolean — estado de visibilidade
 * - onChange: (value: string) => void — callback quando o valor muda
 * - onToggleVisibility: () => void — callback quando o olho é clicado
 * - placeholder: string — placeholder opcional
 * - type: "text" | "number" — tipo do input (default "text")
 */
export default function InputWithVisibility({
  label,
  value,
  visible = false,
  onChange,
  onToggleVisibility,
  placeholder = "",
  type = "text",
}) {
  return (
    <div className="input-visibility-group">
      <label className="input-visibility-label">{label}</label>
      <div className="input-visibility-row">
        <input
          className="input-visibility-input"
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          className={`btn-visibility ${visible ? "visible" : "hidden"}`}
          onClick={onToggleVisibility}
          title={visible ? "Visível na planta" : "Oculto na planta"}
          type="button"
        >
          {visible ? (
            /* Olho aberto (SVG) */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            /* Olho fechado (SVG) */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * RadioButtonGroup
 *
 * Grupo de botões de rádio horizontal (ex: 127V / 220V)
 *
 * Props:
 * - label: string
 * - value: string — valor selecionado
 * - options: [{ value: string, label: string }]
 * - onChange: (value: string) => void
 */
export function RadioButtonGroup({ label, value, options, onChange }) {
  return (
    <div className="input-visibility-group">
      <label className="input-visibility-label">{label}</label>
      <div className="radio-group-horizontal">
        {options.map((opt) => (
          <button
            key={opt.value}
            className={`radio-btn ${value === opt.value ? "active" : ""}`}
            onClick={() => onChange(opt.value)}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * SelectField
 *
 * Dropdown de seleção.
 *
 * Props:
 * - label: string
 * - value: string
 * - options: [{ value: string, label: string }]
 * - onChange: (value: string) => void
 */
export function SelectField({ label, value, options, onChange }) {
  return (
    <div className="input-visibility-group">
      <label className="input-visibility-label">{label}</label>
      <select
        className="select-field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * CheckboxField
 *
 * Checkbox com label.
 */
export function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="checkbox-label-text">{label}</span>
    </label>
  );
}
