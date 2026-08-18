# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Projetista / eletricista profissional que desenha esquemas elétricos de habitações e outros espaços sobre plantas arquitetónicas, e que precisa de dimensionar circuitos de acordo com a regulamentação portuguesa.

## Product Purpose

O Electrilal é um sistema local para desenhar esquemas elétricos sobre plantas arquitetónicas (.dxf / .pdf) e dimensionar circuitos (corrente, disjuntor, bitola de cabo, queda de tensão), com exportação do resultado. O sucesso é um projetista concluir um projeto completo — planta, componentes, ligações e dimensionamento — num único fluxo, sem ferramentas CAD complexas.

## Positioning

Ferramenta local acessível que combina desenho sobre planta real, ligações entre componentes e dimensionamento regulamentar num só lugar, diferenciando-se pela visualização 3D da instalação e por automação (dimensionamento em grafo, deteção de anti-padrões) que um CAD genérico não oferece.

## Operating Context

- Trabalho sobre plantas arquitetónicas importadas de ficheiros `.dxf` ou `.pdf`.
- Componentes posicionados em coordenadas cartesianas (metros no backend; `ESCALA_PX_POR_METRO = 40` no canvas).
- Dimensionamento segue a **RTIEBT (Portugal)**; os valores atuais em `backend/electrical/calculator.py` e `validator.py` são aproximações a validar contra a norma antes de qualquer uso certificado.
- Aplicação de uso local (sem autenticação, base SQLite em `data/projeto.db`); backend tem de correr antes do frontend.

## Capabilities and Constraints

- Tipos de componente extensos (tomadas, interruptores, lâmpadas — incluindo LED de jardim e fita LED —, comunicações, caixas de passagem, quadro), definidos como `Literal` em `backend/schemas.py`.
- Ligações (condutos) entre componentes com roteamento `teto_parede` ou `subterraneo`, e ponto de controlo Bezier opcional (`c1_x`/`c1_y`).
- Dimensionamento individual e global por circuito (Dijkstra sobre o grafo de ligações para comprimento de fio).
- Exportação para `.dxf` (planta original + componentes).
- Autosave local (localStorage) e undo/redo.
- Vista 3D experimental (Three.js) com navegação em 1ª pessoa e iluminação de lâmpadas.
- Toda a UI e mensagens estão em **Português (pt-PT)**.
- Restrições técnicas: sem TypeScript, sem linter/formatter configurado, sem framework de testes formal, sem Alembic (migrações manuais leves em `database.py`).
- Decisão em aberto: **validação dos valores de dimensionamento contra a RTIEBT** (nunca apresentar valores como conformidade certificada sem verificação humana).

## Brand Commitments

- Nome: **Electrilal**.
- Idioma obrigatório do produto: Português (pt-PT).

## Evidence on Hand

- Documentação técnica no repositório: `README.md`, `AGENTS.md`, `knowledge.md`, `CHANGELOG.md`.
- Ficheiro de referência de projeto real: `05 - ARQ - HID.pdf`, `Proposta T4 - v4.dxf`.
- Não existem testemunhos, casos de estudo ou press de clientes — trabalho futuro não deve inventá-los.

## Product Principles

- **Desenho e cálculo no mesmo fluxo** — o dimensionamento nasce das ligações reais, não de tabelas à parte.
- **Precisão regulamentar primeiro** — os valores devem poder ser rastreados à RTIEBT antes de serem apresentados como válidos.
- **Ferramenta local, rápida e sem fricção** — sem dependência de serviços externos.
- **Diferenciar pela visão espacial** — o 3D ajuda a validar a instalação antes da obra.
- **Português (pt-PT) em toda a superfície** — consistência de linguagem técnica.

## Accessibility & Inclusion

Nenhum requisito específico estabelecido.
