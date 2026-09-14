# Plano 101 — O roteiro proposto diz quanto rende

## O seam que já existe, e é ele que sustenta o plano

`previewTripValuation` faz duas coisas separáveis (`read-trip-valuation.use-case.ts:218-252`):

1. resolve **distância e pedágio** indo ao OSRM (`resolvePreviewRoad`, `:261`);
2. entrega um `TripValuationContext` já completo a **`valuationOf`** (`:290`), que produz a conta.

O caminho multi-veículo precisa só da segunda metade. A distância vem da sugestão (D1), o pedágio
não vem (D2) — então o trabalho é montar o contexto por veículo e chamar o **mesmo** `valuationOf`.

⚠️ `valuationOf` é privada hoje. Ela passa a ser exportada, e é isso que garante que as duas telas
respondam a mesma conta: uma segunda implementação da margem divergiria calada, que é exatamente o
defeito que a spec 100 acabou de corrigir no preço do combustível.

## Camadas, e o que entra em cada uma

### API — `src/routing/` (a sugestão é dele) lendo de `src/trips/` (a conta é dele)

| arquivo                                                             | papel                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `trips/application/read-trip-valuation.use-case.ts`                 | exportar `valuationOf` como `buildValuationFromContext`                                                             |
| `routing/application/read-suggestion-valuation.use-case.ts`         | **novo** — orquestra: lê a sugestão, agrupa por veículo, monta contexto por veículo, chama a conta, soma o conjunto |
| `routing/domain/suggestion-valuation.policy.ts`                     | **novo** — puro: soma distância/duração por veículo, decide a origem e as lacunas do total (D4)                     |
| `routing/application/suggestion-valuation.port.ts`                  | **novo** — o que o use case precisa do banco                                                                        |
| `routing/infrastructure/drizzle-suggestion-valuation.repository.ts` | **novo** — as notas por veículo e os veículos da sugestão                                                           |
| `routing/presentation/multi-vehicle-suggestion.routes.ts`           | acrescenta `GET /route-suggestions/:id/valuation`, `trip.financials`                                                |

**A consulta é uma só, e não é por veículo.** As notas saem de
`route_suggestion_stop_documents → route_suggestion_stops` filtrando `suggestion_id`, com o
`vehicle_id` da parada na projeção; os veículos saem de `route_suggestion_vehicles` na ordem
oferecida (`position`), que é a mesma ordem que a tela já mostra.

⚠️ `readPreviewContext` **continua servindo**: ele lê ficha do veículo, tripulação, notas, regime
federal e preço do combustível para um veículo e um conjunto de notas — que é exatamente o recorte
de cada viagem proposta. O que muda é quem escolhe o conjunto: aqui é a sugestão, não o operador.
Ele roda uma vez por veículo, e as N chamadas são de banco, não de rede.

### Frontend — `src/modules/routing/`

| arquivo                                                 | papel                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `shared/suggestionValuation.service.ts`                 | **novo** — tipos e a view do relatório do conjunto                                 |
| `shared/suggestionValuation.validation.ts`              | **novo** — type guard manual, como o resto da app                                  |
| `queries/useSuggestionValuation.query.ts`               | **novo** — `enabled` só com `trip.financials` **e** sugestão `ready`               |
| `components/MultiVehicleSuggestionDialog.component.tsx` | por veículo, a conta ao lado das paradas; no topo, o relatório do conjunto         |
| `components/SuggestionValuationReport.component.tsx`    | **novo** — tempo · distância · gasto · lucro · entregas, com a marca de incompleto |
| `locales/routing.locale.json` + `.en.`                  | rótulos, inclusive a lacuna nova de pedágio                                        |

O painel por veículo **reusa `TripValuationPreview`**? Não: ele recebe um `TripValuationPreviewController`
e monta esqueleto e permissão por conta própria. O que se reusa é `buildValuationSteps`
(`modules/trip/shared/valuationSteps.service.ts`), que é puro e é onde mora a ordem das parcelas.
⚠️ Importar de `trip/` em `routing/` é o que já acontece na direção oposta; se incomodar, o serviço
sobe para `modules/shared/` — decisão da T7, com o contrato pronto.

## O que pode dar errado, e como o plano evita

| risco                                        | como                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| a distância mostrada não bater com o desenho | D1: soma das paradas exibidas, e um contrato que falha se `RouteGeometryPort` for tocada |
| pedágio virar zero silencioso                | D2: lacuna própria, e contrato que a exige                                               |
| a margem divergir da tela de "Nova viagem"   | uma função só (`buildValuationFromContext`), nunca uma segunda conta                     |
| N requisições ao abrir o diálogo             | D3: uma rota que devolve tudo                                                            |
| lucro total parecendo completo               | D4: `hasGaps` obrigatório ao lado do número, com contrato                                |

## Ordem, e por que ela

Domínio puro primeiro (T2) porque é onde estão as decisões e é o que se prova sem banco. A rota
(T4) antes da tela (T6) porque o contrato do corpo é o que a tela valida. Os rótulos por último
(T8) porque só aí a lista de lacunas está fechada.

## Gates por task

`bun run --cwd apps/<app> test` e `bun run typecheck` na raiz em toda task; `make check` antes de
fechar a feature. Teste de contrato **antes** da implementação, e a lista de arquivos de teste do
`package.json` atualizada junto — teste novo não roda se não for adicionado ali.
