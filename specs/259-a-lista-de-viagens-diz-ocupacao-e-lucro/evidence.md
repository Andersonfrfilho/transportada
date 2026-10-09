# Evidência — Spec 259

## T1.1 — parecer do architect (opus), 2026-10-09

- Consultas por viagem hoje: `readContext` até 17; `loadTripOccupancy` até 7 (a última varre as caixas medidas da
  empresa inteira); `loadTripCargoWeight` 2. Página de 20 ingênua: ~340 de custo + ~180 de ocupação.
- Decisão: lote verdadeiro. Ocupação ~7 consultas por página; custo ~17 por página (dados da empresa uma vez).
  Reuso por viagem com concorrência rejeitado (varredura da empresa 20 vezes, disputa pelo pool).
- Não entra em lote: rota ao vivo do rascunho (`applyDraftTripLiveRoute`, OSRM). Lista marca lacuna.
- Riscos: paridade (usar viagem com rota congelada no teste), critério de notas da ocupação igual ao do detalhe
  (`trip_documents.nfe_document_id`, sem filtrar liberadas), custo calculado sem `trip.financials` (pular via
  `includeFinancials`), tempo da página de 20 (medir na T2.4).

## T3.1 — tipos e parser tolerante do painel, 2026-10-09

- `TripAmounts` ganha `costTotal`, `marginTotal`, `marginPercentage`, `hasGaps` (opcionais); `Trip.occupancySummary` recebe o `occupancy` do item (renomeado: o detalhe usa o mesmo nome com outra forma). `readTripListOccupancy` tolera ausência e lixo (ocupação malformada vira ausente, a lista segue); `amounts` com tipo errado ou chave desconhecida continua recusando.
- Contrato `test/trip/trip-list-parser.contract.ts` (resposta antiga e nova). `bun test ./test/trip.contract.test.ts`: 2814 pass, 0 fail (antes do commit); `bun run typecheck` limpo; eslint e prettier limpos nos arquivos tocados.

## T1.2 — teste de paridade lista × detalhe (falhando), 2026-10-09

- `apps/api-transportada/test/integration/trip-list-occupancy-financials.integration.ts` (novo, na lista `test:integration`):
  3 viagens com rota congelada (capacidade e peso conhecidos; `tractor_unit` sem carreta; sem veículo), lista montada com o
  `createTripUseCase` real contra Postgres, conferida contra `findById` (ocupação/peso) e `readTripValuation` (custo/margem).
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-list-occupancy-financials.integration.ts` →
  1 pass (o cenário prova algo: razão de peso e volume não nulas, `capacityUnknownReason` presente, custo > 0) e 1 fail
  pelo motivo certo: `item.occupancy` é `undefined` (esperado `{ volume, weight, capacityUnknownReason }` do detalhe).
- `bun run typecheck` → limpo. prettier + eslint do arquivo limpos.

## T3.2 — TripOccupancyBars, TripResultCell e colunas, 2026-10-09

- Colunas `occupancy` e `result` em `TRIP_COLUMN_KEYS`; `result` fica em `MONEY_COLUMNS` (some sem `trip.financials`, ordena pela margem numérica) e `occupancy` não ordena (sem botão de ordenação). Viagem cancelada mostra "—" nas duas.
- Percentual = `toOccupancyPercent` (`Math.round(razão × 100)`, a mesma conta do `TripCargoPanel`, que não foi alterado); marca `estimado` (fonte estimada) e `parcial` (fonte parcial ou nota sem medida); resultado marca `previsto` (receita não medida), `sem regra` (receita `missing`) e `parcial` (`hasGaps`). Prejuízo sai com a palavra "Prejuízo", não só cor.
- Contrato `test/trip/trip-list-cells.contract.tsx` (sem veículo, estimado, parcial, sem capacidade, acima do teto, prejuízo, sem permissão, colunas, ordenação); `amount-columns.contract.ts` atualizado. `bun test ./test/trip.contract.test.ts`: 2828 pass, 0 fail; typecheck e eslint limpos.

## T3.3 — lista do package.json do painel, 2026-10-09

- Os dois contratos novos (`trip-list-parser.contract.ts`, `trip-list-cells.contract.tsx`) entram por `test/trip.contract.test.ts`, que já está na lista explícita do `package.json` — não houve linha nova a acrescentar lá.
- `bun run test` do painel (script, não `bun test` cru): 7758 pass / 0 fail no passo principal e 1176 pass / 0 fail em `test:hooks`, exit 0.

## T2.1 — `readValuationContexts` em lote, 2026-10-09

- `DrizzleTripValuationQuery.readValuationContexts({ companyId, tripIds })` → `Map<tripId, TripValuationContext>`; leituras por
  viagem em `trip-valuation-batch.support.ts` (equipe, ajudantes, pedágio/avulso, taxas de entrega, esperas) e notas em
  `readDocumentsOfTrips`; combustível via `readEffectiveFuelPrices` (fatos da empresa 1x, preço por produto distinto em memória).
  Dados da empresa (diária geral, taxa de ajudante, taxas federais, perfis de ICMS) 1x por página. `readContext` não foi tocado.
- Integração (Postgres descartável) em `trip-list-occupancy-financials.integration.ts`: contexto em lote **igual** ao de
  `readContext` nas 3 viagens; **mesmo número de `select`s para 1 e para 20 viagens**; id de outra empresa não entra no mapa.
  Run: 4 pass, 1 fail (a paridade da T1.2, que só fecha na T2.3 — esperado).
- `test/trip-schema/tenant-safety.contract.ts` +4 testes (fonte): `bun test ./test/trip-schema.contract.test.ts` → 262 pass, 0 fail.
- Regressão: `trip-valuation-document-figures` + `trip-financial-end-to-end` integração → 10 pass, 0 fail.
- `bunx tsc --noEmit` limpo; eslint (--max-warnings=0) e prettier limpos nos arquivos tocados.

## T2.2 — `readTripListFinancials` e os campos de custo em `TripAmounts`, 2026-10-09

- `read-trip-list-financials.use-case.ts`: lê os contextos em lote e chama `buildValuationFromContext` por viagem (busca de regra
  memoizada com `memoizeRule`, agora exportada); `buildValuationFromContext` passou a pedir `Pick<TripValuationPort, 'findApplicableRule'>`.
- `TripAmounts` ganha `costTotal`, `marginTotal`, `marginPercentage` (money) e `hasGaps` (safe) em `TRIP_AMOUNTS_FIELD_POLICY` — opcionais
  no tipo: ausentes quando não se pediu custo (sem `trip.financials`) ou quando ele falhou naquela viagem.
- `list` recebe `includeFinancials` (rota: `canReadFinancials`); sem ele o custo nem é lido. `main.ts` injeta `financials`.
- Contratos: `test/trip-application/trip-list-financials.contract.ts` (novo, no entrypoint `trip-application.contract.test.ts`) — 7 testes
  (mesma conta do painel, memoização 2 viagens = 1 consulta de regra, falha isolada com log só de ids, classificação `money`, merge por
  `includeFinancials`). `list.contract.ts` ganhou `includeFinancials` nas 3 expectativas; os 2 contratos de texto de fonte do
  `trip-valuation.query.ts` (`crew-zone-wiring`, `icms-projection`) passaram de 2 para 3 pontos de leitura (a viagem em lote).
- `bun test ./test/trip-http.contract.test.ts ./test/trip-application.contract.test.ts ./test/trip-valuation.contract.test.ts` →
  829 pass, 0 fail. Integração `trip-list-occupancy-financials`: paridade de **custo e margem** verde (3 viagens, `costTotal`,
  `marginTotal`, `marginPercentage`, `hasGaps` e `revenueTotal` iguais ao `readTripValuation`); só a paridade de ocupação segue
  vermelha (T2.3). `trip-valuation-document-figures` → 7 pass.
- `bunx tsc --noEmit`, eslint (--max-warnings=0) e prettier limpos.

## T2.3 — ocupação em lote e `occupancy` na linha da lista, 2026-10-09

- `trip-occupancy.support.ts`: extraída a função pura `resolveTripOccupancyFromFacts` (e `hasKnownTripCapacity`,
  `resolveOccupancyReferenceKey`, `loadOccupancyCargoFacts`); `loadTripOccupancy` (detalhe) só lê e chama a função, com os **mesmos cortes**
  de leitura de antes (sem veículo / sem capacidade não lê carga). `trip-cargo-weight.support.ts`: `loadDocumentCargoWeights` devolve peso e
  origem por nota; `loadTripCargoWeight` passou a chamá-la (mesmas 2 consultas, mesmo resultado).
- `trip-list-occupancy.query.ts` (`readTripListOccupancies`): viagens + notas + veículos/carreta + referência + fatores + volumes + caixas
  medidas + peso = **10 consultas por página**, qualquer que seja o tamanho dela; viagem sem veículo → `null`; empresa alheia não entra.
  `Trip.occupancy?` (ausente = não calculada; `null` = sem veículo) → `TripListOccupancy` em `domain/trip-list-occupancy.policy.ts`;
  `TripDetail` passou a `Omit<Trip, 'occupancy'> & {...}` (a `occupancy` do detalhe é outro tipo e **não mudou**).
- Detalhe intocado, provado: 8 integrações de ocupação/planta/carreta/revisão (`trip-detail-query-count`, `trip-capacity-unknown-reason`,
  `trip-cargo-carrier`, `trip-cargo-layout-read`, `package-box-unit-estimate`, `trip-cargo-preview-layout`, `trip-repository`,
  `trip-document-review`) + a nova → **67 pass, 0 fail**; contratos `cargo-weight` + `cargo-volume` + `transaction-serial-queries` → 201 pass.
- Paridade de **ocupação e peso** lista × detalhe verde, agora com 4 viagens (inclui cavalo + carreta: capacidade `30.000000` e teto
  `5000.0000` são os da carreta). 3 integrações novas: mesmas consultas para 1 e 20 viagens, empresa alheia fora, sem veículo = `null`.
- Contratos: `occupancy-from-facts.contract.ts` (novo, 5 testes: órfã, cavalo sem carreta, carreta, fatos de mais notas = mesmo resultado,
  recorte da lista) e `list.contract.ts` +2 (sem `trip.financials` ainda serve `occupancy`; `null` sem veículo; chave ausente se não calculada).
  `bun test ./test/trip-infrastructure.contract.test.ts ./test/trip-http.contract.test.ts` → 424 pass.
- `bunx tsc --noEmit`, eslint (--max-warnings=0) e prettier limpos.

## T2.4 — isolamento de falha, aviso só de ids, medição do tempo, 2026-10-09

- `trip.use-case.ts`: `enrichTripPage` — receita (`amounts`) segue propagando falha; custo e ocupação rodam em `Promise.allSettled` e cada bloco
  que cai sai da página com `logger.warn` de `trip.list.financials_block_failed` / `trip.list.occupancy_block_failed` e metadados
  `{ companyId, errorName, tripIds }` (nunca mensagem de erro, valor ou nome). Por viagem: `readTripListFinancials` (try por viagem,
  `trip.list.financials_trip_failed`) e `assembleTripListOccupancies` (conta pura em try por viagem, `trip.list.occupancy_trip_failed`);
  a lista não chama a rota ao vivo do rascunho (OSRM). Códigos em `trip-list-enrichment.constant.ts`.
- Contratos novos: `trip-list-isolation.contract.ts` (5: tudo certo; ocupação cai; custo cai; as duas caem = lista de hoje; receita ainda propaga)
  e `assembleTripListOccupancies` (ficha corrompida sai do mapa com aviso só de ids, as outras seguem, sem veículo = `null`).
  `bun test` dos entrypoints trip-http + trip-application + trip-infrastructure + trip-valuation + trip-schema → 1184 pass, 0 fail.
- Fixture compartilhada extraída para `test/fixtures/trip-list-world.fixture.ts`; integração `trip-list-occupancy-financials` → 9 pass.
- **Tempo da página de 20 viagens** (Postgres local descartável, 3 notas por viagem, rota congelada; mediana de 15 execuções após aquecimento;
  máquina de desenvolvimento, não produção): hoje (só receita) **5,8 ms** → com custo + ocupação em lote **13,7 ms** (+7,9 ms, min 13,0 / max 17,4).
  Custo: leitura ingênua `readContext` × 20 em série **65,6 ms** contra **6,0 ms** em lote. Consultas: `readValuationContexts` **16** para 1 ou 20
  viagens (`readContext` sozinho faz 17 por viagem, ~340 numa página de 20); `readTripListOccupancies` **10**.
- `bunx tsc --noEmit`, eslint e prettier limpos.

## T2.5 — redação: sem `trip.financials` o JSON não tem custo, lucro nem margem, 2026-10-09

- `list-money-redaction.contract.ts` +5 testes: para `separator` e `viewer` o texto inteiro da resposta de `GET /trips` não contém `costTotal`,
  `marginTotal`, `marginPercentage` nem `hasGaps` (o `amounts` sai inteiro, como na spec 156 L6); para `finance`, `operator` e `company-admin`
  os quatro campos estão em `amounts`. Reforço no `list.contract.ts` (T2.3): `occupancy` não é dinheiro e segue para quem não tem `trip.financials`.
  A rota passa `includeFinancials: canReadFinancials`, então sem a permissão o custo nem é calculado (contrato `list.contract.ts`).
- Provado por mutação: trocar `canReadFinancials` por `true` na redação da rota reprova 5 testes (incluindo os 2 novos); revertido.
- `bun test ./test/trip-http.contract.test.ts` → 344 pass, 0 fail.
- **Fechamento da fase API**: `bun --env-file=../../.env.test run test` (suíte de contrato inteira da API) → 11071 pass, 25 skip, 0 fail
  (uma primeira execução teve 1 falha transitória em `test/deploy/keycloak-realm.contract.ts`, alheia a esta spec — não reproduziu em duas
  execuções seguintes); `bunx tsc --noEmit`, `bunx eslint src test --max-warnings=0` e prettier limpos.
