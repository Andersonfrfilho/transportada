# Plano técnico

## Contexto e premissas

- `stored_objects` já tem o vocabulário inteiro da exclusão, e ele está morto: `status='deleted'`,
  `deleted_at`, `retention_until` (`apps/api-transportada/src/database/storage.schema.ts:45,48,51`)
  não têm escritor nem leitor em produção nas três apps. Esta spec os liga.
- O apagar no bucket já existe e é um só: `NfeStorageGateway.deleteObject`
  (`apps/api-transportada/src/storage/infrastructure/nfe-storage-gateway.ts:61,159`), hoje usado
  apenas pela limpeza de rollback (`trips/application/stored-object-cleanup.service.ts:24`). O
  worker tem o gêmeo (`apps/worker-transportada/src/storage/infrastructure/nfe-storage-gateway.ts:36`)
  e, ao lado dele, a porta `NfeStorageRecordRepositoryPort` (l. 40-47, com
  `listExpiredStagingObjects`/`markExpiredReconciled`) **declarada e sem nenhum chamador** — é o
  encaixe que a rotina desta spec ocupa.
- As 16 FKs para `stored_objects` são todas `onDelete('restrict')`. A linha nunca some; por isso a
  exclusão é lápide, não `DELETE`.
- O módulo `storage/` da API tem só `infrastructure/` — não há `presentation/` nem rota. Ganha as
  quatro camadas.
- Sem migration em `audit_logs`: o IP já vai em `metadata.ipAddress`
  (`trips/infrastructure/trip-field-office-audit.persistence.ts:31`), com
  `resolveClientIp` (`http/client-ip.service.ts:11`).

## Arquitetura e arquivos afetados

**API — `apps/api-transportada/src/`**

- `shared/storage-purpose.constant.ts` **(novo)** — as **duas** classificações exaustivas:
  `STORAGE_PURPOSE_CLASSIFICATION: Record<StorageObjectPurpose, 'protected' | 'purgeable' |
'by-link'>` e `STORAGE_LINK_CLASSIFICATION: Record<StorageObjectRecordType, 'protected' |
'purgeable'>`, mais `resolveStorageProtection({ purpose, recordType })` — função pura que devolve
  `{ state, reason, individualPurgePath }`. É a camada 1 da barreira (D6): finalidade nova **ou**
  tabela referenciadora nova não compilam sem classificação.
- `shared/api.constant.ts` — `API_STORAGE_SUMMARY_PATH`, `API_STORAGE_OBJECTS_PATH`,
  `API_STORAGE_PURGES_PATH`, `API_STORAGE_OBJECT_RESTORE_PATH`.
- `identity/domain/authorization.policy.ts` — `storage.read` e `storage.purge` em
  `TRANSPORTADA_PERMISSIONS` e em `COMPANY_ROLE_PERMISSIONS['company-admin']`.
- `storage/domain/storage-purge.error.ts` **(novo)** — `StoredObjectNotPurgeableError` (422),
  `StoredObjectAlreadyPurgedError` (409), `IllegibleReasonInvalidError` (400).
- `storage/domain/illegible-reason.policy.ts` **(novo)** — regra pura do motivo de ilegibilidade:
  20 a 500 caracteres (teto amarrado ao CHECK `audit_logs_reason_check`) e recusa de padrão de CPF,
  CNPJ, telefone, e-mail e CEP. Sem I/O.
- `storage/domain/storage-purge.policy.ts` **(novo)** — regra pura: dado finalidade, status, lease e
  janela, qual é o `outcome`. Sem I/O, testável direto.
- `storage/application/list-stored-objects.use-case.ts`, `summarize-storage.use-case.ts`,
  `purge-stored-objects.use-case.ts`, `restore-stored-object.use-case.ts`,
  `purge-illegible-delivery-proof.use-case.ts` **(novos)**.
- `storage/application/storage-purge.port.ts` **(novo)** — portas de repositório e do gateway
  (`Pick<NfeStorageGateway, 'deleteObject'>`), injetadas por construtor.
- `storage/infrastructure/drizzle-stored-object.repository.ts` — ganha `listPage`, `summarize`,
  `findManyForPurge`, `markDeleted`, `markRestored`. Hoje só tem `saveImportSource` (l. 13).
- `storage/infrastructure/stored-object-link.query.ts` **(novo)** — os 16 `NOT EXISTS`, o
  `recordType`, a montagem do `recordLabel` e a chamada a `resolveStorageProtection`, num arquivo
  só, porque é a peça que envelhece junto com o schema. **O vínculo e a proteção saem do mesmo
  passo** — a classe `by-link` não custa consulta extra nem quebra o keyset (D6, camada 2).
- `storage/infrastructure/stored-object-audit.persistence.ts` **(novo)** — molde copiado de
  `trips/infrastructure/trip-field-office-audit.persistence.ts`.
- `storage/presentation/storage.routes.ts`, `storage.schema.ts` **(novos)**.
- `main.ts` — cabeamento das quatro rotas.
- Rotas que servem objeto armazenado — `410` quando a linha está `deleted` (RF8).

**Worker — `apps/worker-transportada/src/`**

- `storage-object-purge/domain/storage-object-purge.constant.ts`,
  `application/storage-object-purge.port.ts`, `application/storage-object-purge.routine.ts`,
  `infrastructure/drizzle-storage-object-purge.repository.ts` **(novos)** — quatro camadas, cópia
  fiel do molde de `rate-limit-window-purge/`.
- `shared/job-catalog.constant.ts` — `storage.object.purge`, `minimumIntervalSeconds: 3600`.
- `main.ts` — registro no mapa `routines:` (l. ~1208).
- `database/nfe.schema.ts` — o espelho de `storedObjects` (l. 288-306) precisa de
  `retention_until` conferido pelo contrato de paridade.

**API — catálogo de job**: `shared/job-catalog.constant.ts` da API também, porque
`test/job-catalog/catalog.contract.ts` compara os dois.

**Frontend — `apps/frontend-transportada/src/`**

- `modules/storage/` **(novo)**: `pages/StorageWorkspace.page.tsx`,
  `components/StorageObjectTable.component.tsx`, `components/PurgeConfirmDialog.component.tsx`,
  `hooks/useStorageWorkspace.hook.ts`, `shared/storageClient.service.ts`,
  `shared/storageResponse.validation.ts`, `shared/storageViewModel.service.ts`,
  `locales/storageWorkspace.locale.json` + `.en.locale.json`,
  `styles/storageWorkspace.module.css`. Esqueleto por `modules/operations/`.
- `main.tsx` — `'storage'` na união de `WorkspaceNavigationItem['key']` (l. 77),
  `{ href: '/armazenamento', key: 'storage', label: 'Armazenamento' }` em
  `WORKSPACE_NAVIGATION_ITEMS`, entrada no grupo `administration` (l. 175-178), `lazy()`, `switch`,
  `resolveCurrentWorkspace()`, e o filtro do item por `storage.read`.
- `modules/shared/i18n/i18n.service.ts` — dois imports + namespace `storageWorkspace` nas árvores
  `en` e `pt-BR`.
- `modules/identity/shared/permissionGroups.constant.ts` — as duas permissões no grupo certo, senão
  caem em `other` na tela de papéis.
- `modules/shared/cursorPagination.service.ts` — reúso, sem mudança.

## Contratos/API/eventos

```
GET  /storage/summary                      storage.read   200 { data: { byPurpose: [...], totals: {...} } }
GET  /storage/objects                      storage.read   200 { data: [...], page: { nextCursor } }
     ?purpose&from&to&minSizeBytes&status&link&cursor&limit
POST /storage/purges                       storage.purge  200 { data: { batchId, results: [...] } }
     Idempotency-Key obrigatório; body { objectIds: [1..50] }
POST /storage/objects/:id/restore          storage.purge  200 { data: {...} } | 409
POST /storage/objects/:id/purge-illegible  storage.purge  200 { data: {...} } | 400 | 422
     body { reason: string(20..500) } — único caminho que apaga canhoto
```

Erros: `STORAGE_OBJECT_NOT_PURGEABLE` (422, com `reason` `purpose` ou `delivery_proof`),
`STORAGE_OBJECT_ALREADY_PURGED` (409), `ILLEGIBLE_REASON_INVALID` (400),
`STORED_OBJECT_PURGED` (410, nas rotas de download).

**Sem migration de `audit_logs`**: o motivo de ilegibilidade cabe na coluna `reason` que já existe,
e o teto de 500 da spec é o próprio CHECK `audit_logs_reason_check`
(`fiscal-operation.schema.ts:88-90`).

Sem evento novo de fila. A rotina do worker é agendada por `job_schedules`, como as irmãs.

## Dados, migration e rollback

Uma migration, **aditiva**, sem alterar coluna existente:

1. Índice de ordenação: `stored_objects (company_id, created_at desc, id desc)`.
2. Índice da janela: `stored_objects (retention_until) where status = 'deleted'` — parcial, porque a
   rotina só enxerga essa fatia.
3. **Os 16 índices de FK que faltam**, um por coluna referenciadora
   (`(company_id, <coluna>)`), listados na tabela de D3 da spec. Nenhum existe hoje; o Postgres não
   indexa coluna de FK sozinho. Sem eles, cada `NOT EXISTS` de D3 é um seq scan — e, de quebra, cada
   verificação `restrict` dessas FKs também já é hoje.

`snapshot.json` obrigatório na pasta da migration (`apps/api-transportada/CLAUDE.md`, "Migration à
mão é permitida, sem snapshot não"); `test/database-migration/schema-snapshot.contract.ts` é quem
pega a falta. Rollback ao lado: `drop index` dos 18, sem perda de dado.

⚠️ Antes do push, conferir numeração de migration contra `origin/staging` e que `db:generate`
devolve `no_changes` (memória do projeto: colisão com outras sessões).

## Segurança e tenant

- `companyId` do contexto em toda consulta e escrita; contrato negativo entre empresas obrigatório.
- Resposta sem `object_key`/`bucket`/`provider`/`sha256`, com contrato que varre o JSON — a mesma
  postura de `operations.routes.ts:22-23` e de `docs/SECURITY.md:49`.
- `recordLabel` construído de identificadores de negócio (número de viagem, de fatura, protocolo),
  nunca de nome, telefone, CPF ou e-mail (LGPD, `security.md` §1).
- Trilha de auditoria por objeto, com ator, alvo, IP e timestamp (§10 do code-standart), na
  transação da ação e sem PII.
- `rateLimit` declarado em `POST /storage/purges` (RNF3).
- Barreira em quatro camadas independentes (D6), sendo a primeira o próprio compilador — e agora
  ela é por **finalidade e vínculo**, porque `delivery_proof` serve canhoto e anexo de ocorrência.
- A camada 3 reclassifica **dentro da transação, com `select … for update`** na linha de
  `stored_objects`: entre listar e apagar, um órfão pode ganhar vínculo em `trip_delivery_proofs` e
  virar canhoto. Reconferir fora da transação deixaria essa janela aberta.
- O `reason` de ilegibilidade é texto livre indo para registro permanente — validado contra CPF,
  CNPJ, telefone, e-mail e CEP antes de chegar à trilha (LGPD, `security.md` §1).
- Achado novo a registrar em `docs/SECURITY.md` ao fim: os 16 índices de FK ausentes, e o fato de o
  expurgo por listagem do bucket (objeto sem linha) continuar pendente — atualizar a entrada de
  2026-09-18 apontando para esta spec, sem fechá-la.

## Idempotência e concorrência

- `Idempotency-Key` sobre `idempotency_records` (`operation = 'storage.purge'`), resposta guardada.
- Segunda camada, independente da chave: o `UPDATE … where status <> 'deleted'` devolve zero linhas
  para quem já foi excluído, e é o `returning` que decide `purged` vs `already_purged` — nunca uma
  leitura prévia. Mesmo freio por índice que `operations.routes.ts:116-127` usa para o `409`.
- Exclusão e restauração competindo com a rotina: resolvido no `where` da rotina
  (`status='deleted' and retention_until <= now()`), não em leitura prévia.
- A rotina toma lotes com `for update skip locked`, como
  `drizzle-rate-limit-window-purge.repository.ts:20-30`.
- Apagar objeto ausente no provedor é sucesso, não falha.

## Observabilidade

- `storage_purge_requested` (ator, quantidade, batchId, correlationId) e
  `storage_purge_finished` (contagem por `outcome`) — contagens e ids opacos, nada de chave.
- Rotina: `storage_object_purge_cycle_finished` com `batches/deleted/bytesFreed/exhausted/
correlationId/executionId`, no molde de `rate-limit-window-purge.routine.ts:54-64`.
- Falha do provedor no ciclo loga `errorCode`/`outcome`, nunca a chave do objeto.

## Estratégia de testes

Teste de aceite/contrato **antes** da implementação, em toda task.

- API, contrato (`bun --env-file=../../.env.test test --timeout 120000`):
  `test/storage/purpose-classification.contract.ts` (CA2, CA2b, CA3),
  `test/storage/purge-illegible.contract.ts` (CA15),
  `test/storage/driver-score-unchanged.contract.ts` (CA14),
  `test/storage/list.contract.ts` (CA2, CA4), `test/storage/purge.contract.ts` (CA5, CA6, CA7),
  `test/storage/restore.contract.ts` (CA8), `test/storage-schema/tenant-safety.contract.ts` (CA12),
  `test/storage/download-gone.contract.ts` (CA11),
  e as entradas em `test/rate-limited-routes.contract.test.ts` e `test/separator-role.contract.test.ts`.
- API, integração (`bun --env-file=../../.env.test run test:integration`):
  `test/integration/storage-object-link.integration.ts` — semeia objeto em cada uma das 16 colunas,
  prova a classificação órfão/vinculado, e mede a RNF4 com 100 mil linhas (CA9).
- Worker: `test/storage-object-purge/purge.contract.ts` e `schema-parity.contract.ts` (CA10), mais a
  entrada em `test/job-catalog/catalog.contract.ts` nas duas apps.
- Frontend: contrato do cliente e do painel (CA13), no molde de
  `test/driver-trip/occurrence.contract.ts`; smoke com a lista falhando e depois respondendo.

⚠️ **Arquivo de teste novo não roda se não for listado no `package.json` da app** — contrato e
integração são duas listas e dois comandos, e o segundo precisa do `--env-file` ou **pula** em vez
de falhar (CLAUDE.md da raiz).

## Alternativa barata, se a T0 disser que o ganho é pequeno

Registrada para não ser redescoberta. Se a medição da T0 mostrar poucos órfãos e pouco espaço
recuperável, a tela não se paga, e o que resolve o problema real é o que
`docs/SECURITY.md:169` já pede desde 2026-09-18: **uma rotina de worker, sem interface.**

Recorte: T1 (só a classificação, que a rotina também usa), T11 e T12 — a rotina
`storage.object.purge` ampliada para varrer órfãos com mais de N dias e apagá-los, com contagem no
log. Fora: permissões novas, as quatro rotas, a migration dos 18 índices (a rotina varre em lote,
não pagina sob latência de tela), o módulo de frontend e a revisão de design. De 19 tasks para
aproximadamente 4.

Isso não entrega "página para excluir coisas do bucket", que é o que o usuário pediu — entrega o
efeito (o bucket para de acumular lixo) sem a tela. É uma troca que só ele pode fazer, e é para
isso que a T0 existe antes da Fase 1.

## Riscos

1. **O risco principal já não é técnico: é a tela não se pagar.** Com fiscal, `import_source`,
   `contractor_mail_raw`, canhoto e **foto de ocorrência** (nova e antiga) fora, sobram órfão, PDF de
   fatura, documento de candidato e miniatura — e a miniatura é ganho ruim (cache). A feature virou
   essencialmente uma ferramenta de limpeza de órfãos, e **ninguém mediu quantos órfãos existem**.
   Mitigação: a **T0** é portão de decisão antes da Fase 1, e a § "Alternativa barata" acima é o
   plano B. Está escrito no `spec.md` em vez de mantido como expectativa.
2. **Órfão de `delivery_proof` é, em boa parte, canhoto substituído e foto de ocorrência
   substituída** (`docs/SECURITY.md:160-163`).
   Apagá-lo é o comportamento desejado — o comprovante vigente é o vinculado —, mas o rótulo do
   filtro precisa dizer isso, senão o operador apaga sem saber o que era. Defeito de rótulo, pego na
   revisão de design (T16).
3. **A independência entre nota e storage é um acoplamento a proteger, não um fato eterno.** Hoje a
   nota lê `trip_delivery_proofs.punctuality` e nunca o bucket (D9). A CA14 é contrato de regressão:
   calcula a nota, apaga, recalcula, exige valor idêntico. Se alguém ligar a nota ao storage, é esse
   teste que avisa.
4. **Acoplamento com a spec 161 — já materializado, não hipotético.** Medido na árvore de trabalho
   enquanto esta spec era escrita: a 161 acrescentou as finalidades `trip_occurrence_attachment` e
   `trip_occurrence_thumbnail` e a tabela `trip_document_occurrence_attachments`, com **duas**
   colunas para `stored_objects`. Consequências concretas: a tabela de D3 vai de 16 para 18 colunas
   (em 14 tabelas), e a classificação de D6 ganha duas linhas — as duas já escritas. A T1 e a T5
   começam conferindo `origin/staging`. Além disso, as duas specs precisam usar o mesmo
   `deleteObject` e a mesma lápide (RF7): se a 161 entrar primeiro com rotina de expurgo própria,
   esta spec a **absorve** em vez de duplicar. Conferir antes da Fase 4. Não editar `specs/161-*/`.
5. **O filtro `link=orphan` caminhando muitas linhas** numa base onde quase tudo é vinculado. A
   RNF4 mede; se reprovar, a saída é índice parcial adicional, não coluna materializada.
6. **RF8 esquecida.** Sem o `410`, a primeira exclusão vira `500` na tela de quem lê o arquivo. É
   task própria e bloqueante, não detalhe da fase da API.
7. **Migration colidindo** com outra sessão (numeração e `snapshot.json`) — memória do projeto.
