# Plano técnico — Spec 198

## Contexto e premissas

As decisões estão na `spec.md` (D1–D17) e na **ADR-0083**. O executor confere as premissas abaixo
antes de codar e anota arquivo:linha no `evidence.md`. **Se uma premissa divergir, ele para e
pergunta.**

1. **Base.** O commit do seletor (`describeTripSelectorPath`/`shortStopLabel`) já está em
   `origin/staging` (spec § Pré-requisito). Se não estiver, **pare**.
2. **Fix da coordenada da parada.** Rodar
   `git log origin/staging --oneline -S geocodedAddresses -- apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`
   e anotar o resultado. A 198 não toca `listStops`/`toDriverStop`.
3. **O jsonb `planned_route`.** Ele guarda `depot` inteiro
   (`drizzle-trip-planned-route.repository.ts:97-104`). Hoje `readPlannedRouteDepot` (:160-165) faz um
   _cast_ cego.
4. **Congelamento.** Todas as portas de congelamento passam por `freezeTripPlannedRoute`, pela
   composição `tripRouteTollFreezer` (`main.ts:1921`). Anotar o grep das cinco ocorrências: :1951,
   :2003, :2152, :2625 e :3721.
5. **Leitor de coordenadas.** `listTripStopCoordinates` usa `innerJoin`
   (`trip-stop-coordinates.support.ts:24-35`). Conferir se a 197 (RF10: irmãs como dois pontos com
   perna 0) já mudou esse arquivo.
6. **Validadores tolerantes.** O validador do `/minha-viagem` legado e o type guard da rota do painel
   (`tripResponse.validation.ts:~204`) ignoram campo a mais.
7. **Estado dos cartões na app.** Os cartões da app renderizam `delivered`/`returned` pelo snapshot,
   sem estado otimista da fila.
8. **Relógio e amostras.**
   - No canal do app, `trip_stops.arrived_at`/`completed_at` são a hora do servidor (composição em
     `main.ts`).
   - `captured_at` existe nos eventos do app.
   - `resolveServiceTime` não tem chamador fora do contrato.
   - Medir em staging a distribuição das durações válidas e das descartadas pelo piso e pelo teto
     (Q3).
9. **Painel.**
   - Qual conjunto de notas `buildTripProcessFlow` conta (vinculadas; `released`?).
   - `percent` de `resolveTripProgress` não tem leitor hoje.
   - Nota liberada (`released_at`) fica fora dos dois lados: na app o snapshot já filtra
     (`drizzle-current-driver-trip.repository.ts:723`), e no painel o filtro tem de ser explícito.
10. **Specs irmãs.** Rodar `git diff --name-only origin/staging...HEAD` e cruzar com a tabela da spec
    § Convivência, para saber o que já chegou da 192, 193, 196 e 197.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

**Rota: o que o congelamento grava**

- `src/trips/domain/route-depot.policy.ts`: o `RouteDepot` resolvido ganha
  `endSource: 'origin' | 'address' | null`. Entram também `ROUTE_END_KINDS` e `RouteEndKind`.
- `src/trips/infrastructure/route-depot.query.ts` (`readDepot`, :78-148) preenche `endSource`,
  comparando `endAddressKey` com `originKey.addressKey`, como :113-118 já faz.
- `src/trips/application/read-route-geometry.use-case.ts`: `RouteGeometryDepot` ganha
  `endKind: RouteEndKind | null`.
- `src/trips/infrastructure/trip-stop-coordinates.support.ts`: passa a devolver
  `{ points, excludedStopIds }`.
  - Os pontos continuam sendo só os geocodificados, então o traçado não muda.
  - Os ids excluídos vêm da mesma consulta, trocada para `leftJoin`, com o filtro feito em memória.
  - Se a 197 já estiver lá, as irmãs dela continuam como dois pontos com perna 0, sem mudança.
- `freeze-trip-planned-route.use-case.ts` e `drizzle-trip-planned-route.repository.ts`
  (`writePlannedRoute`): o jsonb ganha `excludedStopIds` no topo. `depot.endKind` já entra de carona,
  porque `depot` é gravado inteiro.

**Rota: o que a leitura lê**

- `src/trips/domain/parse-planned-route.policy.ts` ganha três parsers:
  - `parsePlannedRouteDepot`, com `endKind?`: valor fora da lista vira ausente;
  - `parseRouteLeg`;
  - `parseStopIdList`.

  `readPlannedRouteDepot` do repositório passa a usar `parsePlannedRouteDepot`.

- `src/trips/domain/driver-trip-route.policy.ts` + `driver-trip-route.types.ts`:
  `toDriverTripRoute(params)` é pura. Implementa RF2–RF4 e decide `first_stop`/`last_stop` pela lista
  de paradas em `sequence` menos as excluídas.
- `drizzle-current-driver-trip.repository.ts` → `listActiveTrips` (:205-277) ganha no mesmo
  `SELECT`:
  - as métricas `planned_*` e `plannedRouteFrozenAt`;
  - ``sql`${trips.plannedRoute} -> 'depot'` ``;
  - ``sql`${trips.plannedRoute} -> 'excludedStopIds'` ``;
  - ``sql`${trips.plannedRoute} -> 'legs' -> -1` ``.

  Nunca lê `planned_route` inteiro. **Não toca `listStops`/`toDriverStop`.**

- `find-current-driver-trip.use-case.ts`: `DriverTrip` ganha `route` e `stopTime`.
- `me-trip.routes.ts` (`serializeTrip`, :204-214): passa os dois adiante.

**Tempo de parada (D14–D17)**

- `src/trips/domain/stop-service-sample.policy.ts`: `toStopServiceSample` e
  `STOP_SERVICE_SAMPLE_BOUNDS = { minimumSeconds: 30, maximumSeconds: 7200 } as const`.
- `src/trips/domain/trip-stop-time.policy.ts`: `estimateTripStopTime` agrupa as amostras e chama
  `resolveServiceTime` por grupo.
  - A importação vem de `routing/domain`, na mesma app. Se o lint de fronteira recusar, a função
    pura sobe para `src/shared`, sem cópia.
- `src/trips/application/stop-service-time-estimate.port.ts`: `StopServiceTimeEstimatePort`.
- `src/trips/infrastructure/drizzle-stop-service-samples.query.ts`: uma consulta por empresa.
  - Seleciona as paradas com `completed_at` na janela, com `trip_id` e `address_key` (para achar
    as irmãs, D14).
  - Seleciona também os eventos `arrived`/`delivered`/`returned` do canal `driver_app`, com
    `captured_at` e `recorded_at`, e o `tax_id` do destinatário das notas.
  - O documento é normalizado com `normalizeTaxId` (`src/shared/tax-id.service.ts`) na política,
    não no SQL.
  - Não seleciona ator nem motorista.
  - Roda com `SET LOCAL statement_timeout` (`SERVICE_TIME_QUERY_TIMEOUT_MS`, 2 s), dentro de uma
    transação de leitura curta.
- `src/trips/infrastructure/cached-stop-service-time-estimate.adapter.ts`: um
  `Map<companyId, { expiresAt, estimates }>`.
  - TTL `SERVICE_TIME_CACHE_TTL_MS` (1 h), definido no `*.constant.ts` do módulo.
  - Relógio injetado.
  - `Promise` em voo dividida entre leituras simultâneas.
  - **Valor vencido serve enquanto recalcula:** depois do TTL, devolve o valor antigo na hora e
    dispara um recálculo só, em segundo plano.
  - **Fallback gracioso** (code-standart §7, catch local permitido): a falha ou o timeout da consulta
    é capturado no adaptador. Ele loga `warn` com `companyId` e o motivo (sem CNPJ), tira a `Promise`
    rejeitada do mapa e devolve o valor antigo ou `unavailable`.
  - O caso de uso omite `stopTime` com `unavailable`. O GET nunca cai por causa disso.
- `find-current-driver-trip.use-case.ts` recebe a porta pelo construtor e monta `stopTime`.
  - Os clientes de cada parada vêm do `recipientTaxId` que `listDocuments` já seleciona
    (`drizzle-current-driver-trip.repository.ts:697`), normalizado, sem consulta nova.
  - `stopCount` conta todas as paradas da viagem, inclusive as fora do traçado.
- `main.ts` compõe o adaptador, inclusive no caminho do WhatsApp (:833-840).
- Um índice aditivo `(company_id, completed_at)` em `trip_stops` entra **só** se o
  `EXPLAIN (ANALYZE, BUFFERS)` da T1.6 mostrar varredura cara, e com `rollback.sql`.

### App do motorista (`apps/frontend-driver`)

- `driverTrip.types.ts`: tipos `DriverTripRoute` (com origem e fim) e `DriverTripStopTime`, e os
  campos `DriverTrip.route?` e `DriverTrip.stopTime?`. O opcional é deliberado (D10), e o validador
  omite a chave em vez de gravar `undefined`.
- `driverTripResponse.validation.ts`: `toTripRoute` e `toTripStopTime` (RF11).
- `driverTripProgress.service.ts`: `computeDocumentProgress` (RF12). `computeTripProgress`, por
  parada, não muda.
- `driverRouteFormat.service.ts` (novo):
  - `formatRouteDistance`, com a regra de `driverStopDistance.service.ts:59`, sem o piso;
  - `formatDuration`, **cópia por valor** de
    `apps/frontend-transportada/src/modules/routing/shared/suggestionValuation.service.ts:149`. Leva o
    cabeçalho `/* Cópia por valor de … (ADR-0075 §7). */` e entra no mapa de
    `test/driver-trip/copy-by-value-header.contract.ts`.
- `driverTripRouteView.service.ts` (novo): `describeRouteEnds` e `buildTripRouteSummaryView`.
  `shortStopLabel` é exportado de `driverTripSelection.service.ts`.
- `DriverTripRouteSummary.component.tsx` (novo), `DriverTripSelector.component.tsx` e
  `DriverTripProgress.component.tsx` (legenda).
- Os locales pt-BR e en.
- `driverTrip.module.css`, só com `var(--…)` (CA17).

### Painel (`apps/frontend-transportada`)

- `src/modules/trip/shared/tripProgress.service.ts`: `resolveTripProgress` recebe `documents` e passa
  a calcular `percent` por nota, com piso (RF19).
  - Traz `settledDocuments`/`totalDocuments`.
  - O ritmo da previsão continua por parada.
- `TripDetail.component.tsx:803` passa `documents: trip.documents`.
- `TripProcessFlow.component.tsx` exibe a linha nova (RF20).
- Chaves novas em `trip.locale.json`/`.en`.

### Preview

- A API de demonstração é `apps/frontend-driver/scripts/driver-preview-api.ts`, versionada pela
  **T5.0 da 196**. Antes da T5.0, vale o arquivo do scratchpad apontado pelo `.claude/launch.json`.

## Contratos/API/eventos

```text
GET /me/trips/current                                   trip.read (sem mudança)
  trips[i].route:    null | { distanceMeters, durationSeconds,
                              lastLegDistanceMeters, lastLegDurationSeconds,
                              origin: {kind:'depot',name,address} | {kind:'first_stop',stopId},
                              end: {kind:'depot'|'address'|'unspecified'} | {kind:'last_stop',stopId},
                              excludedStopCount, isFromPreviousStopOrder? }
  trips[i].stopTime: null | {status:'measured',estimatedSeconds,stopCount}
                          | {status:'measuring',stopCount}

GET /trips/:id/route-geometry (painel)                  depot.endKind — aditivo
planned_route (jsonb)                                   depot.endKind?, excludedStopIds? — aditivos
```

Ordem de deploy, com um push por passo:

1. API.
2. App do motorista, depois do "pode subir".
3. Painel, depois do "pode subir".

## Dados, migration e rollback

- **Sem migration por padrão.** As duas chaves novas moram no jsonb, e o tempo de parada fica em
  cache de memória. A única exceção possível é o índice condicional da T1.6.
- **Sem backfill** (153 D8).
  - Rota antiga: `endKind` ausente → `unspecified`, e `excludedStopIds` ausente →
    `excludedStopCount: null`.
  - Viagem já despachada **não recongela** (o vínculo fica bloqueado a partir de `dispatched`,
    `trip-state.policy.ts:128-131`). Ela fica assim até fechar, salvo se a reordenação da 192
    recongelar.
- **Rollback:** reverter o commit da API. As chaves do jsonb ficam inertes, e a app lê `route`
  ausente como `undefined`.

## Segurança e tenant

- A política não muda. O `SELECT` novo usa o mesmo `WHERE`, e a consulta de amostras é por
  `companyId`.
- **Minimização** (RF6, CA01): da empresa, só nome, endereço fiscal quando ele é a origem, e os
  `kind`.
- **Sem dinheiro** (153 D10).
- **Tempo de parada** (D17): sem ator, sem motorista, sem chave de cliente na resposta (CA16).
- `docs/SECURITY.md`: o snapshot leva nome e endereço fiscal da empresa. Quando a empresa é ME ou
  empresário individual, esse endereço pode ser a casa do titular: aceito, porque é o endereço
  público do CNPJ.

## Idempotência e concorrência

Só leitura, sem escrita nova. `endKind` e `excludedStopIds` entram na escrita atômica que já existe.
O cache divide a `Promise` em voo e tira do mapa a que rejeitou. O recálculo em segundo plano é um
só por empresa.

## Observabilidade

- Um `debug` por recálculo do cache, com `companyId`, amostras válidas e descartes por motivo
  (canal, relógio misto, piso, teto, sem chegada) e o tempo da consulta. Sem CNPJ e sem motorista.
- Um `warn` quando a consulta falha ou estoura o `statement_timeout`, com `companyId` e o motivo,
  sem CNPJ.
- Rota ilegível vira `null` sem `warn`.

## Estratégia de testes

Contrato antes, visto vermelho.

- **API, contrato** (`bun --env-file=../../.env.test test --timeout 120000`):
  - `test/trip-domain/driver-trip-route.contract.ts` (CA02 e os casos extremos da rota);
  - `route-depot.contract.ts` e `route-geometry-depot.contract.ts` (`endKind`);
  - `stop-service-sample.contract.ts` e `trip-stop-time.contract.ts` (CA14);
  - o adaptador com relógio falso;
  - `test/driver-trip/current-trip.contract.ts` (estados de `route`/`stopTime`);
  - `test/driver-trip/me-routes.contract.ts` (CA01 negativo no corpo HTTP; CA16).

  Toda suíte nova entra no entrypoint da área. O `test/test-registry/declaration.contract.ts` lê o
  disco sozinho e só exige que `*.contract.test.ts` novo esteja no script `test`.

- **API, integração** (`bun --env-file=../../.env.test run test:integration`; sem o `--env-file`,
  **pula**):
  - `freeze-trip-planned-route.integration.ts`: `endKind` e `excludedStopIds`;
  - `route-depot-query.integration.ts`: `endSource`;
  - `me-trip.integration.ts`: `route`, `null`, outra empresa, `excludedStopCount`, `stopTime`
    `measured`/`measuring`, cache, e o CA01 negativo varrendo só `route`/`stopTime`.
- **App, contrato** (`bun run --cwd apps/frontend-driver test`):
  - `test/driver-trip/route-response.contract.ts` (novo, CA05);
  - `route-summary.contract.ts` (novo, CA07, CA08);
  - `progress.contract.ts` (CA06);
  - `trip-selection.contract.ts`;
  - `copy-by-value-header.contract.ts` (mapa);
  - `route-summary-tokens.contract.ts` (novo, CA17).

  As suítes novas entram em `test/driver-trip.contract.test.ts`.

- **App, smoke:** `driver-app.smoke.spec.ts`, com um CA novo. O CA12 existente só muda se quebrar.
- **Painel, contrato:** `test/trip/progress.contract.ts` (CA18, a mesma tabela do CA06).

## Riscos

- **Base atrasada.** A 198 depende de `work/driver-app` em `origin/staging`, e a T0.1 para sem isso.
- **Conflito de texto** com a 192, 193, 196 e 197 nos arquivos da tabela da spec. A verificação por
  `git diff --name-only` vai anotada no `evidence.md`.
- **Rotas antigas** mostram "com volta" e nenhum aviso de parada fora da conta. Viagem já despachada
  não recongela, então isso dura até ela fechar.
- **Parada fora da conta** revela uma rota parcial que já existia (item 4 do Problema). A conta
  prevista não muda aqui.
- **Poucas amostras no começo:** "ainda sendo medido" por semanas. É o pedido.
- **Relógio do aparelho:** o piso, o teto e a mediana absorvem o erro. Piso e teto sem calibração
  (Q3).
- **Cache por processo:** as réplicas divergem por até 1 h.
- **Porcentagem no painel:** mudar de parada para nota, e de `round` para piso, muda o número de
  viagens em curso. O `percent` não era exibido, então ninguém lia o número antigo.
