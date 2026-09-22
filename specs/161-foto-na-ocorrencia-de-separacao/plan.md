# Plano técnico

## Contexto e premissas

Quase tudo já existe e é reaproveitado em vez de reescrito:

- Upload multipart do escritório: `readOfficeMultipartForm`/`readOfficeMultipartFile`
  (`src/trips/presentation/office-multipart.schema.ts:23-53`), `assertOfficeUploadAccepted`
  (`src/trips/application/office-delivery-proof.service.ts:64-78`), `runWithStoredObjectCleanup`
  (`src/trips/application/stored-object-cleanup.service.ts:23-42`).
- Idempotência: `withFieldReport` (`src/trips/application/trip-field-report.port.ts`) sobre
  `trip_field_reports`, com fingerprint sha256 — molde em `occurrence-batch.policy.ts:13-73`.
- Presigned: `createDeliveryProofDownloadGateway`
  (`src/trips/infrastructure/delivery-proof-download.gateway.ts`, 300 s, `inline`).
- Frontend: `useCameraStream`, `reduceImageFileToJpeg`
  (`src/modules/trip/shared/fieldDeliveryImage.service.ts`), `FieldDeliveryCaptureStep` como
  referência de degradê de câmera, `OccurrenceAttachments`
  (`TripOccurrenceTable.component.tsx:66-111`) como referência de grade.
- WhatsApp: `channel.fetchMediaAsBase64` é campo do contrato do canal e **todo `FlowActionHandler`
  já recebe `channel`** — o router da foto baixa a mídia sem injeção nenhuma. O access token por
  empresa já é aberto pelo resolver a partir de `whatsapp_channels.secret_envelope`.
  ⚠️ **`providers.objectStorage` não é injetado** (reprovado na validação de arquitetura, D7): o
  `IngestInboundMediaUseCase` do pacote não grava em `stored_objects` — chave fixa
  `meta-whatsapp/{companyId}/inbound/{mediaId}`, sem purpose, sem `retention_until`, sem sha256 —
  e injetar acenderia `sendMedia`, `DeleteConversation`, `PurgeExpiredDocuments` e o nó `send_media`,
  nada disso pedido aqui. `meta-whatsapp-module.resolver.ts:82-95` segue sem `providers`, travado por
  contrato.
- A persistência com anexo já existe e é reusada pelo canal:
  `persistSeparationOccurrenceWithAttachment` (importado em `src/main.ts:233`, usado pela rota HTTP
  em `src/main.ts:2799-2824`). A dep do WhatsApp em `src/main.ts:826-843` ainda usa `saveOccurrence`
  cru — é essa linha que muda.
- Expurgo: `rate-limit.window.purge` é o molde exato — catálogo em `job-catalog.constant.ts`
  (cópia por valor nas 4 apps), rotina em
  `apps/worker-transportada/src/rate-limit-window-purge/` (porta de lote, laço com `MAX_BATCHES` e
  `isStopRequested`, log de ciclo), registro em `apps/worker-transportada/src/main.ts:1208-1215`, e
  a linha de `job_schedules` criada pela migration da API
  (`drizzle/20260915233000_rate_limit_windows/migration.sql:11-17`).

Premissas verificadas:

- O único consumidor HTTP de `POST .../occurrences` é o frontend
  (`tripClient.service.ts:835-847`) — a rota pode trocar de JSON para multipart sem cliente órfão.
- `trip_document_occurrences` **não tem** unique `(company_id, id)` (conferido em
  `src/database/trip.schema.ts:1459-1512`): é pré-requisito da FK composta da tabela nova.
- Nenhuma app escreve `stored_objects.retention_until`, `status='deleted'` ou `deleted_at` hoje —
  esta spec é a primeira a preencher e a primeira a varrer.
- `docs/SECURITY.md:149-172` já registra como achado aberto a falta de varredura periódica de
  `delivery-proofs/` e `trip-occurrence-attachments/`.

## Arquitetura e arquivos afetados

**Banco (API)**

- `src/database/trip.schema.ts`: tabela `tripDocumentOccurrenceAttachments`; unique
  `(company_id, id)` em `trip_document_occurrences`.
- `src/database/storage.schema.ts`: purposes `trip_occurrence_attachment` e
  `trip_occurrence_thumbnail` em `STORAGE_OBJECT_PURPOSES` (linhas 12-26) e CHECK ampliado.
- `src/database/database.schema.ts`: agrega a tabela nova.
- `drizzle/<ts>_trip_document_occurrence_attachments/` e
  `drizzle/<ts>_trip_occurrence_attachment_purge_job/` (catálogo + `job_schedules`).

**API — domínio**

- `src/trips/domain/occurrence-attachment.policy.ts` (novo): `OCCURRENCE_ATTACHMENT_LIMIT = 5`,
  `OCCURRENCE_ATTACHMENT_RETENTION_YEARS = 5`, `buildOccurrenceAttachmentObjectKey`,
  `resolveOccurrenceAttachmentRetentionUntil`, e as operações de idempotência.
- `src/trips/domain/trip.error.ts`: `OccurrencePhotoRequiredError` (422),
  `TripOccurrenceAttachmentLimitError` (409), `TripOccurrenceNotFoundError` (404).

**API — aplicação**

- `register-trip-occurrence.use-case.ts`: recebe `attachment?: { bytes, mimeType }`, **exige** anexo
  quando a etapa é `separation` (D1/RF4), e persiste objeto + linha na mesma transação.
- `attach-occurrence-photo.use-case.ts` (novo): valida etapa, empresa e teto; grava objeto + linha.
- `occurrence-attachment.service.ts` (novo): ponto único de leitura (RF11) — tabela nova, senão a
  coluna antiga; resolve `expired` pela `retention_until` (RF22).

**API — infraestrutura**

- `drizzle-occurrence-attachment.repository.ts` (novo): inserir, contar, listar, sempre por
  `companyId`.
- `delivery-proof-read.support.ts:175-271`: `attachments[]` no lugar do `attachment` singular.
- `trip-occurrence-feed.query.ts`: sai o `hasAttachment: false` fixo (linha 229);
  `listTripOccurrenceAttachmentLocations` (405-470) passa a unir a tabela nova.
- Fonte de ocorrência de nota da linha do tempo: `attachmentCount`.

**API — apresentação**

- `occurrence.schema.ts`: parsers multipart (lista fechada, um `file`).
- `trip.routes.ts`: registro vira multipart com `Idempotency-Key` e rate limit; entra a rota de anexo.
- `src/main.ts`: fiação e resposta com `attachments`.

**API — WhatsApp**

- `src/whatsapp/application/meta-whatsapp-module.resolver.ts:82-95`: **não muda** — o contrato novo
  é que ele continue sem `providers`.
- `src/whatsapp-commands/domain/whatsapp-answer.policy.ts:7-13`: `extractWhatsAppAnswer` mantém
  `string | undefined` (o `FlowInterpreter` tipa `userAnswer?: string` e o handler não recebe a
  mensagem). O descritor da imagem é escrito pelo despachante em
  `whatsapp-command-driver.service.ts:222-229`, ao montar o cursor, e lido/apagado pelo router no
  mesmo turno.
- `src/trips/application/persist-separation-occurrence-with-attachment.ts`: o teto de bytes vira
  **parâmetro** (hoje fixa `OCCURRENCE_PHOTO_MAX_BYTES`); o WhatsApp passa `OFFICE_PROOF_MAX_BYTES`
  importado de `delivery-proof.policy.ts`.
- `describeTripError`: casos `TRIP_DELIVERY_PROOF_TOO_LARGE` e `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`.
- `src/whatsapp-commands/domain/whatsapp-operator-flow.constant.ts`: nó
  `operator_occurrence_photo_entry`, `actionKind` novo, chave de contexto
  `operatorOccurrenceId`/`operatorOccurrencePhotoCount`, rótulos "✅ Concluir" e
  "❌ Cancelar ocorrência".
- `register-operator-trip-flow-actions.ts`: `noteRouter` (l.580-620) deixa de registrar direto e
  passa a `photoPrompt`; `photoRouter` novo lê o descritor do contexto, baixa por
  `channel.fetchMediaAsBase64`, valida (RF20), grava (RF19), **incrementa o contador de tentativas
  inválidas** em resposta que não é imagem (RF18b) e decide entre repetir, concluir ou cancelar.
- `src/main.ts:826-843`: a dep `registerOccurrence` troca `saveOccurrence` cru por
  `persistSeparationOccurrenceWithAttachment` com `attachment` opcional e teto de 960 KiB.

**Worker + cron**

- `apps/worker-transportada/src/trip-occurrence-attachment-purge/` (novo): `*.constant.ts`,
  `*.port.ts`, `*.routine.ts`, `drizzle-*.repository.ts` — no molde de `rate-limit-window-purge/`.
- `apps/worker-transportada/src/main.ts`: registra a rotina no `createJobCycle` (sem guarda de
  config, como o expurgo de rate limit).
- `job-catalog.constant.ts` das **quatro** apps (API, worker, cron, frontend): entrada nova com
  `minimumIntervalSeconds: 86_400`.

**Frontend**

- `occurrencePhotoImage.service.ts` (novo): reencode do original (≤ 1600 px, ≤ 400 KB) e geração da
  miniatura (≤ 320 px, qualidade 0,7) do **mesmo** canvas, sobre `loadImageFromFile` e
  `drawFullResolutionCanvas` que já existem em `fieldDeliveryCapture.service.ts` /
  `fieldDeliveryImage.service.ts` — não é um segundo seam de imagem, é um consumidor deles.
- `tripClient.service.ts` (`registerTripOccurrence` multipart com `file` + `thumbnail`,
  `attachOccurrencePhoto`),
  `occurrencePhotoSend.service.ts` (novo, molde de `fieldDeliverySend.service.ts`),
  `useTripWorkspace.hook.ts` (chave por foto, invalidação de `occurrences` e
  `['trip','occurrence-feed']`), `OccurrencePhotoPicker.component.tsx` (novo),
  `TripOccurrences.component.tsx`, `SeparationOccurrenceDialog.component.tsx`,
  `TripTimeline.component.tsx`, `trip.types.ts`, `tripResponse.validation.ts`,
  `locales/trip.locale.json` + `trip.en.locale.json`.

**Documentação**

- `docs/SECURITY.md`: entrada nova (retenção de 5 anos, varredura, mídia do WhatsApp sem reencode).

## Contratos/API/eventos

```
POST /trips/:id/documents/:documentId/occurrences        multipart/form-data, trip.manage
  headers: Idempotency-Key (obrigatório)
  campos:  occurrenceTypeId (uuid), note?, productCode?, file (exatamente 1)
  201 { data: { id, attachments: [{ id, position }] } }
  400 INVALID_REQUEST (corpo JSON, campo fora da lista, 2+ file)
  413 PAYLOAD_TOO_LARGE (corpo > 1 MiB)
  422 OCCURRENCE_PHOTO_REQUIRED | OCCURRENCE_TYPE_NOT_SEPARATION | TRIP_DELIVERY_PROOF_*
  409 TRIP_FIELD_REPORT_KEY_REUSED
  429 60 / 300 s, scope trip-separation-occurrence

POST /trips/:id/documents/:documentId/occurrences/:occurrenceId/attachments
  multipart, trip.manage, Idempotency-Key obrigatório, campo file (1)
  201 { data: { id, position } }
  404 TRIP_OCCURRENCE_NOT_FOUND
  409 TRIP_OCCURRENCE_ATTACHMENT_LIMIT | TRIP_FIELD_REPORT_KEY_REUSED
  422 OCCURRENCE_TYPE_NOT_SEPARATION | TRIP_DELIVERY_PROOF_*
  429 300 / 300 s, scope trip-occurrence-attachment

GET /trips/:id/documents/:documentId/occurrences        # painel da nota
  attachments: [{ id, position, downloadUrl?, thumbnailUrl?, expiresAt?, expired, mimeType }]
  // sai `attachment` singular; a grade usa thumbnailUrl, o original só ao abrir
GET /trip-occurrences              # feed/consulta — hasAttachment real para ocorrência de nota
GET /trip-occurrences/:id/attachments   # feed e detalhe da ocorrência — mesmo formato acima
GET /trips/:id/timeline            # attachmentCount, nenhuma URL assinada
```

Fila: nenhum envelope novo além do `job.run` já existente, agora com o job
`trip.occurrence-attachment.purge`.

## Dados, migration e rollback

**Migration A — anexos**

⚠️ **Corrigido em 21/09/2026 (T1), na implementação — a versão anterior deste bloco tinha três
defeitos apontados numa validação de arquitetura antes de codar.** (1) faltava o purpose
`trip_occurrence_thumbnail` na lista nova do CHECK — só `trip_occurrence_attachment` estava escrito,
e a miniatura (D12) precisa do purpose dela para existir. (2) faltava o índice **não-parcial** de
`(company_id, stored_object_id)` — é a FK mais cara (coluna `NOT NULL`, `RESTRICT`) e só o índice
parcial de `thumbnail_object_id` estava desenhado. (3) a ordem das instruções tinha `CREATE TABLE`
antes do `UNIQUE (company_id, id)` de `trip_document_occurrences` — invertida, a migration falha por
faltar o alvo do `REFERENCES` composto. A ordem certa é: unique primeiro (pega `ACCESS EXCLUSIVE`),
depois o CHECK de purpose, depois `CREATE TABLE`, depois os índices. O SQL abaixo já reflete os três
ajustes; a migration aplicada é `drizzle/20260921224341_trip_document_occurrence_attachments/`.

```sql
ALTER TABLE trip_document_occurrences
  ADD CONSTRAINT trip_document_occurrences_company_id_id_unique UNIQUE (company_id, id);

-- purpose novo: CHECK recriado numa instrução só (DROP + ADD ... NOT VALID), depois VALIDATE —
-- os dois purposes de D12, original e miniatura, os dois no fim da lista (STORAGE_OBJECT_PURPOSES)
ALTER TABLE stored_objects DROP CONSTRAINT stored_objects_purpose_check,
  ADD CONSTRAINT stored_objects_purpose_check
  CHECK (purpose IN (<lista antiga>, 'trip_occurrence_attachment', 'trip_occurrence_thumbnail')) NOT VALID;
ALTER TABLE stored_objects VALIDATE CONSTRAINT stored_objects_purpose_check;

CREATE TABLE trip_document_occurrence_attachments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  occurrence_id    uuid NOT NULL,
  stored_object_id uuid NOT NULL,
  thumbnail_object_id uuid,            -- nulo: foto do WhatsApp, coluna antiga, falha de geração
  position         smallint NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_document_occurrence_attachments_company_id_id_unique UNIQUE (company_id, id),
  CONSTRAINT trip_document_occurrence_attachments_position_check CHECK (position BETWEEN 1 AND 5),
  CONSTRAINT trip_document_occurrence_attachments_unique_position
    UNIQUE (company_id, occurrence_id, position),
  CONSTRAINT trip_document_occurrence_attachments_company_id_companies_id_fk
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE restrict ON UPDATE cascade,
  CONSTRAINT trip_document_occurrence_attachments_company_occurrence_fk
    FOREIGN KEY (company_id, occurrence_id)
    REFERENCES trip_document_occurrences(company_id, id) ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT trip_document_occurrence_attachments_company_object_fk
    FOREIGN KEY (company_id, stored_object_id)
    REFERENCES stored_objects(company_id, id) ON DELETE restrict ON UPDATE cascade,
  CONSTRAINT trip_document_occurrence_attachments_company_thumbnail_fk
    FOREIGN KEY (company_id, thumbnail_object_id)
    REFERENCES stored_objects(company_id, id) ON DELETE restrict ON UPDATE cascade
);

-- índice da FK NOT NULL/RESTRICT (a mais cara), não-parcial
CREATE INDEX trip_document_occurrence_attachments_company_object_idx
  ON trip_document_occurrence_attachments (company_id, stored_object_id);

-- índice da FK nullable, parcial (só o anexo que tem miniatura), no molde do
-- trip_document_occurrences_company_on_behalf_driver_idx da spec 156 T15
CREATE INDEX trip_document_occurrence_attachments_company_thumbnail_idx
  ON trip_document_occurrence_attachments (company_id, thumbnail_object_id)
  WHERE thumbnail_object_id IS NOT NULL;

CREATE INDEX trip_document_occurrence_attachments_company_occurrence_idx
  ON trip_document_occurrence_attachments (company_id, occurrence_id, position);
```

⚠️ **`position` não é escolhida por `SELECT count(*)` antes do `INSERT`** — a task que grava a
primeira linha (T3 em diante) usa `INSERT ... SELECT $1, $2, $3, $4, coalesce(max(position), 0) + 1
FROM trip_document_occurrence_attachments WHERE company_id = $1 AND occurrence_id = $2`, dentro da
mesma instrução. Contar antes e inserir depois abre uma janela onde duas requisições calculam a
mesma posição e uma delas perde para o unique — o `INSERT ... SELECT` fecha essa janela. O
mapeamento dos dois SQLSTATE (`23505` do unique de posição, `23514` do CHECK de posição) para
`TripOccurrenceAttachmentLimitError`/409 é do caso de uso que grava (T6/T7), fora desta task —
registrado aqui e em `tasks.md` para não se perder.

**Migration B — job de expurgo** (molde de `20260915233000_rate_limit_windows`)

```sql
-- amplia os CHECKs de job_executions e job_schedules com o job novo
INSERT INTO job_schedules (job, interval_seconds, next_run_at)
VALUES ('trip.occurrence-attachment.purge', 86400, now());

-- índice que serve a varredura, sem varrer o bucket inteiro
CREATE INDEX stored_objects_purpose_retention_idx
  ON stored_objects (purpose, retention_until)
  WHERE status <> 'deleted' AND retention_until IS NOT NULL;
```

Justificativas: o teto de cinco é `CHECK` **e** unique de posição — o `CHECK` sozinho deixaria cinco
linhas na mesma posição, e a corrida de duas abas enviando a sexta foto é resolvida pelo unique, não
pelo `SELECT count(*)`. `ON DELETE cascade` para a ocorrência (o anexo não sobrevive ao fato) e
`restrict` para o objeto (apagar objeto referenciado é defeito, não operação) — por isso o expurgo
remove a linha do anexo **antes** de marcar o objeto, e nunca dá `DELETE` em `stored_objects`. O
índice parcial da varredura é o que impede a rotina de varrer todo o bucket de todas as empresas a
cada hora. Sem ENUM nativo (§8 do code-standart), PK em uuid.

Rollbacks no molde do repositório: `BEGIN`, bloco `DO $$` com `RAISE EXCEPTION` se há linhas/valores
novos, `DROP TABLE`/`DROP CONSTRAINT`/`DELETE FROM job_schedules`, remoção da entrada em
`drizzle.__drizzle_migrations` conferindo `ROW_COUNT = 1`, `COMMIT`. Aditivas: nenhuma coluna
removida, `attachment_object_id` intacta (D6).

**Follow-up registrado, fora desta spec**: migrar a ocorrência de rua para a tabela
(`INSERT ... SELECT` a partir de `attachment_object_id`), trocar a escrita de
`office-occurrence-batch.service.ts` e só então `DROP COLUMN`; e estender a varredura aos demais
purposes.

## Segurança e tenant

- `companyId` sempre do contexto; toda query nova filtra por ele e entra em
  `test/trip-schema/tenant-safety.contract.ts`. A varredura do worker é **global por desenho** (é
  manutenção de infraestrutura, não leitura de produto) e por isso nunca devolve conteúdo, só conta.
- Chave do objeto `tenants/{companyId}/trip-occurrence-attachments/{occurrenceId}/{objectId}` —
  inclusive para a mídia vinda do WhatsApp, que **não** usa a chave `meta-whatsapp/...` do pacote.
- Bytes conferidos contra a assinatura, não contra o `content-type` do cliente nem contra o
  `mime_type` que a Meta declara.
- Presigned 5 min, `inline`; `object_key`/`bucket` nunca no JSON nem no log.
- A rota de anexo resolve a ocorrência **dentro** da empresa do token antes de qualquer escrita —
  ocorrência de outra empresa é 404, nunca 403.
- Token da Meta segue selado; nenhuma URL de mídia, `media-id` ou telefone em log.

## Idempotência e concorrência

- Criação (web): `Idempotency-Key` + fingerprint (tipo, nota, `productCode`, sha256 da foto) por
  `withFieldReport`, operação `separation.document.occurrence`.
- Anexo (web): operação `separation.document.occurrence-attachment`, fingerprint com `occurrenceId` +
  sha256 da foto — reenviar a mesma foto converge.
- WhatsApp: a chave de idempotência é o **sha256 do arquivo baixado**. O `media-id` não serve (muda
  quando o operador reenvia a mesma foto) e `occurrenceId` seria circular — no momento do upload a
  ocorrência ainda não existe. A reentrega do mesmo webhook pela Meta é barrada antes, pelo
  `nonceStore` que o módulo já usa, e isso entra como teste, não como suposição.
- Corrida da sexta foto: o unique `(company_id, occurrence_id, position)` decide; a violação vira 409
  `TRIP_OCCURRENCE_ATTACHMENT_LIMIT`, não 500.
- Upload e escrita na mesma transação, com limpeza do objeto se ela desfizer.
- Expurgo: lote com `FOR UPDATE SKIP LOCKED` (molde do rate limit), duas instâncias não brigam; a
  marcação é idempotente e o objeto ausente converge.

## Observabilidade

- Sem log novo de conteúdo. Os `http_request_failed` já existentes carregam o código do erro.
- Expurgo loga `trip_occurrence_attachment_purge_cycle_finished` com `batches`, `deleted`,
  `exhausted`, `correlationId`, `executionId` — contadores e nada mais (RF21).
- O ciclo devolve `{ counters: { batches, deleted }, outcome: 'succeeded' }`, no vocabulário de
  `JOB_WRAPPER_OUTCOMES`.
- WhatsApp: falha de download vira log de erro com `mediaId` **omitido** e motivo em texto curto.

## Estratégia de testes

- **Contrato (API)**: `test/trip-occurrence/` — `separation-upload.contract.ts`,
  `attachment-route.contract.ts`, `attachment-read.contract.ts`, importados pelo barril
  `test/trip-occurrence.contract.test.ts` (já na lista do `package.json`). Feed, linha do tempo,
  `rate-limited-routes` e `tenant-safety` ganham casos.
- **Contrato (WhatsApp)**: `test/whatsapp-commands/operator-flow-actions.contract.ts` (passo novo) e
  um `occurrence-photo.contract.ts` novo no mesmo barril; `test/whatsapp/` para a injeção do
  `objectStorage` no resolver.
- **Integração (Postgres)**: `test/integration/trip-occurrence-attachment.integration.ts` **somado à
  lista explícita do script `test:integration`**; e casos novos em
  `test/integration/whatsapp-operator-flow-actions.integration.ts` (já listado). Rodar com
  `bun --env-file=../../.env.test run test:integration` — sem a flag, a integração _pula_.
- **Worker**: `test/trip-occurrence-attachment-purge.contract.test.ts` +
  `test/trip-occurrence-attachment-purge.integration.test.ts`, **ambos somados ao `package.json`** do
  worker; integração por `make worker-integration`.
- **Cron/paridade**: `test/job-catalog/catalog.contract.ts` nas apps que têm o catálogo.
- **Migration**: `make migration-test` com os dois `rollback.sql`.
- **Frontend**: `test/trip/occurrence-photo-picker.contract.ts`,
  `occurrence-photo-send.contract.ts`, `occurrence-upload-client.contract.ts` e
  `occurrence-expired-attachment.contract.ts`, importados por `test/trip.contract.test.ts`; hook com
  DOM em `test/trip-hooks/` se a corrida de envio exigir.
- **Smoke/prints**: `test/spec-161-prints.smoke.spec.ts` no molde de `spec-159-prints.smoke.spec.ts`
  (PNG 1×1 sintético, nunca foto real em fixture), rodado com `PLAYWRIGHT_TEST_MATCH`.

## Riscos

- **A rota deixa de aceitar JSON.** Aba antiga aberta durante o deploy passa a receber 400.
  Mitigação: o frontend é servido no mesmo deploy. Alternativa descartada: aceitar os dois formatos,
  que deixaria um caminho sem foto vivo contra D1.
- **O WhatsApp fica mais caro de concluir.** Exigir foto num canal de conversa aumenta a desistência;
  por isso o passo tem cancelamento explícito (D8) e a mensagem diz por que a foto é necessária. Se a
  operação reclamar, a saída é permitir texto **com** justificativa — decisão de produto, não desta
  spec.
- **Perda de trabalho no WhatsApp** (D15): abandonar no passo da foto descarta tipo e observação, e
  não há TTL de sessão. Risco de produto aceito, com aviso no passo; se a operação reclamar, a saída
  é rascunho persistido, que é feature própria.
- **O `media-id` no contexto é credencial de curta duração**: com o token da empresa ele resgata a
  mídia. Fica no `sessions.context` só dentro do turno, some depois, e nunca entra em log.
- **Risco evitado, registrado para não voltar**: injetar `providers.objectStorage` acenderia
  `sendMedia`, `DeleteConversation`, `PurgeExpiredDocuments` e o nó `send_media` do pacote, além de
  gravar fora de `stored_objects`. O contrato de CA9b existe para que uma sessão futura não refaça
  esse caminho achando que está "só ligando o download".
- **Expurgo que apaga de verdade é irreversível.** Mitigação: rollback da migration não devolve
  arquivo — por isso a rotina nasce com teto de lotes, log de contadores e um ciclo de observação em
  staging antes de produção; e a marcação (`deleted`) preserva a trilha de que existiu.
- **`hasAttachment` real no feed** muda contagem de filtros já usados pelo escritório — é correção de
  defeito (o valor era falso para toda ocorrência de nota), registrada no contrato do feed.
- **Mídia do WhatsApp sem reencode nem miniatura** mantém EXIF, inclusive GPS do aparelho do
  operador, e faz a lista daquela ocorrência baixar os originais. Risco assumido por decisão do
  usuário (D14), registrado em `docs/SECURITY.md` (RF27). Mitigação de peso: `loading="lazy"` e
  carregamento só da ocorrência aberta; o teto de 960 KiB limita o pior caso a ~4,8 MB por
  ocorrência. Se a medição em produção mostrar lista pesada, trocar para selo é uma linha na leitura.
- **A miniatura é cache, não prova.** O desenho tem de deixar isso explícito no código: falha de
  geração (RF29b), ausência (WhatsApp) e expiração nunca podem impedir a leitura do original — e o
  contrário, miniatura viva com original expurgado, é proibido pelo expurgo em lote único (RF22).
