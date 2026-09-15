# Spec 149 — Plano

## Onde o código está

| Peça                                         | Arquivo                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Insert de nota e evento — importação de XML  | `apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.ts` (~232–314)                                                                 |
| Insert de nota e evento — distribuição       | `apps/worker-transportada/src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.ts` (`#persistItem`, `#insertEvent`, `#insertDocument`)                      |
| Resumo (`situacao` lida e descartada)        | `apps/worker-transportada/src/nfe-distribution/infrastructure/nfe-distribution-item.mapper.ts` (`buildDistributionSummary`) e `nfe-distribution-persistence.adapter.ts` (~244) |
| Schema (cópia no worker)                     | `apps/worker-transportada/src/database/nfe.schema.ts` (`NfeDocumentStatus` já tem os 4 valores)                                                                                |
| Schema (fonte, com CHECK e índices)          | `apps/api-transportada/src/database/nfe.schema.ts` (`nfe_documents_status_check`, `nfe_events_company_access_key_type_sequence_unique`)                                        |
| Tipo do evento no pacote                     | `@adatechnology/fiscal-provider@0.3.0-rc.7`, `dist/types.d.ts`: `NfeXmlEvent { type, sequence, statusCode?, … }`, `DfeItem.situacao`                                           |
| Emissão de CT-e (sem reconferir a nota hoje) | `apps/worker-transportada/src/cte-issuance/application/cte-issuance-consumer.effect.ts`                                                                                        |
| Elegibilidade do lote                        | `apps/api-transportada/src/cte-batches/domain/cte-batch-eligibility.policy.ts` (`CTE_BATCH_DOCUMENT_NOT_AUTHORIZED`)                                                           |
| Nota na viagem                               | `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts:694` (`nfeDocumentStatus` já sai)                                                                   |
| Listagem                                     | `apps/api-transportada/src/nfe-documents/infrastructure/drizzle-nfe-document.repository.ts` (ordem do `3f265e64`)                                                              |
| Tela                                         | `apps/frontend-transportada/src/modules/nfe-workspace/` — badge `cancelled`/`denied` e filtro de status já existem                                                             |

## Desenho

### Uma política pura, compartilhada pelos dois trilhos do worker

`apps/worker-transportada/src/nfe-documents/domain/nfe-document-status-transition.policy.ts`:

- `NFE_STATUS_CHANGING_EVENT_TYPES` (`110111`, `110112` → `cancelled`) e
  `NFE_EVENT_REGISTERED_STATUS_CODES` (`135`, `136`, `155`) em `nfe-document-status.constant.ts`;
- `resolveEventStatusChange({ eventType, statusCode })` → `{ kind: 'change', to } | { kind: 'ignore' } |
{ kind: 'not-applied', reason }` (D1, D2);
- `resolveSummaryStatusChange({ situation })` → idem (D3);
- `ALLOWED_ORIGIN_STATUSES: Record<target, readonly NfeDocumentStatus[]>` (D4) — `cancelled ←
{authorized, unsigned}`, `denied ← {unsigned}`.

Pura, sem banco: é o que a T2 testa exaustivamente (tabela de todos os pares tipo × cStat e origem ×
destino).

### Um único ponto de escrita no banco

`apps/worker-transportada/src/nfe-documents/infrastructure/drizzle-nfe-document-status.persistence.ts`,
funções que recebem a `tx` já aberta pelo repositório chamador (os dois repositórios já abrem
transação por item):

- `lockAccessKey({ tx, companyId, accessKey })` — `select pg_advisory_xact_lock(hashtextextended(…, 0))` (D8);
- `applyStatusChange({ tx, companyId, accessKey, to })` —
  `update nfe_documents set status = $to, updated_at = now() where company_id = $c and access_key = $k
and status in (<ALLOWED_ORIGIN_STATUSES[to]>) returning id` → `{ changed: boolean }` (D4, D7);
- `findPendingStatusFromEvents({ tx, companyId, accessKey })` — lê `nfe_events` da chave e devolve o
  status alvo se houver evento aplicável (D5). A política decide; a query só traz `event_type` e o
  `statusCode` (ver "Onde fica o cStat do evento").

### Onde fica o `cStat` do evento, e a trilha (D13–D18)

O histórico exige gravar dados que hoje não existem, então o `cStat` também vira coluna, em vez de ir
para `metadata` (coluna tipada serve à linha do tempo e à D5 ao mesmo tempo). Evento antigo não tem
`status_code`: para esses, a D5 e o backfill (T6) seguem a D2 — sem `statusCode`, não aplica. O XML
original está no storage se um dia for preciso reler.

**Opção escolhida — colunas em `nfe_events` + tabela nova de mudanças de status.**

1. `nfe_events` ganha (todas **nullable**, porque as linhas antigas não as têm — D17):
   `status_code varchar(3)`, `protocol varchar(20)`, `correction_text text`, `import_id uuid`,
   `origin varchar(16)` (`manual`|`automatic`, CHECK; sem ENUM nativo), `actor_user_id uuid`,
   `requested_by_user_id uuid`, `document_status_before varchar(16)`, `document_status_after
varchar(16)` (CHECK no mesmo domínio de `nfe_documents.status`). CHECK de coerência: `origin =
'manual'` ⇒ `actor_user_id` não nulo e `requested_by_user_id` nulo; `origin = 'automatic'` ⇒
   `actor_user_id` nulo. FK composta `(company_id, import_id) → nfe_imports(company_id, id)`.
2. Tabela nova `nfe_document_status_changes` (uma linha por **mudança efetiva** de status, qualquer que
   seja a causa): `id uuid pk`, `company_id`, `document_id` (FK composta com `company_id`),
   `status_before`, `status_after`, `cause varchar(16)` (`event`|`summary`|`document_insert`),
   `event_id uuid null` (FK composta), `import_id`, `origin`, `actor_user_id`, `requested_by_user_id`,
   `changed_at timestamptz default now()`, com os mesmos CHECKs de coerência; índice
   `(company_id, document_id, changed_at desc, id desc)`. Só se grava quando `applyStatusChange`
   retorna `changed: true` (ou quando a nota nasce cancelada na D5) — a tabela **é** a trilha de
   auditoria da mudança (§10 de segurança: ator, alvo, timestamp; IP não se aplica, é processo de
   fila).

**Alternativas descartadas:**

- _Só colunas em `nfe_events`_ — não cobre a mudança vinda do resumo (D3) nem a nota que nasce
  cancelada (D5), que não são eventos; forçaria linha falsa em `nfe_events`, que é espelho do fiscal.
- _Só a tabela nova, sem colunas em `nfe_events`_ — CC-e e manifestação não mudam status e ficariam sem
  origem/ator/texto; a linha do tempo precisaria de duas fontes com metadados diferentes.
- _Reusar `audit_logs`_ — é trilha de ação HTTP autorizada (`result allowed|denied|failed`), não de
  processamento de fila; misturar distorceria as consultas de auditoria que já existem.

**Propagação do ator/solicitante:** nenhum campo novo na fila. O worker já recebe `payload.importId`
no envelope e já lê `nfe_imports` do item (`requestedByUserId`, `source`). `resolveNfeEventOrigin({
source, requestedByUserId })` (pura, compara com `SYSTEM_DISTRIBUTION_ACTOR_USER_ID` — cópia da
constante no worker, como o cron já faz) produz `{ origin, actorUserId, requestedByUserId }`.
Referência por id, sem PII.

### Fiação por trilho

Dentro da transação que já existe, sempre nesta ordem: `lockAccessKey` → escrita → propagação.

- **Evento** (`#insertEvent` e o ramo `nfe-event` do consumidor de importação): lê o status atual da
  nota (sob o lock), insere o evento com `status_code`, `protocol`, `correction_text`, `import_id`,
  origem/ator/solicitante e o snapshot `before`/`after`; se a política disser `change`,
  `applyStatusChange` + linha em `nfe_document_status_changes` (`cause = 'event'`). Se `not-applied`,
  `warn`.
  Mesmo com o evento duplicado (insert retornou 0 linhas), roda o `applyStatusChange` — é idempotente e
  cobre o caso de a primeira gravação ter sido antes desta spec existir.
- **Nota** (`#insertDocument` e o ramo documento do consumidor): antes do insert,
  `findPendingStatusFromEvents`; se houver alvo **permitido a partir do status do XML** (`authorized`
  ou `unsigned`), a nota é inserida já com ele. Conflito (nota já existia) → nada, como hoje.
- **Resumo** (`variant === 'summary'` em `#persistItem`): passa `situacao` adiante (hoje o
  `DistributionSummary` a carrega mas o repositório a ignora); se a política disser `change`,
  `lockAccessKey` + `applyStatusChange`. Nota inexistente → `changed: false`, nada.

### Transação

Nenhuma transação nova: as duas `#database.transaction(...)` por item que já existem passam a conter o
lock e o update. O lock é por `(company, chave)` — itens de chaves diferentes seguem em paralelo.

### Emissão de CT-e (D12, H8)

No worker, antes de montar a chamada à SEFAZ para um item, reler `nfe_documents.status` das notas do
item (mesma `company_id`); se alguma não for `authorized`, falhar o item com o código já existente
`CTE_BATCH_DOCUMENT_NOT_AUTHORIZED` (reaproveitar a constante; no worker, cópia em `*.constant.ts`,
já que app não importa código de outra), **classificado como não-retentável**. Confirmar na T4 se
existe consulta equivalente a reaproveitar.

### API e tela

- `GET /nfe-documents`: nada muda na ordem nem no cursor — o `updated_at` novo basta. Contrato
  confirma a subida (H1).
- Lote de CT-e e CT-e emitido: a resposta que já lista as notas do item passa a expor o `status` da
  nota (se ainda não expõe — conferir `cte-batch-selection.query.ts:215`, que já seleciona) e a tela
  mostra "NF-e cancelada após a emissão" quando o CT-e está autorizado e a nota não.
- Viagem: `nfeDocumentStatus` já sai em `drizzle-trip.repository.ts:694`; a tela da viagem mostra o
  mesmo aviso. Textos em `*.locale.json`.
- Filtros: o filtro de status da listagem já tem `cancelled`/`denied` — nada a mudar.

### Histórico na API (D19)

- `apps/api-transportada/src/nfe-documents/`: `list-nfe-document-events.use-case.ts`,
  `drizzle-nfe-document-event.repository.ts` (união de `nfe_events` da chave e de
  `nfe_document_status_changes` com `cause <> 'event'`, ordenada por `registered_at desc, id desc`,
  cursor de duas chaves), `nfe-document-events.schema.ts` (Zod de query e resposta), rota em
  `nfe-documents.routes.ts` com `nfe.read`. Nome do ator/solicitante por `left join` em
  `user_company_memberships` (mesma `company_id`) + `identity_user_profiles.name`; sem membership →
  `null` e a tela escreve "usuário removido". Tipos de evento mapeados para chave de locale no
  frontend, não no backend (o backend devolve o código).
- Resposta por entrada: `id`, `kind` (`event`|`statusChange`), `eventType`, `sequence`, `occurredAt`,
  `registeredAt`, `protocol`, `statusCode`, `statusBefore`, `statusAfter`, `origin`
  (`manual`|`automatic`|`unknown`), `actor { id, name } | null`, `requestedBy { id, name } | null`,
  `correctionText`. Nunca `xml_object_id`, chave de objeto ou XML.
- Cópia do schema no worker (`apps/worker-transportada/src/database/nfe.schema.ts`) ganha as colunas e
  a tabela nova — migrations só na API.

### Tela (D20)

`apps/frontend-transportada/src/modules/nfe-workspace/`: `NfeDocumentEventsDrawer.component.tsx`
(`Sheet` do shadcn/ui), `NfeDocumentEventTimeline.component.tsx`, `nfeDocumentEvents.query.ts`
(TanStack Query infinita pelo cursor), textos em `nfe-workspace.locale.json` (ou o locale do módulo
que já existe). Abre por ação na linha da `NfeDocumentTable` ("Histórico fiscal").

## Migration

**Uma, aditiva** (`apps/api-transportada/drizzle/<timestamp>_nfe_event_history`), gerada por
`bun run db:generate`, com `rollback.sql` ao lado e validada por `make migration-test`:

- `ALTER TABLE nfe_events ADD COLUMN …` (nove colunas nullable, sem default que reescreva a tabela) +
  CHECKs de domínio/coerência + FK composta para `nfe_imports`;
- `CREATE TABLE nfe_document_status_changes` + índice + FKs compostas.

Nenhum `NOT NULL` retroativo, nenhum `DROP`. Rollback: `DROP TABLE nfe_document_status_changes` e
`DROP COLUMN` das nove — **só enquanto não houver dado gravado**; depois, roll-forward (a trilha é
histórico imutável, princípio 5). O CHECK de `nfe_documents.status` e o índice de `updated_at` não
mudam. A busca da D5 usa o prefixo `(company_id, target_access_key)` da unique
`nfe_events_company_access_key_type_sequence_unique`.

## Backfill (T6, opcional, com aprovação)

Rotina one-shot que percorre `nfe_events` de cancelamento com `status_code` válido e aplica
`applyStatusChange`. Como os eventos antigos não têm `status_code`, ela só pega os gravados depois do
deploy desta spec **ou** exige reler o XML do storage — decidir com o usuário antes de rodar (T6 é
parada obrigatória). Na mesma rotina, opcionalmente, preencher `import_id`/`origin`/ator/solicitante
dos eventos antigos pela cadeia `xml_object_id → nfe_import_items.source_object_id → nfe_imports`
(D17) — **sem** inventar snapshot de status.

## Testes (antes do código)

- **Unitário (worker):** política — todos os tipos × cStat, todas as origens × destinos, `unsigned →
denied`, `authorized → denied` recusado, terminais nunca saem.
- **Integração (worker, Postgres real):** H1, H2 (nos dois trilhos), H3, H4, H5 (negativo entre
  empresas), H6, H7 (duas conexões, commits nas duas ordens). Novos arquivos entram na lista explícita
  do `package.json` do worker.
- **Contrato (worker):** emissão de CT-e recusa item com nota cancelada sem chamar o gateway fake (H8).
- **Contrato (API):** listagem devolve a nota cancelada primeiro; viagem/lote expõem o status.
- **Tela:** aviso aparece para CT-e autorizado sobre nota cancelada e para nota cancelada na viagem.
- **Histórico:** unitário de `resolveNfeEventOrigin` (as três linhas da D14); integração do worker
  gravando origem/ator/solicitante/snapshot em cada trilho (upload, distribuição agendada,
  distribuição "buscar agora", evento antes da nota); contrato de rota H9–H14 (incluindo 404 entre
  empresas, "usuário removido", evento antigo, cursor e teto de `limit`, ausência de campos de
  XML/storage na resposta); migration + rollback em `make migration-test`; contrato de tela (drawer,
  locale, foco e teclado, estado vazio/erro, "carregar mais").

## Observabilidade

`info nfe_document_status_changed { companyId, documentId, from, to, source: 'event'|'summary'|'insert' }`,
`warn nfe_event_status_not_applied`, `warn nfe_summary_status_inconsistent`. Nunca XML, chave completa
só se já for padrão nos logs do trilho (conferir; na dúvida, `documentId`).
