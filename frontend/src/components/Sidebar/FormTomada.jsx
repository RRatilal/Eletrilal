import React from "react";
import InputWithVisibility, {
  RadioButtonGroup,
  SelectField,
  CheckboxField,
} from "./InputWithVisibility";

/**
 * Formulário de propriedades para Tomadas.
 *
 * Props:
 * - data: electricalData da tomada
 * - onChange: (campo, valor) => void
 * - onToggleVisibility: (campo) => void
 */
export default function FormTomada({ data, onChange, onToggleVisibility }) {
  if (!data) return null;

  const set = (campo, valor) => onChange(campo, valor);
  const toggle = (campo) => onToggleVisibility(campo);

  return (
    <div className="dynamic-form">
      {/* Nome */}
      <InputWithVisibility
        label="Nome"
        value={data.nome?.value}
        visible={data.nome?.visible}
        placeholder="Ex: Sala de Estar"
        onChange={(v) => set("nome", { ...data.nome, value: v })}
        onToggleVisibility={() => toggle("nome")}
      />

      {/* Tipo de Tomada */}
      <SelectField
        label="Tipo de Tomada"
        value={data.tipo_tomada}
        options={[
          { value: "baixa", label: "Baixa" },
          { value: "media", label: "Média" },
          { value: "alta", label: "Alta" },
          { value: "dupla", label: "Dupla" },
          { value: "tripla", label: "Tripla" },
          { value: "piso", label: "Piso" },
          { value: "trifasica", label: "Trifásica" },
          { value: "sensor", label: "Com Sensor" },
        ]}
        onChange={(v) => set("tipo_tomada", v)}
      />

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

      {/* Altura */}
      <SelectField
        label="Altura"
        value={data.altura}
        options={[
          { value: "Baixa", label: "Baixa" },
          { value: "Média", label: "Média" },
          { value: "Alta", label: "Alta" },
        ]}
        onChange={(v) => set("altura", v)}
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

      {/* Incluir na legenda de indicação */}
      <CheckboxField
        label="Incluir na legenda de indicação"
        checked={data.incluirLegenda ?? false}
        onChange={(v) => set("incluirLegenda", v)}
      />
    </div>
  );
}
