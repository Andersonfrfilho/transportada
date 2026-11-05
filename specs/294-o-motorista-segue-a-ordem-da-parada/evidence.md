# Evidência — 294

## T0.1 — ADR 0113 (2026-11-05)

- `git fetch && git ls-tree origin/staging docs/adr/` → maior número em `origin/staging` é 0112 (0109 não existe);
  **0113 livre**.
- Tabela de eventos confirmada em `apps/api-transportada/src/database/trip.schema.ts`: **`trip_stop_events`**
  (`tripStopEvents`, `kind ∈ {arrived, delivered, returned, occurrence, departed, departure_cancelled}`). Saída
  (`report-stop-departure.use-case.ts:123`), chegada (`report-stop-arrival.use-case.ts:119`) e baixa
  (`document-outcome-steps.service.ts:127`) gravam por `recordEvent` →
  `drizzle-driver-field-report.repository.ts:800` (`insert(tripStopEvents)`). A saída também marca
  `trip_stops.en_route_since` (`markStopEnRoute`). A baixa de campo não escreve em `trip_document_events`.
  `plan.md` atualizado.
- `grep -rn "trip_stop_location_suggestions\|address_correction_suggestions" src drizzle` → nada: a tabela da
  ADR-0080/195 nunca foi criada.
- `docs/adr/` não tem índice (`README`); a convenção é marcar a ADR antiga no cabeçalho. ADR-0080 ganhou
  "Substituída em parte por: ADR-0113".
- `npx prettier@3 --check` nos arquivos alterados → todos formatados.
- `grep -n "0113" docs/adr -r` → `0113-…md:1` e `0080-…md:6`.

## Desvio do plano — contratos vermelhos (T0.2, T0.3, T0.4)

Contrato vermelho registrado no `package.json` quebraria o gate por task. Cada task de contrato escreve o contrato
primeiro, roda vermelho (módulo ausente), e escreve na mesma task a política **pura** que o deixa verde, sem ligar
em use case (isso fica em T2.3/T3.1). T0.4 (contratos do bot) foi movida para o começo de T4.3.

## T0.2 — contrato e política da ordem da parada

- Contrato `apps/api-transportada/test/trips/stop-event-sequence.contract.ts`, importado por
  `test/trips.contract.test.ts` (já listado no `package.json`).
- Vermelho: `bun --env-file=../../.env.test test ./test/trips.contract.test.ts` → `Cannot find module
'../../src/trips/domain/stop-event-sequence.policy.js'` (0 pass, 1 fail, 1 error).
- Política `src/trips/domain/stop-event-sequence.policy.ts` (reusa `TripFieldChannel`).
- Verde: mesmo comando → 147 pass, 0 fail.
- Gates em `apps/api-transportada`: `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` → 13139 pass,
  35 skip, 0 fail; prettier nos arquivos alterados.

## T0.3 — contrato e política da correção do endereço pela chegada

- Contrato `apps/api-transportada/test/trips/address-arrival-correction.contract.ts`, importado por
  `test/trips.contract.test.ts`.
- Vermelho: `bun --env-file=../../.env.test test ./test/trips.contract.test.ts` → `Cannot find module
'../../src/trips/domain/address-arrival-correction.constant.js'` (0 pass, 1 fail, 1 error).
- Política `src/trips/domain/address-arrival-correction.policy.ts` + `.constant.ts` (2000 / 15000 / 300 m);
  distância por `distanceInMetres` de `src/addresses/domain/coordinate-distance.ts` (haversine existente).
- Fronteira: a grade de 7 casas decimais não cai em exatamente N m, então o contrato acha o último ponto com
  distância <= limite (apply/ignore) e o seguinte, > limite (suggest).
- Verde: mesmo comando → 166 pass, 0 fail.
- Gates em `apps/api-transportada`: `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` → 13158 pass,
  35 skip, 0 fail; prettier nos arquivos alterados.

## T1.1 — painel tolerante a `recordedTogether` e à origem da correção do endereço

- Contrato `apps/frontend-transportada/test/trip/timeline-recorded-together-tolerance.contract.ts`, importado por
  `test/trip.contract.test.ts` (já na lista do `package.json`): campo ausente, `true`, `false`, não booleano
  (recusa), origem `driver`, origem desconhecida (rótulo neutro), kind desconhecido (descartado).
- Vermelho: antes da implementação o chip `together` e a origem livre não existiam (falha de tipo/asserção).
- `recordedTogether?: boolean` opcional no item (`TRIP_TIMELINE_ITEM_OPTIONAL_KEYS`); chip "Marcada junto" com
  dica; `addressChange.origin` passou a texto livre na leitura, origem fora do vocabulário cai em
  `origin.unknown`; `origin.driver` = "Endereço corrigido pela chegada do motorista".
- Ajuste: `timeline.contract.ts` deixou de exigir recusa de origem `invented` (decisão da 294: tolerar).
- Gates em `apps/frontend-transportada`: `bun run typecheck` limpo; `bun run lint` 0 errors (16 warnings
  antigos); `bun run test` → 8632 pass, 0 fail + 1438 pass, 0 fail; `bun run build` ok; prettier nos alterados.

## T2.1 — migration A aditiva (`recorded_together`, `address_correction_suggestions`, fonte `driver`)

- Migration `20261105023931_stop_event_recorded_together_and_address_suggestions` (com `rollback.sql`): coluna
  `trip_stop_events.recorded_together boolean not null default false`; tabela `address_correction_suggestions`
  (`company_id`, FK de membership, índice `(company_id, status, created_at)`, único parcial
  `(company_id, trip_stop_event_id)`); `'driver'` entra em `GEOCODING_SOURCES` e os quatro CHECKs de fonte
  (`geocoded_addresses`, `geocoded_address_corrections` previous/new, `client_delivery_addresses`) são alargados
  aditivamente. `origin = 'driver'` já existia em `CORRECTION_ORIGINS`.
- `db:generate` seguinte: `no_changes`. Sem rebase: `origin/staging` já era ancestral da branch.
- Ajustes de contrato: lista de migrations (`static-migration.contract.ts`), política do staging-refresh
  (`deploy/staging-refresh/prune-source.sql`: `keep`), e o teste "origem não é fonte" admite a sobreposição `driver`.
- Gates: `make migration-test` → 231 pass, 0 fail (migration + rollback); `bun run typecheck` e `bun run lint` limpos;
  prettier ok; contrato da API → só falham os 9 testes de `toll booth catalog repository`, que falham igual sem a
  mudança (preexistente, `disposable-database` "drop" no ambiente local).

## T2.2 — passos de saída e chegada extraídos (sem mudança de comportamento)

- Novos: `stop-event-steps.service.ts` (`performStopDeparture`, `applyStopDeparture`, `performStopArrival`,
  `applyStopArrival`; `assertArrivalWithinWindow` e `shiftPendingStopsByDelay` privados) e
  `stop-event-steps.types.ts`. Os use cases mantêm `deriveFieldAuthorship`, `unitOfWork.execute`, `withFieldReport`
  e `recall`; o `perform` só chama o passo. Diff dos use cases = só remoção do código movido.
- Gates (de `apps/api-transportada`): `bun run typecheck` limpo; `bun run lint` limpo; prettier ok;
  contrato `bun --env-file=../../.env.test test --timeout 120000` → 13158 pass, 26 skip, 9 fail (só os 9 de
  `toll booth catalog repository`, preexistentes); integração `bun --env-file=../../.env.test run test:integration`
  → 1857 pass, 8 skip, 0 fail (332 arquivos, 3586 s).
- Infra: `make e2e-up` falha no pull do MinIO (GHCR `unauthorized`); subiu-se só `postgres rabbitmq`
  (`ENV_FILE=.env.test SERVICES="postgres rabbitmq" make up`), como a CI faz.

## T2.3 — a API exige a ordem da parada da tripulação e marca junto a etapa pulada

- Novo `recorded-together-steps.service.ts`: `recordSkippedSteps` (trava as paradas, lê a decisão sob a trava, aplica
  `resolveStopEventSequence`, grava a saída marcada junto — `markTripOnDeliveryRoute` + `recordEvent` com
  `recordedTogether`, sem `isDepartureTapStale`, sem 409, sem `markStopEnRoute` — e a chegada marcada junto por
  `applyStopArrival`, que zera "a caminho" da viagem e não desloca a previsão) e `performSequencedStopArrival`
  (escritório inalterado, `recordedTogether: []`). Relógio das etapas junto = o do evento pedido; `location: null`
  nelas (decisão reversível: não dispara a correção de endereço, RF14).
- Baixa (`document-outcome*.ts`): trava das paradas em todo canal e nota relida sob a trava (a baixa do motorista e a do
  escritório na mesma nota se serializam: antes da releitura as duas gravavam `delivered`), transição calculada antes das
  etapas (cancelada continua `TripStateTransitionNotAllowed`; `unchanged` não marca nada).
- Reenvio: `findRecordedTogetherSteps` deriva `recordedTogether` das etapas da mesma parada com o mesmo `created_at`
  do evento da chave (mesma transação). `recordEvent` aceita `recordedTogether`.
- HTTP: chegada do motorista devolve `{ id, recordedTogether }`; baixa/devolução já devolvem o resultado inteiro.
  Escritório sem mudança de corpo.
- Efeito colateral aceito: chegada sem saída leva a viagem `dispatched` → `on_delivery_route` (como a saída real faria),
  não mais a `in_transit`; três testes antigos (`me-trip` x2, `event-location-stamp`) ajustados a isso e à contagem de
  eventos.
- Testes: `test/integration/stop-event-sequence.integration.ts` (9: baixa 3 eventos/2 junto, chegada sem saída, parada já
  chegada, escritório 1 evento, reenvio de baixa e de chegada, cancelada, corrida motorista × escritório, ajudante) e contrato
  de rota (`clock-fields-schema.contract.ts`).

## T2.4 — estatísticas ignoram etapa marcada junto; linha do tempo desempata

- Espera (spec 232): `readStopDwells` e `readStopDwellsByTrip` juntam só eventos com `recorded_together = false`. Amostras de
  tempo de serviço (`service-time.policy.ts`) e de deslocamento (206 D11) não têm consumidor de `trip_stop_events` hoje: nada a filtrar.
- Previsão 109: T2.3 já pulava `shiftPendingStopsByDelay` com `recordedTogether`; agora há integração (parada pendente intacta).
- Desempate: `stop.departed` passou a prioridade -1 (< `stop.arrived` 0 < `document.delivered` 4); a lista decrescente mostra
  baixa, chegada, saída. Painel: `sortChronologically` do mapa desempata saída < chegada < resto.
- Integração `stop-event-sequence` (10 pass), `trip-timeline` (46), `trip-valuation-document-figures` (7); contrato 13168/0; painel 1438/0;
  typecheck e lint verdes.

## T2.5 — a baixa que fecha a parada devolve a próxima; o snapshot leva a precisão

- `resolveDepartureStop` e o resto da política foram movidos para `trips/domain/driver-stop-resolution.policy.ts` (imports do bot atualizados);
  `isStopAddressReliable` (`stop-address-reliability.policy.ts`): confiável só com coordenada e `rooftop`/`street`.
- `reportDocumentDelivery`/`reportDocumentReturn` devolvem `nextStop` (id, sequence, totalStops, recipientName, address, documents,
  coordinate, precision, isAddressReliable) quando a baixa do motorista/WhatsApp fecha a parada e a viagem segue; `null` na última parada,
  na nota que não fecha a parada, no reenvio e no escritório (`serializeOutcome` não o inclui). Leitura: 2 consultas por baixa que fecha parada
  (paradas+geocode, notas+destinatário), sem N+1.
- `GET /me/trips/current`: cada parada ganhou `precision` e `isAddressReliable` (mesmo join de `geocoded_addresses`); a contagem de consultas
  da leitura não mudou (25). O app do motorista valida à mão e ignora campos novos: sem mudança.
- Contratos `stop-address-reliability`, `resolve-next-stop`; integração `next-stop-offer` (7). Contrato 13174/0, integração dos arquivos tocados 50/0,
  typecheck e lint verdes.

## T3.1 — a chegada da tripulação corrige o endereço ou sugere ao escritório

- `PerformSequencedStopArrival` chama `correctAddressFromArrival` (porta da transação de campo) após gravar a chegada, só para
  motorista/ajudante com localização real; escritório e etapa marcada junto (localização nula) nunca chamam.
- `arrival-address-correction.support.ts`: lê o endereço da parada + `geocoded_addresses`, roda `resolveAddressArrivalCorrection` e
  `apply` → `applyGeocodedAddressCorrection` (extraída do repositório do `PATCH /geocoded-addresses/:key`, agora com `origin`/`source`
  opcionais; a trilha `geocoded_address_corrections` com `origin 'driver'` já é o evento da linha do tempo 228), `suggest` → insere
  `address_correction_suggestions` (`on conflict do nothing`, único por empresa + evento), `ignore` → nada.
- Roda em savepoint dentro da transação da chegada: falha vira `address_correction.failed` (warn, só ids) e a chegada grava. Logs
  `address_correction.applied|suggested|ignored|failed` sem coordenada. Chave `address-correction:<eventId>` vai no log; a idempotência real é o
  `recall` da chave da chegada + o índice único da sugestão.
- A FK `address_key` -> `geocoded_addresses` da sugestão foi removida da migration da T2.1 (branch não publicada): endereço sem coordenada não tem linha lá.
- Testes: integração `address-arrival-correction` (11: CEP 500 m aplica com trilha e evento driver, CEP 5 km sugere, confiável 200 m nada, confiável
  500 m sugere sem sobrescrever, sem coordenada sugere sem distância, sem localização, escritório, marcada junto, reenvio, chegada repetida, falha isolada)
  e contrato `arrival-address-correction-call`. Contrato 13177/0, integração dos arquivos tocados 28/0, typecheck, lint e prettier verdes.

## T3.2 — sugestões de endereço do motorista nas pendências

- `GET /pending-items` ganhou a fonte `addressSuggestedByDriver` (`trip.manage`, a permissão do `PATCH /geocoded-addresses/:addressKey`), só
  pendentes da empresa do token, com `details` (endereço, ponto sugerido, distância, parada). Com mais de uma fonte permitida o caso de uso
  mescla pelo cursor `createdAt::id` decrescente; com uma só a paginação segue a dela (itens passaram a levar `createdAt`, que a resposta HTTP não expõe).
  A rota continua `fleet.read`: quem só tem `trip.manage` precisa de `fleet.read` para abrir a lista.
- `POST /address-correction-suggestions/:suggestionId/apply|dismiss` (`trip.manage`): aplicar é `applyGeocodedAddressCorrection` com o ponto
  sugerido, `origin 'operator'`, `source 'manual'`, ator = o operador (a trilha vira o evento 228); descartar só marca. Ambas travam a linha
  (`for update`), gravam `decided_by/decided_at` e uma linha em `audit_logs` (`address_correction_suggestion.applied|dismissed`) na mesma transação.
  Outra empresa ou inexistente: 404; já decidida: 409.
- Testes: contratos `pending-items` (mescla, permissão por fonte, filtro de empresa/pendente, rotas 200/404/403/rota não-UUID) e integração
  `address-suggestion-pending-items` (5: lista por empresa, aplicar com trilha e auditoria, descartar, tenant 404 nas duas decisões, 409 sem segunda
  gravação). Contrato 13185/0, integração dos arquivos tocados 6/0, typecheck, lint e prettier verdes.
