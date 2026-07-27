import React, { useEffect, useState, useCallback, useRef } from "react";
import Toolbar from "./components/Toolbar/Toolbar";
import ComponentToolbar from "./components/Toolbar/ComponentToolbar";
import Canvas from "./components/Canvas/Canvas";
import CircuitosPanel from "./components/CircuitosPanel/CircuitosPanel";
import PropertiesPanel from "./components/PropertiesPanel/PropertiesPanel";
import Sidebar from "./components/Sidebar/Sidebar";
import BottomToolbar from "./components/BottomToolbar/BottomToolbar";
import PdfImporter from "./components/PdfImporter/PdfImporter";
import PdfToDxf from "./components/PdfToDxf/PdfToDxf";
import Canvas3D from "./components/Canvas/Canvas3D";
import { ToastProvider, useToast } from "./components/Toast/Toast";
import { ThemeProvider } from "./hooks/ThemeContext";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { useAutosave } from "./hooks/useAutosave";
import { useCanvasIntegration } from "./hooks/useCanvasIntegration";
import { useFloorPlanTools } from "./hooks/useFloorPlanTools";
import { api } from "./api/client";
import "./App.css";

function AppContent() {
  const [projetos, setProjetos] = useState([]);
  const [projeto, setProjeto] = useState(null);
  const [geometria, setGeometria] = useState(null);
  const [componentes, setComponentes] = useState([]);
  const [circuitos, setCircuitos] = useState([]);
  const [conexoes, setConexoes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState(null);
  const [painelEsquerdoAberto, setPainelEsquerdoAberto] = useState(true);
  const [painelDireitoAberto, setPainelDireitoAberto] = useState(true);
  const [modoCabo, setModoCabo] = useState(false);
  const modoCaboRef = useRef(false);
  useEffect(() => { modoCaboRef.current = modoCabo; }, [modoCabo]);
  const [pdfImporterAberto, setPdfImporterAberto] = useState(false);
  const [pdfToDxfAberto, setPdfToDxfAberto] = useState(false);
  const [modo3D, setModo3D] = useState(false);
  const [gridVisivel, setGridVisivel] = useState(true);
  const [canvasInstance, setCanvasInstance] = useState(null);
  const [canvasRefs, setCanvasRefs] = useState(null);
  const toast = useToast();

  // Handler unificado para onCanvasRef (recebe objeto com canvas + refs)
  const handleCanvasRef = useCallback((payload) => {
    setCanvasInstance(payload.canvas);
    if (payload.canvas) {
      // Ouvir movimentos da planta para persistir posição
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
      toggleFloorPlanLock: payload.toggleFloorPlanLock,
      geometriaRef: payload.geometriaRef,
      floorPlanGroupRef: payload.floorPlanGroupRef,
      floorPlanScaleRef: payload.floorPlanScaleRef,
      floorPlanClipRectRef: payload.floorPlanClipRectRef,
      floorPlanModeRef: payload.floorPlanModeRef,
    });
  }, []);

  // ─── Exportar Planta 2D em PNG (alta resolução 2x + enquadramento completo) ───
  const exportarCanvasPNG = useCallback(() => {
    if (canvasRefs?.exportarPNG) {
      toast.info("A gerar imagem PNG de alta resolução...");
      canvasRefs.exportarPNG();
      toast.success("Imagem PNG exportada com sucesso!");
    } else if (canvasInstance) {
      try {
        const dataURL = canvasInstance.toDataURL({
          format: "png",
          quality: 1,
          multiplier: 2,
        });
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

  const exportarCanvasSVG = useCallback(() => {
    if (canvasRefs?.exportarSVG) {
      toast.info("A gerar imagem SVG...");
      canvasRefs.exportarSVG();
      toast.success("Imagem SVG exportada com sucesso!");
    } else if (canvasInstance) {
      try {
        const dataURL = canvasInstance.toDataURL({
          format: "svg",
          quality: 1,
          multiplier: 2,
        });
        const link = document.createElement("a");
        link.href = dataURL;
        link.download = `electrilal_planta_${Date.now()}.svg`;
        link.click();
        toast.success("Imagem SVG exportada!");
      } catch (err) {
        toast.error(`Erro ao exportar SVG: ${err.message}`);
      }
    } else {
      toast.warning("Canvas 2D não disponível.");
    }
  }, [canvasRefs, canvasInstance, toast]);

  // ─── Canvas Integration (Sidebar ↔ Fabric.js two-way binding) ───
  const {
    electricalData,
    setElectricalData,
    atualizarNoCanvas,
    limparSelecao,
    selectedComponentId,
  } = useCanvasIntegration(canvasInstance);

  // Componente seleccionado (para o painel individual)
  const selectedComponent = componentes.find((c) => c.id === selectedComponentId) || null;

  // ─── Floor Plan Tools (Crop, Calibr, Erase) ───
  const [plantaTravada, setPlantaTravada] = useState(false);
  const [zoomNivel, setZoomNivel] = useState(1);
  const [floorPlanModifications, setFloorPlanModifications] = useState(null);
  const floorPlanPositionRef = useRef({ left: 0, top: 0 });

  // Handler for floor plan modifications (crop, erase, calibrate)
  const handleFloorPlanModified = useCallback((modState) => {
    setFloorPlanModifications(modState);
  }, []);

  const {
    activeTool,
    calibResult,
    tempSelection,
    iniciarCrop,
    iniciarCalibracao,
    iniciarLimpeza,
    confirmarCrop,
    confirmarLimpeza,
    confirmarCalibracao,
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

  // ─── Undo / Redo ───
  const { gravar, desfazer, refazer } = useUndoRedo(50);

  // ─── Autosave (sem geometria — é carregada da API) ───
  const autosaveData = projeto
    ? { componentes, circuitos, conexoes, rooms, floorPlanModifications, floorPlanPosition: floorPlanPositionRef.current, plantaTravada }
    : null;
  const { estado: autosaveEstado, carregar } = useAutosave(projeto?.id, autosaveData);

  // ─── Sincronizar estado de travamento com o grupo da planta no canvas ───
  useEffect(() => {
    const grupo = canvasRefs?.floorPlanGroupRef?.current;
    if (!grupo) return;
    const isCurrentlyLocked = grupo.selectable === false;
    if (plantaTravada && !isCurrentlyLocked) {
      grupo.set({ selectable: false, evented: false, hoverCursor: "default" });
      canvasInstance?.discardActiveObject();
      canvasInstance?.renderAll();
    } else if (!plantaTravada && isCurrentlyLocked) {
      grupo.set({ selectable: true, evented: true, hoverCursor: "pointer" });
      canvasInstance?.renderAll();
    }
  }, [plantaTravada, canvasRefs, canvasInstance]);

  useEffect(() => {
    api.listarProjetos().then(setProjetos).catch((e) => setErro(e.message));
  }, []);

  // ─── Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) ───
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (modoCaboRef.current) return; // Let Canvas handle cable-specific undo
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
  }, [componentes, geometria, desfazer, refazer, toast]);

  async function abrirProjeto(p) {
    setProjeto(p);
    setErro(null);
    setModoCabo(false);
    try {
      const [comps, circs, conns, rms] = await Promise.all([
        api.listarComponentes(p.id),
        api.listarCircuitos(p.id),
        api.listarConexoes(p.id),
        api.listarRooms(p.id),
      ]);
      setComponentes(comps);
      setCircuitos(circs);
      setConexoes(conns);
      setRooms(rms);

      // Carregar geometria sempre da API (não do localStorage)
      const autosave = carregar();
      let geoParaUsar = null;

      // Restaurar floor plan modifications, posição e estado de travamento do autosave
      if (autosave?.floorPlanModifications) {
        setFloorPlanModifications(autosave.floorPlanModifications);
      }
      if (autosave?.floorPlanPosition) {
        floorPlanPositionRef.current = autosave.floorPlanPosition;
      }
      if (autosave?.plantaTravada !== undefined) {
        setPlantaTravada(autosave.plantaTravada);
      } else {
        setPlantaTravada(false);
      }

      // Geometria vem sempre da API (DXF original re-processado)
      try {
        const geoResult = await api.obterGeometria(p.id);
        if (geoResult?.geometria) {
          geoParaUsar = geoResult.geometria;
        }
      } catch {
        // Sem DXF associado — prossegue sem geometria
      }

      if (geoParaUsar) {
        setGeometria(geoParaUsar);
      } else {
        setGeometria(null);
      }

      toast.success(`Projeto "${p.nome}" aberto`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function criarProjeto() {
    if (!novoNome.trim()) return;
    try {
      const p = await api.criarProjeto(novoNome);
      setProjetos((prev) => [p, ...prev]);
      setNovoNome("");
      abrirProjeto(p);
      toast.success("Projeto criado com sucesso!");
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function apagarProjeto(e, projetoId) {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja apagar este projeto?")) return;
    try {
      await api.apagarProjeto(projetoId);
      setProjetos((prev) => prev.filter((p) => p.id !== projetoId));
      toast.success("Projeto apagado");
    } catch (e) {
      toast.error(e.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") criarProjeto();
  }

  function voltarHome() {
    setProjeto(null);
    setGeometria(null);
    setComponentes([]);
    setCircuitos([]);
    setConexoes([]);
    setRooms([]);
    setModoCabo(false);
    api.listarProjetos().then(setProjetos).catch(() => { });
  }

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
    // Also remove connections that reference this component
    setConexoes((prev) => prev.filter((c) => !ids.includes(c.origem_id) && !ids.includes(c.destino_id)));
    toast.info(ids.length === 1 ? "Componente removido" : `${ids.length} componentes removidos`);
  }

  function handleCircuitoCriado(novo) {
    setCircuitos((prev) => [...prev, novo]);
    toast.success("Circuito criado");
  }

  function handleCircuitoAtualizado(atualizado) {
    setCircuitos((prev) => prev.map((c) => (c.id === atualizado.id ? atualizado : c)));
  }

  function handleConexaoCriada(novaConexao) {
    setConexoes((prev) => [...prev, novaConexao]);
  }

  function handleConexaoApagada(idOrIds) {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setConexoes((prev) => prev.filter((c) => !ids.includes(c.id)));
    toast.info(ids.length === 1 ? "Cabo removido" : `${ids.length} cabos removidos`);
  }

  // ─── Divisões (Rooms) Handlers ───
  async function handleCriarRoom(dados) {
    // Coordenadas iniciais centralizadas cartesianamente (ex: x=5.0m, y=-5.0m)
    const x = 5.0;
    const y = -5.0;
    const w = dados.largura;
    const h = dados.altura;

    const geojson = {
      type: "Polygon",
      coordinates: [[
        [x, y],
        [x + w, y],
        [x + w, y - h],
        [x, y - h],
        [x, y]
      ]]
    };

    try {
      const novaRoom = await api.criarRoom(projeto.id, {
        nome: dados.nome,
        poligono_geojson: JSON.stringify(geojson),
      });
      setRooms((prev) => [...prev, novaRoom]);
      toast.success(`Divisão "${dados.nome}" criada`);
    } catch (e) {
      toast.error(`Erro ao criar divisão: ${e.message}`);
    }
  }

  function handleRoomAtualizada(atualizada) {
    setRooms((prev) => prev.map((r) => (r.id === atualizada.id ? atualizada : r)));
  }

  function handleRoomApagada(idOrIds) {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setRooms((prev) => prev.filter((r) => !ids.includes(r.id)));
  }

  function handleRoomsImportadas(novasRooms) {
    setRooms((prev) => [...prev, ...novasRooms]);
    toast.success(`✓ Planta importada — ${novasRooms.length} divisões criadas`);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
  }

  // ───── HOME SCREEN ─────
  if (!projeto) {
    return (
      <div className="home-screen">
        <div className="home-header">
          <div className="home-logo">
            <div className="home-logo-icon">⚡</div>
          </div>
          <h1>Electrilal</h1>
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

  // ───── EDITOR ─────
  return (
    <div className="app-layout">
      <Toolbar
        projeto={projeto}
        onUploadDxf={(geo) => {
          setGeometria(geo);
          setFloorPlanModifications(null);
          toast.success("Planta DXF carregada");
        }}
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
        modo3D={modo3D}
        onToggleModo3D={() => {
          setModo3D((v) => !v);
          setModoCabo(false);
        }}
        gridVisivel={gridVisivel}
        onToggleGrid={() => setGridVisivel((v) => !v)}
        onExportarPNG={exportarCanvasSVG}
      />

      {!modo3D && (
        <ComponentToolbar onCriarRoom={handleCriarRoom} />
      )}

      {pdfImporterAberto && (
        <PdfImporter
          projectId={projeto.id}
          onRoomsCreated={handleRoomsImportadas}
          onClose={() => setPdfImporterAberto(false)}
        />
      )}

      {pdfToDxfAberto && (
        <PdfToDxf
          projectId={projeto.id}
          onGeometriaImportada={(geo) => {
            setGeometria(geo);
            setFloorPlanModifications(null);
            toast.success("Geometria DXF importada para o canvas");
          }}
          onClose={() => setPdfToDxfAberto(false)}
        />
      )}

      {modo3D ? (
        <Canvas3D
          geometria={geometria}
          componentes={componentes}
          conexoes={conexoes}
          circuitos={circuitos}
          rooms={rooms}
          onClose={() => setModo3D(false)}
        />
      ) : (
        <Canvas
          projectId={projeto.id}
          geometria={geometria}
          componentes={componentes}
          conexoes={conexoes}
          rooms={rooms}
          modoCabo={modoCabo}
          plantaTravada={plantaTravada}
          onComponenteCriado={handleComponenteCriado}
          onComponenteAtualizado={handleComponenteAtualizado}
          onComponenteApagado={handleComponenteApagado}
          onConexaoCriada={handleConexaoCriada}
          onConexaoApagada={handleConexaoApagada}
          onRoomAtualizada={handleRoomAtualizada}
          onRoomApagada={handleRoomApagada}
          onGeometriaAtualizada={setGeometria}
          floorPlanModifications={floorPlanModifications}
          floorPlanPosition={floorPlanPositionRef.current}
          onGravarUndo={() => gravar({ componentes, geometria })}
          gridVisivel={gridVisivel}
          onToggleGrid={() => setGridVisivel((v) => !v)}
          onCanvasRef={handleCanvasRef}
        />
      )}

      {!modo3D && (
        <>
          <CircuitosPanel
            aberto={painelDireitoAberto && electricalData === null && !activeTool}
            projectId={projeto.id}
            componentes={componentes}
            circuitos={circuitos}
            conexoes={conexoes}
            onCircuitoCriado={handleCircuitoCriado}
            onCircuitoAtualizado={handleCircuitoAtualizado}
            onCircuitoApagado={(circuitId) => {
              setCircuitos((prev) => prev.filter((c) => c.id !== circuitId));
              setComponentes((prev) =>
                prev.map((comp) =>
                  comp.circuit_id === circuitId ? { ...comp, circuit_id: null } : comp
                )
              );
            }}
            onComponenteAtualizado={handleComponenteAtualizado}
            onConexaoAtualizada={(atualizada) =>
              setConexoes((prev) =>
                prev.map((c) => (c.id === atualizada.id ? atualizada : c))
              )
            }
          />
          <PropertiesPanel
            aberto={painelDireitoAberto && electricalData !== null && electricalData.type !== "floorplan" && !activeTool}
            componente={selectedComponent}
            conexao={conexoes.find((c) => c.id === (electricalData?.type === "conduto" ? electricalData.connectionId : null)) || null}
            circuitos={circuitos}
            onComponenteAtualizado={handleComponenteAtualizado}
            onConexaoAtualizada={(atualizada) =>
              setConexoes((prev) =>
                prev.map((c) => (c.id === atualizada.id ? atualizada : c))
              )
            }
            electricalData={electricalData}
            setElectricalData={setElectricalData}
            atualizarNoCanvas={atualizarNoCanvas}
            canvasInstance={canvasInstance}
          />
          <BottomToolbar
            onZoomIn={() => {
              const canvas = canvasInstance;
              if (!canvas) return;
              const center = canvas.getCenterPoint();
              let zoom = canvas.getZoom();
              zoom = Math.min(zoom * 1.3, 20);
              canvas.zoomToPoint(center, zoom);
              canvas.renderAll();
              setZoomNivel(zoom);
            }}
            onZoomOut={() => {
              const canvas = canvasInstance;
              if (!canvas) return;
              const center = canvas.getCenterPoint();
              let zoom = canvas.getZoom();
              zoom = Math.max(zoom / 1.3, 0.05);
              canvas.zoomToPoint(center, zoom);
              canvas.renderAll();
              setZoomNivel(zoom);
            }}
            onToggleLock={() => {
              // Desativar qualquer ferramenta ativa antes de travar
              desativarFerramenta();
              const { toggleFloorPlanLock: toggle } = canvasRefs || {};
              if (toggle) {
                const novaState = toggle();
                setPlantaTravada(novaState);
              }
            }}
            plantaTravada={plantaTravada}
            zoomValue={zoomNivel}
          />
          <Sidebar
            aberto={painelDireitoAberto && (electricalData?.type === "floorplan" || activeTool)}
            electricalData={electricalData}
            setElectricalData={setElectricalData}
            atualizarNoCanvas={atualizarNoCanvas}
            limparSelecao={limparSelecao}
            activeTool={activeTool}
            calibResult={calibResult}
            tempSelection={tempSelection}
            iniciarCrop={iniciarCrop}
            iniciarCalibracao={iniciarCalibracao}
            iniciarLimpeza={iniciarLimpeza}
            confirmarCrop={confirmarCrop}
            confirmarLimpeza={confirmarLimpeza}
            confirmarCalibracao={confirmarCalibracao}
            desativarFerramenta={desativarFerramenta}
            escalaAtual={canvasRefs?.floorPlanGroupRef?.current?.scaleX || 1}
          />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
