import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext(null);

/**
 * Provider de tema (light/dark) para toda a aplicação.
 * - Padrão: light
 * - Persiste escolha no localStorage
 * - Define atributo data-theme no <html> para CSS
 */
export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(() => {
    try {
      return localStorage.getItem("electrilal_tema") || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    try {
      localStorage.setItem("electrilal_tema", tema);
    } catch {
      // localStorage indisponível
    }
  }, [tema]);

  const alternarTema = useCallback(() => {
    setTema((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ tema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTema() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTema deve ser usado dentro de ThemeProvider");
  return ctx;
}
