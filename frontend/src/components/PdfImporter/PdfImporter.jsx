import { useState, useRef, useCallback } from "react";
import { api } from "../../api/client";
import "./PdfImporter.css";

/**
 * PdfImporter — Modal de importação automática de planta a partir de PDF.
 *
 * Fluxo:
 *   1. Utilizador faz drag & drop ou seleciona um PDF
 *   2. O ficheiro é enviado para o backend (POST /import-pdf-plant)
 *   3. O backend devolve a lista de divisões detetadas
 *   4. O utilizador confirma/edita/desmarca divisões
 *   5. Ao clicar "Criar Planta" → rooms criadas via API + callback onRoomsCreated
 */
export default function PdfImporter({ projectId, onRoomsCreated, onClose }) {
  const [fase, setFase] = useState("upload"); // "upload" | "analisando" | "confirmar" | "criando"
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);        // resposta completa do backend
  const [divisoes, setDivisoes] = useState([]);            // lista editável
  const [isDragging, setIsDragging] = useState(false);
  const [progresso, setProgresso] = useState(0);           // 0-100 para a barra

  const inputRef = useRef(null);

  // ─── Upload & análise ────────────────────────────────────────────────────

  const analisarFicheiro = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setErro("Apenas ficheiros PDF são aceites.");
      return;
    }
    setErro(null);
    setFase("analisando");

    // Simular progresso enquanto aguarda resposta
    let p = 0;
    const intervalo = setInterval(() => {
      p = Math.min(p + 3, 90);
      setProgresso(p);
    }, 200);

    try {
      const res = await api.importarPlantaPDF(projectId, file);
      clearInterval(intervalo);
      setProgresso(100);

      // Construir lista editável com seleção
      const lista = res.divisoes.map((d, i) => ({
        ...d,
        id_temp: i,
        selecionada: d.confianca >= 0.5,
        nome_editado: d.nome,
      }));

      setResultado(res);
      setDivisoes(lista);
      setFase("confirmar");
    } catch (e) {
      clearInterval(intervalo);
      setErro(e.message || "Erro desconhecido ao analisar o PDF.");
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
    const file = e.dataTransfer.files?.[0];
    if (file) analisarFicheiro(file);
  };
  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) analisarFicheiro(file);
  };

  // ─── Confirmação e criação de rooms ──────────────────────────────────────

  const toggleDivisao = (id_temp) => {
    setDivisoes(prev =>
      prev.map(d => d.id_temp === id_temp ? { ...d, selecionada: !d.selecionada } : d)
    );
  };

  const editarNome = (id_temp, nome) => {
    setDivisoes(prev =>
      prev.map(d => d.id_temp === id_temp ? { ...d, nome_editado: nome } : d)
    );
  };

  const criarPlanta = async () => {
    const selecionadas = divisoes.filter(d => d.selecionada);
    if (selecionadas.length === 0) {
      setErro("Selecione pelo menos uma divisão.");
      return;
    }

    setFase("criando");
    setErro(null);

    const criadas = [];
    for (const d of selecionadas) {
      try {
        const room = await api.criarRoom(projectId, {
          nome: d.nome_editado || d.nome,
          poligono_geojson: d.poligono_geojson,
        });
        criadas.push(room);
      } catch (e) {
        console.warn(`Erro ao criar divisão "${d.nome}":`, e.message);
      }
    }

    onRoomsCreated?.(criadas);
    onClose?.();
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const selecionadasCount = divisoes.filter(d => d.selecionada).length;

  return (
    <div className="pdf-importer-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="pdf-importer-modal">

        {/* Header */}
        <div className="pdf-importer-header">
          <div className="pdf-importer-title">
            <span className="pdf-icon">📄</span>
            <span>Importar Planta de PDF</span>
          </div>
          <button className="pdf-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ── Fase: Upload ── */}
        {fase === "upload" && (
          <div className="pdf-importer-body">
            <p className="pdf-desc">
              Carrega um PDF arquitetónico para extrair automaticamente divisões,
              áreas e posições.
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
                <li>O sistema extrai texto embutido no PDF</li>
                <li>Deteta nomes de divisões (Quarto, Sala, W.C., ...)</li>
                <li>Associa áreas (A: 18 m²) e posições relativas</li>
                <li>Normaliza para coordenadas reais em metros</li>
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

        {/* ── Fase: Confirmar ── */}
        {fase === "confirmar" && (
          <>
            <div className="pdf-importer-body">
              <div className="pdf-resumo">
                <span className="pdf-badge">{divisoes.length} divisões detetadas</span>
                {resultado?.terreno_w && (
                  <span className="pdf-badge secondary">
                    Terreno {resultado.terreno_w}m × {resultado.terreno_h}m
                  </span>
                )}
                {resultado?.escala && (
                  <span className="pdf-badge secondary">Escala {resultado.escala}</span>
                )}
              </div>

              <div className="pdf-divisoes-lista">
                {divisoes.map((d) => (
                  <div
                    key={d.id_temp}
                    className={`pdf-divisao-item ${d.selecionada ? "selecionada" : "desselecionada"}`}
                  >
                    <input
                      type="checkbox"
                      checked={d.selecionada}
                      onChange={() => toggleDivisao(d.id_temp)}
                      className="pdf-check"
                    />
                    <div className="pdf-divisao-info">
                      <input
                        type="text"
                        value={d.nome_editado}
                        onChange={(e) => editarNome(d.id_temp, e.target.value)}
                        className="pdf-divisao-nome-input"
                        disabled={!d.selecionada}
                      />
                      <div className="pdf-divisao-meta">
                        {d.area_m2 != null && <span>{d.area_m2} m²</span>}
                        <span>{d.dim_w} × {d.dim_h} m</span>
                        <span
                          className={`pdf-confianca ${d.confianca >= 0.7 ? "alta" : d.confianca >= 0.5 ? "media" : "baixa"}`}
                        >
                          {d.confianca >= 0.7 ? "✓ Alta" : d.confianca >= 0.5 ? "~ Média" : "⚠ Baixa"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {erro && <div className="pdf-erro">{erro}</div>}
            </div>

            <div className="pdf-importer-footer">
              <button className="pdf-btn-secondary" onClick={() => setFase("upload")}>
                ← Voltar
              </button>
              <button
                className="pdf-btn-primary"
                onClick={criarPlanta}
                disabled={selecionadasCount === 0}
              >
                Criar Planta ({selecionadasCount} divisões)
              </button>
            </div>
          </>
        )}

        {/* ── Fase: Criando ── */}
        {fase === "criando" && (
          <div className="pdf-importer-body pdf-center">
            <div className="pdf-loading-icon spin">⚙️</div>
            <div className="pdf-loading-text">A criar divisões no canvas...</div>
          </div>
        )}
      </div>
    </div>
  );
}
