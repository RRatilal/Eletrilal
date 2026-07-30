import React from "react";
import InputWithVisibility from "./InputWithVisibility";

/**
 * Devolve o número de comandos/rótulos para um tipo de interruptor.
 */
function getNumComandos(tipo) {
  if (!tipo || tipo === "interruptor_simples" || tipo === "interruptor") return 1;
  if (tipo === "interruptor_duplo") return 2;
  if (tipo === "interruptor_triplo") return 3;
  return 1;
}

/**
 * Formulário de propriedades para Interruptores.
 * Mostra um campo de comando por cada polo do interruptor.
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

  // Tipo do interruptor (ex: "interruptor_duplo")
  const tipo = data.type || "interruptor";
  const numComandos = getNumComandos(tipo);

  // Parse dos comandos atuais ("a,b,c" → ["a","b","c"])
  const comandosAtuais = (data.comando?.value || "")
    .split(",")
    .map((s) => s.trim())
    .slice(0, numComandos);

  // Preencher com letras sequenciais se faltar algum
  while (comandosAtuais.length < numComandos) {
    comandosAtuais.push(String.fromCharCode(97 + comandosAtuais.length));
  }

  /**
   * Atualiza o comando num dado índice e recompõe a string comma-separated.
   */
  function handleComandoChange(idx, val) {
    const novos = [...comandosAtuais];
    novos[idx] = val.slice(0, 1) || String.fromCharCode(97 + idx);
    set("comando", { ...data.comando, value: novos.join(",") });
  }

  const LABELS = ["1.º Comando", "2.º Comando", "3.º Comando"];

  return (
    <div className="dynamic-form">
      <div className="comandos-group">
        <span className="field-group-title">
          Comandos ({numComandos})
        </span>
        {comandosAtuais.map((cmd, idx) => (
          <InputWithVisibility
            key={idx}
            label={LABELS[idx] || `${idx + 1}.º Comando`}
            value={cmd}
            visible={data.comando?.visible}
            placeholder={String.fromCharCode(97 + idx).toUpperCase()}
            onChange={(v) => handleComandoChange(idx, v)}
            onToggleVisibility={() => toggle("comando")}
          />
        ))}
      </div>
    </div>
  );
}
