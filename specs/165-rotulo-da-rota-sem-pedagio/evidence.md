# Evidência — 165

## Origem: medição em staging (2026-09-22)

A viagem `66667bb0` (Ribeirão Preto, dez entregas) refeita no roteirizador de staging, com o
depósito da empresa nas duas pontas:

| Chamada        | Distância | Praças casadas no catálogo                          |
| -------------- | --------- | --------------------------------------------------- |
| sem `exclude`  | 376,5 km  | 3 — São Simão, Santa Rita do Passa Quatro, Batatais |
| `exclude=toll` | 372,6 km  | 0                                                   |

Os 372,6 km são exatamente os da tela que motivou a spec, e o catálogo de staging tem 592 praças
(571 com tarifa por eixo, extrato de 14/09/2026). O zero era verdade; faltava dizer por quê.

## T001–T002 — `isNoToll` no resumo da opção

`test/trip/assembly-route-options.contract.ts`, três casos novos (CA01, CA03 e a opção sem pedágio
calculado). Antes da implementação: 3 falhas, `Expected: true / Received: undefined`. Depois:

```
16 pass · 0 fail · 33 expect() calls
```

## T003 — Selo na lista

`assemblyMap.routeOptions.noToll` em pt-BR e o selo em `TripAssemblyMap`, acumulando com os selos
de mais rápida e mais barata.

## T004–T005 — Frase do bloco de pedágio

`test/trip/route-toll-no-toll-route.contract.tsx` (novo, registrado em `test/trip.contract.test.ts`):
desvio anunciado, rota comum inalterada e catálogo vazio vencendo a frase do desvio.

⚠️ `test/trip/assembly-toll.contract.ts` afirmava a linha de montagem do componente **literal**
(`'<RouteTollSummary canAdjustTollBooth={canAdjustTollBooth} toll={toll} />'`) e quebrou quando a
prop nova quebrou a linha em várias. A asserção passou a procurar `'<RouteTollSummary'` — ela
existe para provar a ordem na tela, não a formatação do JSX.

## T006 — Gates

De `apps/frontend-transportada`:

```
bun run typecheck   → tsc --noEmit, sem saída
bun run lint        → eslint ., sem saída
bun run test        → 4716 pass · 0 fail (29 arquivos)
                      40 pass · 0 fail (test:hooks, processo próprio)
```

## T007 — Revisão de design

Recorte da caixa de opções e do bloco de pedágio montado com os tokens reais (`--color-copper`,
`--color-fog`, `--space-*`) e o CSS literal de `.routeOption*`, `.ui-button-secondary` e `.hint`.

- O selo novo é o mesmo `routeOptionBadge` dos outros: mesma borda, mesmo raio, mesmo peso e tamanho
  de fonte. Nada de primitivo cru ao lado de primitivo do design system.
- Contraste conferido nos dois estados: na opção **selecionada** o fundo é cobre a 18% e o texto do
  selo continua em `--color-fog`, legível; na não selecionada o fundo é grafite.
- Os três selos cabem na mesma linha em 15rem de largura mínima, e `flex-wrap` resolve quando não
  cabem.

Print enviado ao usuário.
