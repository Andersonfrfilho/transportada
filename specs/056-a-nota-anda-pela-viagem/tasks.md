# 056 — A nota anda pela viagem · tasks

> Ordem de trabalho: Fase 0 antes de qualquer linha de código. As fases 1 e 2 são o coração; a 3 e a
> 4 só compilam sobre elas.

## Fase 0 — Decisão registrada

> 🤖 Modelo: `opus` 🧠

### T001 🧠 ✅ — ADR-0043: a viagem tem fases, e a nota tem as suas

A máquina de dois eixos (D1), o derivado automático do estado da viagem, `dispatched` como porta de
não-retorno (D2), a parada agrupada por endereço e não por destinatário (D3), e a trilha de eventos
(D4). Registra explicitamente que **revisa o ADR-0023 §4** ("o ciclo é só aberto/fechado") — a
viagem continua sem falar com a SEFAZ, mas o ciclo deixa de ser binário, e sem essa frase escrita a
próxima leitura do 0023 conclui que esta feature o viola.

- **Arquivos:** `docs/adr/0043-a-nota-anda-pela-viagem.md`, `docs/adr/0023-*.md` (marca a §4 como
  revista), `docs/spec/domain-model.md` (§estados)
- **Aceite:** revisão humana
- **Verificação:** —
- **Evidência:** `docs/adr/0043-a-nota-anda-pela-viagem.md` (9 decisões, 5 alternativas recusadas);
  `docs/adr/0023-*.md` com nota de emenda no cabeçalho e o `NEEDS CLARIFICATION` do §4 substituído
  pela resposta; `docs/spec/domain-model.md` com Trip/TripStop nos agregados, 9 arestas novas no ER,
  3 constraints e as duas linhas de estado.

## Fase 1 — O modelo

> 🤖 Modelo: `sonnet` (T002 e T005 são 🧠 — migration com backfill)

### T002 🧠 ✅ — Os estados da viagem e da nota

`TRIP_STATUSES` passa de `['open','closed']` para os nove de D1; nasce `TRIP_DOCUMENT_SEPARATION_STATUSES`.
`trip_documents` ganha `separation_status`, `separated_at`, `loaded_at`, `returned_at`,
`return_reason`. Check constraints por `inList`, como o resto do schema. Backfill aditivo:
`open→draft`, `closed→completed`; nota com `delivered_at` → `delivered`, as demais de viagem
fechada → `returned` com motivo `migration`.

- **Arquivos:** `apps/api-transportada/drizzle/20260824200157_trip_status_machine/` (migration
  + `rollback.sql`), `apps/api-transportada/src/database/trip.schema.ts`
- **Aceite:** `test/trip-schema/status.contract.ts` (novo),
  `test/database-migration/static-migration.contract.ts` (atualizado)
- **Verificação:** `bun run --cwd apps/api-transportada typecheck` ✅,
  `bun run --cwd apps/api-transportada lint` ✅, `bun run --cwd apps/api-transportada test`
  (2910 pass, 0 fail) ✅
- **Evidência:** migration aplicada do zero num Postgres local e verificada por `\d trip_documents`;
  backfill testado (`open→draft`, `closed→completed`, `delivered_at`→`delivered`, demais de viagem
  fechada→`returned` com motivo `migration`); rollback escreve com guarda que recusa recuar viagem
  em estado que `open|closed` não representa. Blast radius fora do schema: 2 arquivos de produção
  (`trip.use-case.ts`, `drizzle-trip.repository.ts`) com literal `'closed'`→`'completed'` /
  `'open'`→condição de não-terminal — semântica completa (força + motivo, `dispatched` irreversível)
  fica para T006/T010, como escopado. 9 arquivos de teste com literais `'open'/'closed'` corrigidos
  para manter `tsc --noEmit` e a suíte verdes.

### T003 ✅ — `trip_stops`

Parada com `sequence` (unique por viagem), chave de endereço normalizada, rótulo legível,
`arrived_at`, `completed_at`, e `delivery_window_start`/`end` nulas e reservadas. FK composta
`(company_id, trip_id)` seguindo o padrão de `trips`. Sem coordenada — a 058 a adiciona.

- **Arquivos:** `apps/api-transportada/drizzle/20260824202501_trip_stops/` (migration +
  `rollback.sql`), `apps/api-transportada/src/database/trip.schema.ts`,
  `apps/api-transportada/src/database/database.schema.ts` (registro no barrel)
- **Aceite:** `test/trip-schema/stops.contract.ts` (novo, 7 testes),
  `test/trip-schema/tenant-safety.contract.ts` (tripStops adicionada a `TRIP_TABLES`),
  `test/database-migration/support.ts` (idem, para a checagem de existência),
  `test/database-migration/static-migration.contract.ts` (migration nova na lista exaustiva; o
  teste da migration histórica `_trip_planning_expansion` foi desacoplado do `TRIP_TABLES`
  compartilhado — ele valida um snapshot de três tabelas no passado, não a família atual)
- **Verificação:** `bun run --cwd apps/api-transportada typecheck` ✅,
  `bun run --cwd apps/api-transportada lint` ✅, `bun run --cwd apps/api-transportada test`
  (2917 pass, 0 fail) ✅
- **Evidência:** migration puramente aditiva (`CREATE TABLE`, sem backfill — tabela nova, sem
  linha existente); FK composta `(company_id, trip_id)` → `trips`, `on delete cascade` (a parada é
  derivada, some com a viagem); `unique(company_id, trip_id, sequence)`; checks para `sequence >= 1`,
  chave/rótulo não vazios, janela de entrega reservada mas coerente (início e fim nulos juntos), e
  `completed_at` nunca sem `arrived_at`. Sem coordenada — a spec 058 adiciona. Rollback recusa
  `DROP TABLE` se alguma parada já registrou chegada ou conclusão.

### T004 — `trip_documents.stop_id` e `trip_document_events`

FK da nota para a parada, e a tabela de eventos com `from_status`, `to_status`,
`actor_membership_id`, `occurred_at`, `note`. Contrato negativo obrigatório: **nenhuma coluna de
PII** na tabela de eventos.

- **Arquivos:** `drizzle/<ts>_trip_document_events/`, `src/database/trip.schema.ts`
- **Aceite:** `test/trip-schema/events.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T005 🧠 — O snapshot congelado do roteiro

Tabela (ou JSONB em `trips`) escrita na transição a `dispatched`, guardando a ordem das paradas e as
notas de cada uma. Imutável por constraint, não por convenção.

- **Arquivos:** `drizzle/<ts>_trip_dispatch_snapshot/`, `src/database/trip.schema.ts`
- **Aceite:** `test/trip-schema/snapshot.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 2 — O domínio

> 🤖 Modelo: `sonnet` (T006 é 🧠 — é a máquina inteira)

### T006 🧠 — A máquina de transição, isolada e pura

Módulo sem I/O: recebe estado atual + transição pedida, devolve estado novo ou erro tipado. É ele
que define **cada aresta**, inclusive as proibidas. Estar isolado é o que torna testável toda
transição inválida sem subir banco.

- **Arquivos:** `src/trips/domain/trip-state-machine.ts` (novo),
  `src/trips/domain/trip-state.error.ts`, `shared/errors/codes.ts`
- **Aceite:** `test/trip-state-machine/transitions.contract.ts` — tabela completa: toda aresta
  válida passa, **toda inválida** devolve `STATE_TRANSITION_NOT_ALLOWED`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T007 — Normalização de endereço e derivação de parada

Função única e testada de `(postal_code, number, city_code)` → chave. `01310-100`/`01310100`,
`nº 45`/`45`/`45 A` resolvidos por teste, não por leitura. Mais o reconciliador: vincular cria a
parada se faltar, desvincular a última apaga.

- **Arquivos:** `src/trips/domain/stop-address-key.ts` (novo),
  `src/trips/application/reconcile-trip-stops.use-case.ts` (novo)
- **Aceite:** `test/trip-stops/address-key.contract.ts` (as quatro variantes de D3),
  `test/trip-stops/reconcile.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T008 — Transição de nota, com evento e derivação da viagem

Use case único por trás de `separate`/`load`/`deliver`/`return`: valida pela T006, escreve estado +
timestamp + evento, e recalcula o estado da viagem **na mesma transação**. Idempotente (RF-8).

- **Arquivos:** `src/trips/application/transition-trip-document.use-case.ts` (novo),
  `src/trips/infrastructure/trip-document.repository.ts`
- **Aceite:** `test/trip-documents/transition.contract.ts`, incluindo a repetição idempotente e a
  derivação automática de `separating`/`loading`/`completed`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T009 — Transição em lote

50 notas em uma transação e uma ida ao banco por tabela. É a operação real do armazém; uma a uma é
a que o produto não deve incentivar.

- **Arquivos:** `src/trips/application/transition-trip-documents-batch.use-case.ts` (novo)
- **Aceite:** `test/trip-documents/batch-transition.contract.ts` (contagem de queries assertada)
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T010 — Planejar e despachar

`plan-route` (exige ≥1 parada e nenhuma parada `SEM ENDEREÇO`), e `dispatch` com a regra de
`force` mais motivo obrigatório (P2), congelando o snapshot da T005 e desvinculando as pendentes.

- **Arquivos:** `src/trips/application/plan-trip-route.use-case.ts`,
  `src/trips/application/dispatch-trip.use-case.ts` (ambos novos)
- **Aceite:** `test/trips/plan-and-dispatch.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T010b — O endereço sobrescrito, com solicitante e histórico (D9)

`delivery_address_overrides` e o use case da ação: exige motivo e solicitante, grava o par
executor/solicitante, reconcilia a parada (T007) e recusa a partir de `dispatched`. A chave de
agrupamento passa a preferir o override.

- **Arquivos:** `drizzle/<ts>_delivery_address_overrides/`, `src/database/trip.schema.ts`,
  `src/trips/application/override-delivery-address.use-case.ts` (novo),
  `src/trips/domain/stop-address-key.ts` (passa a receber o override)
- **Aceite:** `test/trip-stops/address-override.contract.ts` — preferência sobre o XML, exigência de
  motivo e solicitante, `409` em `dispatched`, histórico preservado após desvínculo
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T010c — A lista de retornadas com CT-e ativo (D8)

Consulta que cruza `separation_status = 'returned'` com CT-e autorizado, pelo mesmo caminho de índice
que a 059 vai usar. **Nenhum efeito fiscal automático** — a task inclui o teste negativo que prova
isso.

- **Arquivos:** `src/trips/application/list-returned-with-active-cte.use-case.ts` (novo),
  `src/trips/infrastructure/trip-document.repository.ts`
- **Aceite:** `test/trip-documents/returned-with-active-cte.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 3 — A fronteira

> 🤖 Modelo: `sonnet` (T011 é 🧠 — é permissão)

### T011 ✅ — A permissão `trip.manage` *(entregue pela spec 055, na árvore)*

**Não refazer.** A implementação da 055 já está na árvore de trabalho (não commitada, branch
`staging`) e entregou tudo o que esta task pedia:

- `trip.manage` em `TRANSPORTADA_PERMISSIONS` e nos papéis `operator`, `admin` e `separator`
  (`identity/domain/authorization.policy.ts`)
- papel `separator` novo, com `['invoices.read', 'fleet.read', 'trip.read', 'trip.manage']` — e
  deliberadamente **sem** `trip.report`, que é do campo
- `TRIP_MANAGE_POLICY` migrada de `fleet.manage` para `trip.manage`
  (`trips/presentation/trip.routes.ts:36-40`)
- `camera=(self)` no `Permissions-Policy` (`frontend-transportada/server.ts:28-30`)

**O que resta desta task:** conferir que o contrato negativo existe nos dois sentidos — quem tem só
`fleet.manage` **não** move estado de viagem, e quem tem só `trip.manage` **não** apaga veículo. A
055 tocou `test/authorization.contract.test.ts`; verificar se ele já cobre o segundo sentido antes de
escrever teste novo.

- **Arquivos:** `test/authorization.contract.test.ts` (só se faltar cobertura)
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T012 — As rotas de estado

As rotas do RF-6, incluindo as três da D8/D9, com `defineRoute`, schemas Zod em
`trip-request.schema.ts`, e `Idempotency-Key` honrado.

> **Reduzida pela 055:** o resolvedor de chave de acesso já existe. A 055 moveu `parseDocumentList`
> para `nfe-documents.schema.ts` e adicionou `accessKey` ao filtro de listagem, então
> `GET /nfe-documents?accessKey=…` já resolve chave → documento. **Não criar** a rota
> `by-access-key/:accessKey` que esta task previa; a de localização na viagem
> (`.../trip-location`) continua necessária, e deve reusar aquele filtro em vez de duplicar a
> consulta.

- **Arquivos:** `src/trips/presentation/trip.routes.ts`,
  `src/trips/presentation/trip-request.schema.ts`,
  `src/nfe-documents/presentation/nfe-documents.routes.ts`
- **Aceite:** `test/trips/routes.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T013 — Vínculo e desvínculo recusam viagem despachada

`POST /trips/:id/documents` e o `DELETE` respondem `409` a partir de `dispatched`. É a metade da D2
que protege o fiscal da 059.

- **Arquivos:** `src/trips/application/link-trip-document.use-case.ts` (e o de desvínculo)
- **Aceite:** `test/trips/dispatched-is-sealed.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T014 — `GET /trips/:id` por parada, sem N+1

A leitura passa a devolver paradas com as notas aninhadas e o progresso por fase. 200 notas em 40
paradas com contagem de queries assertada.

- **Arquivos:** `src/trips/application/get-trip.use-case.ts`,
  `src/trips/infrastructure/trip.repository.ts`
- **Aceite:** `test/trips/detail-query-count.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 4 — A tela

> 🤖 Modelo: `sonnet`

### T015 — A viagem lista por parada

`TripDetail` passa a agrupar por parada, com reordenação por arraste (só antes de `dispatched`),
maço de seleção e barra de progresso por fase. Mutações por `docs/frontend/mutations.md`.

- **Arquivos:** `src/modules/trip/components/TripDetail.component.tsx`,
  `TripStopList.component.tsx` (novo), `trip.locale.json`, `trip.module.css`
- **Aceite:** revisão humana + conferência em 375px, 768px, 1280px
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

### T015b — O menu de desvio de entrega (D9)

Ação em menu explícito, nunca edição em linha: diálogo com endereço novo, motivo e **quem
solicitou**, mais o histórico visível na nota. O campo de solicitante é texto livre porque essa
pessoa quase nunca é usuária do sistema.

- **Arquivos:** `src/modules/trip/components/DeliveryAddressOverrideDialog.component.tsx` (novo),
  `src/modules/trip/mutations/overrideDeliveryAddress.mutation.ts` (novo), `trip.locale.json`
- **Aceite:** revisão humana
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

### T016 — As ações de estado

Botões de separar / carregar / devolver, em lote e por nota, com o diálogo de motivo no retorno e o
diálogo de `force` no despacho — este último **lista as notas pendentes** antes de pedir o motivo.

- **Arquivos:** `src/modules/trip/components/TripStateActions.component.tsx` (novo),
  `src/modules/trip/mutations/*.mutation.ts`, `trip.locale.json`
- **Aceite:** revisão humana
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

### T017 — O passe de responsividade da tela de viagem

`trip.module.css` hoje tem duas consultas, ambas de grade, e nenhuma pensada para 375px. Alvo de
toque ≥44px na ação mais repetida do produto (marcar nota). `min-width` para adicionar, nunca
`max-`.

> A auditoria da spec 055 aponta sete `max-width` e nove breakpoints diferentes no frontend, e a
> falta de um `docs/frontend/responsiveness.md`. Esta task conserta **a tela de viagem**; o passe
> global é dívida registrada, não escopo daqui.

- **Arquivos:** `src/modules/trip/styles/trip.module.css`, `docs/frontend/responsiveness.md` (novo)
- **Aceite:** revisão humana nos três tamanhos
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`

### T018 — E2E do ciclo inteiro

Criar viagem → vincular 3 notas em 2 endereços → planejar → separar → carregar → despachar →
conferir snapshot congelado e vínculo selado. Mais o teste negativo de tenant (viagem de outra
empresa → 404, não 403).

- **Arquivos:** `test/e2e/trip-lifecycle.e2e.ts` (novo)
- **Aceite:** verde em `env.test.e2e`
- **Verificação:** `make test-e2e`

### T019 — Documentação viva

`docs/spec/domain-model.md` (ER + tabela de estados), `CLAUDE.md` da raiz (§14 do
`code-standart.md`), e `evidence.md` desta spec.

- **Arquivos:** `docs/spec/domain-model.md`, `CLAUDE.md`, `specs/056-*/evidence.md`
- **Aceite:** revisão humana
- **Verificação:** `make validate`
