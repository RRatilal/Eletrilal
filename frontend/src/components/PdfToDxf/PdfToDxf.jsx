import { useState, useRef, useCallback } from "react";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import "./PdfToDxf.css";

/**
 * PdfToDxf — Modal de conversão de PDF para DXF com seleção de páginas.
 *
 * Fluxo:
 *   1. Utilizador faz drag & drop ou seleciona um PDF
 *   2. O backend analisa e retorna info das páginas
 *   3. O utilizador escolhe quais páginas converter
 *   4. O sistema gera o DXF e permite download ou importação para o canvas
 */
export default function PdfToDxf({ projectId, onGeometriaImportada, onClose }) {
  const [fase, setFase] = useState("upload");
  const [erro, setErro] = useState(null);
  const [file, setFile] = useState(null);
  const [paginas, setPaginas] = useState([]);
  const [paginasSelecionadas, setPaginasSelecionadas] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [dxfBlobUrl, setDxfBlobUrl] = useState(null);
  const [dxfNome, setDxfNome] = useState("");

  const inputRef = useRef(null);
  const toast = useToast();

  // ─── Upload & análise ────────────────────────────────────────────────────

  const analisarFicheiro = useCallback(async (f) => {
    if (!f || !f.name.toLowerCase().endsWith(".pdf")) {
      setErro("Apenas ficheiros PDF são aceites.");
      return;
    }
    setErro(null);
    setFile(f);
    setFase("analisando");

    let p = 0;
    const intervalo = setInterval(() => {
      p = Math.min(p + 3, 90);
      setProgresso(p);
    }, 200);

    try {
      const res = await api.previewPdfParaDxf(projectId, f);
      clearInterval(intervalo);
      setProgresso(100);

      setPaginas(res.paginas);
      setPaginasSelecionadas(res.paginas.map((p) => p.numero));
      setFase("selecionar");
    } catch (e) {
      clearInterval(intervalo);
      setErro(e.message || "Erro ao analisar o PDF.");
      setFase("upload");
      setProgresso(0);
    }
  }, [projectId]);

  // ─── Drag & Drop ─────────────────────────────────────────────────────────

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) analisarFicheiro(f);
  };
  const onInputChange = (e) => {
    const f = e.target.files?.[0];
    if (f) analisarFicheiro(f);
  };

  // ─── Seleção de páginas ──────────────────────────────────────────────────

  const togglePagina = (numero) => {
    setPaginasSelecionadas((prev) =>
      prev.includes(numero) ? prev.filter((n) => n !== numero) : [...prev, numero]
    );
  };

  const selecionarTodas = () => setPaginasSelecionadas(paginas.map((p) => p.numero));
  const deselecionarTodas = () => setPaginasSelecionadas([]);

  // ─── Conversão ───────────────────────────────────────────────────────────

  const converter = async () => {
    if (paginasSelecionadas.length === 0) {
      setErro("Selecione pelo menos uma página.");
      return;
    }

    setFase("convertendo");
    setErro(null);

    try {
      const res = await api.converterPdfParaDxf(projectId, file, paginasSelecionadas);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const nome = file.name.replace(/\.pdf$/i, "") + ".dxf";

      setDxfBlobUrl(url);
      setDxfNome(nome);
      setFase("concluido");
      toast.success("DXF gerado com sucesso!");
    } catch (e) {
      setErro(e.message || "Erro ao converter.");
      setFase("selecionar");
    }
  };

  const downloadDxf = () => {
    if (!dxfBlobUrl) return;
    const a = document.createElement("a");
    a.href = dxfBlobUrl;
    a.download = dxfNome;
    a.click();
  };

  const importarParaCanvas = async () => {
    if (!dxfBlobUrl) return;
    try {
      const res = await fetch(dxfBlobUrl);
      const blob = await res.blob();
      const fileObj = new File([blob], dxfNome, { type: "application/dxf" });

      const uploadRes = await api.uploadDxf(projectId, fileObj);
      onGeometriaImportada?.(uploadRes.geometria);
      toast.success("Geometria DXF importada para o canvas");
      onClose?.();
    } catch (e) {
      toast.error(`Erro ao importar: ${e.message}`);
    }
  };

  const resetar = () => {
    setFase("upload");
    setFile(null);
    setPaginas([]);
    setPaginasSelecionadas([]);
    setErro(null);
    setDxfBlobUrl(null);
    if (dxfBlobUrl) URL.revokeObjectURL(dxfBlobUrl);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="pdf-importer-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="pdf-importer-modal">

        {/* Header */}
        <div className="pdf-importer-header">
          <div className="pdf-importer-title">
            <span className="pdf-icon">🔄</span>
            <span>Converter PDF para DXF</span>
          </div>
          <button className="pdf-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ── Fase: Upload ── */}
        {fase === "upload" && (
          <div className="pdf-importer-body">
            <p className="pdf-desc">
              Carrega um PDF para extrair a geometria e converter para DXF.
              Poderás escolher quais páginas incluir.
            </p>

            <div
              className={`pdf-drop-zone ${isDragging ? "dragging" : ""}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <div className="pdf-drop-icon">📂</div>
              <div className="pdf-drop-text">Arrasta o PDF aqui</div>
              <div className="pdf-drop-sub">ou clica para selecionar</div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={onInputChange}
              />
            </div>

            {erro && <div className="pdf-erro">{erro}</div>}

            <div className="pdf-info-box">
              <strong>Como funciona:</strong>
              <ul>
                <li>O sistema extrai linhas, retângulos e curvas do PDF</li>
                <li>Deteta automaticamente a escala (ex: 1:100)</li>
                <li>Gera um ficheiro DXF com layers por página</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── Fase: Analisando ── */}
        {fase === "analisando" && (
          <div className="pdf-importer-body pdf-center">
            <div className="pdf-loading-icon">🔍</div>
            <div className="pdf-loading-text">A analisar o PDF...</div>
            <div className="pdf-progress-bar">
              <div className="pdf-progress-fill" style={{ width: `${progresso}%` }} />
            </div>
            <div className="pdf-progress-pct">{progresso}%</div>
          </div>
        )}

        {/* ── Fase: Selecionar páginas ── */}
        {fase === "selecionar" && (
          <>
            <div className="pdf-importer-body">
              <div className="pdf-resumo">
                <span className="pdf-badge">{paginas.length} páginas detetadas</span>
                <span className="pdf-badge secondary">
                  {paginasSelecionadas.length} selecionada{paginasSelecionadas.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="pdf-dxf-actions-top">
                <button className="pdf-link-btn" onClick={selecionarTodas}>
                  Selecionar todas
                </button>
                <button className="pdf-link-btn" onClick={deselecionarTodas}>
                  Desselecionar todas
                </button>
              </div>

              <div className="pdf-paginas-lista">
                {paginas.map((p) => (
                  <div
                    key={p.numero}
                    className={`pdf-pagina-item ${paginasSelecionadas.includes(p.numero) ? "selecionada" : "desselecionada"}`}
                    onClick={() => togglePagina(p.numero)}
                  >
                    <input
                      type="checkbox"
                      checked={paginasSelecionadas.includes(p.numero)}
                      onChange={() => togglePagina(p.numero)}
                      className="pdf-check"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="pdf-pagina-info">
                      <span className="pdf-pagina-numero">Página {p.numero}</span>
                      <span className="pdf-pagina-dims">{p.largura_pt} × {p.altura_pt} pt</span>
                    </div>
                  </div>
                ))}
              </div>

              {erro && <div className="pdf-erro">{erro}</div>}
            </div>

            <div className="pdf-importer-footer">
              <button className="pdf-btn-secondary" onClick={resetar}>
                ← Voltar
              </button>
              <button
                className="pdf-btn-primary"
                onClick={converter}
                disabled={paginasSelecionadas.length === 0}
              >
                Converter para DXF ({paginasSelecionadas.length} páginas)
              </button>
            </div>
          </>
        )}

        {/* ── Fase: Convertendo ── */}
        {fase === "convertendo" && (
          <div className="pdf-importer-body pdf-center">
            <div className="pdf-loading-icon spin">⚙️</div>
            <div className="pdf-loading-text">A converter PDF para DXF...</div>
          </div>
        )}

        {/* ── Fase: Concluído ── */}
        {fase === "concluido" && (
          <>
            <div className="pdf-importer-body pdf-center">
              <div className="pdf-loading-icon">✅</div>
              <div className="pdf-loading-text">DXF gerado com sucesso!</div>
              <div className="pdf-dxf-nome">{dxfNome}</div>
            </div>

            <div className="pdf-importer-footer">
              <button className="pdf-btn-secondary" onClick={resetar}>
                ← Outro PDF
              </button>
              <button className="pdf-btn-secondary" onClick={downloadDxf}>
                ⬇ Download DXF
              </button>
              <button className="pdf-btn-primary" onClick={importarParaCanvas}>
                Carregar no Canvas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
