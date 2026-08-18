import React, { useState, useCallback, useRef, useEffect } from "react";
import Toolbar from "./components/Toolbar/Toolbar";
import ComponentToolbar from "./components/Toolbar/ComponentToolbar";
import Canvas from "./components/Canvas/Canvas";
import CircuitosPanel from "./components/CircuitosPanel/CircuitosPanel";
import PropertiesPanel from "./components/PropertiesPanel/PropertiesPanel";
import Sidebar from "./components/Sidebar/Sidebar";
import BottomToolbar from "./components/BottomToolbar/BottomToolbar";
import PdfImporter from "./components/PdfImporter/PdfImporter";
import PdfToDxf from "./components/PdfToDxf/PdfToDxf";
import ExportPdfModal from "./components/ExportPdf/ExportPdfModal";
import Canvas3D from "./components/Canvas/Canvas3D";
import { ToastProvider, useToast } from "./components/Toast/Toast";
import { ThemeProvider } from "./hooks/ThemeContext";
import { useProjectManager } from "./hooks/useProjectManager";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { useAutosave } from "./hooks/useAutosave";
import { useCanvasIntegration } from "./hooks/useCanvasIntegration";
import { useFloorPlanTools } from "./hooks/useFloorPlanTools";
import { api } from "./api/client";
import "./App.css";

// ─── Home Screen ──────────────────────────────────────────────────────────
function HomeScreen({ projetos, erro, novoNome, setNovoNome, criarProjeto, abrirProjeto, apagarProjeto, formatDate }) {
  function handleKeyDown(e) {
    if (e.key === "Enter") criarProjeto();
  }

  return (
    <div className="home-screen">
      <div className="home-header">
        <div className="home-logo">
          <div className="home-logo-icon">⚡</div>
        </div>
        <h1>Electri<span className="accent">lal</span></h1>
        <p className="subtitle">Sistema de projeto elétrico — uso local</p>
      </div>

      {erro && (
        <div className="erro-banner">
          ⚠ Erro ao ligar à API: {erro}. Confirma que o backend está a correr em 127.0.0.1:8000.
        </div>
      )}

      <div className="home-content">
        <div className="new-project">
          <input
            id="new-project-input"
            placeholder="Nome do novo projeto..."
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button id="new-project-btn" onClick={criarProjeto}>
            Criar projeto
          </button>
        </div>

        <div className="projects-section">
          <h3>Projetos recentes</h3>
          {projetos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📁</div>
              <p>Nenhum projeto ainda. Cria o teu primeiro acima.</p>
            </div>
          ) : (
            <ul className="project-list">
              {projetos.map((p) => (
                <li key={p.id} className="project-card" onClick={() => abrirProjeto(p)}>
                  <div className="project-card-icon">📐</div>
                  <div className="project-card-info">
                    <div className="project-card-name">{p.nome}</div>
                    <div className="project-card-date">
                      {formatDate(p.atualizado_em || p.criado_em)}
                    </div>
                  </div>
                  <button
                    className="project-card-delete"
                    onClick={(e) => apagarProjeto(e, p.id)}
                    title="Apagar projeto"
                  >
                    🗑
                  </button>
                  <span className="project-card-arrow">→</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────
function Editor({ projeto, geometria, setGeometria, componentes, setComponentes, circuitos, setCircuitos, conexoes, setConexoes, rooms, setRooms, voltarHome }) {
  const toast = useToast();

  // ─── UI State ────────────────────────────────────────────────────────────
  const [painelEsquerdoAberto, setPainelEsquerdoAberto] = useState(false);
  const [painelDireitoAberto, setPainelDireitoAberto] = useState(true);
  const [modoCabo, setModoCabo] = useState(false);
  const modoCaboRef = useRef(false);
  useEffect(() => { modoCaboRef.current = modoCabo; }, [modoCabo]);
  const [modoFitaLed, setModoFitaLed] = useState(false);
  const [pdfImporterAberto, setPdfImporterAberto] = useState(false);
  const [pdfToDxfAberto, setPdfToDxfAberto] = useState(false);
  const [exportPdfAberto, setExportPdfAberto] = useState(false);
  const [modo3D, setModo3D] = useState(false);
  const [gridVisivel, setGridVisivel] = useState(true);
  const [fiacaoVisivel, setFiacaoVisivel] = useState(false);
  const [canvasInstance, setCanvasInstance] = useState(null);
  const [canvasRefs, setCanvasRefs] = useState(null);

  // ─── Floor Plan ──────────────────────────────────────────────────────────
  const [plantaTravada, setPlantaTravada] = useState(false);
  const [zoomNivel, setZoomNivel] = useState(1);
  const [floorPlanModifications, setFloorPlanModifications] = useState(null);
  const floorPlanPositionRef = useRef({ left: 0, top: 0 });

  // ─── Autosave (guarda estado quando o projeto está ativo) ────────────────
  const autosaveData = React.useMemo(() => ({
    componentes, circuitos, conexoes, rooms,
    floorPlanModifications,
    floorPlanPosition: floorPlanPositionRef.current,
    plantaTravada,
  }), [componentes, circuitos, conexoes, rooms, floorPlanModifications, plantaTravada]);
  const { estado: autosaveEstado, carregar: carregarAutosave } = useAutosave(projeto?.id, autosaveData);

  // ─── Restaurar autosave quando o projeto abre ────────────────────────────
  const projectKeyRef = useRef(null);
  useEffect(() => {
    if (!projeto || projectKeyRef.current === projeto.id) return;
    projectKeyRef.current = projeto.id;

    const autosave = carregarAutosave();
    if (autosave?.floorPlanModifications) setFloorPlanModifications(autosave.floorPlanModifications);
    if (autosave?.floorPlanPosition) floorPlanPositionRef.current = autosave.floorPlanPosition;
    if (autosave?.plantaTravada !== undefined) setPlantaTravada(autosave.plantaTravada);
    else setPlantaTravada(false);
  }, [projeto, carregarAutosave]);

  // ─── Canvas Integration ──────────────────────────────────────────────────
  const {
    electricalData, setElectricalData,
    atualizarNoCanvas, limparSelecao, selectedComponentId,
    selectedComponentIds, isMultiSelection,
  } = useCanvasIntegration(canvasInstance);

  const selectedComponent = componentes.find((c) => c.id === selectedComponentId) || null;
  const selectedComponents = componentes.filter((c) => selectedComponentIds.includes(c.id));

  // ─── Floor Plan Tools ────────────────────────────────────────────────────
  const handleFloorPlanModified = useCallback((modState) => {
    setFloorPlanModifications(modState);
  }, []);

  const {
    activeTool, calibResult, tempSelection,
    iniciarCrop, iniciarCalibracao, iniciarLimpeza,
    confirmarCrop, confirmarLimpeza, confirmarCalibracao,
    desativarFerramenta,
  } = useFloorPlanTools({
    fabricCanvasRef: { current: canvasInstance },
    floorPlanGroupRef: canvasRefs?.floorPlanGroupRef ?? { current: null },
    geometriaRef: canvasRefs?.geometriaRef ?? { current: null },
    floorPlanScaleRef: canvasRefs?.floorPlanScaleRef ?? { current: 1 },
    floorPlanClipRectRef: canvasRefs?.floorPlanClipRectRef ?? { current: null },
    floorPlanModeRef: canvasRefs?.floorPlanModeRef ?? { current: null },
    onModified: handleFloorPlanModified,
  });

  // ─── Undo / Redo ─────────────────────────────────────────────────────────
  const { gravar, desfazer, refazer } = useUndoRedo(50);

  // ─── Canvas Ref Handler ──────────────────────────────────────────────────
  const handleCanvasRef = useCallback((payload) => {
    setCanvasInstance(payload.canvas);
    if (payload.canvas) {
      payload.canvas.on("object:modified", (opt) => {
        const obj = opt.target;
        if (obj?.electricalData?.type === "floorplan") {
          floorPlanPositionRef.current = { left: obj.left, top: obj.top };
        }
      });
    }
    setCanvasRefs({
      exportarPNG: payload.exportarPNG,
      exportarSVG: payload.exportarSVG,
      carregarFiacao: payload.carregarFiacao,
      ocultarFiacao: payload.ocultarFiacao,
      toggleFloorPlanLock: payload.toggleFloorPlanLock,
      geometriaRef: payload.geometriaRef,
      floorPlanGroupRef: payload.floorPlanGroupRef,
      floorPlanScaleRef: payload.floorPlanScaleRef,
      floorPlanClipRectRef: payload.floorPlanClipRectRef,
      floorPlanModeRef: payload.floorPlanModeRef,
    });
  }, []);

  // ─── Export ──────────────────────────────────────────────────────────────
  const exportarCanvasPNG = useCallback(() => {
    if (canvasRefs?.exportarPNG) {
      toast.info("A gerar imagem PNG de alta resolução...");
      canvasRefs.exportarPNG();
      toast.success("Imagem PNG exportada com sucesso!");
    } else if (canvasInstance) {
      try {
        const dataURL = canvasInstance.toDataURL({ format: "png", quality: 1, multiplier: 2 });
        const link = document.createElement("a");
        link.href = dataURL;
        link.download = `electrilal_planta_${Date.now()}.png`;
        link.click();
        toast.success("Imagem PNG exportada!");
      } catch (err) {
        toast.error(`Erro ao exportar PNG: ${err.message}`);
      }
    } else {
      toast.warning("Canvas 2D não disponível.");
    }
  }, [canvasRefs, canvasInstance, toast]);

  // ─── Handlers: Fiação dos eletrodutos ───────────────────────────────────
  const handleToggleFiacao = useCallback(async () => {
    if (!projeto?.id) return;
    if (fiacaoVisivel) {
      canvasRefs?.ocultarFiacao?.();
      setFiacaoVisivel(false);
      return;
    }
    const ok = await canvasRefs?.carregarFiacao?.(projeto.id, api);
    if (ok) {
      setFiacaoVisivel(true);
      toast.success("Fiação dos eletrodutos mostrada");
    } else {
      toast.error("Não foi possível carregar a fiação dos eletrodutos.");
    }
  }, [projeto?.id, fiacaoVisivel, canvasRefs, toast]);

  // ─── Handlers: Componentes ──────────────────────────────────────────────
  function handleComponenteCriado(novo) {
    gravar({ componentes, geometria });
    setComponentes((prev) => [...prev, novo]);
    toast.success("Componente adicionado");
  }
  function handleComponenteAtualizado(atualizado) {
    gravar({ componentes, geometria });
    setComponentes((prev) => prev.map((c) => (c.id === atualizado.id ? atualizado : c)));
  }
  function handleComponenteApagado(idOrIds) {
    gravar({ componentes, geometria });
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setComponentes((prev) => prev.filter((c) => !ids.includes(c.id)));
    setConexoes((prev) => prev.filter((c) => !ids.includes(c.origem_id) && !ids.includes(c.destino_id)));
    toast.info(ids.length === 1 ? "Componente removido" : `${ids.length} componentes removidos`);
  }

  // ─── Handlers: Circuitos ────────────────────────────────────────────────
  function handleCircuitoCriado(novo) { setCircuitos((prev) => [...prev, novo]); toast.success("Circuito criado"); }
  function handleCircuitoAtualizado(atualizado) { setCircuitos((prev) => prev.map((c) => (c.id === atualizado.id ? atualizado : c))); }
  function handleCircuitoApagado(circuitId) {
    setCircuitos((prev) => prev.filter((c) => c.id !== circuitId));
    setComponentes((prev) => prev.map((comp) =>
      comp.circuit_id === circuitId ? { ...comp, circuit_id: null } : comp
    ));
  }

  // ─── Handlers: Conexões ────────────────────────────────────────────────
  function handleConexaoCriada(novaConexao) { setConexoes((prev) => [...prev, novaConexao]); }
  function handleConexaoApagada(idOrIds) {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setConexoes((prev) => prev.filter((c) => !ids.includes(c.id)));
    toast.info(ids.length === 1 ? "Cabo removido" : `${ids.length} cabos removidos`);
  }
  function handleConexaoAtualizada(atualizada) { setConexoes((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c))); }

  // ─── Handlers: Rooms ────────────────────────────────────────────────────
  async function handleCriarRoom(dados) {
    const x = 5.0, y = -5.0, w = dados.largura, h = dados.altura;
    const geojson = { type: "Polygon", coordinates: [[[x, y], [x + w, y], [x + w, y - h], [x, y - h], [x, y]]] };
    try {
      const novaRoom = await api.criarRoom(projeto.id, { nome: dados.nome, poligono_geojson: JSON.stringify(geojson) });
      setRooms((prev) => [...prev, novaRoom]);
      toast.success(`Divisão "${dados.nome}" criada`);
    } catch (e) { toast.error(`Erro ao criar divisão: ${e.message}`); }
  }
  function handleRoomAtualizada(atualizada) { setRooms((prev) => prev.map((r) => (r.id === atualizada.id ? atualizada : r))); }
  function handleRoomApagada(idOrIds) {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setRooms((prev) => prev.filter((r) => !ids.includes(r.id)));
  }
  function handleRoomsImportadas(novasRooms) {
    setRooms((prev) => [...prev, ...novasRooms]);
    toast.success(`✓ Planta importada — ${novasRooms.length} divisões criadas`);
  }

  // ─── Refresh data (após divisão automática de circuitos) ───────────────
  const handleRefreshData = useCallback(async () => {
    if (!projeto?.id) return;
    try {
      const [novosCircuitos, novosComponentes] = await Promise.all([
        api.listarCircuitos(projeto.id),
        api.listarComponentes(projeto.id),
      ]);
      setCircuitos(novosCircuitos);
      setComponentes(novosComponentes);
    } catch (err) {
      console.error("Erro ao recarregar dados:", err);
      toast.error("Erro ao atualizar dados após divisão automática.");
    }
  }, [projeto?.id, setCircuitos, setComponentes, toast]);

  // ─── Sync Lock ───────────────────────────────────────────────────────────
  useEffect(() => {
    const grupo = canvasRefs?.floorPlanGroupRef?.current;
    if (!grupo) return;
    const isLocked = grupo.selectable === false;
    if (plantaTravada && !isLocked) {
      grupo.set({ selectable: false, evented: false, hoverCursor: "default" });
      canvasInstance?.discardActiveObject();
      canvasInstance?.renderAll();
    } else if (!plantaTravada && isLocked) {
      grupo.set({ selectable: true, evented: true, hoverCursor: "pointer" });
      canvasInstance?.renderAll();
    }
  }, [plantaTravada, canvasRefs, canvasInstance]);

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (modoCaboRef.current) return;
        e.preventDefault();
        const snapshot = desfazer({ componentes, geometria });
        if (snapshot) {
          setComponentes(snapshot.componentes);
          if (snapshot.geometria) setGeometria(snapshot.geometria);
          toast.info("Desfazer");
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const snapshot = refazer({ componentes, geometria });
        if (snapshot) {
          setComponentes(snapshot.componentes);
          if (snapshot.geometria) setGeometria(snapshot.geometria);
          toast.info("Refazer");
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [componentes, geometria, setGeometria, desfazer, refazer, toast]);

  // ─── Render Editor ───────────────────────────────────────────────────────
  return (
    <div className="app-layout">
      <Toolbar
        projeto={projeto}
        onUploadDxf={(geo) => { setGeometria(geo); setFloorPlanModifications(null); toast.success("Planta DXF carregada"); }}
        onImportarPlantaPDF={() => setPdfImporterAberto(true)}
        onPdfToDxf={() => setPdfToDxfAberto(true)}
        onVoltar={voltarHome}
        painelEsquerdoAberto={painelEsquerdoAberto}
        onTogglePainelEsquerdo={() => setPainelEsquerdoAberto((v) => !v)}
        painelDireitoAberto={painelDireitoAberto}
        onTogglePainelDireito={() => setPainelDireitoAberto((v) => !v)}
        autosaveEstado={autosaveEstado}
        modoCabo={modoCabo}
        onToggleModoCabo={() => setModoCabo((v) => !v)}
        modoFitaLed={modoFitaLed}
        onToggleModoFitaLed={() => setModoFitaLed((v) => !v)}
        modo3D={modo3D}
        onToggleModo3D={() => { setModo3D((v) => !v); setModoCabo(false); setModoFitaLed(false); setFiacaoVisivel(false); }}
        gridVisivel={gridVisivel}
        onToggleGrid={() => setGridVisivel((v) => !v)}
        fiacaoVisivel={fiacaoVisivel}
        onToggleFiacao={handleToggleFiacao}
        onExportarPNG={exportarCanvasPNG}
        onExportarPDF={() => setExportPdfAberto(true)}
      />

      {!modo3D && <ComponentToolbar onCriarRoom={handleCriarRoom} />}

      {pdfImporterAberto && (
        <PdfImporter projectId={projeto.id} onRoomsCreated={handleRoomsImportadas} onClose={() => setPdfImporterAberto(false)} />
      )}
      {pdfToDxfAberto && (
        <PdfToDxf projectId={projeto.id} onGeometriaImportada={(geo) => { setGeometria(geo); setFloorPlanModifications(null); toast.success("Geometria DXF importada"); }} onClose={() => setPdfToDxfAberto(false)} />
      )}
      {exportPdfAberto && (
        <ExportPdfModal projeto={projeto} onClose={() => setExportPdfAberto(false)} />
      )}

      {modo3D ? (
        <Canvas3D geometria={geometria} componentes={componentes} conexoes={conexoes} circuitos={circuitos} rooms={rooms} onClose={() => setModo3D(false)} />
      ) : (
        <Canvas
          projectId={projeto.id} geometria={geometria} componentes={componentes} conexoes={conexoes} rooms={rooms}
          modoCabo={modoCabo} modoFitaLed={modoFitaLed} plantaTravada={plantaTravada}
          onComponenteCriado={handleComponenteCriado} onComponenteAtualizado={handleComponenteAtualizado} onComponenteApagado={handleComponenteApagado}
          onConexaoCriada={handleConexaoCriada} onConexaoApagada={handleConexaoApagada}
          onRoomAtualizada={handleRoomAtualizada} onRoomApagada={handleRoomApagada}
          onGeometriaAtualizada={setGeometria}
          floorPlanModifications={floorPlanModifications} floorPlanPosition={floorPlanPositionRef.current}
          onGravarUndo={() => gravar({ componentes, geometria })}
          gridVisivel={gridVisivel} onToggleGrid={() => setGridVisivel((v) => !v)}
          onCanvasRef={handleCanvasRef}
        />
      )}

      {!modo3D && (
        <>
          <CircuitosPanel
            aberto={painelDireitoAberto && electricalData === null && !activeTool}
            projectId={projeto.id} componentes={componentes} circuitos={circuitos}
            onCircuitoCriado={handleCircuitoCriado} onCircuitoAtualizado={handleCircuitoAtualizado}
            onCircuitoApagado={handleCircuitoApagado} onComponenteAtualizado={handleComponenteAtualizado}
            onRefreshData={handleRefreshData}
          />
          <PropertiesPanel
            aberto={painelDireitoAberto && electricalData !== null && electricalData.type !== "floorplan" && !activeTool}
            componente={selectedComponent}
            selectedComponents={selectedComponents}
            selectedComponentIds={selectedComponentIds}
            isMultiSelection={isMultiSelection}
            componentes={componentes}
            conexao={conexoes.find((c) => c.id === (electricalData?.type === "conduto" ? electricalData.connectionId : null)) || null}
            circuitos={circuitos} onComponenteAtualizado={handleComponenteAtualizado}
            onComponenteApagado={handleComponenteApagado}
            onConexaoAtualizada={handleConexaoAtualizada}
            electricalData={electricalData} setElectricalData={setElectricalData}
            atualizarNoCanvas={atualizarNoCanvas} canvasInstance={canvasInstance}
            limparSelecao={limparSelecao}
            onRefreshData={handleRefreshData}
          />
          <BottomToolbar
            onZoomIn={() => { if (!canvasInstance) return; const c = canvasInstance.getCenterPoint(); let z = canvasInstance.getZoom(); z = Math.min(z * 1.3, 20); canvasInstance.zoomToPoint(c, z); canvasInstance.renderAll(); setZoomNivel(z); }}
            onZoomOut={() => { if (!canvasInstance) return; const c = canvasInstance.getCenterPoint(); let z = canvasInstance.getZoom(); z = Math.max(z / 1.3, 0.05); canvasInstance.zoomToPoint(c, z); canvasInstance.renderAll(); setZoomNivel(z); }}
            onToggleLock={() => { desativarFerramenta(); if (canvasRefs?.toggleFloorPlanLock) setPlantaTravada(canvasRefs.toggleFloorPlanLock()); }}
            plantaTravada={plantaTravada} zoomValue={zoomNivel}
          />
          <Sidebar
            aberto={painelDireitoAberto && (electricalData?.type === "floorplan" || activeTool)}
            electricalData={electricalData} setElectricalData={setElectricalData}
            atualizarNoCanvas={atualizarNoCanvas} limparSelecao={limparSelecao}
            activeTool={activeTool} calibResult={calibResult} tempSelection={tempSelection}
            iniciarCrop={iniciarCrop} iniciarCalibracao={iniciarCalibracao} iniciarLimpeza={iniciarLimpeza}
            confirmarCrop={confirmarCrop} confirmarLimpeza={confirmarLimpeza} confirmarCalibracao={confirmarCalibracao}
            desativarFerramenta={desativarFerramenta}
            escalaAtual={canvasRefs?.floorPlanGroupRef?.current?.scaleX || 1}
          />
        </>
      )}
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────
export default function App() {
  const {
    projetos, projeto, geometria, setGeometria,
    componentes, setComponentes, circuitos, setCircuitos,
    conexoes, setConexoes, rooms, setRooms,
    novoNome, setNovoNome, erro,
    abrirProjeto, criarProjeto, apagarProjeto, voltarHome, formatDate,
  } = useProjectManager();

  // Funções que ligam o gestor de projetos aos handlers de UI
  const handleAbrirProjeto = useCallback(async (p) => {
    await abrirProjeto(p);
  }, [abrirProjeto]);

  const handleCriarProjeto = useCallback(async () => {
    await criarProjeto(novoNome, (p) => abrirProjeto(p));
  }, [novoNome, criarProjeto, abrirProjeto]);

  // Home screen (sem projeto ativo)
  if (!projeto) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <HomeScreen
            projetos={projetos} erro={erro} novoNome={novoNome} setNovoNome={setNovoNome}
            criarProjeto={handleCriarProjeto} abrirProjeto={handleAbrirProjeto}
            apagarProjeto={apagarProjeto} formatDate={formatDate}
          />
        </ToastProvider>
      </ThemeProvider>
    );
  }

  // Editor (projeto ativo)
  return (
    <ThemeProvider>
      <ToastProvider>
        <Editor
          projeto={projeto} geometria={geometria} setGeometria={setGeometria}
          componentes={componentes} setComponentes={setComponentes}
          circuitos={circuitos} setCircuitos={setCircuitos}
          conexoes={conexoes} setConexoes={setConexoes}
          rooms={rooms} setRooms={setRooms}
          voltarHome={voltarHome}
        />
      </ToastProvider>
    </ThemeProvider>
  );
}
