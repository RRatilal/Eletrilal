import { useCallback, useRef } from "react";

/**
 * Hook de Undo/Redo para o canvas.
 * Grava snapshots do estado (componentes + posições) e permite reverter.
 *
 * Uso:
 *   const undo = useUndoRedo(componentes, restaurar);
 *   undo.gravar();      // grava estado atual
 *   undo.desfazer();    // Ctrl+Z
 *   undo.refazer();     // Ctrl+Shift+Z
 */
export function useUndoRedo(maxHistorico = 50) {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  /** Grava um snapshot do estado atual. Chamar antes de cada ação. */
  const gravar = useCallback((snapshot) => {
    undoStackRef.current.push(JSON.stringify(snapshot));
    // Limita o tamanho do histórico
    if (undoStackRef.current.length > maxHistorico) {
      undoStackRef.current.shift();
    }
    // Qualquer ação nova limpa o redo
    redoStackRef.current = [];
  }, [maxHistorico]);

  /** Desfaz a última ação: retorna o snapshot anterior ou null. */
  const desfazer = useCallback((snapshotAtual) => {
    if (undoStackRef.current.length === 0) return null;
    // Guarda o estado atual no redo
    redoStackRef.current.push(JSON.stringify(snapshotAtual));
    // Retira o último do undo
    const anterior = undoStackRef.current.pop();
    return JSON.parse(anterior);
  }, []);

  /** Refaz a última ação desfeita: retorna o snapshot seguinte ou null. */
  const refazer = useCallback((snapshotAtual) => {
    if (redoStackRef.current.length === 0) return null;
    // Guarda o estado atual no undo
    undoStackRef.current.push(JSON.stringify(snapshotAtual));
    // Retira o último do redo
    const seguinte = redoStackRef.current.pop();
    return JSON.parse(seguinte);
  }, []);

  const podeDesfazer = () => undoStackRef.current.length > 0;
  const podeRefazer = () => redoStackRef.current.length > 0;

  return { gravar, desfazer, refazer, podeDesfazer, podeRefazer };
}
