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
