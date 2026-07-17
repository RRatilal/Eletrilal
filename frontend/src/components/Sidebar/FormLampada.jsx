import React from "react";
import InputWithVisibility, {
  RadioButtonGroup,
  SelectField,
} from "./InputWithVisibility";

/**
 * Formulário de propriedades para Lâmpadas.
 *
 * Props:
 * - data: electricalData da lâmpada
 * - onChange: (campo, valor) => void
 * - onToggleVisibility: (campo) => void
 */
export default function FormLampada({ data, onChange, onToggleVisibility }) {
  if (!data) return null;

  const set = (campo, valor) => onChange(campo, valor);
  const toggle = (campo) => onToggleVisibility(campo);

  return (
    <div className="dynamic-form">
      {/* Potência (VA) */}
      <InputWithVisibility
        label="Potência (VA)"
        type="number"
        value={data.potencia_va?.value}
        visible={data.potencia_va?.visible}
        placeholder="Ex: 100"
        onChange={(v) => set("potencia_va", { ...data.potencia_va, value: v })}
        onToggleVisibility={() => toggle("potencia_va")}
      />

      {/* Tensão (V) — Radio Button */}
      <RadioButtonGroup
        label="Tensão (V)"
        value={data.tensao}
        options={[
          { value: "127", label: "127V" },
          { value: "220", label: "220V" },
        ]}
        onChange={(v) => set("tensao", v)}
      />

      {/* Interruptor / Comando (Letra) */}
      <InputWithVisibility
        label="Interruptor / Comando"
        value={data.comando?.value}
        visible={data.comando?.visible}
        placeholder="Ex: A"
        onChange={(v) => set("comando", { ...data.comando, value: v })}
        onToggleVisibility={() => toggle("comando")}
      />

      {/* Circuito */}
      <InputWithVisibility
        label="Circuito (Nº)"
        type="number"
        value={data.circuito?.value}
        visible={data.circuito?.visible}
        placeholder="Ex: 2"
        onChange={(v) => set("circuito", { ...data.circuito, value: v })}
        onToggleVisibility={() => toggle("circuito")}
      />
    </div>
  );
}
