import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import "./Toast.css";

const ToastContext = createContext(null);

/**
 * Hook para usar o sistema de toast em qualquer componente.
 * Uso: const toast = useToast(); toast.success("Guardado!");
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de <ToastProvider>");
  return ctx;
}

/** Provider global de notificações toast. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = "info", duration = 3500) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const api = {
    success: (msg) => addToast(msg, "success"),
    error: (msg) => addToast(msg, "error", 5000),
    warning: (msg) => addToast(msg, "warning", 4000),
    info: (msg) => addToast(msg, "info"),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const ref = useRef(null);

  function handleDismiss() {
    setExiting(true);
    setTimeout(onDismiss, 200);
  }

  useEffect(() => {
    // Trigger entry animation
    requestAnimationFrame(() => {
      if (ref.current) ref.current.classList.add("toast-enter");
    });
  }, []);

  return (
    <div
      ref={ref}
      className={`toast toast-${toast.type} ${exiting ? "toast-exit" : ""}`}
      onClick={handleDismiss}
    >
      <span className="toast-icon">{ICONS[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
    </div>
  );
}
