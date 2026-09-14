# Spec 114 — Um bloco só, preenchido pela ordem de entrega

> 🤖 Modelo: `opus` (empacotador — `docs/domain/cargo-placement.md` lido antes)

## Problema

Em profundidade cada parada era empacotada numa **fatia isolada** ao longo do comprimento (spec 095).
Com dezenas de paradas pequenas cada fatia tinha uma ou duas caixas de fundo: toda pilha ficava
**livre**, a esbeltez a cortava em três camadas, e nada subia em cima de nada. Medido em 2026-09-10:
85 paradas num baú de 5,32 m a 30% de ocupação — **38 paradas fora do desenho** com a pilha parada
em 0,75 m de 2,20 m. A tentativa de consertar com piso por fatia desenhou a carga até 33,9 m, fora do
baú (revertida em `2e7189dd`).

Pedido do operador, nas palavras dele: "é um baú, tem altura, profundidade e largura, e enquanto não
ocupar vai colocando uma carga próxima à outra, usando os cálculos de quem está perto da porta pela
ordem de entrega".

## Decisão

- **D1.** Em profundidade a carga é **um bloco só**. O preenchimento começa na testeira com a
  **última entrega** e sobe até o teto antes de avançar para a porta; a entrega seguinte continua de
  onde a anterior parou — ao lado ou em cima dela.
- **D2.** A ordem de entrega é o **primeiro** critério da varredura; dentro da parada valem os de
  sempre (pegada maior embaixo, frágil em cima, medida antes da presumida).
- **D3.** O bloco é deslocado para terminar na porta (099 D2), ou centralizado acima de metade do teto
  de massa (099 D3). O vão sobra na testeira.
- **D4.** ⚠️ **Reverte a proibição da 095** só no que ela proibia a mais: uma entrega **mais cedo**
  pode ficar em cima de uma mais tardia — é assim que ela sai primeiro. O que continua proibido é o
  contrário: entrega mais tardia em cima de uma mais cedo, ou entre ela e a porta.
- **D5.** Sem fatia não há "carga dividida" em profundidade: o que não cabe no bloco é `bedFull`. A
  divisão continua valendo em faixas.

## Aceite

- Toda caixa dentro do baú.
- Nenhuma parada fora do desenho quando o volume cabe.
- Nenhuma caixa de entrega mais tardia em cima de uma mais cedo, nem entre ela e a porta.
- A pilha passa da trava de coluna livre quando está cercada.
- Carga leve termina na porta.
