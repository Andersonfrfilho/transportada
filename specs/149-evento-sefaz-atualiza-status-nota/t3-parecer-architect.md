# Parecer T3: aprovado com ajustes

## Resumo

O desenho da T3 está certo na base. A política pura é a única fonte da regra. A guarda fica no `WHERE`. O lock é por empresa e chave e dura só a transação. A trilha e a idempotência já estão garantidas pelo banco, porque a H1 criou os CHECKs de transição e a unique `(company, document, status_after)`.

Há um bloqueio que o plano não viu. **Com o código de hoje, o resumo nunca chega ao repositório quando a chave já está gravada, e a D3 fica morta.** Além dele, faltam decisões que o executor não pode tomar sozinho: o formato da chave do lock, a ordem exata dentro da transação, de onde sai o logger, o que fazer com evento duplicado, e como dividir o trabalho com a H2.

**Recomendação sobre a H2:** a T3 absorve tudo da H2, menos o `correction_text`. Os CHECKs da H1 obrigam isso: `nfe_events_origin_import_check` exige `origin` junto com `import_id`, e `nfe_events_protocol_check` exige `status_code` junto com `protocol`. A H2 encolhe para "subir o pacote para 0.3.1 + gravar `correction_text`" e roda **depois** da T3, em commit separado.

## Análise (fatos do código)

1. **O resumo de chave conhecida é descartado antes de persistir.**
   - `storeItemOrSkip` pula todo item que não é evento cuja chave já está em `storedAccessKeys`, com `reason: 'already_stored'` (`nfe-distribution-persistence.adapter.ts:199-212`).
   - `findStoredAccessKeys` só exclui evento (`:164-183`). Resumo entra.
   - A D3 vale **só** para nota que já existe. Então o ramo `variant === 'summary'` de `#persistItem` (`drizzle-nfe-distribution.repository.ts:227-228`) nunca vê uma chave onde a D3 se aplica.
   - O `situacao` chega a ser montado (`nfe-distribution-item.mapper.ts:114`), mas o repositório não o lê.
2. **Uma chave por transação nos dois trilhos.**
   - Importação: uma transação por item (`drizzle-nfe-import-consumer.repository.ts:232`).
   - Distribuição: `#persistItem` abre uma transação por item, dentro do laço sequencial de `persistPage` (`drizzle-nfe-distribution.repository.ts:161-168` e `:204`).
   - Nenhum dos dois consumidores de NF-e roda sob `runWithProcessingLock` (nenhum uso em `src/main.ts`, `src/runtime`, `src/nfe-*`). Por isso não existe transação aninhada segurando outro lock.
3. **Advisory locks que já existem:**
   - outbox do worker: `hashtextextended('${companyId}:${consumerName}:${eventId}', 0)` (`drizzle-outbox.repository.ts:161-164`);
   - cron: `hashtextextended('cron:…', 0)`, lock de sessão (`cron-transportada/src/shared/drizzle-advisory-lock.ts:20`, `tick.constant.ts:10`);
   - billing da API: `hashtextextended(companyId, 9011)` (`drizzle-billing.repository.ts:266`);
   - inteiros `14_026` e `14_014` (`environment-provisioning.constant.ts:4`, `local-identity-seed.constant.ts:13`);
   - digest SHA truncado (`drizzle-company-settings.support.ts:53`).

   Todos compartilham o mesmo espaço `bigint`. A string da D8 (`company_id || ':' || access_key`) tem formato diferente da string do outbox, mas nada a identifica como desta feature.

4. **Os repositórios não têm logger.** O construtor de `DrizzleNfeImportConsumerRepository` só recebe `storageProvider` (`:87-98`), e o de `DrizzleNfeDistributionRepository` também (`:69-94`). Só o adapter da distribuição tem logger (`main.ts:731-742`). Os `warn`s da D2/D3 não têm de onde sair.
5. **Os dados de origem já estão disponíveis:**
   - importação: `importRow { requestedByUserId, source }` (`drizzle-nfe-import-consumer.repository.ts:217-228`);
   - distribuição: `run.requestedByUserId` (`drizzle-nfe-distribution.repository.ts:146-153`), e o `source` é sempre `'distribution'`;
   - `NfeImportSource = 'distribution' | 'upload'` (`src/database/nfe.schema.ts:28`);
   - `SYSTEM_DISTRIBUTION_ACTOR_USER_ID` só existe no cron (`cron-transportada/src/nfe-distribution-pull/domain/system-distribution-actor.constant.ts`).
6. **O caminho de nota duplicada na importação não entra em transação.** `findExistingDocument` roda antes e devolve `'duplicated'` (`nfe-import-consumer.service.ts:199-235`). Reimportar uma nota `authorized` já cancelada nunca chega ao insert, e a H3 fica coberta sem código novo.
7. **Upsert sem constraint declarada.** A cópia do schema no worker não declara uniques (`nfe.schema.ts:248-286`). `onConflictDoNothing({ target: [...] })` funciona por inferência de índice, igual ao código atual. As constraints da H1 existem com os nomes do parecer (conferido na `migration.sql`).
8. **Pacote fiscal.** O worker fixa `0.3.0-rc.7` (`package.json:27`). A 0.3.1 já está no npm. `correctionText` só é preenchido quando `type === '110110'` (fonte `NfeXmlImporter.service.ts:433`).

## Causa raiz dos ajustes

- **Resumo descartado.** O filtro `already_stored` da spec anterior foi escrito para não "rebaixar" uma nota completa com dados do resumo. Ele não sabia que o resumo passaria a carregar uma transição de status.
- **Lacunas de fiação.** Os CHECKs da H1 amarram colunas que o plano espalhava entre T3 e H2 (`origin`↔`import_id`, `protocol`↔`status_code`). Não dá para gravar a trilha da T3 sem a origem.

## Ajustes (lista exata para o executor)

### A1: o resumo com situação passa pelo adapter (bloqueante)

No `storeItemOrSkip` (`nfe-distribution-persistence.adapter.ts:199`), o skip `already_stored` **não** se aplica quando:

```
candidate.variant === 'summary' &&
resolveSummaryStatusChange({ situation: candidate.dfe.situacao ?? '' }).kind === 'change'
```

Com `'1'`, `''` ou ausente, o skip continua como hoje. O item segue o fluxo normal: `storeImportedSummary` e depois `persistPage`. A linha em `nfe_import_items` com `variant: 'summary'` é o que liga a mudança à importação.

Contrato em `test/nfe-distribution.contract.test.ts`, com uma chave já gravada:

- resumo `'2'` e resumo `'3'` **não** são pulados;
- resumo `'1'` e resumo `''` continuam pulados com `already_stored`;
- nota completa com chave já gravada continua pulada.

### A2: chave do lock, com namespace

Em `nfe-document-status.constant.ts`:

```ts
export const NFE_DOCUMENT_STATUS_LOCK_NAMESPACE = 'nfe-document-status'
```

A chave é `${NFE_DOCUMENT_STATUS_LOCK_NAMESPACE}:${companyId}:${accessKey}`, com semente `0`:

```sql
select pg_advisory_xact_lock(hashtextextended($1, 0))  -- $1 = a chave montada no TS, parâmetro, nunca sql.raw
```

- O prefixo marca o espaço desta feature, no mesmo padrão do `cron:`.
- Colisão de hash de 64 bits com outro lock (outbox, billing ou inteiros) só gera espera, nunca erro de corretude, porque a guarda está no `WHERE` e na unique.
- Não existe deadlock por colisão: toda transação desta feature toma **um** lock só, e nenhuma transação que segura outro advisory lock toma este (Análise 2).
- Registrar isso num comentário de uma linha junto da constante.

### A3: ordem de aquisição

- **Invariante:** uma chave por transação, e o lock é o **primeiro comando da transação**, antes de qualquer leitura ou escrita (inclusive `stored_objects` e o `select` de `nfe_import_items`).
- Se um dia uma transação precisar de várias chaves, ordena por `(companyId, accessKey)` crescente e trava todas antes da primeira escrita. Registrar no CLAUDE.md do worker (T7).
- Casos sem lock:
  - resumo sem `accessKey`;
  - resumo com `resolveSummaryStatusChange(...).kind === 'ignore'`;
  - caminhos da importação fora de `imported`, que não abrem transação.

### A4: arquivos e assinaturas

Todos com o cabeçalho de copyright. Função com mais de um parâmetro recebe objeto, e os tipos `*Params`/`*Result` ficam em `types/`.

**`src/nfe-documents/domain/system-distribution-actor.constant.ts`**

- Cópia literal do UUID do cron, com comentário "cópia de cron-transportada/…; app não importa código de outra".

**`src/nfe-documents/domain/nfe-event-origin.policy.ts`**

```ts
export function resolveNfeEventOrigin(params: ResolveNfeEventOriginParams): NfeStatusProvenance
// upload                   → { origin: 'manual',    actorUserId: requestedByUserId, requestedByUserId: null }
// distribution + SYSTEM id → { origin: 'automatic', actorUserId: null,              requestedByUserId: null }
// distribution + outro id  → { origin: 'automatic', actorUserId: null,              requestedByUserId }
```

**`src/nfe-documents/types/nfe-document-status.types.ts`**

```ts
export type NfeStatusProvenance = {
  readonly importId: string
  readonly origin: NfeEventOrigin
  readonly actorUserId: string | null
  readonly requestedByUserId: string | null
}
export type NfeStatusChangeRecord = {
  readonly documentId: string
  readonly from: NfeDocumentStatus
  readonly to: NfeDocumentStatus
  readonly cause: NfeDocumentStatusChangeCause
}
export type NfeStatusWarning =
  | {
      readonly code: 'nfe_event_status_not_applied'
      readonly eventId: string
      readonly eventType: string
      readonly reason: NfeDocumentStatusNotAppliedReason
    }
  | {
      readonly code: 'nfe_summary_status_inconsistent'
      readonly documentId: string
      readonly situation: string
    }
export type NfeStatusWriteResult = {
  readonly change: NfeStatusChangeRecord | null
  readonly warning: NfeStatusWarning | null
}
```

Mais os tipos `*Params` de cada função abaixo. `ResolveNfeEventOriginParams` recebe `{ importId, source, requestedByUserId }`.

**`src/nfe-documents/infrastructure/drizzle-nfe-document-status.persistence.ts`** (primitivas, cada uma recebe `tx`)

- `lockAccessKey({ tx, companyId, accessKey }): Promise<void>`: o SQL do A2.
- `readDocumentStatus({ tx, companyId, accessKey }): Promise<{ documentId; status } | null>`: `select id, status from nfe_documents where company_id=$c and access_key=$k`. Sem `FOR UPDATE`, porque o lock serializa todo escritor de status.
- `applyStatusChange({ tx, companyId, documentId, to }): Promise<{ changed: false } | { changed: true; changedAt: Date }>`:

  ```sql
  update nfe_documents set status = $to, updated_at = clock_timestamp()
  where company_id = $c and id = $d and status in (<ALLOWED_ORIGIN_STATUSES[to]>)
  returning updated_at
  ```

  - Use `clock_timestamp()`, não `now()`. Uma transação que esperou o lock teria `now()` anterior ao `created_at` da nota inserida pela outra, e isso quebra a ordem da listagem na H7.
  - A lista do `IN` sai de `ALLOWED_ORIGIN_STATUSES` via `inArray`. Lista vazia → não executa e devolve `{ changed: false }`.

- `recordStatusChange({ tx, companyId, change, eventId, provenance, changedAt }): Promise<void>`: insere em `nfe_document_status_changes` com `changedAt` explícito, igual ao `updated_at` devolvido (ou ao `created_at` da nota, no caso `document_insert`), e `onConflictDoNothing({ target: [companyId, documentId, statusAfter] })`.
- `findPendingStatusFromEvents({ tx, companyId, accessKey }): Promise<{ to; eventId } | null>`:
  - `select id, event_type, status_code from nfe_events where company_id=$c and target_access_key=$k and event_type in (<chaves de NFE_STATUS_CHANGING_EVENT_TYPES>) order by created_at asc, id asc`;
  - em TS, o primeiro com `resolveEventStatusChange({ eventType, statusCode: status_code ?? undefined }).kind === 'change'`;
  - o filtro de `cStat` **não** vai para o SQL, para a política continuar sendo a única fonte.

**`src/nfe-documents/infrastructure/nfe-document-status-write.persistence.ts`** (orquestração compartilhada pelos dois trilhos)

- `writeEventWithStatus({ tx, companyId, event, xmlObjectId, environment?, sourceNsu?, provenance }): Promise<NfeStatusWriteResult>`
- `resolveInitialDocumentStatus({ tx, companyId, accessKey, xmlStatus }): Promise<{ status; pendingEventId: string | null }>`
- `recordDocumentInsertChange({ tx, companyId, documentId, xmlStatus, status, pendingEventId, createdAt, provenance }): Promise<NfeStatusChangeRecord | null>`
- `applySummaryStatus({ tx, companyId, accessKey, situation, provenance }): Promise<NfeStatusWriteResult>`

**Logger:**

- `DrizzleNfeImportConsumerRepositoryOptions` e `DrizzleNfeDistributionRepositoryOptions` ganham `readonly logger: NfeDocumentStatusLogger` (`{ info; warn }`, obrigatório).
- `main.ts:699` e `:736` passam o `logger`.
- O repositório loga **depois do commit**, a partir do `NfeStatusWriteResult` que a transação devolve. Log dentro de transação desfeita mente.

### A5: ordem das operações dentro de cada transação

**Evento** (ramo `nfe-event` de `completeItem` e `#insertEvent`):

1. `lockAccessKey`.
2. Insert de `stored_objects`, como hoje. Na distribuição, o `select` de `existingItem` vem **depois** do lock.
3. `current = readDocumentStatus`.
4. `resolution = resolveEventStatusChange({ eventType: event.type, statusCode })`:
   - `statusCode` = `event.statusCode` só se casar com `/^\d{3}$/`, senão `undefined`;
   - se não casar, grava `status_code` e `protocol` como `null`, para não violar os CHECKs e derrubar a importação.
5. `willChange = resolution.kind === 'change' && current !== null && isStatusTransitionAllowed({ from: current.status, to: resolution.to })`.
6. Insert em `nfe_events`, com os campos de hoje mais:
   - `statusCode`, e `protocol` só quando `statusCode` foi gravado;
   - `importId`, `origin`, `actorUserId`, `requestedByUserId` de `provenance`;
   - `documentStatusBefore = current?.status ?? null` e `documentStatusAfter = current === null ? null : (willChange ? resolution.to : current.status)`;
   - `onConflictDoNothing(...)` e `.returning({ id })`.

   Se o insert não devolver linha (evento duplicado), faça `select id` pela unique `(company_id, target_access_key, event_type, event_sequence)` e **não** reescreva o snapshot nem a origem da linha existente (D15).

7. Se `willChange`:
   - `applyStatusChange`; se voltar `changed: false`, lance `Error('NFE_DOCUMENT_STATUS_INVARIANT_BROKEN')`, porque sob o lock isso é impossível, e aí a transação desfaz e a mensagem vai para retry;
   - `recordStatusChange` com `cause: 'event'` e `eventId`.

   Isso vale **também** para evento duplicado: cobre o evento gravado antes desta spec (plano, "Fiação por trilho").

8. Se `resolution.kind === 'not-applied'`: `warning = nfe_event_status_not_applied { eventId, eventType, reason }`, com ou sem nota.
9. Update de `nfe_import_items`, como hoje (só na importação).

**Nota** (ramo documento de `completeItem` e `#insertDocument`):

1. `lockAccessKey`.
2. `stored_objects`, e na distribuição o `existingItem`.
3. `resolveInitialDocumentStatus`:
   - `pending = findPendingStatusFromEvents`;
   - `status = pending && isStatusTransitionAllowed({ from: document.status, to: pending.to }) ? pending.to : document.status`.
4. Insert de `nfe_documents` com `status`, `onConflictDoNothing` e `.returning({ id, createdAt })`.
5. Se criou e `status !== document.status`: `recordStatusChange` com:
   - `cause: 'document_insert'`, `from: document.status`, `to: status`;
   - `eventId: pending.eventId`, que o CHECK `event_presence` exige;
   - `provenance` da importação **da nota**;
   - `changedAt = createdAt`.

   A linha do evento continua `null`/`null` (D15). **Não** atualize `nfe_events`.

6. `writeDocumentChildren`, como hoje.
7. Update de `nfe_import_items`.

**Resumo** (`variant === 'summary'` em `#persistItem`, com `accessKey` e `kind === 'change'`):

1. `lockAccessKey` como primeiro comando.
2. `stored_objects` e `existingItem`.
3. `current = readDocumentStatus`. Se for `null`, nada acontece (D3).
4. Se `isStatusTransitionAllowed({ from: current.status, to })`: `applyStatusChange` e `recordStatusChange` com `cause: 'summary'`, `eventId: null` e a `provenance` da execução.
5. Senão, se `current.status === 'authorized' && to === 'denied'`: `warning = nfe_summary_status_inconsistent`. Qualquer outro caso, inclusive já estar no destino, fica em silêncio (idempotência).
6. `nfe_import_items`, como hoje.

**Provenance:**

- Importação: `resolveNfeEventOrigin({ importId: item.importId, source: importRow.source, requestedByUserId: importRow.requestedByUserId })`.
- Distribuição: `persistPage` passa a ler `source` junto com `requestedByUserId` (`:146-153`), calcula a provenance **uma vez por página** e a passa para `#persistItem`.

**Logs, depois do commit:**

- `info nfe_document_status_changed { companyId, documentId, from, to, cause }`.
- Os dois `warn`s com os campos acima.
- Nunca chave de acesso, XML, nome ou texto de CC-e.

### A6: integração (vermelha antes), `test/nfe-document-status.integration.test.ts`

Entra na lista `test:integration` do `package.json` do worker. Roda com `.env.test` (`make worker-integration`). Usa os dois repositórios reais e um logger falso que captura as chamadas. Cenários:

- **H1**, nos dois trilhos:
  - evento `110111` com `135` sobre nota `authorized` → `cancelled`;
  - `updated_at > t0`;
  - uma linha `cause='event'` com `changed_at = updated_at`;
  - evento com `before='authorized'`, `after='cancelled'` e `origin`, ator e solicitante coerentes: upload → `manual` + ator; agendada → `automatic` com os dois nulos; "buscar agora" → `automatic` + solicitante.
- **H2**, nos dois trilhos:
  - evento antes da nota → evento `null`/`null`;
  - nota inserida `cancelled`, com filhos gravados;
  - linha `document_insert` com `event_id` = o de menor `created_at, id`, usando dois eventos aplicáveis (`110111` e `110112`).
- **H3:**
  - mesmo evento reprocessado (nova `importId`) → `updated_at` inalterado, uma única linha de mudança, snapshot original preservado;
  - segundo cancelamento com outra sequência → evento `cancelled`→`cancelled`, sem linha nova;
  - reimportação da nota → `duplicated`.
- **H3 (evento legado):** evento pré-spec (colunas novas nulas) e nota `authorized`; o mesmo evento chega de novo → nota `cancelled`, linha `cause='event'` apontando para o id existente, linha do evento intocada.
- **H4:**
  - CC-e, manifestação `210200`, `cStat 573` e evento sem `retEvento` → nota e `updated_at` intactos, nenhuma linha de mudança;
  - `warn nfe_event_status_not_applied` só nos dois últimos;
  - evento sem `statusCode` grava `status_code` e `protocol` nulos.
- **H5:**
  - mesma chave nas empresas A e B, cancelamento em A → só A muda, e o `updated_at` de B fica igual;
  - contrato de lock entre empresas: um controle segurando a chave `(A,K)` não bloqueia uma escrita `(B,K)` nem `(A,K2)`, que terminam dentro de 2 s. Isso prova que o lock não serializa globalmente.
- **H6:**
  - `unsigned` + `'3'` → `denied`;
  - `authorized` + `'3'` → nada, com `warn`;
  - `authorized` + `'2'` → `cancelled`, linha `summary` com `event_id` nulo;
  - resumo de chave desconhecida → nada.
- **H7**, determinístico, nas duas ordens:
  - uma conexão de controle (outro `createDrizzleProvider`) toma `pg_advisory_lock(hashtextextended(<chave>, 0))` **de sessão**;
  - dispara a escrita 1 (nota, por um provider) e espera até `select count(*) from pg_locks where locktype='advisory' and not granted` = 1;
  - dispara a escrita 2 (evento, por outro provider) e espera a contagem chegar a 2;
  - solta o controle;
  - repete com nota e evento trocados;
  - nas duas ordens: nota `cancelled`, exatamente uma linha de mudança (`event` numa ordem, `document_insert` na outra), e `updated_at >= created_at`.

  Um caso extra roda os dois em `Promise.all` sem controle, 20 vezes, com chaves novas, e confere o mesmo.

Unitários, na lista `test`:

- `test/nfe-event-origin.contract.test.ts`: as três linhas da D14, e `upload` sem ator é impossível pelo tipo;
- o contrato do adapter do A1.

### A7: a H2 depois da T3, e o que sobra nela

- **T3:** tudo acima. Inclui `status_code`, `protocol`, origem, ator, solicitante e snapshot, e sai do escopo da H2.
- **H2' (depois, commit isolado):**
  1. subir `@adatechnology/fiscal-provider` de `0.3.0-rc.7` para `0.3.1` no worker, com lockfile e `--frozen-lockfile`; conferir se a API ou o cron fixam a mesma versão e alinhar;
  2. em `writeEventWithStatus`, gravar `correctionText: event.type === '110110' ? event.correctionText ?? null : null`, cortando em 1000 caracteres para o CHECK;
  3. inverter o teste de lacuna da T1 (`nfe-event-fields.contract.ts`);
  4. integração: CC-e grava o texto e o texto não aparece em nenhum log.

**Por que em sequência e não juntas:** a subida vai de rc.7 a 0.3.1 e mexe no pacote fiscal inteiro, inclusive na emissão de CT-e e MDF-e. Precisa de um commit próprio para rollback barato, separado da mudança crítica de concorrência. Como a escrita do evento fica num ponto só (`writeEventWithStatus`), a H2' é uma linha nesse arquivo, sem conflito com os repositórios.

**Atualizar o `tasks.md`:** T3 com o escopo do A5/A6, e H2 reduzida à H2'.

## Recomendações, por prioridade

1. **A1**, o resumo passa pelo adapter. Esforço baixo, impacto crítico: sem ele a D3 não existe.
2. **A5 + A2 + A3**, ordem, lock e namespace. Esforço médio, impacto alto: corretude na corrida e na trilha.
3. **A6**, integração com H7 determinístico e isolamento de lock. Esforço médio, impacto alto: é a única prova da D8.
4. **A4**, logger e provenance nos repositórios. Esforço baixo; sem isso os `warn`s e os CHECKs de origem não fecham.
5. **A7**, a H2' depois da T3. Esforço baixo, e o rollback fica isolado.

## Trade-offs

| Decisão                                                     | A favor                                                     | Contra                                                                                                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefixo na string com semente 0, e não o par `(int4, int4)` | Mesmo padrão do repo (outbox, cron); 64 bits de hash        | Divide o espaço `bigint` com os outros locks; colisão só gera espera                                                                                                                         |
| Lock como primeiro comando da transação                     | Nenhuma escrita da chave fora da seção crítica              | Segura o lock também durante o insert em `stored_objects`, que é barato                                                                                                                      |
| `clock_timestamp()` no `updated_at`                         | A ordem da listagem continua certa depois de esperar o lock | Difere do `now()` do resto da transação                                                                                                                                                      |
| Evento duplicado ainda aplica a transição                   | Cobre eventos gravados antes da spec, sem backfill          | A linha legada fica sem snapshot; a H3 mostra "anterior não registrado" e a mudança aparece pela linha `cause='event'` (a H3 precisa de `left join` por `event_id` para exibir antes→depois) |
| Resumo com situação deixa de ser pulado                     | A D3 funciona                                               | Guarda o XML do resumo e uma linha em `nfe_import_items` para a chave conhecida (serve de evidência fiscal)                                                                                  |
| H2' separada                                                | Rollback do pacote independente da concorrência             | Um ciclo de gates a mais                                                                                                                                                                     |

## Referências

- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/nfe-distribution/infrastructure/nfe-distribution-persistence.adapter.ts:164-212`: resumo de chave gravada é pulado (`already_stored`).
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.ts:146-168,204-252,296-316,335-369`: `run`, transação por item, insert de evento e de nota.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.ts:87-98,217-228,232-325`: sem logger, `importRow`, transação do item.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/nfe-imports/application/nfe-import-consumer.service.ts:199-235`: nota duplicada sai antes da transação.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/outbox/infrastructure/drizzle-outbox.repository.ts:161-164`: formato de lock que já existe no worker.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/src/billing/infrastructure/drizzle-billing.repository.ts:266`: `hashtextextended(companyId, 9011)`.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/main.ts:699,736`: onde injetar o logger.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/database/nfe.schema.ts:28,47-49,248-286`: tipos e cópia do schema.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/nfe-documents/domain/nfe-document-status-transition.policy.ts` e `nfe-document-status.constant.ts`: política da T2, reaproveitada sem mudança.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/drizzle/20260915021812_nfe_event_history/migration.sql`: nomes das constraints (`nfe_document_status_changes_document_target_unique`, `nfe_events_protocol_check`, `nfe_events_origin_import_check`, `..._event_presence_check`).
- `/Users/anderson.filho/Documents/personal/adatechnology-packages-wt/fiscal-cce-text/packages/backend/fiscal-provider/src/providers/NfeXmlImporter.service.ts:433`: `correctionText` só em `110110`.
