# Evidence

## Fase 2 — Painel (T2.1, T2.2)

**T2.1** (`2e3a5be4a`): contratos vermelhos em `test/trip/crew-transfer.contract.ts` (22 testes, módulo
`trip.contract.test.ts`) e `test/trip-hooks/crew-transfer-dialog.contract.ts` (4 testes, `test:hooks`).
Vermelho medido antes da implementação: 20 de 22 falhando, 4 de 4 falhando, e `tsc` reprovando só a
chave `transferCrew` ainda fora do tipo.

**T2.2** (`42cc15d94`): `TripCrewTransferDialog` (+ `TripCrewTransferOutcome`), `useTripCrewTransferDialog`,
`transferTripCrew` no cliente e no controlador (`trip.report-on-behalf`), `transferCrewMutation` (invalida
a viagem e `allowed-actions`), botão "Transferir tripulação" no `TripHeaderActions` por
`canOfferTripFieldAction({ action: 'transferCrew' })`, locales pt-BR e en.

- `bun run typecheck`: sem erros.
- `bun run lint`: 0 erros, 16 avisos (todos anteriores, nenhum em arquivo da spec 249).
- `bun run test` (script da app): 7255 pass / 0 fail em 36 arquivos, e 846 pass / 0 fail em `test:hooks`.

**Divergências em relação ao `plan.md`**:

1. `allowed-actions` não é um objeto de booleanos: `trip` é uma lista de nomes (`['cancel', 'defineCrew', ...]`).
   `transferCrew` entra como mais um nome nessa lista; ausente equivale a falso, que é o que a convivência com
   API antiga pede. O plano diz "chave `transferCrew` (boolean), no mesmo objeto de `defineCrew`".
2. `parseCrewTransfer` recusa chave desconhecida no resumo (`hasExactKeys`, regra da casa para o que atravessa a
   fronteira): se a API acrescentar um campo ao `transfer`, o painel precisa aceitá-lo antes.
3. Quem tem `trip.report-on-behalf` sem `fleet.read` (o `finance`) recebe a lista de motoristas vazia do painel
   (`useFleet` depende de `fleet.read`): o diálogo abre mas não oferece ninguém para escolher. Sem rota de
   leitura de tripulação por `trip.report-on-behalf` na API, isto é decisão de produto.

## Fase 3 — App do motorista (T3.1)

**Tarefa**: T3.1 — Texto do aviso de reatribuição e rótulos de recusa para viagem em andamento; teste de contrato.

**Mudanças**:

1. **Teste de contrato** (`test/driver-trip/trip-reassignment.contract.ts`):
   - Adicionado novo suite de testes descrevendo o comportamento da spec 249 D9
   - Testes verificam que `hasReassignedTrip` retorna `true` para viagem em `dispatched`, `in_transit` ou `on_delivery_route` que some da lista
   - A função já estava correta, os testes apenas formalizam o comportamento esperado

2. **Aviso de reatribuição** (`src/modules/driver-trip/locales/`):
   - **pt-BR**: "Esta viagem foi passada para outro motorista ou ajudante. O que você entregou e registrou fica com a viagem."
   - **en**: "This trip was transferred to another driver or helper. What you delivered and recorded remains with the trip."
   - Novo texto deixa claro que a transferência pode ocorrer com a viagem em andamento (spec 249 D1) e que os registros do motorista anterior permanecem

3. **Rótulos de recusa para ações offline** (`src/modules/driver-trip/locales/`):
   - **TRIP_NOT_OF_DRIVER (403)**:
     - **pt-BR**: "esta viagem foi transferida; peça ao escritório para registrar"
     - **en**: "this trip was transferred; ask the office to record it"
   - **TRIP_STOP_NOT_REACHABLE (404)**:
     - **pt-BR**: "esta parada foi removida da viagem; peça ao escritório para registrar"
     - **en**: "this stop was removed from the trip; ask the office to record it"
   - Estes erros agora explicam que a transferência é a causa e instruem o usuário a contatar o escritório

**Verificação**:

- **Testes**: 1255 pass, 0 fail — incluindo 3 testes novos para spec 249 D9
- **Typecheck**: 0 erros
- **Prettier**: Todos os arquivos JSON e TS formatados corretamente
- **Commit**: `dc4546128`

**Contexto da decisão**:

A spec 217 introduziu a detecção de reatribuição como desaparecimento da viagem da lista, para viagens em `draft` e `route_planned`. A spec 249 estende essa lógica para viagens que já saíram, em `dispatched`, `in_transit` ou `on_delivery_route`. A função `hasReassignedTrip` já estava genérica o suficiente para cobrir esses novos estados — só precisava formalização em testes.

Os textos foram ajustados para refletir que a viagem pode ser transferida enquanto está na rua, e que os registros anteriores permanecem com a viagem (conforme D9 da spec). Os rótulos de recusa agora deixam claro qual é o problema (transferência) e o que fazer (contatar escritório).

## API parte 1 — T1.2 (parcial), T1.3, T1.4

**Commits**: `cd0369a84` (contratos vermelhos) · `fd20121fa` (domínio e custo puro) · `fcc9aaf63` (migration).

**T1.2 (parcial)** — vermelho pelo motivo certo: módulo `trip-crew-cost.policy.js` inexistente e export
`isCrewTransferable` ausente; a grade de `allowed-actions` falhou por `transferCrew` não ser oferecido.
Contratos: `test/trip-valuation/crew-cost.contract.ts` (paridade com `buildValuationFromContext` em 10
cenários, origem da diária, lacuna, duração desconhecida, arredondamento, `antes + diferença = depois`),
grade de `trip-state.contract.ts` (140 → 160 células), janela em `crew-status.contract.ts`,
`allowed-actions` em `policy.contract.ts`. Ficam para a T1.5: `crew-transfer.contract.ts` e o
`separator-role.contract.test.ts` (dependem da rota).

**T1.4** — `trip-crew-cost.policy.ts` (`buildCrewCostParcels`, `summarizeCrewCost`,
`buildCrewCostDifference`, `resolveAllowanceDays` movida); `buildCostParcels` delega.
`isCrewTransferable` + `TRIP_ACTION.transferCrew` (sempre `unchanged` quando liberado; `cancelled` →
`TRIP_CANCELLED`, `completed` → `TRIP_COMPLETED`, antes do despacho → `TRIP_NOT_DISPATCHED`, que já
existia e já está no mapa de mensagens/HTTP). `allowed-actions` oferece `transferCrew` em `trip[]` com
`canReportInField` (permissão `trip.report-on-behalf` + viagem com motorista, a mesma porta de
`startRoute`). Expectativas existentes que mudaram por consequência (RF1): `dispatched`/`in_transit`
com finance agora `['startRoute','transferCrew']`; `on_delivery_route` com operator `['cancel',
'transferCrew']` e finance `['transferCrew']` (`test/trip-http/allowed-actions.contract.ts`).

**T1.3** — `drizzle/20261007114250_trip_crew_events/` (`migration.sql`, `rollback.sql`,
`snapshot.json` gerado por `db:generate`), trigger append-only, CHECKs de canal, motivo 1..500, forma do
retrato (`next_crew` com ao menos 1) e `cost_difference = cost_after − cost_before`; FK composta
`(company_id, trip_id)` com RESTRICT (a tabela é append-only); sem FK de `actor_user_id` (molde de
`trip_status_events`). Rollback recusa com transferência gravada. Asserção:
`test/database-migration/trip-crew-events.assertion.ts`.

**Gates**: `bun run typecheck` limpo · `bun run lint` limpo (`--max-warnings=0`) · `bun run test`
(contrato) 10408 pass / 25 skip / 0 fail · `make migration-test` 141 pass / 0 fail ·
`bun run db:check` ok.

## API parte 2 — T1.5, T1.6 e a linha do tempo

**Commits**: `9930e8c9c` (contratos vermelhos da rota, do caso de uso e da política) · `59831caa5` (rota,
caso de uso, repositório, auditoria) · `0c733be68` (contratos vermelhos da linha do tempo) · `7d1ead708`
(linha do tempo) · integração T1.6 (commit seguinte, com esta seção).

**T1.5 — vermelho pelo motivo certo**: `POST /trips/:id/crew-transfers` respondia 404 (rota ausente) em
20 dos 22 testes do contrato HTTP, `transferCrew is not a function` em 19 do caso de uso, e a política
pura não existia. `TripCrewUnchangedError` entrou com o contrato como vocabulário.

**T1.5 — implementação**: `POST /v1/trips/:id/crew-transfers` (`OFFICE_REPORT_POLICY`, ou seja
`trip.report-on-behalf`; `company-admin`, `operator` e `finance` alcançam, `separator` e `viewer` não).
Corpo estrito `{ driverIds (1..10), helperIds, reason (1..500) }`, 201 com `data.trip` (o mesmo
`serializeTripDetail` do `GET /trips/:id`) e `data.transfer` com só as seis chaves do contrato. O
repositório (`trip-crew-transfer.persistence.ts` + `-write.persistence.ts`, chamados por
`DrizzleTripRepository.transferCrew`) segue a ordem da Decisão T1.1: `SELECT trips … FOR NO KEY UPDATE`
→ `checkTripTransition(transferCrew)` → `trip_drivers` por `position` (igual ao pedido →
`TripCrewUnchangedError`) → um `SELECT fleet_drivers` e as duas diárias da empresa **em sequência** →
custo antes/depois em memória (`summarizeRosterCost` sobre `buildCrewCostParcels`/`buildCrewCostDifference`)
→ `DELETE`+`INSERT trip_drivers` → em `trips` só `updated_at` → MDF-e `authorized` + conjunto de
condutores mudou → `INSERT trip_crew_events` + `audit_logs` (`office.trip.crew-transfer`, ids opacos, sem
motivo nem nome) → `readTripDetail(transaction)`.

**Linha do tempo**: fonte nova `trip-timeline-crew.query.ts`, `kind: 'crew_transfer'`, prioridade 8, chave
opcional `crewTransfer: { reason, previousCrew[], nextCrew[], costDifference, mdfeDriverDivergence }`.
`costDifference` é dinheiro: a rota (`redactTimelineCosts`) a tira do objeto (chave ausente, nunca `null`)
sem `trip.financials`. Contratos: vocabulário, merge, tenant safety da fonte, corte por permissão.

**T1.6 — integração contra Postgres** (`createDatabaseProvider`, pool de 10, `prepare: false`, como em
produção): `trip-crew-transfer.integration.ts` (16), `…-concurrency.integration.ts` (4) e
`…-timeline.integration.ts` (4). Cobrem: custo com diárias diferentes (360,00 → 860,00 = +500,00;
860,00 → 320,00 = −540,00; `antes + diferença = depois` em centavos); ajudante que assume o volante
(role `driver`, posição 1); rota congelada, pedágio, ETA, `vehicle_id`, status, paradas e notas iguais
byte a byte (e nenhum `trip_status_events` novo); MDF-e (`authorized` + motorista trocado diverge;
`authorized` + só ajudante, `draft` ou ausente não); o motorista novo lê a viagem pelo vínculo e o antigo
deixa de vê-la; histórico com `jsonb` armazenado como `array` (não string) e lido de volta; append-only
(UPDATE e DELETE recusados); auditoria sem motivo nem nome; `TRIP_CREW_UNCHANGED` sem gravar nada;
reconferência da janela sob lock (inclusive cancelamento durante a espera); viagem de outra empresa → 404;
concorrência com a trava segurada por uma transação bloqueadora e `pg_stat_activity` mostrando as escritas
paradas no lock: pedidos idênticos (um vence, o outro `TRIP_CREW_UNCHANGED`), pedidos diferentes (os dois
valem em série e o histórico encadeia), e a transferência que espera em vez de passar por cima.

**Prova por mutação** (cada uma derrubou os testes esperados e foi desfeita): sem `FOR NO KEY UPDATE`
(3 de concorrência), `vehicle_id` junto no `UPDATE trips` (2), MDF-e sem exigir `authorized` (4), sinal da
diferença invertido (5), sem reconferir a janela (2), sem `TRIP_CREW_UNCHANGED` (2), cursor da fonte da
linha do tempo desligado (1, laço até o timeout).

**Divergências em relação ao `plan.md`**:

1. **Linha do tempo**: o `kind` é `crew_transfer`, como pedido, mas o conteúdo vai **aninhado** em
   `crewTransfer` (padrão de `addressChange`, spec 228) em vez de cinco chaves soltas no item — o painel
   valida chave exata, e chaves soltas obrigariam as outras nove fontes a emiti-las. `actor` é o
   `actorName` que todo item já tem. Sem `trip.financials`, `costDifference` some do objeto.
2. **O painel precisa publicar primeiro** (ADR-0081 §9): `apps/frontend-transportada/test/trip/timeline.contract.ts`
   compara `TRIP_TIMELINE_KINDS` com o arquivo da API e **fica vermelho (1 teste)** com o commit
   `7d1ead708` até a T2.3 acrescentar `crew_transfer` (e a chave `crewTransfer`). Em execução, o painel
   descarta o item de `kind` desconhecido em vez de reprovar a página (spec 206 D12), então o risco é de
   CI, não de tela. Esse commit não deve ir sozinho para `staging`.
3. Não há `shared/errors/codes.ts` neste repositório: o código estável (`TRIP_CREW_UNCHANGED`, 409) mora na
   classe de `trip.error.ts`, como todos os outros erros de `trips`, e o status HTTP é o do `ApiError`.
4. Não existe documento OpenAPI/Scalar nesta API (nenhum `openapi`/`scalar` em `src/`): não havia onde
   registrar a rota. A lista de rotas por permissão (`separator-role`, `finance-read`) foi atualizada.
5. `trip_crew_events.created_at` é gravado com `clock_timestamp()`, não com o `now()` padrão (início da
   transação): duas transferências serializadas pelo lock sairiam fora de ordem na linha do tempo.
6. `data.transfer` sai sempre com os valores de custo: os três papéis com `trip.report-on-behalf` têm
   também `trip.financials`, então a rota não corta nada ali.
7. A linha do tempo passou a ter dez consultas em `Promise.all` (o limite do pool é 10); a nota em
   `trip-timeline.query.ts` foi atualizada.
8. `refineCrewSize` foi extraída em `trip-request.schema.ts` (a mensagem do teto de dez pessoas se repetia
   duas vezes; a terceira cópia violaria a regra de strings repetidas).

**Gates** (`apps/api-transportada`, Postgres 18 nativo descartável; o Postgres do Docker do `.env.test` não
foi usado): `bun run typecheck` limpo · `bun run lint` limpo (`--max-warnings=0`) · `bun run test`
(contrato) 10473 pass / 25 skip / 0 fail · `bun run test:integration` completo, com
`DRIZZLE_TEST_DATABASE_URL` apontando para o banco nativo, **1163 pass / 1 skip / 0 fail** em 214
arquivos (os 24 testes novos entre os que passaram — nenhum em skip; o skip é anterior à spec) ·
`bun run db:check` ok. Não houve migration nova nesta parte.
