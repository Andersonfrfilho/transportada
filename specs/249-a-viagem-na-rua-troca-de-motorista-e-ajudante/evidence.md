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
