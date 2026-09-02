# Tasks — 076 O baú mostra o que cabe

Uma task por vez. Contrato **antes** da implementação, falhando primeiro. Evidência em
`evidence.md`.

---

## Fase A — A fatia de cada parada

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato de `resolveCargoLayout` (domínio puro): fatia proporcional ao volume de
      cada parada; **ordem inversa à de entrega** (a última parada no fundo); nota sem cubagem
      contada à parte, nunca como fatia zero; excedente acima da capacidade **fora** do baú;
      uma parada só ocupa tudo. Falha antes de existir. (P2, P3, P4 · CA2, CA3, CA4, CA6)
- [x] **T002** — Implementar a política em `trips/domain/cargo-layout.policy.ts`.
- [x] **T003** — Expor o layout no detalhe da viagem, ao lado da ocupação.
      ⚠️ Campo novo no corpo **nasce opcional** no cliente (spec 078 D2) — e o guard usa chaves
      exatas, então declarar é obrigatório.

---

## Fase B — O desenho

> 🤖 Modelo: `sonnet`

- [x] **T004** — Contrato de tela: o baú só é desenhado com dimensões conhecidas; a marca de
      estimativa acompanha; a legenda liga cor a endereço; nenhuma cor literal; nenhum `<svg>` cru
      fora de `components/ui`. (P1, RF1, RF4, RF6 · CA1, CA5, CA8)
- [x] **T005** — Componente do baú, em SVG do design system, com a proporção real do veículo (D1).
- [x] **T006** — Descrição textual equivalente para leitor de tela e impressão. (RNF2 · CA7)
- [x] **T007** — Responsivo: em 375px vira vista lateral única, sem scroll horizontal; animação
      respeita `prefers-reduced-motion`. (RNF3, RNF4 · CA9)

---

## Fase C — Fecho

> 🤖 Modelo: `haiku`

- [x] **T008** — `make check` e smoke verdes, evidência completa.
- [ ] **T009** — Verificar em staging: viagem com paradas mostra o baú fatiado; veículo sem
      dimensão **não** desenha e diz por quê.
      ⚠️ Os veículos de staging têm `capacity_m3` mas **não têm dimensões** — o degrau `measured`
      não tem entrada na tela (pendência registrada na 075). Preencher as três medidas direto na
      base é parte do teste, e é o que torna a P1 exercitável.
