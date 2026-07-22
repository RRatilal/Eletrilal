/**
 * ElectricalIcons.jsx
 *
 * Biblioteca de ícones SVG para componentes elétricos.
 * viewBox padronizado: 0 0 100 100
 * stroke: currentColor (#333333 via CSS var), stroke-width: 5
 * stroke-linecap: round, stroke-linejoin: round
 * fill: none (exceto quando especificado)
 */

import React from "react";

// ─── Helper: wrapper padrão ─────────────────────────────────────────────────

export function IconRenderer({ IconComponent, size = 28 }) {
  if (!IconComponent) return null;
  return (
    <span className="svg-icon-wrapper" style={{ width: size, height: size }}>
      <IconComponent />
    </span>
  );
}

function SvgIcon({ children, style }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        color: "var(--svg-stroke, #334155)",
        ...style,
      }}
    >
      <g
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {children}
      </g>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIA: ILUMINAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 1. Lâmpada / Ponto de Luz no Teto
 * Círculo grande centralizado (raio 40)
 */
export function IconLampada() {
  return (
    <SvgIcon>
      {/* Círculo da lâmpada */}
      <circle cx="50" cy="50" r="40" />
    </SvgIcon>
  );
}

export function IconLampadaSimples() {
  return <IconLampada />;
}

/**
 * 2. Arandela / Ponto de Luz na Parede
 * Linha vertical à esquerda (parede) + meio-círculo "D" virado para a esquerda
 */
export function IconLampadaArandela() {
  return (
    <SvgIcon>
      {/* Linha vertical representando a parede */}
      <line x1="20" y1="10" x2="20" y2="90" />
      {/* Meio-círculo em "D" virado para a esquerda, encostado à parede */}
      <path d="M 20 20 A 30 30 0 0 0 20 80 Z" />
    </SvgIcon>
  );
}

/**
 * 3. Lâmpada Tubular
 * Retângulo estreito inclinado 45° com pinos nas extremidades
 */
export function IconLampadaTubular() {
  return (
    <SvgIcon>
      <g transform="rotate(-45, 50, 50)">
        {/* Corpo tubular */}
        <rect x="25" y="42" width="50" height="16" rx="2" />
        {/* Pino esquerdo */}
        <line x1="25" y1="42" x2="25" y2="58" />
        {/* Pino direito */}
        <line x1="75" y1="42" x2="75" y2="58" />
      </g>
    </SvgIcon>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIA: TOMADAS  (Base: Triângulo equilátero + traço vertical)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 4. Tomada Baixa
 * Triângulo equilátero vazio apontando para cima + linha vertical descendo
 */
export function IconTomada() {
  return (
    <SvgIcon>
      {/* Triângulo equilátero apontando para cima */}
      <polygon points="50,20 70,60 30,60" />
      {/* Linha vertical descendo da base do triângulo */}
      <line x1="50" y1="60" x2="50" y2="85" />
    </SvgIcon>
  );
}

export function IconTomadaBaixa() {
  return <IconTomada />;
}

/**
 * 5. Tomada Média
 * Triângulo + linha descendo, metade esquerda do triângulo preenchida
 */
export function IconTomadaMedia() {
  return (
    <SvgIcon>
      {/* Triângulo completo vazio */}
      <polygon points="50,20 70,60 30,60" />
      {/* Metade esquerda do triângulo preenchida */}
      <polygon points="50,20 50,60 30,60" fill="currentColor" />
      {/* Linha vertical descendo */}
      <line x1="50" y1="60" x2="50" y2="85" />
    </SvgIcon>
  );
}

/**
 * 6. Tomada Alta
 * Triângulo totalmente preenchido + linha descendo
 */
export function IconTomadaAlta() {
  return (
    <SvgIcon>
      {/* Triângulo totalmente preenchido */}
      <polygon points="50,20 70,60 30,60" fill="currentColor" />
      {/* Linha vertical descendo */}
      <line x1="50" y1="60" x2="50" y2="85" />
    </SvgIcon>
  );
}

/**
 * 7. Tomada Dupla Baixa
 * Dois triângulos vazios empilhados verticalmente + linha descendo do inferior
 */
export function IconTomadaDupla() {
  return (
    <SvgIcon>
      {/* Triângulo superior */}
      <polygon points="50,10 65,40 35,40" />
      {/* Triângulo inferior */}
      <polygon points="50,40 65,70 35,70" />
      {/* Linha descendo da base do triângulo inferior */}
      <line x1="50" y1="70" x2="50" y2="85" />
    </SvgIcon>
  );
}

/**
 * 8. Tomada de Piso
 * Quadrado vazio contendo triângulo apontando para a direita
 */
export function IconTomadaPiso() {
  return (
    <SvgIcon>
      {/* Quadrado externo */}
      <rect x="20" y="20" width="60" height="60" />
      {/* Triângulo apontando para a direita, encostado ao lado esquerdo */}
      <polygon points="55,50 20,30 20,70" />
    </SvgIcon>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIA: INTERRUPTORES  (Base: Círculo pequeno + traço vertical)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 9. Interruptor Simples
 * Círculo vazio (raio 15) no centro superior + linha vertical descendo
 */
export function IconInterruptor() {
  return (
    <SvgIcon>
      {/* Círculo pequeno no centro superior */}
      <circle cx="50" cy="25" r="15" />
      {/* Linha vertical descendo */}
      <line x1="50" y1="40" x2="50" y2="80" />
    </SvgIcon>
  );
}

export function IconInterruptorSimples() {
  return <IconInterruptor />;
}

/**
 * 10. Interruptor Duplo
 * Círculo + linha vertical a dividir o círculo ao meio + linha descendo
 */
export function IconInterruptorDuplo() {
  return (
    <SvgIcon>
      {/* Círculo externo */}
      <circle cx="50" cy="25" r="15" />
      {/* Linha vertical dividindo o círculo ao meio */}
      <line x1="50" y1="10" x2="50" y2="40" />
      {/* Linha vertical descendo */}
      <line x1="50" y1="40" x2="50" y2="80" />
    </SvgIcon>
  );
}

/**
 * 11. Interruptor Triplo
 * Círculo dividido em 3 fatias iguais + linha descendo
 */
export function IconInterruptorTriplo() {
  return (
    <SvgIcon>
      {/* Círculo externo */}
      <circle cx="50" cy="25" r="15" />
      {/* Linha central para cima (12h) */}
      <line x1="50" y1="25" x2="50" y2="10" />
      {/* Linha diagonal direita (aprox 120°) */}
      <line x1="50" y1="25" x2="63" y2="32" />
      {/* Linha diagonal esquerda (aprox 240°) */}
      <line x1="50" y1="25" x2="37" y2="32" />
      {/* Linha vertical descendo */}
      <line x1="50" y1="40" x2="50" y2="80" />
    </SvgIcon>
  );
}

/**
 * 12. Interruptor Paralelo / Three-way
 * Círculo totalmente preenchido + linha descendo
 */
export function IconInterruptorParalelo() {
  return (
    <SvgIcon>
      {/* Círculo preenchido */}
      <circle cx="50" cy="25" r="15" fill="currentColor" />
      {/* Linha vertical descendo */}
      <line x1="50" y1="40" x2="50" y2="80" />
    </SvgIcon>
  );
}

/**
 * 13. Interruptor Bipolar
 * Círculo vazio com metade esquerda preenchida + linha descendo
 */
export function IconInterruptorBipolar() {
  return (
    <SvgIcon>
      {/* Círculo externo vazio */}
      <circle cx="50" cy="25" r="15" />
      {/* Metade esquerda do círculo preenchida (arco pelo lado esquerdo) */}
      <path d="M 50 10 A 15 15 0 0 0 50 40 L 50 10 Z" fill="currentColor" />
      {/* Linha vertical descendo */}
      <line x1="50" y1="40" x2="50" y2="80" />
    </SvgIcon>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// ÍCONES ADICIONAIS (mantidos dos anteriores, fora dos 13 especificados)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Spot / Olho de boi (embutido no teto)
 */
export function IconLampadaSpot() {
  return (
    <SvgIcon>
      <circle cx="50" cy="50" r="38" />
      <circle cx="50" cy="50" r="16" fill="currentColor" />
    </SvgIcon>
  );
}

/**
 * Fita de LED
 */
export function IconLampadaLed() {
  return (
    <SvgIcon>
      <rect x="10" y="44" width="80" height="12" rx="2" />
      <circle cx="25" cy="50" r="3" fill="currentColor" />
      <circle cx="40" cy="50" r="3" fill="currentColor" />
      <circle cx="55" cy="50" r="3" fill="currentColor" />
      <circle cx="70" cy="50" r="3" fill="currentColor" />
    </SvgIcon>
  );
}

/**
 * Lustre / Pendente
 */
export function IconLampadaPendente() {
  return (
    <SvgIcon>
      <circle cx="50" cy="50" r="38" />
      <circle cx="50" cy="50" r="18" />
    </SvgIcon>
  );
}

/**
 * Tomada Tripla
 */
export function IconTomadaTripla() {
  return (
    <SvgIcon>
      <polygon points="50,20 70,60 30,60" />
      <line x1="50" y1="60" x2="50" y2="85" />
      {/* Três traços indicando tomada tripla */}
      <line x1="32" y1="44" x2="32" y2="18" />
      <line x1="50" y1="44" x2="50" y2="18" />
      <line x1="68" y1="44" x2="68" y2="18" />
    </SvgIcon>
  );
}

/**
 * Tomada Trifásica
 */
export function IconTomadaTrifasica() {
  return (
    <SvgIcon>
      <circle cx="50" cy="50" r="35" />
      <line x1="32" y1="36" x2="68" y2="36" />
      <line x1="36" y1="48" x2="64" y2="48" />
      <line x1="40" y1="60" x2="60" y2="60" />
    </SvgIcon>
  );
}

/**
 * Tomada c/ Sensor
 */
export function IconTomadaSensor() {
  return (
    <SvgIcon>
      <polygon points="50,20 70,60 30,60" />
      <line x1="50" y1="60" x2="50" y2="85" />
      <path d="M 72 30 Q 80 35 72 42" strokeWidth="4" />
      <path d="M 78 26 Q 88 35 78 46" strokeWidth="3" />
    </SvgIcon>
  );
}

/**
 * Interruptor Intermediário / Four-way
 */
export function IconInterruptorIntermediario() {
  return (
    <SvgIcon>
      <circle cx="50" cy="25" r="15" />
      <line x1="50" y1="40" x2="50" y2="80" />
      <line x1="42" y1="18" x2="58" y2="32" />
    </SvgIcon>
  );
}

/**
 * Interruptor Dimmer
 */
export function IconInterruptorDimmer() {
  return (
    <SvgIcon>
      <circle cx="50" cy="25" r="15" />
      <line x1="50" y1="40" x2="50" y2="80" />
      <path d="M 56 12 A 8 8 0 0 1 64 22" />
    </SvgIcon>
  );
}

/**
 * Botão de Pressão / Pulsador
 */
export function IconInterruptorPulsador() {
  return (
    <SvgIcon>
      <circle cx="50" cy="50" r="22" />
      <circle cx="50" cy="50" r="10" fill="currentColor" />
    </SvgIcon>
  );
}

/**
 * Telefone (RJ11)
 */
export function IconTelefonia() {
  return (
    <SvgIcon>
      <rect x="25" y="50" width="50" height="20" rx="4" />
      <path d="M 30 50 Q 30 25 50 25 Q 70 25 70 50" />
      <line x1="50" y1="70" x2="50" y2="88" />
    </SvgIcon>
  );
}

/**
 * Rede Dados (RJ45)
 */
export function IconDados() {
  return (
    <SvgIcon>
      <rect x="30" y="35" width="40" height="30" rx="3" />
      <line x1="34" y1="42" x2="66" y2="42" />
      <line x1="34" y1="50" x2="66" y2="50" />
      <line x1="34" y1="58" x2="66" y2="58" />
      <line x1="50" y1="65" x2="50" y2="88" />
    </SvgIcon>
  );
}

/**
 * Tomada TV
 */
export function IconTv() {
  return (
    <SvgIcon>
      <circle cx="50" cy="48" r="22" />
      <circle cx="50" cy="48" r="6" fill="currentColor" />
      <line x1="50" y1="70" x2="50" y2="88" />
    </SvgIcon>
  );
}

/**
 * Campainha / Interfone
 */
export function IconCampainha() {
  return (
    <SvgIcon>
      <path d="M 25 55 A 25 25 0 0 1 75 55" />
      <line x1="20" y1="55" x2="80" y2="55" />
      <line x1="50" y1="55" x2="50" y2="68" />
      <circle cx="50" cy="72" r="5" />
      <line x1="50" y1="77" x2="50" y2="88" />
    </SvgIcon>
  );
}

/**
 * Câmara CCTV
 */
export function IconCamera() {
  return (
    <SvgIcon>
      <rect x="30" y="38" width="40" height="24" rx="3" />
      <circle cx="62" cy="50" r="8" />
      <circle cx="62" cy="50" r="3" fill="currentColor" />
      <rect x="22" y="44" width="8" height="12" rx="1" />
    </SvgIcon>
  );
}

/**
 * Caixa de Passagem (Junction Box)
 * Quadrado com X (diagonais) — sem texto
 */
export function IconCaixaPassagem() {
  return (
    <SvgIcon>
      <rect x="15" y="15" width="70" height="70" />
      <line x1="15" y1="15" x2="85" y2="85" />
      <line x1="85" y1="15" x2="15" y2="85" />
    </SvgIcon>
  );
}

/**
 * Passagem Sobe
 */
export function IconPassagemSobe() {
  return (
    <SvgIcon>
      <circle cx="50" cy="50" r="38" />
      <line x1="50" y1="72" x2="50" y2="30" />
      <polyline points="38,42 50,30 62,42" />
    </SvgIcon>
  );
}

/**
 * Passagem Desce
 */
export function IconPassagemDesce() {
  return (
    <SvgIcon>
      <circle cx="50" cy="50" r="38" />
      <line x1="50" y1="28" x2="50" y2="70" />
      <polyline points="38,58 50,70 62,58" />
    </SvgIcon>
  );
}

/**
 * Quadro Geral / QDG
 */
export function IconQuadro() {
  return (
    <SvgIcon>
      <rect x="15" y="25" width="70" height="50" rx="5" />
      <polyline points="55,32 42,50 52,50 45,68 62,48 52,48 58,32" />
    </SvgIcon>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Mapa de ícones por tipo de componente
// ═══════════════════════════════════════════════════════════════════════════

export const ICON_MAP = {
  // Iluminação
  lampada: IconLampada,
  lampada_simples: IconLampadaSimples,
  lampada_arandela: IconLampadaArandela,
  lampada_spot: IconLampadaSpot,
  lampada_tubular: IconLampadaTubular,
  lampada_led: IconLampadaLed,
  lampada_pendente: IconLampadaPendente,
  luminaria: IconLampada,

  // Tomadas
  tomada: IconTomada,
  tomada_baixa: IconTomadaBaixa,
  tomada_media: IconTomadaMedia,
  tomada_alta: IconTomadaAlta,
  tomada_dupla: IconTomadaDupla,
  tomada_tripla: IconTomadaTripla,
  tomada_trifasica: IconTomadaTrifasica,
  tomada_sensor: IconTomadaSensor,
  tomada_piso: IconTomadaPiso,

  // Comunicações
  telefonia: IconTelefonia,
  dados: IconDados,
  tv: IconTv,
  campainha: IconCampainha,
  camera: IconCamera,

  // Passagem
  caixa_passagem: IconCaixaPassagem,
  passagem_sobe: IconPassagemSobe,
  passagem_desce: IconPassagemDesce,

  // Interruptores
  interruptor: IconInterruptor,
  interruptor_simples: IconInterruptorSimples,
  interruptor_duplo: IconInterruptorDuplo,
  interruptor_triplo: IconInterruptorTriplo,
  interruptor_intermediario: IconInterruptorIntermediario,
  interruptor_paralelo: IconInterruptorParalelo,
  interruptor_dimmer: IconInterruptorDimmer,
  interruptor_pulsador: IconInterruptorPulsador,
  interruptor_bipolar: IconInterruptorBipolar,

  // Quadro
  quadro: IconQuadro,
};

/**
 * Componente genérico que renderiza o ícone correspondente ao tipo.
 */
export default function ElectricalIcon({ type, size = 48, style }) {
  const IconComponent = ICON_MAP[type] || IconLampada;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <IconComponent />
    </div>
  );
}
