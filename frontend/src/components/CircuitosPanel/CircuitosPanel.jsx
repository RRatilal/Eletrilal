import React, { useState, useEffect } from "react";
import { api } from "../../api/client";
import { useToast } from "../Toast/Toast";
import NixieDisplay from "../NixieDisplay/NixieDisplay";
import "./CircuitosPanel.css";

const LABELS_TIPO = {
  lampada: "Lâmpada",
  lampada_simples: "Ponto de Luz (Teto)",
  lampada_arandela: "Arandela (Parede)",
  lampada_spot: "Spot / Olho de Boi",
  lampada_tubular: "Lâmpada Tubular",
  lampada_led: "Fita de LED",
  lampada_pendente: "Lustre / Pendente",
  lampada_jardim: "LED Jardim / Espeto",
  tomada: "Tomada",
  tomada_baixa: "Tomada Baixa",
  tomada_media: "Tomada Média",
  tomada_alta: "Tomada Alta",
  tomada_trifasica: "Tomada Trifásica",
  tomada_sensor: "Tomada com Sensor",
  tomada_dupla: "Tomada Dupla",
  tomada_tripla: "Tomada Tripla",
  telefonia: "Telefone (RJ11)",
  dados: "Rede de Dados (RJ45)",
  tv: "Tomada TV Coaxial",
  campainha: "Campainha / Interfone",
  camera: "Câmara CCTV",
  caixa_passagem: "Caixa de Passagem",
  passagem_sobe: "Caixa de Passagem (Sobe)",
  passagem_desce: "Caixa de Passagem (Desce)",
  interruptor: "Interruptor",
  interruptor_simples: "Interruptor Simples",
  interruptor_duplo: "Interruptor Duplo",
  interruptor_triplo: "Interruptor Triplo",
  interruptor_intermediario: "Interruptor Intermediário",
  interruptor_paralelo: "Interruptor Paralelo",
  interruptor_dimmer: "Interruptor Dimmer",
  interruptor_pulsador: "Pulsador de Campainha",
  quadro: "Quadro Geral",
};

function tensaoDe(circuito) {
  const quantidade = fasesDoCircuito(circuito).length;
  return quantidade > 1 ? "380V" : "220V";
}

function dadosDoQuadro(quadro) {
  if (!quadro?.rotulo) return {};
  try {
    const dados = JSON.parse(quadro.rotulo);
    return dados && typeof dados === "object" ? dados : {};
  } catch {
    return {};
  }
}

function tipoFaseDoQuadro(quadro) {
  return dadosDoQuadro(quadro).tipo_fase || "trifasico";
}

function fasesPermitidas(tipoFase) {
  if (tipoFase === "monofasico") return ["L1"];
  if (tipoFase === "bifasico") return ["L1", "L2", "L1-L2"];
  return ["L1", "L2", "L3", "L1-L2", "L1-L3", "L2-L3", "L1-L2-L3"];
}

function fasesDoCircuito(circuito) {
  if (Array.isArray(circuito.fases) && circuito.fases.length > 0) return circuito.fases;
  if (circuito.fase === "trifasico") return ["L1", "L2", "L3"];
  if (circuito.fase === "bifasico") return ["L1", "L2"];
  return ["L1"];
}

/**
 * CircuitosPanel — Painel de gestão de circuitos.
 * Aparece no lado direito quando o botão ⚙ está activo.
 */
export default function CircuitosPanel({
  aberto,
  projectId,
  componentes,
  circuitos,
  onCircuitoCriado,
  onCircuitoAtualizado,
  onCircuitoApagado,
  onComponenteAtualizado,
  onRefreshData,
}) {
  const [novoCircuitoNome, setNovoCircuitoNome] = useState("");
  const [dimensionamentos, setDimensionamentos] = useState({});
  const [calculating, setCalculating] = useState({});
  const [calculatingAll, setCalculatingAll] = useState(false);
  const [dividindo, setDividindo] = useState(false);
  const [globalResults, setGlobalResults] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedQuadros, setExpandedQuadros] = useState({});
  const toast = useToast();

  // Reset states when switching projects
  useEffect(() => {
    setGlobalResults(null);
    setCalculatingAll(false);
    setDimensionamentos({});
  }, [projectId]);

  async function atualizarCircuitoFases(circuitId, valor) {
    try {
      const circuitoAtual = (circuitos || []).find((c) => c.id === circuitId);
      const quadro = quadrosDisponiveis.find((q) => Number(q.id) === Number(circuitoAtual?.quadro_id));
      const permitidas = fasesPermitidas(tipoFaseDoQuadro(quadro));
      const fasesSelecionadas = valor.split("-").filter(Boolean);
      if (!permitidas.includes(valor)) {
        throw new Error("As fases selecionadas não pertencem à alimentação do quadro.");
      }
      const tipo = fasesSelecionadas.length === 1 ? "monofasico" : fasesSelecionadas.length === 2 ? "bifasico" : "trifasico";
      const atualizado = await api.atualizarCircuito(circuitId, {
        fase: tipo,
        fases: fasesSelecionadas,
      });
      onCircuitoAtualizado(atualizado);
      toast.success("Fases do circuito atualizadas");
      await calcularDimensionamento(circuitId);
    } catch (err) {
      toast.error(`Erro ao atualizar fase: ${err.message}`);
    }
  }

  async function atualizarCircuitoQuadro(circuitId, quadroId) {
    try {
      const qId = quadroId ? parseInt(quadroId, 10) : null;
      if (!qId) throw new Error("Todo circuito deve estar associado a um quadro.");
      const quadro = quadrosDisponiveis.find((q) => Number(q.id) === qId);
      const permitidas = fasesPermitidas(tipoFaseDoQuadro(quadro));
      const fasesAtualizadas = permitidas;
      const tipo = fasesAtualizadas.length === 1 ? "monofasico" : fasesAtualizadas.length === 2 ? "bifasico" : "trifasico";
      const atualizado = await api.atualizarCircuito(circuitId, { quadro_id: qId, fase: tipo, fases: fasesAtualizadas });
      onCircuitoAtualizado(atualizado);
      toast.success("Quadro do circuito atualizado");
    } catch (err) {
      toast.error(`Erro ao atualizar quadro do circuito: ${err.message}`);
    }
  }

  const quadrosDisponiveis = (componentes || []).filter(
    (c) => c.tipo === "quadro" || c.tipo === "quadro_parcial"
  );

  function nomeDoQuadro(quadro) {
    if (!quadro) return "Sem quadro";
    try {
      const parsed = JSON.parse(quadro.rotulo || "{}");
      if (parsed?.nome || parsed?.rotulo) return parsed.nome || parsed.rotulo;
    } catch {}
    return quadro.rotulo || (quadro.tipo === "quadro" ? "QGBT" : "QP");
  }

  const gruposCircuitos = quadrosDisponiveis.map((quadro) => ({
    quadro,
    circuitos: circuitos.filter((c) => Number(c.quadro_id) === Number(quadro.id)),
  }));
  const circuitosSemQuadro = circuitos.filter((c) => !c.quadro_id);

  function alternarQuadro(quadroId) {
    setExpandedQuadros((prev) => ({ ...prev, [quadroId]: !prev[quadroId] }));
  }

  async function atualizarCircuitoParam(circuitId, campo, valor) {
    try {
      const atualizado = await api.atualizarCircuito(circuitId, { [campo]: campo === "fases" ? valor : Number(valor) });
      onCircuitoAtualizado(atualizado);
      await calcularDimensionamento(circuitId);
    } catch (err) {
      toast.error(`Erro ao atualizar ${campo}: ${err.message}`);
    }
  }

  async function criarCircuito(quadro = null) {
    const nome = novoCircuitoNome.trim();
    if (!nome) return;
    try {
      const tipoQuadro = tipoFaseDoQuadro(quadro);
      const fases = fasesPermitidas(tipoQuadro)[0].split("-").filter(Boolean);
      const tipo = fases.length === 1 ? "monofasico" : fases.length === 2 ? "bifasico" : "trifasico";
      const circuito = await api.criarCircuito(projectId, {
        nome,
        quadro_id: quadro?.id ?? null,
        fase: tipo,
        fases,
      });
      onCircuitoCriado(circuito);
      setNovoCircuitoNome("");
    } catch (err) {
      toast.error(`Erro ao criar circuito: ${err.message}`);
    }
  }

  function handleKeyDown(e, quadro = null) {
    if (e.key === "Enter") criarCircuito(quadro);
  }

  async function calcularDimensionamento(circuitoId) {
    setCalculating((prev) => ({ ...prev, [circuitoId]: true }));
    try {
      const resultado = await api.dimensionarCircuito(circuitoId);
      setDimensionamentos((prev) => ({ ...prev, [circuitoId]: resultado }));
    } catch (err) {
      toast.error(`Erro no cálculo: ${err.message}`);
    } finally {
      setCalculating((prev) => ({ ...prev, [circuitoId]: false }));
    }
  }

  async function dimensionarTodos() {
    setCalculatingAll(true);
    setGlobalResults(null);
    try {
      const resultado = await api.dimensionarTodosCircuitos(projectId);
      setGlobalResults(resultado);
      toast.success("Dimensionamento global concluído");
    } catch (err) {
      toast.error(`Erro no dimensionamento global: ${err.message}`);
    } finally {
      setCalculatingAll(false);
    }
  }

  async function apagarCircuito(circuitId) {
    try {
      await api.apagarCircuito(circuitId);
      onCircuitoApagado?.(circuitId);
      toast.success("Circuito apagado");
    } catch (err) {
      toast.error(`Erro ao apagar circuito: ${err.message}`);
    }
  }

  async function dividirCircuitosAutomatico() {
    setDividindo(true);
    try {
      const resultado = await api.dividirCircuitosAutomatico(projectId);
      if (resultado.total_circuitos_criados === 0) {
        toast.info(resultado.mensagem || "Nenhum componente por atribuir.");
        return;
      }
      toast.success(`${resultado.total_circuitos_criados} circuitos criados automaticamente`);
      if (resultado.aviso_potencia) {
        toast.warning(resultado.aviso_potencia);
      }
      // Recarregar componentes + circuitos do backend (circuit_ids foram alterados)
      if (resultado.total_circuitos_criados > 0) {
        if (onRefreshData) {
          await onRefreshData();
        } else {
          // Fallback: atualizar estado local com objetos mínimos
          for (const c of resultado.circuitos) {
            onCircuitoCriado?.(c);
          }
        }
      }
    } catch (err) {
      toast.error(`Erro na divisão automática: ${err.message}`);
    } finally {
      setDividindo(false);
    }
  }

  return (
    <div className={`circuitos-panel ${aberto ? "open" : "closed"}`}>
      {/* ─── Circuitos ─── */}
      <div className="panel-section">
        <div className="panel-sticky-header">
          <div className="panel-section-header">
            <h3>Circuitos</h3>
            <span className="badge">{circuitos.length}</span>
          </div>


        </div>

        <div className="cards-list">
          {gruposCircuitos.map(({ quadro, circuitos: circuitosDoQuadro }) => {
            const grupoAberto = expandedQuadros[quadro.id] !== false;
            return (
              <section key={quadro.id} className="circuit-group">
                <button
                  type="button"
                  className="circuit-group-header"
                  onClick={() => alternarQuadro(quadro.id)}
                  aria-expanded={grupoAberto}
                >
                  <span className="circuit-group-marker" />
                  <span className="circuit-group-title">{nomeDoQuadro(quadro)}</span>
                  <span className="circuit-group-type">{quadro.tipo === "quadro" ? "QGBT" : "QP"}</span>
                  <span className="circuit-group-count">{circuitosDoQuadro.length}</span>
                  <span className="circuit-chevron">{grupoAberto ? "▾" : "▸"}</span>
                </button>
                {grupoAberto && (
                  <div className="new-circuit circuit-group-new">
                    <input
                      placeholder={`Novo circuito em ${nomeDoQuadro(quadro)}...`}
                      value={novoCircuitoNome}
                      onChange={(e) => setNovoCircuitoNome(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, quadro)}
                    />
                    <button onClick={() => criarCircuito(quadro)} title={`Criar circuito em ${nomeDoQuadro(quadro)}`}>+</button>
                  </div>
                )}
                {grupoAberto && circuitosDoQuadro.map((c) => {
            const expandida = expandedId === c.id;
            return (
            <div key={c.id} className={`circuit-card ${expandida ? "expanded" : ""}`}>
              <button
                type="button"
                className="circuit-card-header circuit-accordion-toggle"
                onClick={() => setExpandedId(expandida ? null : c.id)}
                aria-expanded={expandida}
              >
                <span className="circuit-indicator" />
                <span className="circuit-title">{c.nome}</span>
                <span className="circuit-tensao">{tensaoDe(c)}</span>
                <span className="circuit-chevron">{expandida ? "▾" : "▸"}</span>
              </button>

              {expandida && (
              <div className="circuit-card-body">
                <div className="dim-params">
                  <label className="dim-param">
                    <span className="dim-param-label">Fases da rede</span>
                    <select
                      className="dim-param-input"
                      value={fasesDoCircuito(c).join("-")}
                      onChange={(e) => atualizarCircuitoFases(c.id, e.target.value)}
                      title="Selecionar as fases de rede do circuito"
                    >
                      {(() => {
                        const quadro = quadrosDisponiveis.find((q) => Number(q.id) === Number(c.quadro_id));
                        const permitidas = fasesPermitidas(tipoFaseDoQuadro(quadro));
                        const valorAtual = fasesDoCircuito(c).join("-");
                        return [valorAtual, ...permitidas.filter((fase) => fase !== valorAtual)]
                          .filter((fase, index, lista) => lista.indexOf(fase) === index)
                          .map((fase) => <option key={fase} value={fase}>{fase}</option>);
                      })()}
                    </select>
                  </label>
                  <label className="dim-param">
                    <span className="dim-param-label">Quadro</span>
                    <select
                      className="dim-param-input"
                      value={c.quadro_id || ""}
                      onChange={(e) => atualizarCircuitoQuadro(c.id, e.target.value)}
                      title="Indicar quadro de alimentação"
                    >
                      {quadrosDisponiveis.map((q) => {
                        let nomeQ = q.tipo;
                        try {
                          const parsed = JSON.parse(q.rotulo);
                          if (parsed?.nome) nomeQ = parsed.nome;
                        } catch {}
                        return (
                          <option key={q.id} value={q.id}>
                            {nomeQ} ({q.tipo === "quadro" ? "QGBT" : "QP"})
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>

              {/* Parâmetros de dimensionamento dinâmico */}
              <div className="dim-params">
                <label className="dim-param">
                  <span className="dim-param-label">Temp. (°C)</span>
                  <input
                    type="number"
                    className="dim-param-input"
                    defaultValue={c.temperatura_c ?? 30}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v > 0 && v !== (c.temperatura_c ?? 30)) {
                        atualizarCircuitoParam(c.id, "temperatura_c", v);
                      }
                    }}
                    min={0}
                    max={60}
                    step={1}
                  />
                </label>
                <label className="dim-param">
                  <span className="dim-param-label">Queda max (%)</span>
                  <input
                    type="number"
                    className="dim-param-input"
                    defaultValue={c.queda_tensao_max_pct ?? 4}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v > 0 && v !== (c.queda_tensao_max_pct ?? 4)) {
                        atualizarCircuitoParam(c.id, "queda_tensao_max_pct", v);
                      }
                    }}
                    min={0.5}
                    max={10}
                    step={0.5}
                  />
                </label>
              </div>

              <div className="circuit-card-actions">
                <button
                  className="btn-calculate"
                  onClick={() => calcularDimensionamento(c.id)}
                  disabled={calculating[c.id]}
                >
                  {calculating[c.id] ? "A calcular..." : "⚡ Dimensionar"}
                </button>
                <button
                  className="btn-delete-circuit"
                  onClick={() => apagarCircuito(c.id)}
                  title="Apagar circuito"
                >
                  ✕
                </button>
              </div>

              {dimensionamentos[c.id] && (
                <div className="dim-result">
                  <div className="dim-row">
                    <span className="dim-label">Potência</span>
                    <NixieDisplay value={dimensionamentos[c.id].dimensionamento.potencia_total_w} unit="W" decimals={0} />
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Corrente Nominal</span>
                    <NixieDisplay value={dimensionamentos[c.id].dimensionamento.corrente_a} unit="A" decimals={2} />
                  </div>
                  {dimensionamentos[c.id].dimensionamento.corrente_corrigida_a > dimensionamentos[c.id].dimensionamento.corrente_a && (
                    <div className="dim-row">
                      <span className="dim-label">Corr. Corrigida</span>
                      <NixieDisplay value={dimensionamentos[c.id].dimensionamento.corrente_corrigida_a} unit="A" decimals={2} />
                    </div>
                  )}
                  <div className="dim-row">
                    <span className="dim-label">Comprimento Max</span>
                    <NixieDisplay value={dimensionamentos[c.id].dimensionamento.comprimento_m} unit="m" decimals={1} />
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Queda de Tensão</span>
                    <NixieDisplay value={dimensionamentos[c.id].dimensionamento.queda_tensao_pct} unit="%" decimals={1} />
                  </div>
                  <div className="dim-row text-xs opacity-70">
                    <span className="dim-label">FCA / FCT</span>
                    <span className="dim-value" title="Fator Agrupamento / Fator Temperatura">{dimensionamentos[c.id].dimensionamento.fca} / {dimensionamentos[c.id].dimensionamento.fct}</span>
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Disjuntor</span>
                    <NixieDisplay value={dimensionamentos[c.id].dimensionamento.disjuntor_recomendado_a} unit="A" decimals={0} />
                  </div>
                  <div className="dim-row">
                    <span className="dim-label">Cabo Recomendado</span>
                    <NixieDisplay value={dimensionamentos[c.id].dimensionamento.cabo_recomendado_mm2} unit="mm²" decimals={1} />
                  </div>
                  {dimensionamentos[c.id].dimensionamento.avisos?.map((a, i) => (
                    <div key={i} className="aviso">⚠ {a}</div>
                  ))}
                  {dimensionamentos[c.id].avisos_validacao?.map((a, i) => (
                    <div key={`v${i}`} className="aviso">⚠ {a}</div>
                  ))}
                </div>
              )}
              </div>
              )}
            </div>
            );
          })}
                </section>
              );
          })}

          {circuitosSemQuadro.length > 0 && (
            <section className="circuit-group circuit-group-unassigned" aria-label="Circuitos sem quadro">
              <div className="circuit-group-header circuit-group-header-static">
                <span className="circuit-group-marker" />
                <span className="circuit-group-title">Sem quadro atribuído</span>
                <span className="circuit-group-count">{circuitosSemQuadro.length}</span>
              </div>
              <div className="circuit-unassigned-warning" role="alert">
                Estes circuitos não têm quadro e podem ser apagados ou associados a um quadro.
              </div>
              {circuitosSemQuadro.map((c) => {
                const expandida = expandedId === c.id;
                return (
                  <div key={c.id} className={`circuit-card ${expandida ? "expanded" : ""}`}>
                    <button
                      type="button"
                      className="circuit-card-header circuit-accordion-toggle"
                      onClick={() => setExpandedId(expandida ? null : c.id)}
                      aria-expanded={expandida}
                    >
                      <span className="circuit-indicator" />
                      <span className="circuit-title">{c.nome}</span>
                      <span className="circuit-chevron">{expandida ? "▾" : "▸"}</span>
                    </button>
                    {expandida && (
                      <div className="circuit-card-body">
                        <div className="circuit-card-actions">
                          <button
                            type="button"
                            className="btn-delete-circuit"
                            onClick={() => apagarCircuito(c.id)}
                            title="Apagar circuito não associado"
                          >
                            ✕ Apagar circuito
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>

        {/* Botões de ações em lote */}
        <div className="dim-global-section">
          <button
            className="btn-dividir-auto"
            onClick={dividirCircuitosAutomatico}
            disabled={dividindo}
            title={`Dividir circuitos (TUG, Iluminação, TUE)

Esta função atribui circuito automaticamente aos componentes que
AINDA NÃO TÊM circuito definido, seguindo os critérios:
1. Cargas mono, bi e trifásicas não ficarão no mesmo circuito;
2. Circuito de iluminação ficará separado dos circuitos de tomadas;
3. Tomadas de área seca ficarão em circuitos diferentes das tomadas de área molhada;
4. Cargas acima de 10A ficarão em circuito exclusivo.

Componentes já atribuídos manualmente não são alterados.`}
          >
            {dividindo ? "A dividir..." : "🔌 Dividir Circuitos Automaticamente"}
          </button>

          <button
            className="btn-dim-global"
            onClick={dimensionarTodos}
            disabled={calculatingAll}
          >
            {calculatingAll ? "A calcular todos..." : "⚡ Dimensionar Todos os Circuitos"}
          </button>

          {globalResults && (
            <div className="dim-global-results">
              {globalResults.balanceamento?.map((b) => (
                <div key={String(b.quadro_id)} className={`dim-global-card balance-${b.nivel}`}>
                  <div className="dim-global-header"><strong>{b.quadro_nome}</strong><span>Desequilíbrio {b.desequilibrio_pct}%</span></div>
                  <div className="dim-row"><span className="dim-label">L1 / L2 / L3</span><span className="dim-value">{b.correntes_a.L1} A / {b.correntes_a.L2} A / {b.correntes_a.L3} A</span></div>
                  {b.nivel !== "ok" && <div className="aviso">⚠ Redistribua circuitos para reduzir o desequilíbrio.</div>}
                </div>
              ))}
              <div className="dim-global-summary">
                <span className="dim-label">Total de circuitos</span>
                <NixieDisplay value={globalResults.total_circuits} />
              </div>
              {globalResults.results?.map((r) => (
                <div key={r.circuito_id} className="dim-global-card">
                  <div className="dim-global-header">
                    <strong>{r.circuito_nome}</strong>
                    <span className="circuit-type-badge">{r.circuitType}</span>
                  </div>
                  {r.error ? (
                    <div className="aviso">⚠ {r.error}</div>
                  ) : (
                    <>
                      <div className="dim-row">
                        <span className="dim-label">Potência</span>
                        <NixieDisplay value={r.potencia_total_w} unit="W" decimals={0} />
                      </div>
                      <div className="dim-row">
                        <span className="dim-label">Corrente Ib</span>
                        <NixieDisplay value={r.nominalCurrent_A} unit="A" decimals={2} />
                      </div>
                      <div className="dim-row">
                        <span className="dim-label">Disjuntor In</span>
                        <NixieDisplay value={r.breaker_A} unit="A" decimals={0} />
                      </div>
                      <div className="dim-row">
                        <span className="dim-label">Cabo</span>
                        <NixieDisplay value={r.cableSection_mm2} unit="mm²" decimals={1} />
                      </div>
                      <div className="dim-row">
                        <span className="dim-label">Queda Tensão</span>
                        <NixieDisplay value={r.voltageDrop_percentage} unit="%" decimals={1} />
                      </div>
                      {r.warnings?.map((w, i) => (
                        <div key={i} className="aviso">⚠ {w}</div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
