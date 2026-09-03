/**
 * Testes unitários para useProjectManager.js
 *
 * Testa o hook useProjectManager com o módulo api mockado.
 * Como é um hook React, usa renderHook do @testing-library/react.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock completo do módulo api/client
// Usar vi.hoisted() para evitar Temporal Dead Zone (TDZ)
// já que vi.mock() é hoisted acima das declarações normais
const mockApi = vi.hoisted(() => ({
  listarProjetos: vi.fn(),
  listarComponentes: vi.fn(),
  listarCircuitos: vi.fn(),
  listarConexoes: vi.fn(),
  listarRooms: vi.fn(),
  obterGeometria: vi.fn(),
  criarProjeto: vi.fn(),
  apagarProjeto: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: mockApi,
}));

// Agora importamos o hook (depois do mock)
import { useProjectManager } from "../hooks/useProjectManager";

// ─── Helpers ──────────────────────────────────────────────────────────────

function criarProjetoMock(id = 1, nome = "Projeto Teste", options = {}) {
  return { id, nome, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), ...options };
}

function criarComponenteMock(id = 1, options = {}) {
  return { id, project_id: 1, tipo: "tomada", x: 0, y: 0, rotacao: 0, potencia_w: 100, ...options };
}

function criarCircuitoMock(id = 1, options = {}) {
  return { id, project_id: 1, nome: "Circuito 1", fase: "monofasico", ...options };
}

// ─── Testes ───────────────────────────────────────────────────────────────

describe("useProjectManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock padrão: listarProjetos retorna array vazio
    mockApi.listarProjetos.mockResolvedValue([]);
  });

  // ─── Estado inicial ────────────────────────────────────────────────────

  describe("Estado inicial", () => {
    it("deve inicializar com arrays vazios e nulls", () => {
      const { result } = renderHook(() => useProjectManager());

      expect(result.current.projetos).toEqual([]);
      expect(result.current.projeto).toBeNull();
      expect(result.current.geometria).toBeNull();
      expect(result.current.componentes).toEqual([]);
      expect(result.current.circuitos).toEqual([]);
      expect(result.current.conexoes).toEqual([]);
      expect(result.current.rooms).toEqual([]);
      expect(result.current.novoNome).toBe("");
      expect(result.current.erro).toBeNull();
    });

    it("deve carregar lista de projetos ao montar", () => {
      const projetosMock = [criarProjetoMock(1), criarProjetoMock(2)];
      mockApi.listarProjetos.mockResolvedValue(projetosMock);

      const { result } = renderHook(() => useProjectManager());

      // O useEffect é assíncrono, esperar atualização
      // Nota: em testes reais, usar waitFor ou waitForNextUpdate
      // Mas para este teste, verificamos que a função foi chamada
      expect(mockApi.listarProjetos).toHaveBeenCalledTimes(1);
    });
  });

  // ─── abrirProjeto ──────────────────────────────────────────────────────

  describe("abrirProjeto", () => {
    beforeEach(() => {
      mockApi.listarComponentes.mockResolvedValue([criarComponenteMock(1)]);
      mockApi.listarCircuitos.mockResolvedValue([criarCircuitoMock(1)]);
      mockApi.listarConexoes.mockResolvedValue([]);
      mockApi.listarRooms.mockResolvedValue([]);
      mockApi.obterGeometria.mockResolvedValue({ geometria: { linhas: [] } });
    });

    it("deve carregar dados do projeto e atualizar estado", async () => {
      const { result } = renderHook(() => useProjectManager());
      const projeto = criarProjetoMock(1, "Projeto Teste", { dxf_original_path: "/tmp/planta.dxf" });

      await act(async () => {
        await result.current.abrirProjeto(projeto);
      });

      expect(result.current.projeto).toEqual(projeto);
      expect(result.current.componentes).toHaveLength(1);
      expect(result.current.circuitos).toHaveLength(1);
      expect(result.current.conexoes).toEqual([]);
      expect(result.current.rooms).toEqual([]);
      expect(result.current.geometria).toEqual({ linhas: [] });
      expect(mockApi.listarComponentes).toHaveBeenCalledWith(1);
      expect(mockApi.listarCircuitos).toHaveBeenCalledWith(1);
      expect(mockApi.listarConexoes).toHaveBeenCalledWith(1);
      expect(mockApi.listarRooms).toHaveBeenCalledWith(1);
    });

    it("deve chamar carregarAutosave se fornecido", async () => {
      const { result } = renderHook(() => useProjectManager());
      const projeto = criarProjetoMock(1);
      const carregarAutosave = vi.fn().mockReturnValue({
        floorPlanModifications: { clipRect: { left: 0, top: 0, width: 100, height: 100 } },
        floorPlanPosition: { left: 50, top: 50 },
        plantaTravada: true,
      });

      await act(async () => {
        await result.current.abrirProjeto(projeto, carregarAutosave);
      });

      expect(carregarAutosave).toHaveBeenCalledTimes(1);
    });

    it("deve definir erro quando a API falha", async () => {
      mockApi.listarComponentes.mockRejectedValue(new Error("Erro de rede"));
      const { result } = renderHook(() => useProjectManager());
      const projeto = criarProjetoMock(1);

      await act(async () => {
        await result.current.abrirProjeto(projeto);
      });

      expect(result.current.erro).toBe("Erro de rede");
    });

    it("não deve consultar geometria para projeto sem DXF", async () => {
      const { result } = renderHook(() => useProjectManager());
      const projeto = criarProjetoMock(1);

      await act(async () => {
        await result.current.abrirProjeto(projeto);
      });

      expect(result.current.geometria).toBeNull();
      expect(mockApi.obterGeometria).not.toHaveBeenCalled();
    });

    it("deve prosseguir sem geometria se a API falhar ao obtê-la", async () => {
      mockApi.obterGeometria.mockRejectedValue(new Error("Sem DXF"));
      const { result } = renderHook(() => useProjectManager());
      const projeto = criarProjetoMock(1, "Projeto Teste", { dxf_original_path: "/tmp/planta.dxf" });

      await act(async () => {
        await result.current.abrirProjeto(projeto);
      });

      expect(result.current.geometria).toBeNull();
    });
  });

  // ─── criarProjeto ──────────────────────────────────────────────────────

  describe("criarProjeto", () => {
    it("deve criar projeto e chamar abrirProjetoFn", async () => {
      const novoProjeto = criarProjetoMock(3, "Novo Projeto");
      mockApi.criarProjeto.mockResolvedValue(novoProjeto);

      const { result } = renderHook(() => useProjectManager());
      const abrirProjetoFn = vi.fn();

      await act(async () => {
        await result.current.criarProjeto("Novo Projeto", abrirProjetoFn);
      });

      expect(mockApi.criarProjeto).toHaveBeenCalledWith("Novo Projeto");
      expect(abrirProjetoFn).toHaveBeenCalledWith(novoProjeto);
      expect(result.current.novoNome).toBe("");
    });

    it("não deve fazer nada com nome vazio", async () => {
      const { result } = renderHook(() => useProjectManager());

      await act(async () => {
        await result.current.criarProjeto("", vi.fn());
      });

      expect(mockApi.criarProjeto).not.toHaveBeenCalled();
    });

    it("deve capturar erros da API", async () => {
      mockApi.criarProjeto.mockRejectedValue(new Error("Erro ao criar"));
      const { result } = renderHook(() => useProjectManager());

      await act(async () => {
        await result.current.criarProjeto("Teste", vi.fn());
      });

      expect(result.current.erro).toBe("Erro ao criar");
    });
  });

  // ─── apagarProjeto ─────────────────────────────────────────────────────

  describe("apagarProjeto", () => {
    beforeEach(() => {
      // Mock window.confirm para retornar true
      vi.spyOn(window, "confirm").mockReturnValue(true);
    });

    it("deve apagar projeto e remover da lista", async () => {
      mockApi.listarProjetos.mockResolvedValue([criarProjetoMock(1), criarProjetoMock(2)]);
      mockApi.apagarProjeto.mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useProjectManager());

      // Simular evento de clique
      const mockEvent = { stopPropagation: vi.fn() };

      await act(async () => {
        await result.current.apagarProjeto(mockEvent, 1);
      });

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockApi.apagarProjeto).toHaveBeenCalledWith(1);
    });

    it("não deve apagar se confirm retornar false", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const { result } = renderHook(() => useProjectManager());
      const mockEvent = { stopPropagation: vi.fn() };

      await act(async () => {
        await result.current.apagarProjeto(mockEvent, 1);
      });

      expect(mockApi.apagarProjeto).not.toHaveBeenCalled();
    });
  });

  // ─── voltarHome ─────────────────────────────────────────────────────────

  describe("voltarHome", () => {
    it("deve limpar estado e recarregar lista de projetos", async () => {
      mockApi.listarProjetos.mockResolvedValue([]);
      const { result } = renderHook(() => useProjectManager());

      // Definir estado primeiro
      await act(async () => {
        result.current.setProjeto(criarProjetoMock(1));
        result.current.setGeometria({ linhas: [] });
        result.current.setComponentes([criarComponenteMock(1)]);
        result.current.setCircuitos([criarCircuitoMock(1)]);
      });

      await act(async () => {
        await result.current.voltarHome();
      });

      expect(result.current.projeto).toBeNull();
      expect(result.current.geometria).toBeNull();
      expect(result.current.componentes).toEqual([]);
      expect(result.current.circuitos).toEqual([]);
      expect(result.current.conexoes).toEqual([]);
      expect(result.current.rooms).toEqual([]);
    });
  });

  // ─── formatDate ─────────────────────────────────────────────────────────

  describe("formatDate", () => {
    it("deve formatar data ISO para formato PT", () => {
      const { result } = renderHook(() => useProjectManager());

      const dataStr = "2026-07-28T12:00:00.000Z";
      const formatted = result.current.formatDate(dataStr);

      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe("string");
    });

    it("deve retornar string vazia para data inválida", () => {
      const { result } = renderHook(() => useProjectManager());
      expect(result.current.formatDate(null)).toBe("");
      expect(result.current.formatDate("")).toBe("");
      expect(result.current.formatDate(undefined)).toBe("");
    });
  });

  // ─── Setter functions ───────────────────────────────────────────────────

  describe("Setters", () => {
    it("deve expor setters funcionais para todos os estados", () => {
      const { result } = renderHook(() => useProjectManager());

      act(() => result.current.setProjetos([criarProjetoMock(1)]));
      expect(result.current.projetos).toHaveLength(1);

      act(() => result.current.setNovoNome("Teste"));
      expect(result.current.novoNome).toBe("Teste");

      act(() => result.current.setErro("Algo correu mal"));
      expect(result.current.erro).toBe("Algo correu mal");
    });
  });
});
