/**
 * Cliente simples para a API do backend (FastAPI local).
 * A URL base é configurável via VITE_API_URL ou assume localhost:8000.
 */
const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const detalhe = await res.json().catch(() => ({}));
    throw new Error(detalhe.detail || `Erro ${res.status} em ${path}`);
  }
  // Respostas de ficheiro (export) não são JSON
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res;
}

export const api = {
  // Projects
  listarProjetos: () => request("/projects"),
  criarProjeto: (nome) =>
    request("/projects", { method: "POST", body: JSON.stringify({ nome }) }),
  obterProjeto: (id) => request(`/projects/${id}`),
  apagarProjeto: (id) => request(`/projects/${id}`, { method: "DELETE" }),

  // Geometry
  obterGeometria: (projectId) => request(`/projects/${projectId}/geometry`),

  // Upload DXF
  uploadDxf: async (projectId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/projects/${projectId}/upload-dxf`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const detalhe = await res.json().catch(() => ({}));
      throw new Error(detalhe.detail || "Erro no upload do DXF.");
    }
    return res.json();
  },

  // Components
  listarComponentes: (projectId) => request(`/projects/${projectId}/components`),
  criarComponente: (projectId, componente) =>
    request(`/projects/${projectId}/components`, {
      method: "POST",
      body: JSON.stringify(componente),
    }),
  atualizarComponente: (componentId, dados) =>
    request(`/components/${componentId}`, {
      method: "PATCH",
      body: JSON.stringify(dados),
    }),
  atualizarComponentesLote: (ids, dados) =>
    request(`/components/batch-update`, {
      method: "POST",
      body: JSON.stringify({ ids, dados }),
    }),
  apagarComponente: (componentId) =>
    request(`/components/${componentId}`, { method: "DELETE" }),

  // Circuits
  listarCircuitos: (projectId) => request(`/projects/${projectId}/circuits`),
  criarCircuito: (projectId, circuito) =>
    request(`/projects/${projectId}/circuits`, {
      method: "POST",
      body: JSON.stringify(circuito),
    }),
  dimensionarCircuito: (circuitId) =>
    request(`/circuits/${circuitId}/dimensionamento`, { method: "POST" }),
  dimensionarTodosCircuitos: (projectId) =>
    request(`/projects/${projectId}/dimensionamento-global`, { method: "POST" }),
  dividirCircuitosAutomatico: (projectId) =>
    request(`/projects/${projectId}/dividir-circuitos-automatico`, { method: "POST" }),
  atualizarCircuito: (circuitId, dados) =>
    request(`/circuits/${circuitId}`, {
      method: "PATCH",
      body: JSON.stringify(dados),
    }),
  apagarCircuito: (circuitId) =>
    request(`/circuits/${circuitId}`, { method: "DELETE" }),

  // Connections (cabos)
  listarConexoes: (projectId) => request(`/projects/${projectId}/connections`),
  criarConexao: (projectId, conexao) =>
    request(`/projects/${projectId}/connections`, {
      method: "POST",
      body: JSON.stringify(conexao),
    }),
  atualizarConexao: (connectionId, dados) =>
    request(`/connections/${connectionId}`, {
      method: "PATCH",
      body: JSON.stringify(dados),
    }),
  apagarConexao: (connectionId) =>
    request(`/connections/${connectionId}`, { method: "DELETE" }),

  // Rooms (divisões)
  listarRooms: (projectId) => request(`/projects/${projectId}/rooms`),
  criarRoom: (projectId, room) =>
    request(`/projects/${projectId}/rooms`, {
      method: "POST",
      body: JSON.stringify(room),
    }),
  atualizarRoom: (roomId, dados) =>
    request(`/rooms/${roomId}`, {
      method: "PATCH",
      body: JSON.stringify(dados),
    }),
  apagarRoom: (roomId) =>
    request(`/rooms/${roomId}`, { method: "DELETE" }),

  // Batch deletes (single API call instead of N)
  apagarComponentesBatch: (ids) =>
    request("/components/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  apagarConexoesBatch: (ids) =>
    request("/connections/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  apagarRoomsBatch: (ids) =>
    request("/rooms/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  obterFiacaoEletrodutos: (projectId) =>
    request(`/projects/${projectId}/eletrodutos/fiacao`),

  // Export
  exportarDxfUrl: (projectId) => `${BASE_URL}/projects/${projectId}/export/dxf`,
  exportarPdf: async (projectId, config) => {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/export/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const detalhe = await res.json().catch(() => ({}));
      throw new Error(detalhe.detail || "Erro ao gerar o PDF.");
    }
    return res.blob();
  },

  // Importar Planta PDF
  importarPlantaPDF: async (projectId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/projects/${projectId}/import-pdf-plant`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const detalhe = await res.json().catch(() => ({}));
      throw new Error(detalhe.detail || "Erro ao analisar o PDF.");
    }
    return res.json();
  },

  // PDF → DXF
  previewPdfParaDxf: async (projectId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/projects/${projectId}/pdf-to-dxf/preview`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const detalhe = await res.json().catch(() => ({}));
      throw new Error(detalhe.detail || "Erro ao analisar o PDF.");
    }
    return res.json();
  },

  converterPdfParaDxf: async (projectId, file, paginas, escala) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("paginas", paginas.join(","));
    if (escala) formData.append("escala", escala);
    const res = await fetch(`${BASE_URL}/projects/${projectId}/pdf-to-dxf/convert`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const detalhe = await res.json().catch(() => ({}));
      throw new Error(detalhe.detail || "Erro ao converter PDF para DXF.");
    }
    return res;
  },
};
