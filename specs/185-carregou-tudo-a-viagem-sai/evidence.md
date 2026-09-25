# Evidence — Feature 185

Registro por task: comando, saída relevante, commit.

## T1.1 — teste de `resolveDispatchReadiness`

Comando: `bun --env-file=../../.env.test test --timeout 120000 test/trips.contract.test.ts`
(de `apps/api-transportada`, antes da implementação).

Saída: `error: Cannot find module '../../src/trips/domain/dispatch-readiness.policy.js'` —
0 pass, 1 fail, 1 error. Falha esperada: o módulo ainda não existe.

Commit: `0fa359854` — test(trips): tabela de casos de resolveDispatchReadiness (spec 185 T1.1).

## T1.2 — implementação de `dispatch-readiness.policy.ts`

Comando: `bun --env-file=../../.env.test test --timeout 120000 test/trips.contract.test.ts`
→ `79 pass, 0 fail, 235 expect() calls`.

Comando: `bun --env-file=../../.env.test test --timeout 120000` (suíte de contrato inteira, de
`apps/api-transportada`) → `7237 pass, 23 skip, 0 fail, 24362 expect() calls` em 183 arquivos.

Comando: `bun run typecheck` (raiz) → sem erros nas seis apps (api, worker, cron, frontend,
frontend-client, frontend-landing).

Comando: `bunx eslint` e `bunx prettier --check` em `dispatch-readiness.policy.ts`,
`dispatch-readiness.contract.ts` e `trips.contract.test.ts` → ambos limpos (exit 0).

Integração não exercitada nesta fase — a função é pura, sem I/O (RF1 do spec.md).

Commit: `77f6879d4` — feat(trips): resolveDispatchReadiness, a conta pura da carga fechada
(spec 185 T1.2).

## T2.1 — teste de "a viagem segue sem a nota" no catálogo

Suítes: `test/trip-occurrence/leaves-document-behind-schema.contract.ts` (schema do PUT: ausente não
decide, aceita true/false, recusa não-booleano), `test/trip-occurrence/leaves-document-behind.contract.ts`
(caso de uso: entrega com `true` → 422 `OCCURRENCE_TYPE_LEAVES_BEHIND_REQUIRES_SEPARATION`) e
`test/integration/occurrence-type-leaves-document-behind.integration.ts` (Postgres). Falharam antes da
implementação (campo/coluna inexistentes).

Commit: `f71b5620a` — test(trips): catálogo aprende "segue sem a nota" (spec 185 T2.1).

## T2.2 — coluna, CHECK, GET/PUT

Migration `20260924201710_occurrence_type_leaves_document_behind` (aditiva: `ADD COLUMN ... boolean
DEFAULT false NOT NULL` + CHECK `stage = 'separation' or not leaves_document_behind`) com `rollback.sql`.
PUT no molde de `attachmentMode` (ausente = não mexe). Revisão do orquestrador: tipo que não é de
separação grava sempre `false` — mudar o estágio de um tipo marcado, sem mandar o campo, batia na
CHECK e virava 500; caso novo na integração, e a prova da CHECK passou a usar escrita direta.

Gates (banco nativo descartável 127.0.0.1:65433, PG 18.4):

- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-leaves-document-behind.integration.ts` → 4 pass, 0 fail
- `bun run db:test` (migration + rollback) → 110 pass, 0 fail
- `bun run db:generate --name probe` → `{"status":"no_changes"}`
- contrato inteiro `bun --env-file=../../.env.test test --timeout 120000` → 7243 pass, 23 skip, 0 fail
- integração inteira `bun --env-file=../../.env.test run test:integration` → 586 pass, 0 fail, 107 arquivos (318 s)
- `bun run typecheck` (raiz) limpo; eslint e prettier nos arquivos tocados limpos.

## T3.1 — teste de `loadRemaining` e da nota deixada para trás

Suítes: `test/integration/trip-dispatch-load-remaining.integration.ts` (Postgres, registrada em
`test:integration`), `test/trips/plan-and-dispatch.contract.ts` (caso de uso + corpo da rota:
`loadRemaining` + `force` → 400, `loadRemaining` não fura agendamento, deixadas para trás sem
`force`, viagem vazia recusada) e `test/trip-schema/tenant-safety.contract.ts` (a query de
prontidão carrega `companyId` em toda junção e filtra por empresa e viagem).

Antes da implementação (de `apps/api-transportada`, banco nativo 127.0.0.1:65433):

- integração do arquivo novo → 4 pass, 3 fail (CA04 `loadRemaining`, CA05 liberação com motivo, e
  a corrida de dois despachos: o segundo rejeitado — o 23505 do snapshot inserido antes do lock).
- `bun --env-file=../../.env.test test --timeout 120000 test/trips.contract.test.ts
test/trip-schema.contract.test.ts` → 184 pass, 7 fail, 1 erro (`ENOENT` de
  `dispatch-readiness.query.ts`, ainda inexistente).

Commit: `53a28dafb` — test(trips): despachar leva todas e libera o que a ocorrência deixa
(spec 185 T3.1).

## T3.2 — query de prontidão, `loadRemaining`, liberação por ocorrência e ordem lock/snapshot

- `trips/infrastructure/dispatch-readiness.query.ts`: uma consulta (`trip_documents` ⟕ ocorrência
  de separação de nota inteira — `product_code = ''` e `not exists` em
  `trip_document_occurrence_products` — ⟕ tipo com `leaves_document_behind`, `company_id` em todo
  degrau), alimentando `resolveDispatchReadiness`. `readPreconditions` devolve `toLoad`,
  `leftBehind`, `isCargoClosed`; `unloadedDocumentIds` = `toLoad`. "Ocorrência aberta" lida como
  ocorrência existente: `trip_occurrence_cases` só nasce com `redeliveryPolicy ≠ unset`, e
  `returned_to_warehouse` é terminal — filtrar pela tratativa devolveria a nota à conta.
- `dispatchTrip`: `loadRemaining` + `force` → 400 `TRIP_DISPATCH_LOAD_REMAINING_WITH_FORCE` (também
  no schema Zod, `refine` sobre o `.strict()`); agendamento só cede a `force`; `toLoad` sem
  `force`/`loadRemaining` → 409 como antes; `leftBehind` sempre liberado; deixadas para trás sem
  sobrar nota carregada → 409 `TRIP_HAS_UNLOADED_DOCUMENTS` com as notas (com `force`, despacho
  forçado e assinado, como era antes da spec 185).
- Motivo da deixada para trás: **no snapshot**, chave `leftBehind: [{ documentId, reason:
"Ocorrência: <tipo>" }]` (só quando há). `force_reason` não serve — a CHECK
  `forced = (force_reason is not null)` e o despacho não é forçado; `trip_document_events` também
  não — liberar não muda `separation_status` e a CHECK recusa evento sem transição. Sem migration.
- `loadRemaining`: `pending → separated → loaded` pela aresta de `checkTripDocumentTransition`,
  UPDATE guardado por status de origem e `released_at is null`, evento pelo escritor do lote
  (`insertTripDocumentBatchEvents`, exportado). Nota que uma escrita concorrente tirou do caminho
  → 409 e a transação desfaz. Sem status intermediário da viagem: ela vai direto a `dispatched`.
- **Ordem lock/snapshot (decisão):** notas primeiro (carregar, liberar — ADR-0068 §2, notas →
  viagem), depois `FOR NO KEY UPDATE` da viagem e reconferência de `checkTripTransition`, e só
  então snapshot, ETA e UPDATE por compare-and-set. `trip_dispatch_snapshots` tem unique
  `(company_id, trip_id)`: antes, o snapshot entrava antes do lock e o segundo despacho de uma
  corrida virava 23505/500. Reconferência `unchanged` (ou compare-and-set sem linha) **lança** um
  sinal interno que desfaz a transação inteira — nenhuma nota fica carregada/liberada por um
  despacho que não houve — e `DrizzleTripRouteRepository.dispatch` o converte em
  `{ tripStatus }`. A liberação também passou a ser guardada (`released_at is null` e status não
  carregado): nota carregada depois da leitura vai no caminhão.
- Rota `POST /trips/:id/dispatch`: corpo aceita `loadRemaining?: boolean`; resposta segue
  `{ data: { tripStatus } }`. Não há OpenAPI gerado neste repositório: o contrato é o schema Zod.
- Fakes de `readPreconditions` em `test/driver-trip/dispatch.contract.ts` e
  `trip-status-write-guard.integration.ts` ganharam os campos novos do port.

Gates (de `apps/api-transportada`, banco nativo 127.0.0.1:65433, PG 18.4):

- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-dispatch-load-remaining.integration.ts ./test/integration/trip-status-write-guard.integration.ts ./test/integration/trip-lifecycle.integration.ts`
  → 15 pass, 0 fail
- contrato inteiro `bun --env-file=../../.env.test test --timeout 120000` → 7253 pass, 23 skip,
  0 fail, 24391 expect() em 183 arquivos
- integração inteira `bun --env-file=../../.env.test run test:integration` → 593 pass, 0 fail,
  108 arquivos (307,8 s)
- `bun run typecheck` (raiz) limpo nas seis apps; `bunx eslint` e `bunx prettier --check` nos
  arquivos tocados limpos. Sem migration nesta fase.

Commit: `4354c77fa` — feat(trips): despachar leva todas e libera o que a ocorrência deixa
(spec 185 T3.2).

## T4.1 — teste de integração do gatilho automático (CA01, CA02, CA03)

Suítes novas: `test/integration/trip-auto-dispatch.integration.ts` (Postgres, registrada em
`test:integration`) cobrindo CA01 (linha), CA02 (lote), CA03 (parada sem agendamento bloqueia com
`stopIds`), "carregar sem fechar a carga" (sem `autoDispatch`) e a ocorrência de nota inteira
"segue sem a nota" na última pendente. `test/whatsapp-commands/operator-flow-actions.contract.ts`
ganhou 4 casos por dublê (carregar sem gatilho, carregar despachando, carregar com gate recusado,
"Todas as pendentes" despachando) provando a segunda mensagem ao operador. Atualizado também
`test/integration/whatsapp-operator-flow-actions.integration.ts`: wiring de `autoDispatchRepository`/
`autoDispatch` nas dependências compostas (mesmo molde de `main.ts`) e o cenário ponta a ponta de
uma nota só, que agora despacha sozinho ao carregar (ADR-0074 §1) — sem passar pelo botão manual.

Falha antes da implementação — de `apps/api-transportada`, com os arquivos de produção
temporariamente revertidos ao estado anterior (`try-auto-dispatch-trip.use-case.ts` inexistente,
`autoDispatchRepository`/`autoDispatch` não lidos pelos use cases), banco nativo 127.0.0.1:65433:

- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-auto-dispatch.integration.ts`
  → 1 pass, 4 fail (CA01/CA02/CA03/ocorrência: `autoDispatch` sempre `undefined`).
- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test test --timeout 120000 ./test/integration/whatsapp-operator-flow-actions.integration.ts`
  → 6 pass, 1 fail (o cenário ponta a ponta esperava "Carregamento registrado." na posição nova e
  recebia a mensagem de um turno anterior — sem o gatilho a viagem não despacha ao carregar).
- `bun test --timeout 120000 ./test/whatsapp-commands/operator-flow-actions.contract.ts`
  → 45 pass, 3 fail (as 3 mensagens de desfecho do gatilho nunca chegavam).

Commit: `69121c8c5` — test(trips): o gatilho automático despacha ao fechar a carga (spec 185 T4.1).

## T4.2 — `try-auto-dispatch-trip.use-case.ts` e a ligação nos chamadores

- `trips/application/try-auto-dispatch-trip.use-case.ts` (novo): `tryAutoDispatchTrip` lê
  `readPreconditions` do mesmo `DispatchTripPort` do despacho; fora de
  `route_planned|separating|loading`, ou com `!isCargoClosed`, devolve `undefined`; senão chama
  `dispatchTrip` sem `force`/`loadRemaining` — sucesso (inclusive `unchanged`, viagem já
  despachada) vira `{ outcome: 'dispatched' }`; `TripHasUnscheduledStopsError` vira
  `{ outcome: 'blocked', code: 'TRIP_HAS_UNSCHEDULED_STOPS', details: { stopIds } }`;
  `TripStateTransitionNotAllowedError` com `reason === 'TRIP_HAS_NO_ROUTE'` vira
  `{ outcome: 'blocked', code: 'TRIP_HAS_NO_ROUTE' }` (fallback gracioso, code-standart §7);
  qualquer outro erro propaga.
- Chamadores ligados (todos com o repositório de despacho já injetado — nunca `new` no use case):
  - `transition-trip-document.use-case.ts`: campo opcional `autoDispatchRepository`; só tenta
    quando `action === 'load'` e a escrita não foi `raced`/`unchanged` — idempotente e corrida
    perdida não disparam (quem venceu já tenta o próprio gatilho).
  - `transition-trip-documents-batch.use-case.ts`: mesmo campo; só quando `action === 'load'` e
    ao menos uma nota foi de fato `applied` (não só `unchanged`/`raced`/`blocked`).
  - `register-trip-occurrence.use-case.ts`: campo opcional `autoDispatch: { channel,
onBehalfOfDriverId?, repository }` — este caso de uso só registra ocorrência de separação
    (`OccurrenceTypeNotSeparationError` já barra o resto antes), por isso não há filtro extra de
    `stage`.
  - `trip-lifecycle.use-case.ts`: `document('load'|'separate')` e `batchStatus.execute` passam
    `dependencies.routeRepository` (já injetado, já `DispatchTripPort`) — `separate` recebe o
    parâmetro sem efeito, porque o use case só age em `load`.
  - `main.ts`: WhatsApp `loadDocument`/`batchTransition` (composição do operador) ganham
    `autoDispatchRepository: whatsappTripRouteRepository`; WhatsApp e painel `registerOccurrence`/
    `registerTripOccurrence` ganham `autoDispatch: { channel: whatsapp|backoffice, repository }`.
  - `register-operator-trip-flow-actions.ts`: `documentRouter` manda a confirmação da escrita e,
    numa segunda mensagem (`conversation-flow.md` §5, uma ideia por mensagem), o desfecho do
    gatilho — "Viagem despachada. 🚚" ou a frase de bloqueio
    (`OPERATOR_AUTO_DISPATCH_BLOCKED_MESSAGES`, `whatsapp-operator-flow.constant.ts`), tanto para
    carregar uma nota quanto para "Todas as pendentes".
- Resposta HTTP: `serializeTransitionResult`/`serializeBatchResult` (`trip.routes.ts`) acrescentam
  `autoDispatch` quando presente, sem tocar no formato existente; a rota de ocorrência já devolve o
  objeto inteiro do caso de uso, então `autoDispatch` chega de graça.
- Efeito colateral necessário: `test/integration/whatsapp-operator-flow-actions.integration.ts`
  tinha um cenário ponta a ponta (viagem de uma nota só) que despachava pelo botão manual depois de
  carregar — com o gatilho automático, a viagem já sai ao carregar, e a viagem some do menu de
  ações (`listWarehouseTrips` não lista `dispatched`); o teste foi ajustado para refletir a ordem
  nova (confirmação → "Viagem despachada." → "Esta viagem não está mais disponível." → menu raiz),
  sem o clique manual em "Despachar" (achado ao rodar o teste, não suposição).

Gates (de `apps/api-transportada`, banco nativo descartável 127.0.0.1:65433, PG 18.4):

- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-auto-dispatch.integration.ts`
  → 5 pass, 0 fail
- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test test --timeout 120000 ./test/integration/whatsapp-operator-flow-actions.integration.ts`
  → 7 pass, 0 fail
- `bun --env-file=../../.env.test test --timeout 120000` (contrato inteiro) →
  7257 pass, 23 skip, 0 fail, 24395 expect() em 183 arquivos
- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test run test:integration` (sem a
  variável, pula) → 598 pass, 0 fail, 109 arquivos (327 s)
- `bun run typecheck` (raiz) limpo nas seis apps; `bunx eslint` e `bunx prettier --check` nos
  arquivos tocados limpos.

Commit: `eb0240a24` — feat(trips): o gatilho automático despacha a viagem que fecha a carga
(spec 185 T4.2).

## T4.3 — concorrência do despacho (CA09)

Suíte nova: `test/integration/trip-auto-dispatch-concurrency.integration.ts` (registrada em
`test:integration`), com o banco, a viagem e os leitores em
`test/fixtures/trip-dispatch-race.fixture.ts`. Postgres real, `createDatabaseProvider` com pool de
**10 conexões** (`prepare: false` — com `createDrizzleProvider` cru a transação pode parar ociosa,
spec 137) e uma conexão à parte para olhar `pg_stat_activity`. As duas chamadas saem juntas por
`Promise.allSettled`, pelos casos de uso reais (`transitionTripDocument` com
`autoDispatchRepository` ligado; `dispatchTrip` com `loadRemaining: true`). Cada cenário roda **10
iterações**, uma viagem nova (empresa própria) por iteração, num banco descartável por cenário.

Cenários e o que cada iteração confere (status da viagem, linhas em `trip_dispatch_snapshots`,
eventos `→ dispatched` em `trip_status_events`, status das notas):

1. **Duas cargas das duas últimas notas, forçadas na trava da viagem** — 3 notas (1 `loaded`, 2
   `separated`). Ambas respondem sem erro, as duas com `autoDispatch = { outcome: 'dispatched' }`
   (a perdedora recebe o `unchanged`); `dispatched`, 1 snapshot, 1 evento, 3 notas `loaded`.
2. **Duas cargas, livres** — mesmo cenário sem costura: sem erro, ≥ 1 `dispatched` (a que lê a
   precondição antes da outra comitar não fecha a carga e volta sem `autoDispatch`), 1 snapshot,
   1 evento, notas `loaded`.
3. **Dois "leva todas", forçados na trava da nota separada** — 2 notas (1 `loaded`, 1
   `separated`). As duas transações param no `UPDATE` da nota; a perdedora acorda com 0 linhas,
   passa pela reconferência e devolve `{ tripStatus: 'dispatched' }`. 1 snapshot, 1 evento, nota
   `loaded`.
4. **Dois "leva todas" com precondição velha** — o duplo clique: as duas leituras de precondição
   antes de qualquer escrita, e a transação da segunda só começa depois que a primeira comitou.
5. **Dois "leva todas", livres.**

**Como a intercalação é garantida (sem `pg_sleep`, sem relógio):** nos cenários 1 e 3 uma
transação bloqueadora segura a trava disputada (`FOR NO KEY UPDATE` na viagem; na nota, no
cenário 3) e só solta depois que `pg_stat_activity` mostra **duas** conexões do banco com
`wait_event_type = 'Lock'` — prova de que as duas escritas chegaram à mesma trava ao mesmo tempo
(se não chegarem em 10 s, a iteração falha com `EXPECTED_2_LOCK_WAITERS`, nunca passa por sorte). No
cenário 1 uma barreira no `readPreconditions` do port do gatilho segura as duas cargas depois de
comitadas até as duas chegarem, para que ambas leiam a carga fechada. No cenário 4 a barreira é
nas duas leituras de precondição, e o `dispatch` do segundo espera o do primeiro terminar. Os
cenários 2 e 5 ficam sem costura, para as intercalações que o escalonador escolher.

**Decisão sobre o perdedor do botão:** devolve o status sem erro (`{ tripStatus: 'dispatched' }`,
200), não 409. É o que `dispatch()` já fazia na reconferência (`DispatchAlreadySettledSignal` →
`unchanged`) e o que o RNF pede ("`unchanged` na outra"); 409 fica para viagem cancelada/concluída.

**Defeito achado (cenário 4):** antes da correção, 4 pass / 1 fail — o segundo "leva todas"
rejeitava com `TripStateTransitionNotAllowedError` (`TRIP_ALREADY_DISPATCHED`, "The cargo already
left…", 409). Causa: `loadRemainingDocuments` lê o status da viagem **sem lock** e aplica a política
da nota antes da reconferência; quando a transação começa depois do vencedor comitar, a política da
nota via `dispatched` e recusava, enquanto a mesma corrida com transações sobrepostas (cenário 3)
respondia `unchanged` — dois desfechos para o mesmo duplo clique. O cenário 5 (livre) passou as 10
iterações antes da correção: a janela é estreita e só a intercalação forçada a expôs. Correção: se
despachar sobre o status lido ali já é `unchanged`, `loadRemainingDocuments` lança o
`DispatchAlreadySettledSignal` — a transação desfaz e o repositório devolve `{ tripStatus }`, igual à
reconferência. Viagem cancelada/concluída segue pelo caminho de antes (409). Sem 23505, sem
deadlock e sem evento duplicado em nenhum cenário.

Gates (de `apps/api-transportada`, banco nativo descartável 127.0.0.1:65433, PG 18.4):

- arquivo novo antes da correção → 4 pass, 1 fail (cenário 4, 409 acima)
- arquivo novo depois da correção, 3 vezes seguidas → 5 pass, 0 fail, 150 expect() (6,8 s ·
  6,0 s · 6,5 s)
- `trip-dispatch-load-remaining` + `trip-auto-dispatch` + `trip-status-write-guard` +
  `trip-lifecycle` → 20 pass, 0 fail
- contrato inteiro `bun --env-file=../../.env.test test --timeout 120000` → 7257 pass, 23 skip,
  0 fail, 24395 expect() em 183 arquivos
- integração inteira `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test run
test:integration` → 603 pass, 0 fail, 4101 expect() em 110 arquivos (338,3 s)
- `bun run typecheck` (raiz) limpo nas seis apps; `bunx eslint` e `bunx prettier --check` nos
  arquivos tocados limpos.

Commits: `76f0c0671` — test(trips): despacho concorrente sai uma vez (spec 185 T4.3);
`0fdcd04f8` — fix(trips): "leva todas" com a viagem já despachada responde unchanged
(spec 185 T4.3).

## T5.1 — teste de "sem Conferir carga" (CA07)

Levantamento antes de escrever o teste:

- `resolveTripLevelActions` (`trips/domain/trip-allowed-actions.policy.ts:130-147`) era o único
  ponto que oferecia `TRIP_ACTION.confirmLoad`, junto com `startRoute`, quando
  `canReportInField` e a máquina (`checkTripTransition`) aplicaria a transição — o que acontecia em
  `dispatched` (`confirmLoad` aplica `dispatched → in_transit`).
- `confirmLoad` também existe em `trip-state.policy.ts` (`TRIP_ACTION.confirmLoad`, `checkFieldStart`)
  e em `start-field-trip.use-case.ts`/`me-trip.routes.ts`/`trip-field-office-trip.routes.ts`
  (`FIELD_TRIP_STEP.confirmLoad`, uma constante à parte) — são o enum e as rotas que a spec pede para
  **manter**; só a oferta em `allowed-actions` sai.
- `GET /me/trips/current` (`find-current-driver-trip.use-case.ts`, tipo `DriverTrip`) **não** expõe
  nenhum campo de ações/capacidades — não lê `trip-allowed-actions.policy.ts` em nenhum ponto. Não há
  o que ajustar ali: registrado aqui porque a task pedia conferir.
- `rg -n "confirmLoad" test/` achou 7 arquivos: `test/trip-allowed-actions/policy.contract.ts` (a
  única afirmação de que `confirmLoad` é **oferecido** em `allowed-actions`) e mais seis que testam a
  rota `confirm-load`/o enum `FIELD_TRIP_STEP`/a transição pura (`checkTripTransition` com
  `TRIP_ACTION.confirmLoad`) — nenhum deles afirma oferta em `allowed-actions`, e nenhum muda com a
  spec 185 (RF7 mantém a rota aceita e idempotente).
- `test/integration/trip-detail-occurrence-marker.integration.ts:80-125` (spec 164 T15, regressão
  "byte a byte") compara `actionsAfter` com `actionsBefore` (antes/depois de abrir tratativa) — não é
  um valor fixo, então continua válido com ou sem `confirmLoad` na lista.

Ajuste (contrato existente, spec 156 D10): `test/trip-allowed-actions/policy.contract.ts`, teste "os
dois toques só quando a máquina aplicaria" virou "CA07: confirmLoad nunca é oferecido, mesmo quando a
máquina aplicaria (dispatched)" — antes esperava `dispatched.trip` igual a `['confirmLoad',
'startRoute']`, agora espera `['startRoute']` e `not.toContain('confirmLoad')`; `in_transit`
continua `['startRoute']` (inalterado).

Comando (de `apps/api-transportada`, antes da implementação):
`bun --env-file=../../.env.test test --timeout 120000 test/trip-allowed-actions.contract.test.ts`
→ 18 pass, **1 fail** — `expect(dispatched.trip).toEqual(['startRoute'])` recebeu
`['confirmLoad', 'startRoute']`. Falha esperada: a policy ainda oferece `confirmLoad`.

`POST /trips/:id/confirm-load` continuar 200/idempotente em viagem `dispatched` já tem prova viva que
não muda com esta spec (nada em T5.2 toca rota, caso de uso ou enum): unitário em
`test/field-trip-target/start-field-trip-driver.contract.ts:52-66` (`step: 'confirmLoad'` sobre
`dispatched` → `{ changed: true, tripStatus: 'in_transit' }`) e fiação HTTP em
`test/trip-field-office/routes.contract.ts:96-135` (`confirmLoadRoute!.execute` → 200, `{ data: {
changed: true, status: '...' } }`).

Commit: `917d65cb7` — test(trips): allowed-actions para de oferecer confirmLoad (spec 185 T5.1).

## T5.2 — a policy para de oferecer `confirmLoad`

`trips/domain/trip-allowed-actions.policy.ts`: em `resolveTripLevelActions`, `field` passa de
`[TRIP_ACTION.confirmLoad, TRIP_ACTION.startRoute]` para só `[TRIP_ACTION.startRoute]`, com comentário
citando a ADR-0074 §5. Nenhuma rota, caso de uso, enum (`TRIP_ACTION.confirmLoad`,
`FIELD_TRIP_STEP.confirmLoad`) ou máquina de estados (`checkFieldStart`) mudou — só o que a lista
**oferece**.

Gates (de `apps/api-transportada`, banco nativo descartável 127.0.0.1:65433, PG 18.4):

- `bun --env-file=../../.env.test test --timeout 120000 test/trip-allowed-actions.contract.test.ts`
  → 19 pass, 0 fail, 31 expect() calls
- contrato inteiro `bun --env-file=../../.env.test test --timeout 120000` → 7257 pass, 23 skip,
  0 fail, 24396 expect() em 183 arquivos
- integração inteira `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres
bun --env-file=../../.env.test run test:integration` → 603 pass, 0 fail, 4101 expect() em
  110 arquivos (330,17 s) — inclui `trip-field-office`, `field-trip-target`,
  `trip-detail-occurrence-marker` (regressão byte a byte da spec 164) e `me-trip`, todos verdes.
- `bun run typecheck` (raiz) limpo nas seis apps (api, worker, cron, frontend, frontend-client,
  frontend-landing).
- `bunx eslint` e `bunx prettier --check` em `trip-allowed-actions.policy.ts` e
  `policy.contract.ts` → limpos (exit 0).
- Frontend (fora do escopo desta fase, só para registrar): `bun run --cwd apps/frontend-transportada
test` → 51 pass, 0 fail, 206 expect() calls. Nenhum contrato do frontend dependia de `confirmLoad`
  vir da API — como esperado, a Fase 6 é quem mexe na tela.

Commit: `923fe31f8` — feat(trips): allowed-actions para de oferecer "Conferir carga" (spec 185 T5.2).

## T6.1 — contratos da tela (dispatchReadiness, frases de recusa, autoDispatch, catálogo, TripProcessFlow, campo novo da API)

**API — `leavesBehindOnDispatch` no detalhe da viagem:**

- `test/integration/trip-detail-leaves-behind.integration.ts` (novo, registrado em `test:integration`):
  viagem com 3 notas — uma com ocorrência "segue sem a nota" ainda pendente (`leftBehindId`), uma
  sem ocorrência (`untouchedId`), uma carregada com a mesma ocorrência (`loadedId`, D1: carregada
  continua carga). Antes da implementação, de `apps/api-transportada`
  (banco nativo 127.0.0.1:65433): `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test
test --timeout 120000 ./test/integration/trip-detail-leaves-behind.integration.ts` → 0 pass,
  1 fail (`leavesBehindOnDispatch` `undefined`, campo ainda não existe no tipo/serializador).

**Frontend — contratos novos/alterados** (`test/trip.contract.test.ts` ganhou os seis imports):

- `test/trip/dispatch-readiness.contract.ts` (novo): a mesma tabela de casos de D1
  (`dispatch-readiness.contract.ts` da API), restatada sobre `dispatchReadiness.service.ts`
  (ainda inexistente) — vivas × liberadas × devolvidas, ocorrência tira da conta só quando não
  carregada, zero carregada não fecha, campo ausente (API anterior) degrada para "conta como carga
  a levar".
- `test/trip/dispatch-feedback.contract.ts` (novo): `resolveDispatchBlockedFeedback`/
  `resolveDispatchErrorFeedback`/`resolveAutoDispatchFeedback` (`tripDispatchFeedback.service.ts`,
  ainda inexistente) — resolução do rótulo da parada a partir de `trip.stops`, o motivo "sem rota"
  batendo com `TRIP_TRANSITION_BLOCK_MESSAGES.TRIP_HAS_NO_ROUTE` da API, e o caminho `null` para
  erro sem relação com despacho.
- `test/trip/dispatch-confirm-dialog.contract.ts` (novo, leitura de fonte): `TripHeaderActions`
  conta pela regra pura de D1, confirma com `TripConfirmDialog` (nunca mais o `TripReasonDialog` de
  forçar), manda `loadRemaining` — e não oferece mais `confirmLoad`; `TripDetail`/`useTripWorkspace`
  sem `confirmLoadTripMutation`; `tripClient.service.ts` sem `confirmLoadTrip`, com `loadRemaining`
  no corpo do despacho.
- `test/trip/auto-dispatch-response.contract.ts` (novo) + `registered-occurrence-shape.contract.ts`
  (ganhou 3 casos): `transitionTripDocumentResultFromApi`/`batchStatusResultFromApi`/
  `registeredOccurrenceFromApi` aceitam `autoDispatch` ausente/`dispatched`/`blocked`, e recusam
  código fora do vocabulário.
- `test/trip/auto-dispatch-notice.contract.ts` (novo, leitura de fonte): `useTripWorkspace` captura
  `autoDispatch` nas três escritas (linha, lote, ocorrência) e expõe `autoDispatchOutcome`;
  `TripDetail` lê `resolveAutoDispatchFeedback`/`resolveDispatchErrorFeedback` e usa uma classe de
  sucesso (`successNotice`) diferente do alerta de erro.
- `test/trip/occurrence-catalog-leaves-behind.contract.ts` (novo): `OccurrenceTypeCatalogPanel` usa
  `Checkbox` (nunca `<input type=checkbox>`), condicionado a `TRIP_OCCURRENCE_STAGE.separation`, com
  `Tooltip` de dica; `tripClient.saveOccurrenceType` manda `leavesDocumentBehind`.
- `test/trip/process-flow.contract.ts` (reescrito): `TRIP_PROCESS_STAGES` ganha `dispatched` entre
  `loaded` e `delivered`; `buildTripProcessFlow` passa a receber `tripStatus` — a fase não vem de
  `separationStatus` nenhum (não existe `'dispatched'` ali), é a viagem inteira que a alcança
  (`total − returned`) quando o status chega a `dispatched|in_transit|on_delivery_route|completed`.
- `test/trip/client-and-controller.contract.ts` (ajuste de expectativa, não critério novo):
  `dispatchTrip({ tripId })` sem `force`/`loadRemaining` explícitos agora manda corpo vazio (`{}`),
  não mais `{ force: false, forceReason: null }` — efeito do `dispatchTrip` parar de inventar valor
  para o que não foi pedido (T6.2).
- `test/trip/separation-occurrence-button.contract.ts` (fixture): `leavesDocumentBehind: false`
  acrescentado ao `OccurrenceType` de teste — campo passou a obrigatório no tipo.

Antes da implementação (de `apps/frontend-transportada`): `bun run typecheck` falha em 4 arquivos
(`leavesBehindOnDispatch`/`leavesDocumentBehind` inexistentes nos tipos,
`dispatchReadiness.service`/`tripDispatchFeedback.service` inexistentes) e `bun run test` falha ao
resolver os módulos novos — falha esperada, T6.1 é só o contrato.

Commits: `00309b634` — test(trips): contratos da tela de despacho (spec 185 T6.1).

## T6.2 — implementação até os contratos passarem

**API (`leavesBehindOnDispatch`):** `trip.port.ts` (`TripDocumentDetail.leavesBehindOnDispatch:
boolean`, comentado como D1/RF9), `trip.mapper.ts` (`mapTripDocumentDetail` ganha o parâmetro
opcional, padrão `false`), `drizzle-trip.repository.ts` (`readTripDetail` chama
`readDispatchReadinessDocuments` + `resolveDispatchReadiness` — **uma consulta a mais, fixa para a
viagem inteira**, nunca por nota — e monta o `Set` de `leftBehind` para marcar cada documento),
`trip.routes.ts` (`serializeTripDocumentDetail` inclui o campo). Fixtures HTTP e do caso de uso
(`trip-http-payload.fixture.ts`, `trip-use-case.contract.ts`) ganharam `leavesBehindOnDispatch:
false` para compilar.

**Frontend — os sete pontos do plano:**

1. `dispatchReadiness.service.ts` (novo): cópia por valor de `resolveDispatchReadiness` da API —
   `{ isCargoClosed, leftBehindCount, toLoadCount }` a partir de `trip.documents`.
2. `TripHeaderActions.component.tsx`: `handleDispatchClick` sempre abre `TripConfirmDialog` (nunca
   mais `TripReasonDialog`/motivo); a mensagem é composta de três chaves i18n
   (`dispatchConfirmSimple`/`dispatchConfirmLoadRemaining`/`dispatchConfirmLeftBehind`, cada uma com
   pluralização própria do i18next — duas contagens independentes não cabem numa chave só);
   confirma com `onDispatch({ loadRemaining: readiness.toLoadCount > 0 })`. `tripClient.dispatchTrip`
   reescrito para só mandar `force`/`forceReason`/`loadRemaining` quando presentes (antes sempre
   mandava `force: false, forceReason: null`) — o tipo `DispatchTripInput` mantém os três campos.
3. "Conferir carga" removido de `TripHeaderActions` (botão, `canConfirmLoad`, seletor de motorista
   condicionado só a `canStartRoute` agora), `TripDetail.component.tsx`, `useTripWorkspace.hook.ts`
   (`confirmLoadTrip`/`confirmLoadTripMutation` inteiros) e `tripClient.service.ts`
   (`confirmLoadTrip`); locales sem `fieldActions.confirmLoad`.
   `rg -n "confirmLoad" apps/frontend-transportada/src` não acha nada em `modules/driver-trip` —
   conferido, o app do motorista nunca ofereceu o botão nesta base (só o enum/rota da API, que RF7
   mantém). `tripAllowedActions.validation.ts` **não mudou**: `'confirmLoad'` continua em
   `TRIP_ALLOWED_ACTIONS` de propósito (tolerância a API antiga), só que nada mais chama
   `canTrip('confirmLoad')`.
4. Frases de recusa: `tripDispatchFeedback.service.ts` (novo) —
   `resolveDispatchBlockedFeedback({code, stopIds?, stops})` resolve o rótulo de cada parada por
   `trip.stops.find(stop => stop.id === stopId)?.label ?? stopId`; `TRIP_HAS_NO_ROUTE` vira a frase
   fixa. Para o **botão manual**, `resolveDispatchErrorFeedback` lê `TripRequestError.details`
   (capturado agora em `tripClient.service.ts`: `readErrorDetails` extrai `error.details[]` da
   resposta) — `TRIP_HAS_UNSCHEDULED_STOPS` pelos `details[].field === 'stopId'`,
   `STATE_TRANSITION_NOT_ALLOWED` casando o texto de `details[].message` com a cópia por valor de
   `TRIP_TRANSITION_BLOCK_MESSAGES.TRIP_HAS_NO_ROUTE` (é o único sinal que a API expõe para esse
   motivo específico — `code` sozinho não distingue os motivos de transição bloqueada).
5. `autoDispatch`: `trip.types.ts` ganha `AutoDispatchOutcome`/`TripDispatchBlockedCode` (cópia de
   `TryAutoDispatchTripResult`) e o campo opcional em `TransitionTripDocumentResult`/
   `BatchStatusResult`/`RegisteredOccurrence`; `tripResponse.validation.ts` ganha
   `isAutoDispatchOutcome` e os três guards passam a aceitar a chave opcional (`hasKeys` em vez de
   `hasExactKeys`). `useTripWorkspace.hook.ts`: `autoDispatchOutcome` (estado) capturado no
   `onSuccess` de `transitionDocumentMutation`/`batchStatusMutation` e dentro de
   `registerFirst` (fluxo de foto da ocorrência de separação); invalidação da viagem acrescida ao
   fim do envio de fotos (o gatilho pode ter despachado). `TripDetail.component.tsx` renderiza
   `resolveAutoDispatchFeedback` num `<p>` com `styles.successNotice` (`--color-ready`) quando
   `dispatched`, `styles.alert` quando `blocked` — e a recusa do botão "Despachar" ganhou o próprio
   `<p>` com `resolveDispatchErrorFeedback` (com fallback para a tradução genérica quando o motivo
   não é um dos dois específicos).
6. `OccurrenceTypeCatalogPanel.component.tsx`: `Checkbox` "A viagem segue sem a nota" +
   `Tooltip` de dica, só quando `stage === TRIP_OCCURRENCE_STAGE.separation` (linhas existentes e no
   formulário de cadastro); `leavesDocumentBehind` sempre enviado no `onSave` (molde de
   `active`/`notifies`, nunca omitido). `occurrence.constant.ts`/`tripClient.service.ts`/
   `useTripWorkspace.hook.ts` ganharam o campo no tipo `OccurrenceType`/`saveOccurrenceType`.
7. `tripProcessFlow.service.ts`: `TRIP_PROCESS_STAGES` com `dispatched`; `buildTripProcessFlow`
   recebe `tripStatus`, calcula `reachedByDocumentStage` só para as 4 fases de nota
   (`DOCUMENT_STAGES`) e `dispatchedReached = isDispatched ? total − returned : 0` separado —
   `dispatched|in_transit|on_delivery_route|completed` marcam a fase. `TripProcessFlow.component.tsx`
   recebe `tripStatus` (de `trip.status`, `TripDetail.component.tsx`) e ganhou ícone próprio
   (`target`) para a fase nova.
8. Locales pt-BR (acentuado) e en: `feedback.hasUnscheduledStops`/`hasNoRoute`/`autoDispatched`,
   `stateActions.dispatchConfirm*` (título + 3 mensagens), `separationStatus.dispatched`,
   `occurrenceTypeCatalog.leavesDocumentBehind`/`leavesDocumentBehindHint` — e remoção de
   `stateActions.forceTitle`/`forceSubtitle`/`forceSubmit`/`forceReasonLabel` e
   `fieldActions.confirmLoad` (mortos com a remoção do diálogo/botão).

**Gates (de `apps/api-transportada`, banco nativo descartável 127.0.0.1:65433, PG 18.4):**

- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test test --timeout 120000
./test/integration/trip-detail-leaves-behind.integration.ts
./test/integration/trip-detail-query-count.integration.ts` → 5 pass, 0 fail, 54 expect() —
  a prova de "sem N+1" (contagem igual entre 1 e 40 paradas) continua batendo com a query nova.
- contrato inteiro `bun --env-file=../../.env.test test --timeout 120000` → 7257 pass, 23 skip,
  0 fail, 24396 expect() em 183 arquivos (a suíte `.integration.ts` não roda aqui, por desenho —
  `test/integration/trip-detail-leaves-behind.integration.ts` não casa `*.test.*`).
- integração inteira `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres
bun --env-file=../../.env.test run test:integration` → 604 pass, 0 fail, 4104 expect() em
  111 arquivos (338,58 s).

**Gates (de `apps/frontend-transportada`):**

- `bun run test` (contratos + `test:hooks`) → 5240 pass em 29 arquivos de contrato + 51 pass em
  hooks (30 arquivos ao todo), 0 fail, exit 0.
- `bun run typecheck` → limpo.
- `bun run lint` (eslint) → limpo (dois achados de asserção redundante corrigidos:
  `readErrorDetails` sem cast e `DOCUMENT_STAGES.indexOf(stage)` sem cast — o narrowing do
  `stage === 'dispatched' ? ... : ...` já exclui `'dispatched'` no ramo `else`).
- `bun run build` → build de produção completo, sem erro (avisos de chunk grande são pré-existentes,
  não desta mudança).

**Gates (raiz):** `bun run typecheck` limpo nas seis apps (api, worker, cron, frontend,
frontend-client, frontend-landing); `bunx prettier --check` nos 34 arquivos tocados/criados
(API + frontend) → limpo, exit 0 (7 arquivos precisaram de `--write` uma vez — quebras de linha do
Prettier em código recém-escrito — e o `--check` seguinte confirmou limpo).

**Decisões registradas aqui por não caberem em comentário:**

- **Rótulo da parada**: `resolveStopLabel` usa `trip.stops.find(...)?.label`, o mesmo rótulo
  derivado que a própria tela já usa em toda parte (`buildStopLabel`/endereço resolvido) — nunca uma
  segunda formatação. Parada que sumiu de `trip.stops` (não deveria acontecer, mas a resposta é
  externa) cai para o próprio `stopId`, nunca quebra a tela.
- **Motivo "sem rota"**: a API não expõe um código específico para `TRIP_HAS_NO_ROUTE` na resposta
  HTTP de erro de `STATE_TRANSITION_NOT_ALLOWED` (só `autoDispatch.code` tem esse luxo, porque nasce
  direto no caso de uso) — o cliente casa `details[].message` com a cópia por valor da frase fixa da
  API. É o único sinal disponível sem mudar o contrato da API, e a mudança de API desta fase foi
  proposital e pequena (só `leavesBehindOnDispatch`).
- **`autoDispatched` como aviso, não erro**: classe `successNotice` nova (`--color-ready`, mesmo
  corpo do `.alert`) e `role="status"` em vez de `role="alert"` — o leitor de tela não trata sucesso
  como interrupção.
- **`dispatchTrip` para de inventar valor**: o corpo passou a omitir `force`/`forceReason`/
  `loadRemaining` quando `undefined`, em vez de sempre mandar `force: false, forceReason: null`. Não
  muda o efeito (a API tem `.default(false)` para os dois), só o dado na rede — e é consistente com
  o resto do arquivo (`acceptMultiVehicleSuggestion` já fazia isso).

Prints (revisão de design, `web.md` §15) ficam para T7.1 — fora do escopo desta fase, como o brief
já registrava.

Commits: `b4d8e4385` — feat(trips): a tela do escritório despacha "leva todas" (spec 185 T6.2).

## T7.1 — revisão de design (web.md §15)

**Dois modos novos em `trip-smoke.helper.ts`** (`DocumentsMode` ganhou `'dispatch-flow'` e
`'dispatched'`, sem alterar os quatro existentes):

- `dispatch-flow`: viagem em `loading`, uma parada (`Galpao Central`) com duas notas `separated`
  (`DISPATCH_LOAD_DISPATCHED_DOCUMENT_ID`/`DISPATCH_LOAD_BLOCKED_DOCUMENT_ID`) e uma `pending` com
  `leavesBehindOnDispatch: true` (`DISPATCH_LEFT_BEHIND_DOCUMENT_ID`), mais uma segunda parada sem
  agendamento (`Cliente Via Norte`) citada pelo bloqueio. Novo mock de
  `POST /trips/:id/documents/:id/load` decide `autoDispatch` pelo id da nota — a "dispatched" fecha
  a viagem sozinha, qualquer outra recusa com `TRIP_HAS_UNSCHEDULED_STOPS` — sem precisar de estado
  mutável entre chamadas, porque cada print clica numa nota diferente (`nth(0)`/`nth(1)`).
- `dispatched`: viagem em `dispatched` com a nota já `loaded`; `allowed-actions` passou a devolver
  `trip: ['startRoute']` só neste modo, para "Iniciar rota" aparecer.

**`spec-185-prints.smoke.spec.ts`** (novo, fora do smoke da CI — só roda com
`PLAYWRIGHT_TEST_MATCH`): 20 PNGs (4 telas × claro/escuro × celular/desktop, mais o catálogo de
ocorrência) em `prints/`.

⚠️ **Duas armadilhas que custaram três rodadas de smoke:**

1. `canReadTrip` (`trip.constant.ts`) só aceita `fleet.read` ou `trip.report-on-behalf` — não existe
   permissão `trip.read`. A primeira tentativa usava `trip.read` e a tela caía em "Seu acesso atual
   não permite consultar as viagens" para as quatro primeiras telas.
2. O catálogo de ocorrência (Configurações da empresa) não tinha smoke nenhum te testasse antes
   desta task. `company-settings-smoke.helper.ts` fixa `access-control-allow-origin:
http://localhost:53000` — com `PLAYWRIGHT_FRONTEND_PORT=53185` (obrigatório aqui para não colidir
   com a porta de outra sessão) o navegador recusa a resposta por CORS. E, mesmo corrigindo o CORS,
   sob `VITE_SMOKE_AUTH_BYPASS=true` a identidade **nunca sai pela rede**: `fetchAuthMe`
   (`useAuthMe.query.ts`) lê `sessionStorage['transportada.smoke-auth-me']` direto — mockar só a
   rota `**/auth/me` (como as duas tentativas fizeram) deixa a leitura sem nada e a tela cai no
   assistente de cadastro fiscal em vez das abas, sem nenhum pedido a `/company-settings` sair. A
   correção final: dublê próprio no arquivo do spec (`'*'` de CORS, como `trip-smoke.helper.ts` já
   faz) mais o `addInitScript` de sessionStorage, e o corpo de `/company-settings` reaproveitado de
   `test/company-settings/company-settings.fixture.ts` (`COMPANY_SETTINGS_RESPONSE`) — um objeto
   reconstruído à mão reprovava `isSettingsResponse` e também derrubava a página para o assistente.

**Prints e revisão** (comparado par a par — campo com campo, botão com botão, diálogo com diálogo —
nos dois temas; nenhuma divergência achada, nenhuma correção necessária):

1. `dialogo-despachar-leva-todas-{mobile,desktop}-{dark,light}.png` — `TripConfirmDialog` reaproveita
   literalmente as classes `mdfeGate*` do `TripReasonDialog`/portão de MDF-e: mesmo overlay, mesma
   moldura, mesmo par de botões ("Fechar" fantasma + confirmação sólida). Título "Despachar a
   viagem", corpo com as duas frases concatenadas ("Separar e carregar 2 notas e despachar a viagem?
   1 nota com ocorrência sai da viagem."). Contraste do texto cinza sobre o fundo do diálogo ok nos
   dois temas. No celular o diálogo ocupa a tela cheia (`100vh`) por desenho (`web.md` §10: modal
   fullscreen em mobile) — o espaço em branco abaixo do texto é o comportamento esperado, não um
   vazamento.
2. `aviso-viagem-despachada-{mobile,desktop}-{dark,light}.png` — `successNotice` em `--color-ready`
   (verde), a mesma cor que o resto do módulo usa para "o que entra" (`CLAUDE.md` do app), bem acima
   do alerta vermelho que a mesma posição mostra em `bloqueio-*`. Legível nos dois temas.
3. `bloqueio-despacho-aguardando-agendamento-{mobile,desktop}-{dark,light}.png` — mesma posição,
   classe `.alert` (vermelho/laranja de alerta), frase "A viagem não saiu: Cliente Via Norte
   aguardando agendamento." com o nome da parada resolvido de `trip.stops`, igual ao padrão de
   `resolveStopLabel`.
4. `cabecalho-viagem-despachada-{mobile,desktop}-{dark,light}.png` — selo "DESPACHADA" no cabeçalho,
   fase "Despachada" (ícone `target`) alcançada na régua de progresso, e **nenhum** "Despachar" nem
   "Conferir carga" — só "Iniciar rota" (sólido) e "Cancelar viagem" (fantasma vermelho), igual ao
   par que as outras fases da viagem já usam. Sem rolagem horizontal no celular.
5. `catalogo-ocorrencia-segue-sem-nota-{mobile,desktop}-{dark,light}.png` — o `fieldset`/`legend`
   "No galpão" mostra o `Checkbox` "A viagem segue sem a nota" (com `Tooltip`) no tipo "Item
   avariado"; o de "Na rua" ("Cliente ausente") não mostra nada no lugar — a condicional de
   `type.stage === TRIP_OCCURRENCE_STAGE.separation` funciona exatamente como o código promete. O
   formulário "Cadastrar tipo novo" também mostra a caixa (nasce em "No galpão" por padrão) — mesmo
   componente, mesmo estilo, sem duplicação visual.

**Observação registrada, não é defeito de design:** as notas do modo `dispatch-flow`/`dispatched`
aparecem na lista pelo id cru (`00000000-0000-4000-8000-...`) em vez de um número de NF-e — a
fixture de teste não preencheu `nfeNumber`/`nfeSeries` para essas notas sintéticas (só
`STOP_CARD_*` tinha isso, da spec 181). É dado do dublê, não do componente: a mesma tela já mostra
"NF-e 901" quando o campo vem preenchido (ver `nota-marcada-listagem-*` da spec 164). Não corrigido
aqui para não inflar o escopo de T7.1 com uma fixture nova sem efeito na revisão pedida (diálogo,
avisos, cabeçalho, catálogo).

**Gates (de `apps/frontend-transportada`):**

- `bun run typecheck` → limpo.
- `bun run lint` (eslint) → limpo.
- `bun run test` (contratos + hooks) → 5240 pass em 29 arquivos de contrato + 51 pass em hooks,
  0 fail, exit 0 (sem regressão dos números da Fase 6).
- `PLAYWRIGHT_TEST_MATCH=spec-185-prints.smoke.spec.ts PLAYWRIGHT_FRONTEND_PORT=53185
PLAYWRIGHT_REUSE_EXISTING_API_SERVER=true VITE_API_URL=http://localhost:53001 bun run smoke` →
  20 pass, 0 fail (rodado em primeiro plano, sem tocar a porta 53000 de outra sessão).

Commit: `e189ef2b7` — test(trips): prints da revisão de design do despacho leva todas (spec 185
T7.1).

## Revisão de código — correções da API

Correções dos achados da revisão de código da spec 185, uma por commit (teste + correção juntos,
cada HIGH no seu). Cada correção de comportamento tem teste visto falhando antes dela — a contagem
"antes" de cada linha. Os controles (tratativa `recorded` no item 1, parada que ainda leva nota no
item 3) passam dos dois lados por desenho, e a integração do item 4 foi escrita depois da correção
(a prova de falha do item 4 é o contrato).

| #   | Achado                                                                                                   | O que mudou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Teste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Commit      |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | HIGH — "ocorrência aberta" era qualquer ocorrência                                                       | `dispatch-readiness.query.ts` ganhou `not exists` de tratativa terminal (junção com `company_id`). **Lista usada: `OCCURRENCE_CASE_TERMINAL_STATUSES` = `returned_to_warehouse`, `closed`, `cancelled`** (`occurrence-case-state.policy.ts`, a mesma do marcador `occurrence-case-marker.query.ts`). O detalhe da viagem (`readTripDetail`) já lia por esta mesma consulta — nenhuma segunda fonte. Tipo aposentado (`active = false`) continua valendo para a ocorrência já registrada: a marca é do tipo no momento do despacho, e aposentar não desfaz o registro — sem mudança de código.                                                                                                                                                           | `trip-dispatch-load-remaining.integration.ts`: os três terminais → a nota volta a `toLoad` e o despacho sem `force` recusa com 409 (antes: 1 fail); `recorded` → continua deixada para trás. `trip-detail-leaves-behind.integration.ts`: tratativa `cancelled` → `leavesBehindOnDispatch: false` (antes: 1 fail).                                                                                                                                                                       | `aa935a8c4` |
| 2   | HIGH — o gatilho podia fazer a escrita comitada responder erro (e pular o `settle` do `withFieldReport`) | `tryAutoDispatchTrip` não lança mais: `TripHasUnloadedDocumentsError` e `TripStateTransitionNotAllowedError` com `TRIP_CANCELLED`/`TRIP_COMPLETED` → `undefined`; qualquer outro erro → log `trip_auto_dispatch_failed` com só `{ companyId, tripId, errorCode }` (código da `ApiError` ou nome do erro — nunca a mensagem) e `{ outcome: 'blocked', code: 'TRIP_AUTO_DISPATCH_FAILED' }`. As escritas recebem `autoDispatch: { logger, repository }` (antes `autoDispatchRepository`); `TripLifecycleDependencies.logger` novo; `main.ts` passa o `logger` da aplicação nos cinco pontos. Idempotência: com o gatilho sem lançar, o `perform` sempre retorna e o `settle` sempre roda — provado por teste, sem mover o gatilho para fora do `perform`. | `test/trips/try-auto-dispatch.contract.ts` (novo, 8 casos; antes: 7 fail). `trip-auto-dispatch.integration.ts`: dublê de `dispatch` que lança erro genérico → lote responde `TRIP_AUTO_DISPATCH_FAILED`, notas `loaded`, viagem `loading`, sem snapshot, um log só com ids e código; ocorrência dentro de `withFieldReport` (molde de `main.ts`) com o mesmo dublê → reenvio com a mesma chave devolve a mesma ocorrência, uma linha só em `trip_document_occurrences` (antes: 2 fail). | `9009897de` |
| 3   | MEDIUM — gates contavam a nota que vai ser liberada                                                      | `readPreconditions` lê a prontidão primeiro e passa `excludedTripDocumentIds` (os de `leftBehind`) para `readRouteState` (nota viva sem parada) e `listUnscheduledStops` (parada esperando agendamento).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `trip-dispatch-load-remaining.integration.ts`: deixada para trás sem parada não vira `TRIP_HAS_NO_ROUTE`; parada ocupada só por ela não vira `TRIP_HAS_UNSCHEDULED_STOPS` (antes: 2 fail); controle — parada que agenda e ainda leva nota continua bloqueando.                                                                                                                                                                                                                          | `333646b81` |
| 4   | MEDIUM — toda ocorrência de separação tentava o gatilho                                                  | `registerTripOccurrence` só tenta com tipo `leavesDocumentBehind` sobre a nota inteira, e passa `leftBehindDocumentId`: o gatilho só segue se **esta** nota entrou em `leftBehind` (logo, não carregada). **Achado no caminho:** `findOccurrenceType` nunca lia `leaves_document_behind` — o campo chegava `undefined` ao caso de uso; passou a ler.                                                                                                                                                                                                                                                                                                                                                                                                    | `try-auto-dispatch.contract.ts`: parcial, tipo que só anota e nota já carregada em viagem toda carregada não despacham (antes: 3 fail); a que entra em `leftBehind` despacha. `trip-auto-dispatch.integration.ts`: ocorrência "segue sem a nota" sobre nota `loaded` numa viagem toda carregada em `loading` → sem `autoDispatch`, viagem continua `loading`.                                                                                                                           | `350341f7e` |
| 5   | MEDIUM — WhatsApp não avisava o desfecho da ocorrência                                                   | Depois de "Foto 1 anexada", segunda mensagem com `describeAutoDispatchOutcome(registered.autoDispatch)`; `TRIP_AUTO_DISPATCH_FAILED` → "A viagem não saiu sozinha — use Despachar." (constante em `OPERATOR_AUTO_DISPATCH_BLOCKED_MESSAGES`, agora `Record<TryAutoDispatchTripBlockedCode, string>`).                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `operator-flow-actions.contract.ts`: `dispatched` e `TRIP_AUTO_DISPATCH_FAILED` chegam depois de "Foto 1 anexada" (antes: 2 fail); sem gatilho, só a confirmação.                                                                                                                                                                                                                                                                                                                       | `3d884fb97` |
| 6   | MEDIUM — `force` sem integração depois da reordenação de `dispatch()`                                    | Só teste (o comportamento já estava certo).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `trip-dispatch-load-remaining.integration.ts`: `force` + motivo pelo canal `whatsapp` libera a pendente e a separada (`stop_id` nulo), apaga as duas paradas que esvaziaram, snapshot `forced = true` com `force_reason` e só a parada que ficou, evento de status com ator e canal `whatsapp`.                                                                                                                                                                                         | `e667930f5` |
| 7   | LOW — `leftBehind` do snapshot vinha da precondição                                                      | `releaseUnloadedDocuments` devolve os ids do `RETURNING` do UPDATE guardado; o snapshot grava `leftBehind` só dessas notas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `trip-dispatch-load-remaining.integration.ts`: deixada para trás carregada depois da leitura vai no caminhão e não aparece em `snapshot.leftBehind` (antes: 1 fail).                                                                                                                                                                                                                                                                                                                    | `b8637d136` |
| 8   | LOW — resposta da carga dizia `loading` com `autoDispatch.dispatched`                                    | `transitionTripDocument`/`transitionTripDocumentsBatch` devolvem `tripStatus: 'dispatched'` quando o gatilho despachou.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | CA01/CA02 em `trip-auto-dispatch.integration.ts` conferem `result.tripStatus` (antes: 2 fail).                                                                                                                                                                                                                                                                                                                                                                                          | `5362a3030` |
| 9   | LOW — comentários errados                                                                                | `stillUnloaded` (a nota liberada **não** é o caso: o filtro é `released_at is null`) e o JSDoc de `forced` que estava colado em `documentsToLoad`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `0f3ef6dd6` |
| 10  | LOW opcional — gatilho lê a prontidão barata primeiro                                                    | **Não feito.** Pede um método novo em `DispatchTripPort` — muda todo dublê do port e a barreira do cenário 1 de `trip-auto-dispatch-concurrency.integration.ts`, que segura as cargas justamente no `readPreconditions` do gatilho. Não é "simples"; fica registrado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —           |

**Para a próxima leva (frontend/docs):**

- Código novo em `autoDispatch.code`: `TRIP_AUTO_DISPATCH_FAILED` (`{ outcome: 'blocked', code }`, sem
  `details`). `isAutoDispatchOutcome`/`TripDispatchBlockedCode` do frontend recusam código fora do
  vocabulário — precisam aprender este, com frase própria ("A viagem não saiu sozinha — use
  Despachar." no WhatsApp).
- `tripStatus` da resposta de carregar (linha e lote) já vem `dispatched` quando o gatilho despachou.
- Texto en "with an open case": com a correção 1, "aberta" passou a significar "sem tratativa ou
  tratativa fora de `returned_to_warehouse`/`closed`/`cancelled`" — a frase continua verdadeira; não
  foi mexida (é do frontend).
- `returned_to_warehouse` entra como terminal por ser a constante do domínio (decisão do
  orquestrador): ocorrência cuja tratativa foi devolvida ao barracão deixa de tirar a nota da conta.

**Gates (de `apps/api-transportada`, Postgres nativo descartável 127.0.0.1:65433, primeiro plano):**

- contrato inteiro `bun --env-file=../../.env.test test --timeout 120000` → 7272 pass, 23 skip,
  0 fail, 24424 expect() em 183 arquivos (23,4 s)
- integração inteira `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres bun
--env-file=../../.env.test run test:integration` → 615 pass, 0 fail, 4154 expect() em 111
  arquivos (351,2 s)
- `bun run typecheck` (raiz) → exit 0 nas seis apps
- `bunx eslint` e `bunx prettier --check` nos 22 arquivos tocados → limpos (exit 0); `rg` de
  `console.log|debugger|TODO|HACK` nos arquivos tocados → nada

## Revisão de código — correções do frontend e documentação

Correções dos achados de frontend e da atualização de documentação da spec 185 (T7.2), depois da
leva da API acima. Achados `A*` são do frontend (um commit); achados `D*` são de documentação —
`CLAUDE.md` da API, `docs/ai-context/*`, três ADRs e comentários de `trip-state.policy.ts` (outro
commit, comentário/doc só, sem mudança de comportamento).

| #   | Achado                                                                         | O que mudou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Teste                                                                                                                                                                                                                                                                                | Commit      |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| A1  | MEDIUM — o aviso de `autoDispatch` sobrevivia a outra ação na viagem           | `dispatchMutation`/`cancelMutation`/`planRouteMutation` (`useTripWorkspace.hook.ts`) limpam `autoDispatchOutcome` (`setAutoDispatchOutcome(undefined)`) no próprio `onSuccess` — um bloqueio antigo ("A viagem não saiu: …") não sobrevive a um despacho manual, cancelamento ou replanejamento de rota bem-sucedidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `test/trip/auto-dispatch-notice.contract.ts` (3 casos novos, leitura de fonte: cada mutation contém `setAutoDispatchOutcome(undefined)` no próprio bloco).                                                                                                                           | `6be3fea52` |
| A2  | MEDIUM — o diálogo "Despachar" prometia a frase errada, por concatenação de TS | `resolveDispatchConfirmMessage` (`tripDispatchFeedback.service.ts`, novo) decide uma chave i18n só por caso — `TripHeaderActions.component.tsx` não concatena mais duas traduções. O caso combinado (`toLoad` e `leftBehind` > 0) encaixa as duas contagens no locale por _nesting_ do i18next (`dispatchConfirmLoadRemainingWithLeftBehind`, texto idêntico ao das prints do T7.1). Dois casos novos: nada a carregar mas sobra nota carregada e nota(s) deixada(s) para trás (`dispatchConfirmLeftBehindOnly`) e nenhuma nota carregada, tudo deixado para trás (`dispatchConfirmNothingToCarry` — o despacho recusaria com 409 `TRIP_HAS_UNLOADED_DOCUMENTS`, então o diálogo não promete "Despachar?"). O mesmo erro HTTP no botão manual ganhou frase própria em `resolveDispatchErrorFeedback` (`hasNoCargoToDispatch`), no lugar do genérico "Há notas ainda não carregadas" (que mentiria: não sobra nota para carregar, a viagem ficaria vazia). | `test/trip/dispatch-feedback.contract.ts` (5 casos novos de `resolveDispatchConfirmMessage` + 1 de `TRIP_HAS_UNLOADED_DOCUMENTS`); `test/trip/dispatch-confirm-dialog.contract.ts` (ajustado: verifica `resolveDispatchConfirmMessage`, não mais as três chamadas `t(...)` antigas). | `6be3fea52` |
| A3  | LOW — o botão calculava `loadRemaining` pela contagem do cliente               | `handleDispatchConfirm` manda `onDispatch({ loadRemaining: true })` sempre — no servidor é no-op sem nota pendente; a contagem do cliente só decide o texto do diálogo agora, nunca o parâmetro da chamada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `test/trip/dispatch-confirm-dialog.contract.ts` (mantido: `loadRemaining` continua no corpo de `onDispatch`, sem condicional).                                                                                                                                                       | `6be3fea52` |
| A4  | Para a próxima leva (achado 2 da API) — código novo sem vocabulário no cliente | `TRIP_DISPATCH_BLOCKED_CODES` ganhou `TRIP_AUTO_DISPATCH_FAILED`; `resolveDispatchBlockedFeedback` devolve `autoDispatchFailed` ("A viagem não saiu sozinha — use Despachar."), sem exigir `stopIds`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `test/trip/dispatch-feedback.contract.ts` (`resolveDispatchBlockedFeedback`/`resolveAutoDispatchFeedback` com o código novo); `test/trip/auto-dispatch-response.contract.ts` (a validação aceita o código sem `details`).                                                            | `6be3fea52` |
| A5  | LOW — tipo sem uso                                                             | `ConfirmLoadTripInput` removido de `trip.types.ts` — `rg -n "ConfirmLoadTripInput" src test` confirmou zero uso fora da própria declaração antes de remover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                                                    | `6be3fea52` |
| D1  | Doc — `apps/api-transportada/CLAUDE.md`                                        | "Quatro transições manuais" → três; parágrafo com o despacho automático (gatilho, códigos de bloqueio, `loadRemaining`, `force`+`loadRemaining` → 400); parágrafo novo sobre a ordem de trava de `dispatch()`, `DispatchAlreadySettledSignal` e a fonte única da conta (D1); nota no `confirm-load` (não oferecido em `allowed-actions`, ADR-0074 §5); exceção opt-in da ADR-0074 §4 na seção da spec 164 ("a nota nunca é presa").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `bun --env-file=../../.env.test test --timeout 120000` (contratos que leem o CLAUDE.md continuam verdes, mesma contagem).                                                                                                                                                            | `5e4773ba7` |
| D2  | Doc — `docs/ai-context/api-transportada.md`                                    | (~91-93, ~111-113): mesma correção das "quatro transições manuais"; `dispatched` passa a significar "carga fechada" (ADR-0074 §6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | idem D1.                                                                                                                                                                                                                                                                             | `5e4773ba7` |
| D3  | Doc — `docs/ai-context/frontend-transportada.md`                               | (~256): trecho do "diálogo de despacho forçado" marcado obsoleto (riscado, mantido para histórico), com o texto atual logo acima (`TripHeaderActions`, `dispatchReadiness.service.ts`, `tripDispatchFeedback.service.ts`, sem `force` e sem "Conferir carga" na tela).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `bun run test` do frontend (arquivo não é lido por contrato nenhum — a app CLAUDE.md que os contratos leem não mudou; verde sem regressão, 5252+51 pass, já rodado na leva A).                                                                                                       | `5e4773ba7` |
| D4  | Doc — `apps/api-transportada/src/trips/domain/trip-state.policy.ts`            | Comentário de `checkTripTransition` (~233) explica que `dispatch` serve os dois chamadores (botão e gatilho, mesma política); comentário de `tripNotDispatched` (~45-47) marca `confirmLoad` como legado (ADR-0074 §5). Só comentário — sem mudança de comportamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `bun --env-file=../../.env.test test --timeout 120000` (mesmos 7272 pass, 0 fail — comentário não muda teste nenhum).                                                                                                                                                                | `5e4773ba7` |
| D5  | Doc — três ADRs                                                                | `docs/adr/0043-a-nota-anda-pela-viagem.md` e os dois `docs/adr/0058-*.md` ganharam a linha "Revisada por ADR-0074 (despacho derivado quando a carga fecha)" no cabeçalho/metadados; corpo de cada ADR intacto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                    | `5e4773ba7` |

**Gates (de `apps/frontend-transportada`, primeiro plano):**

- `bun run test` (contratos + hooks) → 5252 pass em 29 arquivos de contrato + 51 pass em hooks,
  0 fail, exit 0 (era 5240+51 antes desta leva — os 12 casos novos dos achados A1/A2/A4).
- `bun run typecheck` → limpo.
- `bun run lint` (eslint) → limpo.
- `bun run build` → build de produção completo, sem erro (avisos de chunk grande pré-existentes).

**Gates (de `apps/api-transportada`, Postgres nativo descartável, primeiro plano):**

- `bun --env-file=../../.env.test test --timeout 120000` → 7272 pass, 23 skip, 0 fail,
  24424 expect() em 183 arquivos (22,8 s) — os mesmos números da leva anterior: comentário e
  `CLAUDE.md` não mudam contagem de teste.

**Gates (raiz):**

- `bun run typecheck` → exit 0 nas seis apps (api, worker, cron, frontend, frontend-client,
  frontend-landing).
- `bunx prettier --check` nos arquivos de documentação tocados (CLAUDE.md da API, os dois
  `docs/ai-context/*`, os três ADRs) → limpo, exit 0.
- `bunx eslint`/`bunx prettier --check` nos arquivos do frontend tocados → limpos; `rg` de
  `console.log|debugger|TODO|HACK` nos arquivos tocados do frontend → nada.

**Documentação atualizada nesta leva:** `apps/api-transportada/CLAUDE.md`,
`docs/ai-context/api-transportada.md`, `docs/ai-context/frontend-transportada.md`,
`apps/api-transportada/src/trips/domain/trip-state.policy.ts` (comentários),
`docs/adr/0043-a-nota-anda-pela-viagem.md`,
`docs/adr/0058-a-viagem-comeca-e-termina-por-toque-do-motorista.md`,
`docs/adr/0058-o-motorista-abre-a-porta-do-despacho.md`.

**Veredito:** Revisão reexecutada — ver seção seguinte.

## Re-revisão de código (code-reviewer, opus) — APROVADO COM RESSALVAS

Os 2 HIGH, os 6 MEDIUM e os LOW da primeira revisão foram verificados como corrigidos no código;
nenhum achado novo acima de LOW. LOW novos:

- **N2 (corrigido):** com nenhuma nota indo na viagem, o diálogo oferecia "Despachar" (clique que
  sempre dá 409). Agora o confirmar vira "Entendi" e só fecha
  (`DISPATCH_CONFIRM_NOTHING_TO_CARRY_KEY`); contrato em `test/trip/dispatch-feedback.contract.ts`.
- **N4 (corrigido):** ADR-0074 §2 e §4 registram `TRIP_AUTO_DISPATCH_FAILED`, o sentido de "aberta" e
  a exclusão da nota deixada para trás dos gates.
- **N1 (conhecido, não corrigido):** corrida de milissegundos entre a leitura dos gates e a
  liberação — nota de `leftBehind` carregada nessa janela vai no caminhão sem ter passado pelos
  gates de roteiro/agendamento. Mesma classe da corrida de `hasRoute` lido fora da transação, que já
  existia.
- **N3 (conhecido):** `TRIP_HAS_UNLOADED_DOCUMENTS` pelo botão sempre vira "todas têm ocorrência";
  na corrida do `stillUnloaded` a frase fica imprecisa. Sem efeito na carga.
- **N5/N6:** T7.2 marcada antes do veredito (agora vale); nesting do i18n testado à mão pelo
  revisor, sem contrato que renderize a frase final.

## Gates finais (sobre `eb7a80ae2` + N2/N4)

- API integração inteira (Postgres nativo 127.0.0.1:65433): 615 pass, 0 fail, 111 arquivos (361 s)
- API `db:test` (migration + rollback): 110 pass, 0 fail
- API contrato: 7272 pass, 23 skip, 0 fail
- Frontend `bun run test`: 5253 + 51 pass, 0 fail; `typecheck`, `lint` limpos; prettier limpo
