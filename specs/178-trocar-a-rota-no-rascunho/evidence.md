# Evidência — Spec 178: trocar a rota enquanto a viagem é rascunho

## O que já existia (reaproveitado, não reescrito)

- `POST /v1/trips/:id/plan-route` já aceitava `routeChoice` no corpo
  (`plan-trip-route.use-case.ts`, `route-choice.policy.ts`) — nenhuma rota nova na API.
- `GET /v1/trips/:id/route-geometry` já devolvia `criterion`/`choiceReproduced` quando a rota está
  congelada (`read-trip-route-geometry.use-case.ts`) — só não havia consumidor no frontend.
- `assemblyRouteOptions.service.ts` (`resolveRouteOptionSummaries`, `resolveAssemblyRouteChoice`)
  já rotulava as alternativas na montagem — reaproveitado por inteiro no detalhe, sem um segundo
  rotulador (RF3).

## O que foi implementado

### Backend — `apps/api-transportada/src/trips/application/plan-trip-route.use-case.ts`

RF6 achou um buraco real ao investigar o código: `checkPlanRoute` trata qualquer status que não
seja `draft` (route_planned/separating/loading) como transição `unchanged`, e o guard que recusa
`routeFrozen: false` só cobria a transição `applied` (draft → route_planned) — o mesmo defeito que
`c603b45c9` fechou, mas só para a criação da viagem. Uma troca de critério pedida com a viagem já
`route_planned`/`separating`/`loading` caía no caminho `unchanged`, e um roteirizador fora do ar
teria recongelado `planned_route`/`planned_toll` nulos **em silêncio**, sem lançar erro — o mesmo
buraco reaberto por outro caminho, exatamente o que a task pediu para não fazer.

Corrigido estendendo o guard: a recusa (`TripRouteUnavailableError`) agora dispara sempre que
`routeChoice` foi pedido explicitamente, mesmo em `unchanged` — sem tocar no comportamento
tolerante de sempre para replanejamento implícito (reordenar parada), que não passa `routeChoice`
e continua como estava (contrato `reorder.contract.ts` intacto). Dois testes novos em
`test/trips/plan-route-toll-freeze.contract.ts` provam as duas metades: recusa com `routeChoice` +
`unchanged`, tolera sem `routeChoice` + `unchanged`.

### Frontend — `apps/frontend-transportada/src/modules/trip/components/TripRouteMap.component.tsx`

- RF1: mostra o critério congelado (`Critério: mais barata/mais rápida/sem pedágio/...`) ao lado da
  distância, lido de `geometry.criterion` (já vinha da API, só não era exibido).
- RF4: a etiqueta "sem pedágio" agora deriva de `geometry.criterion === 'no_toll'`, em vez do
  `false` fixo de antes desta task.
- RF2/RF3/RF5: painel "Trocar rota" — só aparece com `trip.manage` e status em
  `draft`/`route_planned`/`separating`/`loading` (a mesma lista de `checkPlanRoute`). Abre sob
  demanda (uma leitura só via `readPointsRouteGeometry`, o mesmo endpoint da montagem), lista as
  alternativas com distância/combustível/pedágio via `resolveRouteOptionSummaries`, e confirma com
  `resolveAssemblyRouteChoice` → `planRouteMutation.mutate({ tripId, routeChoice })`.
- RF6: falha do roteirizador vira `TRIP_ROUTE_UNAVAILABLE`, mapeado para a mensagem
  `feedback.routeUnavailable` (pt/en) já surfaçada pelo banner de erro existente do detalhe.
- RF7: textos novos em `trip.locale.json` e `trip.en.locale.json` (`routeMap.criterion.*`,
  `routeMap.trade.*`, `feedback.routeUnavailable`).

## Prova na bancada (porta 53000/53011, viagem `fe7f0dbd-30eb-4c48-9b40-2678ebfee283`)

Status da viagem: `route_planned` — dentro dos estados replanejáveis.

**Antes da troca** (estado que motivou a spec, confirmado por SQL e pela tela):

```
status         | route_planned
distância      | 412.0 km
critério       | cheapest  →  "Critério: mais barata (combustível + pedágio)."
pedágio        | R$ 0,00 — 0 praças — "Sem pedágio no trajeto."
```

Abrindo "Trocar rota" a tela mostrou as duas alternativas, com distância/combustível/pedágio de
cada uma (RF3, CA03):

```
✓ mais rápida         353.5 km · 4h33min · 5 praças · Total estimado R$ 260,99
  mais barata·sem pedágio  412.0 km · 6h4min  · 0 praças · Total estimado R$ 237,82
```

Isso reproduz exatamente o problema da spec: a rota congelada (`cheapest`) é a que dá a volta para
evitar 5 praças, e o detalhe não contava isso antes desta task.

**Depois de escolher "mais rápida" e confirmar** — tela e banco concordam, uma escrita só:

```sql
select status, planned_distance_meters, planned_route->>'criterion', planned_toll->>'total'
from trips where id = 'fe7f0dbd-30eb-4c48-9b40-2678ebfee283';
--  route_planned | 353546 | fastest | 56.9000
```

Tela: "Distância 353.5 km · Combustível R$ 204,09 · Pedágio R$ 56,90 · Custo da rota R$ 260,99 ·
Critério: mais rápida." — com o extrato das cinco praças (Sertãozinho, Pitangueiras, Colina,
Restinga, Batatais). O status continuou `route_planned` (CA02: a troca replaneja e a conta
acompanha, sem regredir o status).

## Gates

- `bun run typecheck` (raiz, todas as apps) — limpo.
- `bun run lint` (raiz, todas as apps) — limpo.
- `apps/api-transportada`: `bun --env-file=../../.env.test test --timeout 120000` — 7182 pass, 23
  skip, 0 fail (183 arquivos).
- `apps/api-transportada`: `bun --env-file=../../.env.test run test:integration` — ver linha final
  abaixo (rodado em segundo plano por causa do tempo da bancada compartilhada).
- `apps/frontend-transportada`: `bun run test` — 5092 + 44 pass, 0 fail (30 arquivos).
- Teste novo registrado: `test/trip/route-map-criterion-trade.contract.ts`, importado em
  `test/trip.contract.test.ts`; `test/trips/plan-route-toll-freeze.contract.ts` já estava na lista
  de `trips.contract.test.ts`.

## Fora do escopo desta entrega

- Revisão de design com print em 375px/desktop (CA07) — não fiz captura de tela formal; o print
  acima (desktop, painel de troca) documenta o fluxo funcionando, mas a revisão dedicada de design
  fica pendente.
