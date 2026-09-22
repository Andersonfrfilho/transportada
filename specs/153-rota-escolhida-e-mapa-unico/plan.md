# Plano — 153

## Forma da escolha

```ts
type RouteChoiceCriterion = 'cheapest' | 'fastest' | 'no_toll' | 'alternative'
type RouteChoice = { signature: string | null; criterion: RouteChoiceCriterion }
```

- `signature`: `sha256` (hex, 16 primeiros bytes) da sequência de `nodeIds` OSM das pernas, calculada
  no gateway/use case (os nós já vêm por `annotations=nodes`). Exposta em cada `option`.
- `selectRouteOption({ options, choice })` (domínio, puro): assinatura presente → a opção dela;
  senão critério (`cheapest` = menor `totalCost` não nulo, `fastest` = menor duração, `no_toll` =
  `isNoToll`, `alternative` → `cheapest`); sem candidata → `options[0]`. Devolve
  `{ option, reproduced }`.

## API (`apps/api-transportada`)

1. **Migration** (`drizzle/`) + `database/trip.schema.ts`: colunas do RF1, CHECKs, `rollback.sql`.
2. **Gateway** `osrm-route-geometry.gateway.ts`: `readRoute({ points, excludeToll })`; o use case
   faz as duas chamadas em paralelo (`Promise.all`), deduplica por assinatura, marca `isNoToll`.
   Falha da chamada com `exclude` não derruba a outra.
3. **`read-route-geometry.use-case.ts`**: `options[].signature/isNoToll`; `selectedIndex` =
   `selectRouteOption(..., { criterion: 'cheapest' })` quando o pedido não traz escolha; campos de
   topo (`legs`, `points`, `toll`) passam a ser os da **selecionada**.
4. **Seam** `trips/domain/planned-road-distance.policy.ts` (`summarizeRoadDistance`: total, volta,
   duração) usado por `resolvePreviewRoad` e pelo congelamento.
5. **Congelamento** `freeze-trip-route-toll.use-case.ts` → `freeze-trip-planned-route.use-case.ts`:
   lê rotas, aplica `selectRouteOption`, grava tudo numa escrita (`writePlannedRoute`) com
   `planned_route = { criterion, signature, choiceReproduced, points, legs, toll, depot }`.
   Limpa antes de recalcular; falha → nulos (D5).
6. **Rotas**: corpo opcional em `POST /trips/:id/plan-route`; `routeChoice` por veículo no aceite
   multi-veículo (`route-suggestion-request.schema.ts`); aceite por viagem chama o planejamento;
   `valuation-preview` aceita `routeChoice`.
7. **Recalcular na mudança** (D6): reorder, link (unitário e lote) e release de documento em viagem
   não despachada chamam o congelamento com `cheapest`, depois da escrita principal, tolerante a
   falha.
8. **Leitura**: `trip-valuation.query.ts` lê distância e pedágio gravados; `GET
/trips/:id/route-geometry` devolve a gravada (`frozen: true`) ou a ao vivo (`frozen: false`).
9. **Redação monetária** `shared/…/monetary-redaction.service.ts` (ou no módulo `trips/presentation`
   se só trips usar): funções puras por forma de resposta, aplicadas no handler conforme
   `context.permissions` contém `trip.financials`. Aplicar em route-geometry ×2, detalhe da viagem
   (`nfeTotalValue`), listagem e leitura de NF-e (`totalAmount`, `freightAmount`, `freightRuleName`
   fica). Campo redigido **sai do objeto** (o schema do cliente passa a aceitar ausência).

## Frontend (`apps/frontend-transportada`)

1. Validação de resposta (`routeGeometry.service.ts`, NF-e, detalhe): campos monetários opcionais;
   `signature`, `isNoToll`, `frozen`, `criterion`, `choiceReproduced`, distância/volta/duração.
2. `TripAssemblyMap`: seletor inclui "Sem pedágio"; abre em `selectedIndex` da API (mais barata);
   `onRouteChoiceChange(choice)`; sem permissão não imprime valores (recebe `canReadFinancials`).
3. `useTripQuickCreate`: guarda a escolha, envia em `planTripRoute`, e corrige a ordem
   plan → reorder (reorder primeiro, plan por último, senão o reorder recalcularia com `cheapest`).
4. Proposta: `TripProposalDetail`/`useTripRouteAssembly` guardam escolha por veículo e enviam no
   aceite; prévia da conta envia `routeChoice`.
5. Detalhe: `TripRouteMap` mostra km, volta, tempo, critério ("rota sem pedágio", "mais barata"),
   aviso de escolha não reproduzida, "rota não calculada"; custos só com `canReadFinancials`
   (passado pela página a partir de `useTripFinancials`). Lista de cargas sem valor da NF sem permissão.
6. `RouteTollSummary` com `canReadFinancials`: sem ela lista praças e eixos, sem preço.
7. Regiões: `FreightRegionMap` sobre MapLibre (`lazy`), fonte GeoJSON dos polígonos da malha já
   carregada (`useFreightRegionMap`), `fill-color` por zona via propriedade, clique →
   `onToggleCity`. Remoções do RF11 e contratos que os liam.

## Verificação

- API: `bun --env-file=../../.env.test test --timeout 120000` em `apps/api-transportada` (integração
  não pula sem o env), `make migration-test`.
- Frontend: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`.
- OSRM `exclude=toll`: spike T001 contra o OSRM de staging antes da T102.
