import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Hook de autosave — guarda o estado automaticamente no localStorage
 * com debounce. Mostra indicador visual de "guardado" / "a guardar...".
 *
 * Uso:
 *   const { estado, aGuardar } = useAutosave(projectId, dados);
 */
export function useAutosave(projectId, dados, delayMs = 2000) {
  const [estado, setEstado] = useState("guardado"); // "guardado" | "pendente" | "a-guardar"
  const timerRef = useRef(null);
  const ultimoRef = useRef(null);

  const CHAVE = `electrilal_autosave_${projectId}`;

  // Guarda quando os dados mudam (com debounce) — sem geometria
  useEffect(() => {
    if (!projectId || !dados) return;

    // Remover geometria do autosave para evitar estourar o limite do localStorage
    const { geometria, ...dadosLeves } = dados;
    const dadosStr = JSON.stringify(dadosLeves);

    // Não guardar se nada mudou
    if (dadosStr === ultimoRef.current) return;

    setEstado("pendente");

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        setEstado("a-guardar");
        localStorage.setItem(CHAVE, dadosStr);
        ultimoRef.current = dadosStr;
        setEstado("guardado");
      } catch {
        // localStorage cheio ou indisponível — silencioso
        setEstado("guardado");
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, dados, delayMs, CHAVE]);

  /** Carrega o estado guardado (se existir). */
  const carregar = useCallback(() => {
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore parse errors
    }
    return null;
  }, [CHAVE]);

  /** Limpa o autosave para este projeto. */
  const limpar = useCallback(() => {
    localStorage.removeItem(CHAVE);
    ultimoRef.current = null;
  }, [CHAVE]);

  return { estado, carregar, limpar };
}
