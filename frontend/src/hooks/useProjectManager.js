/**
 * useProjectManager.js — Gestão de estado e ciclo de vida do projeto.
 *
 * Extraído de App.jsx para separar a lógica de dados da lógica de UI.
 * Gerencia: lista de projetos, projeto ativo, geometria, componentes,
 * circuitos, conexões, divisões (rooms).
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";

export function useProjectManager() {
  const [projetos, setProjetos] = useState([]);
  const [projeto, setProjeto] = useState(null);
  const [geometria, setGeometria] = useState(null);
  const [componentes, setComponentes] = useState([]);
  const [circuitos, setCircuitos] = useState([]);
  const [conexoes, setConexoes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState(null);

  // Carregar lista de projetos ao montar
  useEffect(() => {
    api.listarProjetos().then(setProjetos).catch((e) => setErro(e.message));
  }, []);

  /**
   * Abre um projeto: carrega todos os dados associados da API.
   * Retorna o autosave e a geometria para o caller restaurar estado adicional.
   */
  const abrirProjeto = useCallback(async (p, carregarAutosave) => {
    setProjeto(p);
    setErro(null);
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

      // Carregar autosave do localStorage
      const autosave = carregarAutosave?.();

      // Restaurar estado do autosave
      const result = {
        floorPlanModifications: autosave?.floorPlanModifications || null,
        floorPlanPosition: autosave?.floorPlanPosition || { left: 0, top: 0 },
        plantaTravada: autosave?.plantaTravada ?? false,
      };

      // A geometria DXF é opcional. Evita-se a chamada quando o projeto
      // ainda não tem DXF associado, prevenindo um 404 esperado no browser.
      let geoParaUsar = null;
      if (p.dxf_original_path) {
        try {
          const geoResult = await api.obterGeometria(p.id);
          if (geoResult?.geometria) geoParaUsar = geoResult.geometria;
        } catch (e) {
          if (e?.status !== 404) {
            console.warn("Não foi possível carregar a geometria do projeto:", e);
          }
        }
      }
      setGeometria(geoParaUsar);

      return { autosave: result, geometria: geoParaUsar };
    } catch (e) {
      setErro(e.message);
      return null;
    }
  }, []);

  /**
   * Cria um novo projeto e abre-o automaticamente.
   */
  const criarProjeto = useCallback(async (nome, abrirProjetoFn) => {
    if (!nome.trim()) return;
    try {
      const p = await api.criarProjeto(nome);
      setProjetos((prev) => [p, ...prev]);
      setNovoNome("");
      await abrirProjetoFn(p);
      return p;
    } catch (e) {
      setErro(e.message);
      return null;
    }
  }, []);

  /**
   * Apaga um projeto.
   */
  const apagarProjeto = useCallback(async (e, projetoId) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja apagar este projeto?")) return;
    try {
      await api.apagarProjeto(projetoId);
      setProjetos((prev) => prev.filter((p) => p.id !== projetoId));
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  /**
   * Volta à home screen (projeto = null) e recarrega lista.
   */
  const voltarHome = useCallback(() => {
    setProjeto(null);
    setGeometria(null);
    setComponentes([]);
    setCircuitos([]);
    setConexoes([]);
    setRooms([]);
    api.listarProjetos().then(setProjetos).catch(() => {});
  }, []);

  /**
   * Formata uma data ISO para formato PT.
   */
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  return {
    // Estado
    projetos, setProjetos,
    projeto, setProjeto,
    geometria, setGeometria,
    componentes, setComponentes,
    circuitos, setCircuitos,
    conexoes, setConexoes,
    rooms, setRooms,
    novoNome, setNovoNome,
    erro, setErro,

    // Ações
    abrirProjeto,
    criarProjeto,
    apagarProjeto,
    voltarHome,
    formatDate,
  };
}
