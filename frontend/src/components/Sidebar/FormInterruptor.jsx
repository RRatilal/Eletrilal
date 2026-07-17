import React from "react";
import InputWithVisibility from "./InputWithVisibility";

/**
 * Formulário de propriedades para Interruptores.
 *
 * Props:
 * - data: electricalData do interruptor
 * - onChange: (campo, valor) => void
 * - onToggleVisibility: (campo) => void
 */
export default function FormInterruptor({ data, onChange, onToggleVisibility }) {
  if (!data) return null;

  const set = (campo, valor) => onChange(campo, valor);
  const toggle = (campo) => onToggleVisibility(campo);

  return (
    <div className="dynamic-form">
      {/* Comando (Letra) */}
      <InputWithVisibility
        label="Comando (Letra)"
        value={data.comando?.value}
        visible={data.comando?.visible}
        placeholder="Ex: A"
        onChange={(v) => set("comando", { ...data.comando, value: v })}
        onToggleVisibility={() => toggle("comando")}
      />
    </div>
  );
}
