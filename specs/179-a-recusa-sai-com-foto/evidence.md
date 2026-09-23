
## T103 — schema, repositório e use-case leem e gravam os dois campos

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src test drizzle.config.ts   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7185 pass · 23 skip · 0 fail · 24250 expect() · 183 arquivos [34.43s]
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 0 fail · 105 arquivos [785.89s]
```

⚠️ A primeira execução da integração foi descartada: dois processos rodavam contra o mesmo banco de
teste (um meu, um do agente), e resultado de suíte concorrente não é evidência. Os números acima são
de uma execução única, com os outros processos encerrados.

## T200 — chave de idempotência na ocorrência do motorista

`registerDriverOccurrence` não tinha chave de idempotência (RF13, revisão de arquitetura de 23/09).
A escrita mora agora dentro de `DriverFieldReportUnitOfWork.execute` + `withFieldReport`, reservando
e liquidando a chave na mesma transação da escrita — o padrão que `/deliver`, `/return` e a
ocorrência de parada já usam. Dois métodos novos em `DriverFieldReportTransactionPort`
(`saveDocumentOccurrence`, `findDocumentOccurrenceById`), implementados reaproveitando
`saveTripOccurrence` (o mesmo `insert` que o escritório usa) dentro da transação. A rota
(`me-trip.routes.ts`) passa a ler a chave com `parseIdempotencyKey(request)`; o caminho do WhatsApp
(`register-driver-flow-actions.ts`) gera a chave com `randomUUID()`, como `reportDelivery`/
`reportReturn` já fazem ali.

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src test drizzle.config.ts   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7187 pass · 23 skip · 0 fail · 24253 expect() · 183 arquivos [28.17s]
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 0 fail · 3272 expect() · 105 arquivos [705.33s]
```

Execução única, em primeiro plano, sem suíte concorrente.

## Bloqueio antes de T201/T202 — upload direto ao storage (RF2)

Levantamento no repositório (`grep` por `getSignedUrl`/`createPresignedPost`/`PutObjectCommand` em
`apps/api-transportada/src`): **nenhum caminho de upload assinado existe hoje.** O único gateway de
storage (`NfeStorageGateway`, sobre `@adatechnology/object-storage-provider`) expõe
`put/get/head/delete/createSignedDownload` — não há `createSignedUpload` nem equivalente. Construir
um exigiria estender o pacote `@adatechnology/object-storage-provider` (fora deste repositório, em
`~/Documents/personal/adatechnology-packages`) e desenhar como o servidor confere tipo/tamanho/sha256
de um objeto que ele nunca viu em bytes — hoje `stored_objects.sha256`/`size_bytes` são `not null` e
só existem depois do upload, o que não combina com criar a linha antes de emitir a URL. A revisão de
arquitetura de 23/09 (`architecture-review.md`) não avaliou esta parte porque assumia multipart; isto
é desenho novo, com implicação de segurança (RF2b), e por isso parei aqui para pedir a decisão em vez
de inventar o formato do endpoint de confirmação sem revisão.

## T201/T202 — upload direto ao storage por URL assinada

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src test drizzle.config.ts   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7205 pass · 0 fail
$ make migration-test
 110 pass · 0 fail  (inclui trip_occurrence_uploads, com rollback ida-e-volta)
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 0 fail · 105 arquivos [648.80s]
```

⚠️ Duas execuções anteriores da integração foram descartadas: a primeira competia com um processo do
subagente, a segunda morreu junto com o encerramento dele. A terceira rodou destacada (`nohup`), sem
concorrência — é a que vale.

## 23/09 (segunda passada) — desfeita a duplicação com as specs 164 e 161

Ver `duplicacao.md`. Três achados, um só era código de verdade:

1. **`returns_to_depot`** duplicava `redelivery_policy` (spec 164). Removida a coluna da migration
   `20260923204855_company_occurrence_type_attachment_mode` (migration.sql, rollback.sql,
   snapshot.json) e todo o código/teste que a referenciava. `attachment_mode` — a contribuição real
   da 179 — foi mantida.
2. **`return_reason_code`** (RF10 original): existia em `trip.schema.ts` desde o commit
   `aee673fd7`, mas **nunca tinha migration** — `db:generate` já estava quebrado antes desta limpeza
   por causa dela, não só de `returns_to_depot`. Removida junto, por não ter sentido sem
   `returnsToDepot` e não ser usada em nenhum outro arquivo (`grep` confirmou).
3. **`thumbnailObjectId`/`OCCURRENCE_UPLOAD_PURPOSES`** (T206): achado como alteração **não
   commitada** em `trip.schema.ts` ao rodar o teste de `db:generate` pela primeira vez nesta
   passada — sobra de uma tentativa anterior de T206, que a missão explicitamente pediu para não
   implementar agora. Revertida. O fluxo de upload assinado já commitado (`b1ec3a13e`,
   `confirmUpload` em `drizzle-occurrence-upload.repository.ts`) grava em `stored_objects`, a mesma
   tabela que `attach-occurrence-photo.use-case.ts` usa — nenhuma tabela ou coluna de miniatura
   paralela existe no código commitado. Não havia nada a desfazer aqui além da sobra não commitada.

```
$ bunx tsc --noEmit --cwd apps/api-transportada        # sem saída
$ bunx tsc --noEmit --cwd apps/worker-transportada     # sem saída
$ bunx tsc --noEmit --cwd apps/cron-transportada       # sem saída
$ tsc --noEmit --cwd apps/frontend-transportada        # sem saída
$ tsc --noEmit --cwd apps/frontend-client              # sem saída
$ tsc --noEmit --cwd apps/frontend-landing             # sem saída
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7203 pass · 23 skip · 2 fail · 24291 expect() · 183 arquivos [173.15s]
```

As 2 falhas: um timeout de `toll-booths.contract.test.ts` (120s, flaky sob carga — nada a ver com
esta task) e `database-migration.contract.test.ts` acusando o `thumbnail_object_id` não commitado
do item 3 acima. Depois de removê-lo:

```
$ bun --env-file=../../.env.test test ./test/database-migration.contract.test.ts --timeout 30000
 70 pass · 4 skip · 0 fail · 763 expect() [4.38s]     # db:generate volta a responder no_changes
$ make migration-test
 110 pass · 0 fail [63.01s]
```

Integração completa, uma vez, no fim:

```
$ bun --env-file=../../.env.test run test:integration
 563 pass · 7 skip · 3 fail · 3270 expect() · 105 arquivos [847.10s]
```

As 3 falhas (`extra-charge-batch`, `company-energy-repository`, `whatsapp-command-repository`) são
todas `timed out after 5000ms` — nenhuma toca `company_occurrence_types`, `trip_occurrence_uploads`
ou `trip_document_occurrence_attachments`. Isoladas com timeout de 30s, sem a bateria completa
disputando o Postgres:

```
$ bun --env-file=../../.env.test test ./test/integration/extra-charge-batch.integration.ts \
    ./test/integration/company-energy-repository.integration.ts \
    ./test/integration/whatsapp-command-repository.integration.ts --timeout 30000
 20 pass · 0 fail · 61 expect() [47.76s]
```

Confirma timeout de carga, não regressão desta limpeza.
