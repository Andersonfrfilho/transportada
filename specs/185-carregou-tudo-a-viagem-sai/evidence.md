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
