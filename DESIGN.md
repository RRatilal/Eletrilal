---
name: Electrilal
description: Sistema de projeto elétrico sobre plantas arquitetónicas — bancada de instrumentos escura com mostradores âmbar (tubos nixie).
colors:
  primary: "#ffa62b"
  primary-hover: "#ffbe5c"
  secondary: "#ff7a45"
  canvas: "#0e1014"
  surface-bg: "#0b0d10"
  surface-secondary: "#111418"
  surface-tertiary: "#161a1f"
  surface-elevated: "#1c2127"
  text-primary: "#f0ece2"
  text-secondary: "#a9a398"
  text-tertiary: "#6f6a60"
  text-inverse: "#0b0d10"
  tomada: "#4b9cff"
  interruptor: "#3ddc84"
  luminaria: "#f5a623"
  quadro: "#ef4444"
  telecom: "#ec4899"
  passagem: "#8b5cf6"
  success: "#34d399"
  warning: "#f5a623"
  error: "#ef4444"
  info: "#38bdf8"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "36px"
    fontWeight: 700
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "28px"
    fontWeight: 700
  title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "1px"
  digit:
    fontFamily: "'Spline Sans Mono', ui-monospace, 'SF Mono', monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0"
rounded:
  sm: "3px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    size: "32px"
  input-text:
    backgroundColor: "{colors.surface-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  badge:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-secondary}"
    rounded: "10px"
    size: "20px"
  panel-instrument:
    backgroundColor: "{colors.surface-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "16px"
  nixie-tube:
    backgroundColor: "#161a1f"
    textColor: "#ffb54a"
    rounded: "3px"
    padding: "1px 3px"
---

# Design System: Electrilal

## Overview

**Creative North Star: "O Contador de Tubos Néon"**

O Electrilal é desenhado como a bancada de instrumentos de um eletricista ao fim do dia: à noite, na oficina, os painéis de metal escovado escuro recuam para a sombra e os únicos pontos de luz são os mostradores âmbar acesos — os tubos nixie que exibem cada grandeza elétrica. A interface é um instrumento de medição, não um painel decorativo: superfícies opacas de metal com arestas maquinadas e rótulos gravados, onde a informação numérica (potência, corrente, secção, queda de tensão) se lê como algarismos acesos dentro de vidro.

O acento âmbar é a luz do filamento: marca medição e seleção, e só. As cores semânticas dos componentes elétricos (tomadas, interruptores, lâmpadas) são o vocabulário do desenho e mantêm-se idênticas nos dois temas. A profundidade nasce das arestas maquinadas e das sombras com offset — nunca de vidro ou blur.

Dois temas com a mesma ossatura: o escuro (padrão) é a oficina noturna; o claro é a bancada de dia em baquelite creme. A tipografia é dupla por necessidade: Inter para a interface (rótulos, botões, texto) e Spline Sans Mono exclusivamente para dados e medições — os dígitos dos tubos.

**Key Characteristics:**
- Dark-first: a oficina noturna como cena física que força o tema escuro
- Metal escovado opaco com arestas maquinadas e highlight de topo — sem glassmorphism
- Accent âmbar (#ffa62b) reservado a medição e seleção
- Algarismos nixie (Spline Sans Mono + tubos de vidro) para todas as grandezas elétricas
- Cores semânticas dos componentes elétricos como identidade do desenho
- Dois temas completos (escuro/claro) com a mesma estrutura de tokens

## Colors

A paleta é quase-negra de carvão quente com um accent âmbar de filamento, e um leque de cores semânticas reservado exclusivamente ao desenho técnico.

### Primary
- **Âmbar de Filamento** (#ffa62b; hover #ffbe5c): a luz dos tubos nixie — medições, seleção, foco, ações primárias, logótipo. O filamento quente #ff7a45 é o segundo polo do gradiente da marca.
- **Laranja de Filamento** (#ff7a45): destaque secundário e gradientes (ex: barra de progresso do importador).

### Neutral
- **Parede da Oficina** (#0b0d10): fundo da aplicação (tema escuro); no claro, #efe8db — baquelite creme.
- **Mesa de Trabalho** (#111418): fundos secundários e hover; claro #e6ddcc.
- **Painel Recuado** (#161a1f): inputs e cartões; claro #f7f2e8.
- **Painel Elevado** (#1c2127): superfícies mais claras que o recuado; claro #fbf7ef.
- **Folha de Desenho** (#0e1014): o canvas em si, sempre o tom mais recuado; claro #e4d9c7.
- **Tinta Primária** (#f0ece2): texto principal; claro #2a251d (invertida).
- **Tinta Secundária** (#a9a398): texto de apoio; claro #5c5447.
- **Tinta Terciária** (#6f6a60): labels, placeholders, breadcrumbs; claro #8c8270.

### Cores Semânticas (idênticas nos dois temas)
- **Azul Tomada** (#4b9cff): tomadas e info (#38bdf8).
- **Verde Interruptor** (#3ddc84): interruptores; sucesso #34d399.
- **Âmbar Luminária** (#f5a623): lâmpadas e aviso.
- **Vermelho Quadro** (#ef4444): quadros e erro.
- **Rosa Telecom** (#ec4899): comunicações.
- **Violeta Passagem** (#8b5cf6): caixas de passagem.

### Named Rules
**A Regra do Filamento.** O âmbar #ffa62b é a luz dos tubos: marca medições, seleções e ações, e só. Nunca é usado como cor de texto corrente nem de fundo de superfícies inteiras — a sua raridade é o que o torna um sinal claro.

**A Regra das Cores do Desenho.** As cores semânticas existem para identificar tipos na planta, não para decorar a interface. Fora do canvas e dos símbolos, usa-se apenas os tons neutros e o âmbar.

## Typography

**UI Font:** Inter (com system-ui, -apple-system, 'Segoe UI', sans-serif como fallback)
**Dígito/Medição Font:** Spline Sans Mono (ui-monospace, 'SF Mono', monospace como fallback)

**Caráter:** duas famílias com papéis estritos — Inter para a interface, Spline Sans Mono só para dados e medições (a voz dos tubos nixie). A hierarquia da UI faz-se por peso (500/600/700), tamanho (11→36px) e letter-spacing; os valores numéricos usam a mono tabular-nums para alinhamento perfeito.

### Hierarchy
- **Display** (Inter 700, 36px, letter-spacing -0.5px): título da home screen, com o sufixo "lal" em âmbar.
- **Headline** (Inter 700, 28px): títulos de ecrãs grandes.
- **Title** (Inter 600, 16px): títulos de painéis e cartões.
- **Body** (Inter 400, 13px): texto corrente da interface — a densidade padrão da ferramenta.
- **Label** (Inter 600, 11px, letter-spacing 1px, uppercase): cabeçalhos de secção dos painéis ("CIRCUITOS", "PROPRIEDADES").
- **Digit** (Spline Sans Mono 400, 12px): algarismos dos tubos nixie, com brilho âmbar.

### Named Rules
**A Regra do Corpo Pequeno.** 13px é o corpo padrão — a interface é uma ferramenta densa, não uma página de marketing. Não se aumenta o corpo para "respirar"; aumenta-se o espaçamento quando é preciso respiro.

**A Regra do Dígito Aceso.** Qualquer grandeza elétrica (potência, corrente, comprimento, queda %, disjuntor, secção) é apresentada num tubo nixie, nunca como texto plano. A mono é para medição — código, dados, medidas — nunca um adorno "técnico" em rótulos.

## Layout

O editor é uma aplicação de ecrã completo: canvas 100vw/100vh como base, com painéis flutuantes fixos que não afetam o fluxo do desenho. A barra superior (48px) mantém navegação e estado; os painéis laterais (260px) ancoram à direita com 16px de margem e deslizam com transição normal (250ms); a barra inferior flutua centrada. Escala de espaçamento de 4 em 4px (4/8/12/16/24/32/40). O canvas nunca é coberto por painéis fixos ao ecrã — é sempre o plano de fundo completo.

## Elevation & Depth

**A Regra do Metal Maquinado.** O sistema distingue superfícies por arestas e sombras com offset, não por vidro. Painéis e cartões são metal opaco com um highlight de topo (`inset 0 1px 0 rgba(255,255,255,0.05)`) e borda subtil — como uma placa fresada. Não há backdrop-filter blur em lado nenhum (as únicas exceções eram os scrims de modais, agora também escurecidos a tinta sólida).

### Shadow Vocabulary
- **Sombra Suave** (`0 1px 2px rgba(0,0,0,0.5)`; claro 0.12): estados quietos.
- **Sombra Média** (`0 4px 12px rgba(0,0,0,0.5)`; claro 0.14): hover e elementos intermédios.
- **Sombra Elevada** (`0 12px 32px rgba(0,0,0,0.62)`; claro 0.18): painéis flutuantes e modais — metal apoiado na mesa.
- **Brilho de Filamento** (`0 0 18px rgba(255,166,43,0.18)`): foco de input, logótipo e seleção — o halo do tubo aceso.

### Named Rules
**A Regra do Metal.** Painéis são metal sólido com aresta realçada e sombra com offset. Qualquer nova superfície deve seguir este padrão; nada de vidro, blur ou fundos semitransparentes — a transparência vive só no vidro escuro dos tubos nixie.

## Shapes

Forma cortada e firme, como placa fresada: raios de 3/6/8/12px. Botões de ícone e elementos pequenos usam 3px (sm), inputs e botões primários 6px (md), painéis flutuantes 8px (lg), cartões de destaque 12px (xl). Pílulas (10px) só para chips/badges de contagem. Bordas são 1px e subtis (rgba 5–18%). Não há clipping nem silhuetas irregulares — a linguagem é sempre "aresta maquinada discreta".

## Components

### Buttons
- **Shape:** cantos cortados (6px primário; 3px botões de ícone).
- **Primary:** fundo âmbar de filamento (#ffa62b) com texto inverso (escuro), padding 12px 24px; hover muda para #ffbe5c com transição fast (150ms, ease standard). Estado `:active` com escala 0.92 para feedback tátil.
- **Icon:** 32px quadrado, fundo transparente, texto secundário; hover com fundo de superfície elevada + borda subtil.
- **Ghost/Ativo:** estado ativo com `accent-glow` como fundo e borda âmbar — o "botão aceso pelo filamento".

### Cards / Containers
- **Corner Style:** raio 8px (lg).
- **Background:** superfície recuada (#161a1f; #f7f2e8 claro) com borda subtil 1px e highlight de topo.
- **Shadow Strategy:** sombra elevada apenas quando flutuante; cartões de conteúdo usam camada tonal + aresta.
- **Internal Padding:** 16px (lg).

### Inputs / Fields
- **Style:** fundo de superfície terciária, borda 1px padrão (rgba 10%), raio 6px, sombra interior (`inset 0 1px 2px`).
- **Focus:** borda muda para âmbar + brilho de filamento (shadow-glow) — o "halo do tubo" — sem outline.
- **Placeholder:** tinta terciária; largura de texto 13–14px.

### Navigation (Toolbar)
- **Style:** barra superior fixa de 48px, fundo de toolbar sólido, borda inferior subtil.
- **States:** botões de ícone com hover tonal; ativos com glow de filamento. Breadcrumb com separadores a 40% de opacidade e o item corrente em peso 600.

### Chips / Badges
- **Style:** pílula de 20px de altura, fundo superfície elevada, borda padrão, texto 11px semibold, raio 10px — usados para contagens (ex: nº de circuitos).

### [Componente Assinatura: Mostrador Nixie] (NixieDisplay)
A peça mais característica do mundo: cada grandeza elétrica é um `NixieDisplay` — algarismos âmbar dentro de tubos de vidro escuro com reflexo de topo, algarismos "fantasma" atrás (profundidade) e animação de aquecimento do filamento ao aparecer. A unidade (A, W, mm², %, m) é gravada à direita em Inter semibold. Tamanhos sm/md/lg (12/15/20px). Os dígitos são keyed por caractere para reacender o brilho quando o valor muda.

### [Componente Assinatura: Painel de Instrumento] (Sidebar / Properties / Circuitos)
O painel lateral direito é uma placa de metal: âncora fixa à direita com margem 16px, fundo sólido, highlight de topo, borda subtil, raio 8px e sombra elevada. Abre/fecha com deslize horizontal + fade (250ms). Secções internas separadas por linhas de borda subtil; cabeçalhos de secção em label uppercase 11px letter-spacing 1px. Os resultados de dimensionamento aparecem num recinto com gradiente radial âmbar suave e tubos nixie.

> Nota de tokens: o token `panel-instrument` no frontmatter regista a cor opaca de simplificação; o tratamento real (highlight de topo + sombra com offset) está no sidecar `.impeccable/design.json`, que é a fonte autoritativa para este componente.

## Do's and Don'ts

### Do:
- **Do** reservar o âmbar para medições, ações, seleção e foco — a raridade é o sinal.
- **Do** usar as cores semânticas para identificar tipos na planta e nos símbolos, sempre as mesmas nos dois temas.
- **Do** mostrar grandezas elétricas em tubos nixie (Spline Sans Mono), nunca como texto plano.
- **Do** seguir a Regra do Metal nos painéis (sólido + aresta realçada + sombra com offset).
- **Do** dar feedback tátil nos botões: hover tonal + `:active` com escala 0.92.

### Don't:
- **Don't** usar o âmbar como cor de texto corrente ou fundo de superfícies inteiras.
- **Don't** usar cores semânticas fora do desenho técnico (não decorar a UI com azul-tomada ou verde-interruptor).
- **Don't** reintroduzir glassmorphism, backdrop-filter blur ou fundos semitransparentes nos painéis.
- **Don't** usar a mono (Spline Sans Mono) em rótulos ou texto corrente — só em dados e medições.
- **Don't** quebrar a paridade estrutural entre os dois temas: mesmos tokens, remapeados em valor.
