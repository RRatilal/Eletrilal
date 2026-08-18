import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import "./ExportPdfModal.css";

function dataParaEnvio(valor) {
  if (!valor) return null;
  const [ano, mes, dia] = valor.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor;
}

function dataHoje() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export default function ExportPdfModal({ projeto, onClose }) {
  const toast = useToast();
  const [nomeProjeto, setNomeProjeto] = useState(projeto?.nome || "");
  const [autor, setAutor] = useState("Electrilal");
  const [data, setData] = useState(dataHoje);
  const [formato, setFormato] = useState("A4");
  const [folha, setFolha] = useState("1");
  const [notas, setNotas] = useState("");
  const [incluirUnifilar, setIncluirUnifilar] = useState(true);
  const [aGerar, setAGerar] = useState(false);
  const [erro, setErro] = useState(null);

  const descricaoFormato = useMemo(() => (
    formato === "A3" ? "420 × 297 mm · paisagem" : "297 × 210 mm · paisagem"
  ), [formato]);

  useEffect(() => {
    function fecharComEscape(evento) {
      if (evento.key === "Escape" && !aGerar) onClose?.();
    }
    document.addEventListener("keydown", fecharComEscape);
    return () => document.removeEventListener("keydown", fecharComEscape);
  }, [aGerar, onClose]);

  async function gerarPdf(evento) {
    evento.preventDefault();
    if (!projeto?.id || aGerar) return;
    setAGerar(true);
    setErro(null);
    try {
      const blob = await api.exportarPdf(projeto.id, {
        formato,
        nome_projeto: nomeProjeto.trim() || projeto.nome,
        autor: autor.trim() || "Electrilal",
        data: dataParaEnvio(data),
        numero_folha: Math.max(1, Number(folha) || 1),
        notas: notas.trim() || null,
        incluir_unifilar: incluirUnifilar,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(nomeProjeto.trim() || projeto.nome).replace(/[^a-zA-Z0-9_-]+/g, "_")}_${formato.toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado e transferido com sucesso.");
      onClose?.();
    } catch (e) {
      setErro(e.message || "Não foi possível gerar o PDF.");
      toast.error(`Erro ao gerar PDF: ${e.message}`);
    } finally {
      setAGerar(false);
    }
  }

  return createPortal(
    <div
      className="export-pdf-overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && !aGerar && onClose?.()}
    >
      <form className="export-pdf-modal" onSubmit={gerarPdf} aria-labelledby="export-pdf-title">
        <header className="export-pdf-header">
          <div>
            <span className="export-pdf-kicker">FOLHA TÉCNICA</span>
            <h2 id="export-pdf-title">Exportar projeto em PDF</h2>
            <p>Planta vectorial, quadro de cargas e carimbo técnico.</p>
          </div>
          <button type="button" className="export-pdf-close" onClick={onClose} disabled={aGerar} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="export-pdf-body">
          <div className="export-pdf-grid">
            <label className="export-pdf-field export-pdf-field-wide">
              <span>Nome do projeto</span>
              <input value={nomeProjeto} onChange={(e) => setNomeProjeto(e.target.value)} autoFocus />
            </label>
            <label className="export-pdf-field">
              <span>Autor</span>
              <input value={autor} onChange={(e) => setAutor(e.target.value)} />
            </label>
            <label className="export-pdf-field">
              <span>Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="export-pdf-field">
              <span>Formato</span>
              <select value={formato} onChange={(e) => setFormato(e.target.value)}>
                <option value="A4">A4 — paisagem</option>
                <option value="A3">A3 — paisagem</option>
              </select>
              <small>{descricaoFormato}</small>
            </label>
            <label className="export-pdf-field">
              <span>N.º da folha</span>
              <input type="number" min="1" step="1" value={folha} onChange={(e) => setFolha(e.target.value)} />
            </label>
          </div>

          <div className="export-pdf-scale-box">
            <div className="export-pdf-scale-mark">⌗</div>
            <div>
              <strong>Escala automática</strong>
              <span>A planta é ajustada à área útil e arredondada para uma escala técnica.</span>
            </div>
          </div>

          <label className="export-pdf-field">
            <span>Notas no carimbo <em>(opcional)</em></span>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows="2" placeholder="Ex.: revisão para aprovação" />
          </label>

          <label className="export-pdf-check">
            <input type="checkbox" checked={incluirUnifilar} onChange={(e) => setIncluirUnifilar(e.target.checked)} />
            <span>
              <strong>Incluir diagrama unifilar</strong>
              <small>Será acrescentada uma folha vectorial com o barramento e os circuitos.</small>
            </span>
          </label>

          {erro && <div className="export-pdf-error" role="alert">{erro}</div>}
        </div>

        <footer className="export-pdf-footer">
          <button type="button" className="export-pdf-secondary" onClick={onClose} disabled={aGerar}>Cancelar</button>
          <button type="submit" className="export-pdf-primary" disabled={aGerar || !nomeProjeto.trim()}>
            {aGerar ? "A gerar folha…" : "Gerar PDF"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
