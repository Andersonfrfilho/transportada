# Evidência — Feature 171 (linha do tempo começa no nascimento)

## O que foi implementado

- **RF1** `trip.use-case.ts#create` passa `actorUserId`/`channel` (`backoffice`) para
  `repository.create`; `drizzle-trip.repository.ts#create` grava `recordTripCreation`
  (`trip-status-event.persistence.ts`) na **mesma transação** do `INSERT trips`, escrevendo em
  `trip_status_events` — mesma tabela e mesmo molde de `recordTripStatusChange`.

## Revisão pós-review do usuário: coluna própria em vez de `from_status = to_status`

A primeira versão desta feature usava `fromStatus = toStatus` como o próprio sinal de
`trip.created`, e por isso precisou derrubar o CHECK `trip_status_events_transition_check`
(`from_status <> to_status`). O usuário revisou e pediu para voltar atrás **nesse ponto
específico**: derrubar a garantia do banco para codificar um sinal só documentado em comentário
deixava a proteção inteira do lado da aplicação — e ainda abria a porta para uma transição real
degenerada (`from_status = to_status` sem querer dizer nascimento nenhum) que nada no banco
impedia mais.

Solução adotada, exatamente como pedido: `trip_status_events` ganha `event_kind` (`varchar(16)`,
CHECK em `('created', 'transition')`, `default: 'transition'` — nunca ENUM nativo,
`code-standart.md` §8). `TRIP_STATUS_EVENT_KINDS` (`trip.schema.ts`, mesmo molde de
`TRIP_FIELD_CHANNELS`) documenta o vocabulário fechado.

- `recordTripStatusChange` grava `eventKind: 'transition'` explicitamente (documenta a intenção,
  mesmo sendo o `default` da coluna).
- `recordTripCreation` grava `eventKind: 'created'`.
- O CHECK `trip_status_events_transition_check` **voltou**, mas só vale para `event_kind =
'transition'`: `event_kind <> 'transition' or from_status <> to_status`. Uma transição real
  degenerada continua impossível de gravar — o banco garante isso, não um comentário.
- `listCreatedRows`/`listStatusChangedRows` filtram por `eq(tripStatusEvents.eventKind, ...)`, não
  mais pela (des)igualdade de `fromStatus`/`toStatus`.
- Novo teste de integração prova a garantia pelo lado do banco: inserir uma linha com `eventKind`
  ausente (cai no `default: 'transition'`) e `fromStatus = toStatus` **é rejeitado** pelo Postgres
  (`test/integration/trip-timeline.integration.ts`, "o banco recusa transição degenerada").
- `actor_user_id`/`channel` e o resto do desenho (prioridade `-1`, animação CSS,
  `prefers-reduced-motion`, RF4 não migra viagem antiga) **não mudaram** — só a coluna do sinal.
- **RF2** `trip.created` entra em `TRIP_TIMELINE_KINDS` (API e cópia do frontend) com prioridade
  `-1` em `TRIP_TIMELINE_KIND_PRIORITY` — menor que qualquer outra — para desempatar como o item
  mais antigo (`mergeTripTimeline` já é genérico sobre o mapa de prioridade).
- **RF3** título "Viagem criada" (`eventTimeline.itemTitle.tripCreated`), autoria com
  `resolveTripTimelineAuthorshipText`.
- **RF4** nada migra viagem antiga: `listCreatedRows` só lê linhas que `recordTripCreation`
  gravou; viagem existente sem esse evento continua sem `trip.created` (CA03, prova de integração
  abaixo).
- **RF5/CA05** entrada animada em CSS puro (`.itemEnter`, `@keyframes tripTimelineItemEnter`),
  desligada sob `prefers-reduced-motion: reduce`. Sem estado novo: a `key` de cada `<li>` não muda
  entre renders, então só o item que acabou de montar no DOM roda a animação — recarga, "tentar de
  novo" e paginação disparam nela; o que já estava na lista não remonta.
- **RF6** textos em pt-BR (`trip.locale.json`).
- Caso extremo "pelo sistema": mantido no frontend (`resolveTripTimelineAuthorshipText`) como
  fallback defensivo para `actorName: null` em `trip.created`, mas **não é alcançável hoje** —
  `POST /trips` sempre tem ator autenticado. Ver decisão de escopo abaixo.

## Decisão de escopo: `actor_user_id` continua `NOT NULL`

A spec descreve, em "casos extremos", uma viagem criada por semeadura/importação sem ator humano.
Implementar isso de verdade exigiria tornar `trip_status_events.actor_user_id` opcional — uma
migration. Neste worktree **compartilhado ao vivo por vários agentes em paralelo** (spec166-api,
spec167-api, spec169, spec172, main), gerar `bun run db:generate` bate em `database.schema.ts`
inteiro, e o diff vinha sempre bundlado com tabelas de outra spec em progresso (`company_entry_kinds`,
`trip_revenue_entries`, mudança de tipo em `trip_document_occurrence_products.quantity_unit`) —
isolar exigiria mexer no trabalho alheio ou commitar coisa que não é minha. Decisão: manter
`actor_user_id NOT NULL` (hoje só `POST /trips` autenticado cria viagem — nenhum caminho grava
sem ator), documentado em `trip.schema.ts`. `CreateTripRecord.actorUserId`/
`RecordTripCreationParams.actorUserId` são `string`, não `string | null`.

## Migration que falta

O schema (`trip.schema.ts`) já tem a coluna nova e o CHECK ajustado; **nenhum arquivo em
`drizzle/` foi commitado por mim** — esse worktree é compartilhado ao vivo por vários agentes em
paralelo (spec166-api, spec167-api, spec169, spec172, main), e qualquer `bun run db:generate`
roda contra `database.schema.ts` inteiro, então captura tabelas de outras specs em progresso
(`company_entry_kinds`, `trip_revenue_entries`, `trip_cost_entries`, etc.) que não são minhas para
commitar.

Confirmei em isolamento total (nenhuma pasta não rastreada em `drizzle/` no momento da checagem)
que o diff correto e único desta spec é:

```sql
ALTER TABLE "trip_status_events" ADD COLUMN "event_kind" varchar(16) DEFAULT 'transition' NOT NULL;
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_event_kind_check" CHECK ("event_kind" in ('created', 'transition'));
ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_transition_check", ADD CONSTRAINT "trip_status_events_transition_check" CHECK ("event_kind" <> 'transition' or "from_status" <> "to_status");
```

É aditiva: a coluna nasce com `default: 'transition'`, então toda linha existente vira
`transition` sem `UPDATE` nenhum — exatamente o requisito do usuário ("a coluna nasce com padrão,
e as linhas existentes viram `transition` sem reescrita de dado").

Para testar localmente, apliquei esse `ALTER` (as três linhas acima) num migration temporário
(`drizzle/20260923035249_reflective_sumo/`, nome gerado pelo próprio `db:generate` isolado), rodei
os testes, e **apaguei o arquivo antes de terminar** — não sobrou rastro no `drizzle/`
compartilhado.

**Pendência explícita**: `test/database-migration/schema-snapshot.contract.ts` (dentro do `bun
test` de contrato) falha hoje porque `trip.schema.ts` já não bate com a última migration
commitada — por causa exatamente dessas três linhas que faltam. Por `CLAUDE.md` §"Numeração e
migrations no rebase", a migration correta e isolada só pode ser gerada com segurança **na
publicação**: `git fetch && git rebase origin/staging && bun run db:generate` (deve dar
`no_changes` depois de eu gerar essas três linhas sozinho, sem as outras specs no meio). Quem for
publicar este branch precisa rodar `bun run db:generate` de novo, isolado, e commitar a migration
resultante — só ela, sem as tabelas de outras specs que estiverem no schema naquele momento.

## Gates

### `apps/api-transportada`

- `bunx tsc --noEmit` → **limpo** (0 erros). Havia erros transitórios de `trip-financial.schema.ts`
  por edição concorrente de outro agente; sumiram sozinhos quando aquele agente terminou o próprio
  arquivo — não são meus.
- `bun --env-file=../../.env.test test --timeout 120000` → **7137 pass, 23 skip, 1 fail** (24159
  expect). A única falha é `schema-snapshot.contract.ts`, a pendência de migration documentada
  acima — não um teste que eu escrevi ou que eu quebrei por lógica errada.
- `bun --env-file=../../.env.test run test:integration` → `.env.test` **não existe neste worktree**
  (só `.env` foi linkado; não é `make worktree`, é um scratchpad de sessão). Rodei os testes de
  banco relevantes à mão, contra o Postgres nativo de 55432 (`DATABASE_URL`/`API_TEST_DATABASE_URL`
  exportados na chamada, sem tocar `.env*`):
  - `trip-timeline.integration.ts`: **19 pass, 0 fail** — inclui os três casos novos (CA02/CA04:
    `trip.created` mais antigo mesmo empatado; CA03: viagem sem o evento não inventa `trip.created`;
    e o teste pós-review que prova a garantia pelo lado do banco: inserir `event_kind` ausente
    (default `transition`) com `fromStatus = toStatus` é rejeitado pelo Postgres).
  - `trip-lifecycle.integration.ts`, `trip-repository.integration.ts`,
    `mixed-cargo-end-to-end.integration.ts`, `delivery-charge-end-to-end.integration.ts`,
    `trip-status-write-guard.integration.ts`: **11 pass, 0 fail** — os testes que contavam ou
    liam `trip_status_events` foram ajustados para o evento de nascimento novo (filtro por
    `toStatus` da transição real, contagem `+1`).
  - `field-trip-target.integration.ts`, `me-trip.integration.ts`,
    `trip-field-office-review.integration.ts`, `whatsapp-operator-flow-actions.integration.ts`:
    rodados, com falhas por **timeout** (5000ms), não por asserção errada — reproduzem tanto
    isolados quanto em lote, e variam de corrida para corrida (14 falhas isolado vs. 4 em lote),
    coerente com contenção no Postgres compartilhado por várias sessões simultâneas agora. Não
    encontrei nenhuma falha de conteúdo nesses arquivos.

### `apps/frontend-transportada`

- `bun run typecheck` → **limpo**.
- `bun run lint` → **limpo** (exit 0).
- `bun run test` → **5014 pass, 0 fail** (4970 do `test` principal + 44 de `test:hooks`), inclui:
  - `timeline.contract.ts`: paridade `TRIP_TIMELINE_KINDS`/`TRIP_FIELD_CHANNELS` com a API —
    passa porque adicionei `trip.created` nas duas listas, na mesma posição.
  - `timeline-view.contract.ts`: título de `trip.created`, autoria "pelo sistema" vs. "usuário
    removido", e o CSS da animação (`@keyframes`/`prefers-reduced-motion` por leitura de texto do
    arquivo `.module.css`, sem depender de resolução de CSS Modules no `bun test`).

## O que não rodou

- `schema-snapshot.contract.ts` (dentro de `test:integration`) — falha esperada, documentada acima,
  por falta da migration `DROP CONSTRAINT trip_status_events_transition_check`.
- **CA06** (revisão de design com print) — não fechada nesta sessão; é tarefa de revisão visual
  separada (web.md §15), fora do que um agente de código deveria decidir sozinho.
- Não gerei nenhum arquivo em `drizzle/` — nem o meu, para não bundlar trabalho de outras specs; a
  pasta `drizzle/` deste worktree tem, ao longo da sessão, pastas não rastreadas de outros agentes
  (`20260923032453_flimsy_metal_master`, `20260923032744_silent_darkhawk` e outras que apareceram e
  sumiram) — nenhuma foi tocada por mim além de duas vezes em que precisei movê-las para isolar meu
  próprio diff de teste, sempre devolvidas ao lugar depois.

## Arquivos tocados

API (`apps/api-transportada`):

- `src/database/trip.schema.ts`
- `src/trips/application/trip-timeline.types.ts`
- `src/trips/application/trip.port.ts`
- `src/trips/application/trip.use-case.ts`
- `src/trips/infrastructure/trip-status-event.types.ts`
- `src/trips/infrastructure/trip-status-event.persistence.ts`
- `src/trips/infrastructure/drizzle-trip.repository.ts`
- `src/trips/infrastructure/trip-timeline-status.query.ts`
- `src/trips/infrastructure/trip-timeline.query.ts`
- `test/trip-application/trip-use-case.contract.ts`
- `test/trip-application/trip-timeline-merge.contract.ts`
- `test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`
- `test/integration/trip-timeline.integration.ts`
- `test/integration/trip-lifecycle.integration.ts`
- `test/integration/trip-repository.integration.ts`
- `test/integration/mixed-cargo-end-to-end.integration.ts`
- `test/integration/delivery-charge-end-to-end.integration.ts`

Frontend (`apps/frontend-transportada`):

- `src/modules/trip/shared/trip.types.ts`
- `src/modules/trip/shared/tripTimeline.service.ts`
- `src/modules/trip/components/TripTimeline.component.tsx`
- `src/modules/trip/styles/tripTimeline.module.css`
- `src/modules/trip/locales/trip.locale.json` (conteúdo presente em HEAD — commitado por outro
  agente do mesmo worktree compartilhado junto com o commit dele; nada meu para adicionar aqui)
- `test/trip/timeline-view.contract.ts`
