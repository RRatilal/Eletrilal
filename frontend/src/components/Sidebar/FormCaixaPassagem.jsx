import React from "react";
import InputWithVisibility from "./InputWithVisibility";

/**
 * Formulário de propriedades para Caixa de Passagem.
 *
 * Props:
 * - data: electricalData da caixa de passagem
 * - onChange: (campo, valor) => void
 * - onToggleVisibility: (campo) => void
 *
 * Estrutura esperada do electricalData:
 *   {
 *     nome:      { value: "CX1", visible: true },
 *     descricao: "PVC 4x4",                       // plain string
 *     altura:    { value: "280,00", visible: true },
 *     tamanho:   "100x100",                       // plain string
 *   }
 */
export default function FormCaixaPassagem({ data, onChange, onToggleVisibility }) {
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
        placeholder="Ex: CX1"
        onChange={(v) => set("nome", { ...data.nome, value: v })}
        onToggleVisibility={() => toggle("nome")}
      />

      {/* Descrição (plain string, sem toggle) */}
      <div className="input-visibility-group">
        <label className="input-visibility-label">Descrição</label>
        <input
          className="input-visibility-input"
          type="text"
          value={data.descricao ?? ""}
          placeholder="Ex: PVC 4x4"
          onChange={(e) => set("descricao", e.target.value)}
        />
      </div>

      {/* Altura */}
      <InputWithVisibility
        label="Altura (mm)"
        value={data.altura?.value}
        visible={data.altura?.visible}
        placeholder="Ex: 280,00"
        onChange={(v) => set("altura", { ...data.altura, value: v })}
        onToggleVisibility={() => toggle("altura")}
      />

      {/* Tamanho (plain string, sem toggle) */}
      <div className="input-visibility-group">
        <label className="input-visibility-label">Tamanho</label>
        <input
          className="input-visibility-input"
          type="text"
          value={data.tamanho ?? ""}
          placeholder="Ex: 100x100"
          onChange={(e) => set("tamanho", e.target.value)}
        />
      </div>
    </div>
  );
}
