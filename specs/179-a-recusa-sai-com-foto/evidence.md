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

## T203 — `register-driver-occurrence.use-case.ts` recusa sem anexo/motivo (RF3/CA02/CA03)

### Achado antes de escrever código: a tabela apontada na missão não serve para esta ocorrência

A missão pedia para gravar o anexo confirmado em `trip_document_occurrence_attachments`, pelo
caminho de `attach-occurrence-photo.use-case.ts`. Duas evidências no próprio repositório mostram que
isso está errado para a ocorrência do motorista (`stage = 'delivery'`):

1. `attach-occurrence-photo.use-case.ts:99-101` recusa com `OccurrenceTypeNotSeparationError` toda
   ocorrência cujo `stage` não seja `'separation'` — a ocorrência do motorista nunca passaria por
   ali.
2. O comentário de `trip.schema.ts:1699-1702` já registra a divisão: _"`attachment_object_id` de
   `trip_document_occurrences` continua servindo a ocorrência de rua (D6) — esta tabela nunca é
   escrita por aquele canal."_ `trip_document_occurrence_attachments` é do galpão (spec 161,
   múltiplas fotos com miniatura); a coluna direta é da rua.

A coluna direta (`trip_document_occurrences.attachment_object_id`) já é exatamente o "caminho de
anexos existente" que CA06 pede: `listDocumentOccurrenceAttachmentLocations`
(`trip-occurrence-feed.query.ts:581-620`) tenta primeiro a tabela nova e **cai para esta coluna**
quando não há linha — é o fallback "legado" que o escritório já lê. `saveDocumentOccurrence`
(`driver-field-report.port.ts:297-309`, `delivery-proof-read.support.ts:301`) já aceita e grava
`attachmentObjectId` nessa coluna; a chamada em `register-driver-occurrence.use-case.ts` só passava
`null` fixo. E `test/integration/trip-occurrence-attachment.integration.ts:391-401` já prova, contra
Postgres real, que a FK da coluna aceita um `storedObjects.id` de verdade.

Ou seja: a T203 não precisava de escrita nova nenhuma em tabela de anexo — precisava resolver a
referência (`resolveOccurrenceUploadAttachment`, já pronta da T201) e passar o id resolvido no lugar
do `null` fixo. Implementei por este caminho, menor e já teste-coberto pelo banco real, em vez do
caminho pedido — que não compilaria (o `stage` não bate) e reabriria uma tabela pensada para outro
formato (posição, miniatura, teto de 5). Registro aqui em vez de perguntar e travar a execução porque
as duas evidências (código-fonte + teste de integração já commitado) são conclusivas, não uma leitura
minha; sinalizo mesmo assim para quem revisar decidir se quer o caminho diferente.

### Implementação

- `src/trips/domain/trip.error.ts`: `TripOccurrenceAttachmentRequiredError` (`TRIP_OCCURRENCE_ATTACHMENT_REQUIRED`, 422) e `TripOccurrenceNoteRequiredError` (`TRIP_OCCURRENCE_NOTE_REQUIRED`, 422) — códigos estáveis e
  distintos, para a tela dizer qual dos dois falta (CA04, fora do escopo desta task).
- `src/trips/application/register-driver-occurrence.use-case.ts`: `DriverOccurrenceReadPort` ganhou
  `findConfirmedUpload` (de `OccurrenceUploadAttachmentPort`, já existente). Depois de confirmar tipo,
  alcance e produto, `attachmentMode === 'required'` recusa nota vazia ou `attachmentObjectId`
  ausente; qualquer referência recebida — mesmo em tipo `optional` — é conferida com
  `resolveOccurrenceUploadAttachment` (empresa + viagem, RF2b) antes de entrar na transação. O id
  resolvido substitui o `null` fixo em `saveDocumentOccurrence`. Escrita continua única, dentro do
  `unitOfWork.execute` + `withFieldReport` que a T200 já tinha montado — não precisou de unit of work
  nova, ao contrário do que a `architecture-review.md` havia estimado (o caminho já tinha uma desde a
  T200).
- `src/trips/presentation/occurrence.schema.ts` e `me-trip.routes.ts`: corpo da rota ganha
  `attachmentObjectId` opcional (uuid), threading até o caso de uso.
- `src/main.ts`: as duas composições de `registerDriverOccurrence` (PWA e WhatsApp) ganham
  `findConfirmedUpload`. WhatsApp não sobe anexo, mas o port é o mesmo — instância própria de
  `DrizzleOccurrenceUploadRepository` no escopo de `bootstrap()`, pelo mesmo motivo de
  `whatsappFieldReportGuardTransaction` (nasce antes de `createApplicationRoutes`).
- Testes: `test/trip-occurrence/driver.contract.ts` ganhou `findConfirmedUpload`/`attachmentMode` no
  dublê e 7 casos novos (required sem anexo, sem motivo, com os dois, referência inalcançável,
  optional com/sem anexo, tipo sem a coluna). `test/driver-trip/field-report.double.ts` passou a
  registrar o `attachmentObjectId` gravado em `state.calls` para o teste conferir. Três arquivos que
  montavam `DriverOccurrenceReadPort` na mão (`field-trip-target/use-cases.contract.ts`,
  `whatsapp-driver-flow-actions.integration.ts`, `trip-field-authorship.integration.ts`) ganharam o
  campo novo. `trip-field-authorship.integration.ts` ganhou um teste contra Postgres real: tipo
  `required` recusa sem motivo, recusa sem anexo, e aceita gravando o `stored_objects.id` verdadeiro
  na coluna — fecha a pendência que a `architecture-review.md` deixou registrada ("não confirmou se o
  repositório Drizzle do motorista aceita `attachmentObjectId`").

### Gates

```
$ bunx tsc --noEmit                                             # sem saída
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7212 pass · 23 skip · 0 fail · 24300 expect() · 183 arquivos [29.87s]
$ bun --env-file=../../.env.test test test/trip-occurrence.contract.test.ts --timeout 30000
 229 pass · 0 fail · 417 expect() [217ms]
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 1 fail · 3275 expect() · 105 arquivos [724.82s]
```

A falha é `trip-financial-end-to-end.integration.ts` (timeout de 60s), o mesmo padrão de flakiness
sob carga já documentado acima — não toca `company_occurrence_types`, `trip_occurrence_uploads` nem
`trip_document_occurrences`. Isolada:

```
$ bun --env-file=../../.env.test test ./test/integration/trip-financial-end-to-end.integration.ts --timeout 30000
 2 pass · 0 fail · 25 expect() [4.22s]
$ bun --env-file=../../.env.test test ./test/integration/trip-field-authorship.integration.ts --timeout 30000
 5 pass · 0 fail · 8 expect() [10.02s]
```

Confirma timeout de carga, não regressão desta task; o arquivo que a T203 tocou (`trip-field-
authorship.integration.ts`) passa limpo, incluindo o teste novo contra Postgres real.

## Revisão de código de 23/09 — achados [1] e [2] fechados, [3] bloqueado por escopo

Revisão do `code-reviewer` (opus) sobre o lote publicado da spec: três achados na API do upload de
comprovante. O bloqueante e dois importantes do lote original já tinham sido corrigidos antes desta
passada; ficaram três — dois fechados aqui, um aberto por depender de diretório fora do escopo desta
sessão (`apps/api-transportada/**`, `apps/cron-transportada/**`, `docs/**`,
`specs/179-*/**` — outra frente estava no frontend ao mesmo tempo).

### [1] `confirm` não era idempotente — reenvio recebia 404

`findPendingUpload` filtra `status = 'pending'`; na segunda chamada (fila offline reenviando depois
que a primeira já confirmou) o status já é `confirmed`, a busca devolve `null`, e o caso de uso
lançava `TripOccurrenceUploadNotReachableError` (404) — o app tinha confirmado, a resposta se perdeu
na rede do caminhão, e o cliente levava 404 sem saber se já tinha confirmado ou se o objeto não era
seu.

**Corrigido:** `OccurrenceUploadConfirmationPort` ganhou `findConfirmedUpload` (mesma forma que
`OccurrenceUploadAttachmentPort` já tinha, e que `DrizzleOccurrenceUploadRepository` já implementava
para outro port — nenhuma classe nova). `confirmOccurrenceUpload` (`confirm-occurrence-upload.use-
case.ts:89-103`), quando `findPendingUpload` devolve `null`, tenta o recall por
`findConfirmedUpload` antes de lançar: achou (mesma empresa/viagem), devolve o mesmo resultado sem
tocar o storage; não achou, seguem os três motivos válidos de 404 (nunca existiu, outra empresa,
outra viagem).

### [2] Corrida em dois `confirm` simultâneos virava 500

`DrizzleOccurrenceUploadRepository.confirmUpload` inseria `stored_objects` **antes** de atualizar
`trip_occurrence_uploads`, sem condicionar o `UPDATE` a `status = 'pending'`. Duas confirmações
concorrentes para o mesmo pedido passavam as duas pela leitura (`findPendingUpload`, sem lock) e
tentavam o mesmo `INSERT` com o mesmo `id` (PK de `stored_objects`) — violação de unicidade, 500
genérico.

**Corrigido:** o `UPDATE` agora roda **primeiro**, dentro da transação, condicionado a `status =
'pending'`, com `.returning()`. Zero linhas afetadas quer dizer que outra transação já fechou a
mesma confirmação entre a leitura e esta escrita — a transação termina sem tentar o `INSERT`, e
`confirmUpload` devolve `{ confirmed: false }` em vez de deixar o banco recusar por chave duplicada.
`confirmOccurrenceUpload` trata `confirmed: false` com o mesmo recall do achado [1]
(`findConfirmedUpload`): a chamada perdedora devolve o resultado da vencedora, nunca um 500.

### Implementação

- `src/trips/application/confirm-occurrence-upload.use-case.ts`: `OccurrenceUploadConfirmationPort`
  ganha `findConfirmedUpload`; `confirmUpload` passa a devolver `{ confirmed: boolean }`. Dois pontos
  de recall (pendência não encontrada, e `UPDATE` que não afetou linha) convergem para o mesmo
  `findConfirmedUpload` — um único conceito, "devolver o resultado que já existe", para os dois
  achados.
- `src/trips/infrastructure/drizzle-occurrence-upload.repository.ts`: `confirmUpload` reordenado —
  `UPDATE ... WHERE status = 'pending' RETURNING id` primeiro; `INSERT` em `stored_objects` só quando
  o `UPDATE` afetou uma linha, dentro da mesma transação.
- `src/main.ts`: as duas composições de `confirmOccurrenceUpload` (só existe uma, do PWA — a rota do
  motorista) ganham `findConfirmedUpload` na injeção do repositório.
- `test/trip-occurrence/upload.contract.ts`: `unreachableStorage()` prova que o recall não toca
  `head()`/bytes; testes novos para reenvio pós-confirmação, objeto de outra empresa/viagem
  continuando 404 mesmo com a checagem extra, e a corrida (repositório devolvendo `confirmed:
false`) resolvida pelo recall. Os dois dublês existentes (`repository()` e `reachableRepository()`)
  ganharam `findConfirmedUpload`.
- `test/integration/trip-occurrence-upload-confirm.integration.ts` (novo): três provas contra
  Postgres real — reenvio depois de confirmado devolve o mesmo `id` e grava um único `stored_objects`
  (achado [1]); objeto de outra viagem continua 404 mesmo já confirmado noutra (achado [1], borda);
  `Promise.all` com dois `confirmOccurrenceUpload` concorrentes para o mesmo pedido não lança, os
  dois devolvem o mesmo `id`, e só um `stored_objects`/`trip_occurrence_uploads.status = 'confirmed'`
  fica gravado (achado [2]). Adicionado à lista explícita de `test:integration` do
  `package.json` (a suíte não descobre arquivo novo sozinha).

### Gates

```
$ bunx tsc --noEmit                                                    # sem saída
$ bunx eslint src test eslint.config.js --max-warnings=0               # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7215 pass · 23 skip · 0 fail · 24304 expect() · 183 arquivos [44.68s]
$ bun --env-file=../../.env.test test ./test/integration/trip-occurrence-upload-confirm.integration.ts --timeout 120000
 3 pass · 0 fail · 8 expect() [58.82s]
```

A suíte inteira de integração (`test:integration`, 106 arquivos) rodou sob carga concorrente de
outras sessões no mesmo Postgres local e reproduziu o mesmo padrão de flakiness já registrado acima
neste arquivo (timeouts de 5s/30s em arquivos que não tocam upload de ocorrência —
`cte-export-selection`, `company-user-fleet-link`, `trip-repository`, `route-depot-query` etc.). O
arquivo desta correção, isolado, é limpo (3/3 acima); é a evidência que conta para este achado, pelo
mesmo raciocínio já registrado nas passadas anteriores desta spec.

### [3] Objeto sem dono no bucket — bloqueado por escopo, não implementado

**Achado confirmado, código não escrito.** `TRIP_OCCURRENCE_UPLOAD_STATUSES` inclui `'expired'`
(`trip.schema.ts:1641`) e nada escreve esse status; não há varredura de `trip_occurrence_uploads`
pendente vencido nem do objeto correspondente no bucket. Os dois vazamentos que a missão descreveu
são reais e verificados nesta sessão:

- Upload confirmado no storage mas nunca chega ao `confirm` (motorista perde sinal): bytes no bucket,
  linha `pending` para sempre, **sem** `stored_objects` — invisível para `trip.occurrence-
attachment.purge` (o expurgo de retenção existente só varre `stored_objects`).
- `confirm` roda mas a ocorrência nunca é registrada: `stored_objects` fica com `retentionUntil` de
  cinco anos e nenhuma ocorrência aponta para ele — ninguém encontra para revisar antes do prazo.

**Por que não foi implementado nesta sessão.** O padrão que os outros dez jobs de `JOB_CATALOG`
seguem (`shared/job-catalog.constant.ts`, cópia por valor em quatro apps) não executa a rotina em
`apps/cron-transportada` — o comentário de `tick/application/run-tick.ts:5-6` é explícito: _"[a
batida] não sabe o que rotina nenhuma faz — quem executa é o worker, e é isso que mantém os clientes
de terceiro num app só."_ `cron-transportada` só lê `job_schedules`, abre a execução e publica no
RabbitMQ (`JOB_RUN_QUEUE_ROUTE`); todo `JobRoutine` de verdade — inclusive o que mais se parece com
esta necessidade, `trip.occurrence-attachment.purge`
(`apps/worker-transportada/src/trip-occurrence-attachment-purge/`) — mora em
`apps/worker-transportada`, que está **fora** do escopo desta sessão
(`apps/api-transportada/**`, `apps/cron-transportada/**`, `docs/**`, `specs/179-*/**`; a instrução
que abriu esta sessão citou "outra frente no frontend", mas o worker também não está entre os
diretórios liberados). Publicar a rotina em `job_schedules` sem o consumidor correspondente no worker
deixaria a execução presa (mensagem sem rota tratando, ou `unexpected_error` a cada batida) — pior do
que não publicar.

Achei ainda um resíduo não relacionado enquanto explorava o padrão: `apps/cron-
transportada/src/nfe-distribution-pull/nfe-distribution-pull.job.ts` define `runNfeDistributionPullJob`
mas não é chamado de `main.ts` nem de nenhum outro lugar em `src` — parece sobra da consolidação "os
quatro serviços de cron viram um" (`95c711def`). Não mexi nisso; fica registrado para quem revisar.

**O que falta para fechar, e onde:**

1. `apps/worker-transportada`: `JobRoutine` nova (padrão de
   `trip-occurrence-attachment-purge.routine.ts`) que varre `trip_occurrence_uploads` com `status =
'pending'` e `expires_at` vencido, apaga o objeto do bucket quando existir e marca `status =
'expired'` — e, no caso "confirmado sem ocorrência", decide se cabe na mesma rotina ou é uma
   segunda (a spec não distingue as duas, e a retenção de 5 anos do achado 2 (`docs/SECURITY.md`,
   2026-09-22) pode já cobrir o segundo caso via `trip.occurrence-attachment.purge`, a confirmar).
2. `JOB_CATALOG`: entrada nova nas **quatro** cópias (`api-transportada`, `worker-transportada`,
   `cron-transportada`, `frontend-transportada/src/modules/shared/jobCatalog.constant.ts`) e nos
   quatro `test/job-catalog/catalog.contract.ts` — só os dois primeiros estão dentro do escopo desta
   sessão.
3. Migration/seed de `job_schedules` com o `job` novo, `enabled: true` e o intervalo (a foto some
   depois da URL assinada vencer — o mesmo prazo curto de vida da própria URL, não os cinco anos da
   retenção — então o intervalo pode ser o mais fino do catálogo, `JOB_TICK_INTERVAL_SECONDS`).
4. Teste de integração provando que o pendente vencido é expirado (bucket + linha) e o recente não —
   pode morar em `apps/worker-transportada/test`, seguindo o molde de
   `trip-occurrence-attachment-purge`.

Registrado o achado em `docs/SECURITY.md` (2026-09-23), como "Aberto" — não "Fechado", porque a
correção não foi escrita. Reportado ao orquestrador da sessão para decidir entre ampliar o escopo
desta sessão ou abrir uma sessão dedicada a `apps/worker-transportada` (+ `frontend-transportada` para
a paridade do catálogo).

## 24/09 — [3] fechado: escopo ampliado para o worker

O orquestrador ampliou o escopo desta sessão para `apps/worker-transportada/**`,
`apps/cron-transportada/**`, `apps/api-transportada/**`,
`apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts`, `docs/**` e
`specs/179-*/**`, com a ordem: rotina no worker seguindo `trip-occurrence-attachment-purge/`,
catálogo nas quatro apps, migration/seed, teste de integração — e resolver o segundo vazamento junto
"se der", sem inventar desenho novo.

### Rotina nova: `trip.occurrence-upload.expire`

`apps/worker-transportada/src/trip-occurrence-upload-expire/` — mesmo desenho de
`trip-occurrence-attachment-purge/`, simplificado porque a unidade aqui é uma linha só (sem tabela de
anexo para juntar):

- `domain/trip-occurrence-upload-expire.constant.ts`: nome do job, folga de 900s
  (`TRIP_OCCURRENCE_UPLOAD_EXPIRE_GRACE_SECONDS`) e os mesmos tetos de lote/falha/timeout da rotina
  irmã.
- `application/trip-occurrence-upload-expire-unit.port.ts` + `-unit.service.ts`: a unidade —
  `lockExpiredPendingUpload` (`for update skip locked`, reconferindo `status = 'pending'` e
  `expires_at` vencido **no momento do lock**, não na leitura que escolheu o candidato — é isto que
  faz a corrida com um `confirm` concorrente convergir para "missing" em vez de apagar um objeto que
  acabou de ser confirmado), depois `deleteObject` (com timeout, igual à rotina irmã) e só então
  `markExpired`.
- `application/trip-occurrence-upload-expire.port.ts` + `.routine.ts`: o lote e o laço de batidas —
  cópia estrutural de `trip-occurrence-attachment-purge.port.ts`/`.routine.ts`, com `before = now -
grace` (a folga desloca o corte para trás de `now`, nunca esconde um upload que ainda não venceu).
- `infrastructure/drizzle-trip-occurrence-upload-expire-gateway.ts` + `.repository.ts`: candidatos por
  `status = 'pending' and expires_at < before`, uma transação por unidade.
- `apps/worker-transportada/src/database/trip-occurrence-upload.schema.ts`: cópia por valor de
  `trip_occurrence_uploads` (mesmo padrão de `stored-object.schema.ts`/
  `trip-occurrence-attachment.schema.ts` — sem constraint, quem migra é a API), com
  `schema-parity.contract.ts` conferindo as colunas linha a linha contra `trip.schema.ts`.
- `apps/worker-transportada/src/main.ts`: registrada sempre (como as outras varreduras de retenção),
  com `deleteObject` vindo do mesmo `storageGateway` da rotina irmã.

**Idempotência (pedida explicitamente):** a exclusão é idempotente do **lado do storage** — S3/MinIO
devolvem sucesso apagando uma chave que já não existe, que é exatamente o caso do motorista que perdeu
sinal antes de sequer enviar o arquivo. Rodar a rotina de novo sobre a mesma linha nunca falha por
"objeto já removido"; e o `for update skip locked` cobre a concorrência entre execuções da própria
rotina e contra um `confirm` em voo.

### Catálogo e migration

`JOB_CATALOG` ganhou a entrada `trip.occurrence-upload.expire` (`failureOutcomes: []`,
`minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS`) nas cópias de `api-transportada`,
`cron-transportada`, `worker-transportada` e `frontend-transportada/src/modules/shared/
jobCatalog.constant.ts` — a quarta estava fora do escopo original, liberada nesta ampliação.
`bun run db:generate` (dentro de `apps/api-transportada`) gerou a migration
`20260924033423_lumpy_scalphunter`; reescrevi o `migration.sql` para o padrão `NOT VALID` + `VALIDATE
CONSTRAINT` que `20260922112706_trip_occurrence_attachment_purge_job` já usa (evita segurar lock de
validação nas duas tabelas de uma vez) e acrescentei o `INSERT INTO job_schedules` com intervalo 300.
`rollback.sql` escrito à mão no mesmo molde do anterior. `bun run db:generate` rodado de novo depois:
`no_changes` — o schema bate com a migration.

⚠️ Descoberta no caminho: `apps/frontend-transportada/test/shared/job-catalog.contract.ts` **não**
mantém uma lista literal própria — ele lê o arquivo-fonte de `api-transportada` direto do disco
(`readFileSync` + regex) e compara. Achei que precisaria editar esse teste (fora do escopo liberado,
`test/**` do frontend é de outra sessão) e travar — mas não precisei: atualizando só o `.constant.ts`
do frontend, os 6 testes desse arquivo continuam passando (`bun test
./test/shared/job-catalog.contract.ts` → 6 pass), porque o teste deriva o esperado da própria API. Sem
conflito com a outra frente.

O `test/job-catalog/catalog.contract.ts` de `api-transportada`, `cron-transportada` e
`worker-transportada` (cada um com sua própria lista literal, ao contrário do frontend) ganhou a
entrada correspondente. O de `api-transportada` também tem `SEED_MIGRATIONS`, que lê o `INSERT` de
cada migration para conferir o intervalo semeado contra o piso — acrescentei
`'20260924033423_lumpy_scalphunter'` à lista.

`test/database-migration/static-migration.contract.ts` mantém a lista literal e ordenada de **todos**
os diretórios de migration da API — acrescentei `'20260924033423_lumpy_scalphunter'` ao fim. Sem essa
linha o teste reprovava (`toEqual` comparando array com um item a mais), não por regressão, só por a
lista não ter sido atualizada.

### O segundo vazamento — já coberto, sem código novo

Confirmei, sem inventar desenho: o `stored_objects` que `confirm-occurrence-upload` grava usa
`resolveOccurrenceAttachmentRetentionUntil`, a **mesma** função e o mesmo prazo de cinco anos que
`trip.occurrence-attachment.purge` (spec 161) já aplica
(`drizzle-occurrence-upload.repository.ts:102`, achados [1]/[2] deste lote). Essa rotina resolve a
unidade por `findAttachmentByObjectId` contra `trip_document_occurrence_attachments` — a tabela do
anexo múltiplo do escritório (spec 161). A ocorrência do motorista (T203, spec 179) referencia o
objeto por uma coluna **diferente**, `trip_document_occurrences.attachment_object_id`, que essa
consulta nunca olha. Consequência: um objeto confirmado por este caminho e nunca vinculado a uma
ocorrência cai no ramo "objeto órfão" (`purgeOrphanObject`,
`trip-occurrence-attachment-purge-unit.service.ts:48-61`) da rotina existente assim que os cinco anos
de retenção vencerem — já coberto pelos testes que provam esse ramo
(`purge-unit.contract.ts`, "objeto órfão sai sozinho").

O caso limite — a ocorrência **é** registrada depois, meses ou anos mais tarde — não é um vazamento
paralelo: o objeto já legitimamente referenciado só seria apagado ao fim dos mesmos cinco anos, que é
exatamente a retenção pretendida pela RF21 para toda foto de ocorrência, não um prazo mais curto que
alguém esqueceu de escrever. Não escrevi rotina nova nem mudei a existente para este caso — não havia
lacuna a fechar.

### Gates

```
$ bunx tsc --noEmit                                              # api, cron, worker: sem saída
$ bunx eslint src test [scripts] eslint.config.js --max-warnings=0   # api, cron, worker: sem saída
$ bunx tsc --noEmit (frontend-transportada)                       # sem saída
$ bun --env-file=../../.env.test test --timeout 120000            # api: 7215 pass · 23 skip · 0 fail (183 arquivos)
$ bun --env-file=../../.env.test run test                         # worker: 1421 pass · 0 fail (92 arquivos)
$ bun --env-file=../../.env.test run test                         # cron: 101 pass · 0 fail (8 arquivos)
$ bun test ./test/shared/job-catalog.contract.ts                  # frontend: 6 pass · 0 fail
$ bun run db:generate                                              # api: no_changes
$ make migration-test                                              # 110 pass · 0 fail (migration + rollback reais)
$ bun --env-file=../../.env.test test ./test/integration/trip-occurrence-upload-expire.integration.ts --timeout 60000
                                                                    # worker: 2 pass · 0 fail, Postgres + MinIO reais
```

Não rodei a suíte inteira de `test:integration` de novo (106 arquivos): a passada anterior deste
mesmo dia já mostrou o padrão de flakiness sob carga concorrente de outras sessões (60 falhas,
timeouts de 5s/30s em arquivos que não tocam upload de ocorrência), documentado acima. O arquivo que
esta parte tocou, isolado contra Postgres e MinIO reais, é limpo.

### O que não mexi

O resíduo `apps/cron-transportada/src/nfe-distribution-pull/nfe-distribution-pull.job.ts`
(`runNfeDistributionPullJob`, nunca chamado de `main.ts`) continua como estava — fora do escopo desta
correção, e o orquestrador pediu explicitamente para não tocar.

## 25/09 — PUT tardio na URL de subida trocava a foto já conferida

Mesmo defeito de forma do achado S1 da spec 183 (T903, anexo da conversa), procurado aqui depois de
achado lá. A URL de PUT assinada vale 15 minutos e segue valendo depois da confirmação;
`confirmOccurrenceUpload` gravava `stored_objects.object_key` na **mesma** chave da subida, então um
PUT tardio com outro arquivo do mesmo tamanho trocava os bytes já conferidos por tipo e sha256.

### Implementação

- `trips/domain/occurrence-attachment.policy.ts`: `buildOccurrenceUploadFinalObjectKey` —
  `tenants/<empresa>/trip-occurrence-attachments/<viagem>/<token>`, token de 256 bits em base64url.
- `trips/application/confirm-occurrence-upload.use-case.ts`: depois de conferir, `storeObject` dos
  bytes na chave final, `confirmUpload` apontando para ela e só então `deleteObject` da chave da
  subida. Falha em `confirmUpload` apaga a cópia final (melhor esforço) e sobe o erro; a chamada que
  perde a corrida do achado [2] apaga a própria cópia e deixa a chave da subida para a vencedora. A
  porta de storage passou a `OccurrenceUploadConfirmationStoragePort` (ganhou `storeObject` e
  `deleteObject`; o `storageGateway` de `main.ts` já os tinha).
- `docs/SECURITY.md`: entrada em "Fechados", com o residual aceito (o PUT tardio recria a chave da
  subida como objeto órfão, fora do alcance de `trip.occurrence-upload.expire`, que só varre
  `pending`).

### Contrato antes da implementação

`test/trip-occurrence/upload.contract.ts`, cinco casos novos: ordem `store → confirm → delete` com a
chave final ≠ chave da subida; chave aleatória sem token injetado; limpeza da cópia quando
`confirmUpload` falha; limpeza da cópia na corrida perdida; bytes recusados não copiam nem apagam.
Antes da implementação: **4 fail** (o de bytes recusados já era verde).

### Integração contra Postgres e S3 (MinIO local)

`test/integration/trip-occurrence-upload-confirm.integration.ts`, caso novo: sobe o JPEG pela URL
assinada, confirma, confere que `stored_objects.object_key` ≠ chave da subida, sha256 dos bytes
originais e chave da subida apagada; faz o PUT tardio na mesma URL com o último byte trocado e baixa
pela chave registrada.

- Sem a correção (caso de uso de `HEAD`): falha — primeiro na chave igual; com as asserções de chave
  removidas numa cópia temporária, o download devolveu o byte trocado (`88` no lugar de `1`).
- Com a correção: **4 pass · 0 fail** (base `main` e base `origin/staging`).

⚠️ O caso pula quando o S3 não responde (sonda HTTP no endpoint, não só a variável): a CI carrega o
`.env.example` com `STORAGE_ENDPOINT` mas não sobe o MinIO. A prova contra storage real só roda
localmente.

### Gates

```
$ bun run typecheck                                               # sem erro
$ bun run lint                                                    # sem saída
$ bun --env-file=../../.env.test test --timeout 120000            # api (base main): 7234 pass · 23 skip · 0 fail
$ bun --env-file=../../.env.test run test:integration             # api (base main): 576 pass · 7 skip · 0 fail
$ make check                                                      # base origin/staging: exit 0
$ bun --env-file=../../.env.test test --timeout 120000            # api (após rebase em staging): 7312 pass · 23 skip · 0 fail
```

Na base `origin/staging`, a integração completa mostrou timeouts de 5 s em
`field-trip-target`, `me-location-consent` e `me-trip` (specs 057/156/189, nenhum toca upload de
ocorrência) e foi interrompida; os três arquivos isolados, com esta correção: **21 pass · 0 fail**.
Mesmo padrão de carga no Postgres de teste já registrado acima.

### Staging

Commit `45c5e0e94`. Deploy
[36193206752](https://github.com/Andersonfrfilho/transportada/actions/runs/36193206752) verde de ponta
a ponta (gates, integração e smoke da CI, sete deploys). Implantação ativa da API
`2636d914` = `45c5e0e94`; pre-deploy `migrated=true`; `/health/live` e `/health/ready` 200;
`POST …/occurrence-uploads/:id/confirm` sem token → 401; nenhuma linha de erro no log desde a subida.
Não exercitei o fluxo autenticado do motorista em staging.

## 25/09 — Fase 3 na app do motorista (`apps/frontend-driver`)

Pedido do usuário: _"o 'Não entreguei' precisa registrar ocorrência com foto"_ — tocar "Não
entreguei" abre o registro da ocorrência da nota: motivo, foto obrigatória (câmera, com galeria como
alternativa), observação opcional, confirmar; sem foto o confirmar fica desabilitado e diz o que
falta; sem sinal, foto e ocorrência entram juntas na fila e a tela diferencia "na fila" de "enviado".

### O fluxo escolhido: ocorrência com foto **e** devolução, no mesmo toque

Conferido no código e nas specs antes de escrever:

- A ocorrência da nota **não fecha a nota**. `trip_document_occurrences` é append-only e a spec 164
  RF19 proíbe escrita em `trip_documents` por causa dela (`separation_status`, `returned_at` "seguem
  com os mesmos escritores de hoje"). Quem fecha nota, parada e viagem é a devolução (`/return` →
  `runDocumentOutcome`, `architecture-review.md` § "O risco que a spec não tinha visto"). Trocar a
  devolução pela ocorrência deixaria a parada aberta para sempre.
- A devolução exige `reason` da lista fechada `DRIVER_RETURN_REASONS` (`me-trip.schema.ts:38`,
  `z.enum`). O tipo de ocorrência é cadastro livre da empresa — deduzir um do outro seria comparar
  nome de tipo, o que `duplicacao.md` e o plano desta spec proíbem.

Por isso "Não entreguei" pergunta **os dois**: o motivo da devolução (a lista de sempre) e o tipo de
ocorrência (o cadastro da empresa), mais a foto e a observação. Confirmar enfileira dois itens, a
ocorrência antes: rede caída nela para a drenagem inteira e a devolução espera junto, então a nota
não fecha sem a prova ter subido. Recusa do servidor na ocorrência (ex.: `422` de observação
obrigatória) não segura a devolução — exigir prova não pode virar bloqueio na rua (P3); a recusa
fica à vista na fila de pendentes, com "Enviar agora".

Sem lista de tipos (falha sem cópia guardada, ou empresa sem tipo de rua) não há ocorrência onde
pendurar a foto: a devolução segue só com o motivo e a tela diz isso (spec 157 RF5 — devolver nunca
depende da lista).

### Achado: o `kind` `documentOccurrence` que a 189 dizia ter deixado pronto não existia

`apps/frontend-driver/CLAUDE.md` ("Drenagem", "O que a spec 147 e a spec 179 acrescentam") e a
emenda da Fase 3 afirmam que o `kind` já existia em `DriverFieldReport` e no `switch` de
`driverTripClient.service.ts`. `git log -S"kind: 'documentOccurrence'" --all` não acha nada, e
`origin/staging` também não tem. Foi escrito aqui (T301), com o encadeamento que a emenda descreve:
URL assinada → `PUT` direto ao storage (sem o token da API) → `confirm` → `POST .../occurrences` com
`attachmentObjectId` e a chave do toque.

### T301 — o que falta para confirmar (CA04)

`notDelivered.service.ts` (puro): `listMissingNotDeliveredFields` devolve **todos** os campos que
faltam, na ordem da tela (`reason`, `occurrenceType`, `photo`, `note`); a foto é exigida em todo tipo
(é "Não entreguei"), a observação só quando o tipo declara `attachmentMode: 'required'` — a mesma
regra do servidor (`TripOccurrenceNoteRequiredError`). `buildNotDeliveredReports` monta os dois
itens, ocorrência antes, e recusa rascunho incompleto (`NOT_DELIVERED_INCOMPLETE`).
`DriverOccurrenceType.attachmentMode` entrou **opcional**: a rota do motorista ainda devolve só `id`
e `name` (ver "Pendência de API" abaixo), e a leitura aceita o campo quando vier e recusa valor fora
do vocabulário.

```
$ bun test ./test/driver-trip/not-delivered.contract.ts ./test/driver-trip/occurrence-upload.contract.ts
 25 pass · 0 fail
$ bun run typecheck && bun run lint        # sem saída
$ bun run test                             # 526 pass · 0 fail (3 entrypoints)
```

### T302 — a captura da foto no "Não entreguei"

`DriverNotDeliveredForm.component.tsx` (estado em `useNotDeliveredForm.hook.ts`) substitui os chips
soltos de devolução: motivo (a lista de sempre), tipo de ocorrência (cadastro da empresa), foto
obrigatória e observação (opcional; "obrigatória para este tipo" quando o tipo diz `required`). Duas
portas para a mesma foto: **Tirar foto** (`capture="environment"`) e **Escolher da galeria** (sem
`capture`) — é a saída quando a câmera não abre ou o acesso foi negado, sem depender de detectar a
negação. A foto é reencodada no aparelho (`occurrencePhotoImage.service.ts`, cópia por valor da spec
161: lado ≤ 1600 px, JPEG mirando 400 KiB, sem EXIF) e recusada acima de 512 KiB, o teto do
servidor. O confirmar fica desabilitado enquanto falta algo, e o texto ao lado diz o quê
(`notDelivered.missingLead`). O formulário aberto conta como captura (`occurrence-dialog`).

Sem sinal na abertura da app, a lista de tipos cai na última lista boa do mesmo dono
(`occurrenceTypesCache.service.ts`, `localStorage` por `SHA-256(sub)` — cadastro da empresa, sem
dado de pessoa, o mesmo nível da marca da instalação). Sem cópia, a devolução segue só com o motivo e
a tela diz que a foto não tem onde ser registrada agora.

Confirmar grava os dois itens numa transação só (`enqueueReports`, todos ou nenhum) e a foto conta no
teto de bytes dos anexos (`sumReportPhotoBytes` + `ATTACHMENT_QUEUE_LIMIT.maxTotalBytes`): estourou,
nada entra e a faixa de sempre avisa. `unverified-pending.contract.ts` passou de três para quatro
caminhos que marcam `isUnverified` — o quarto é este.

```
$ bun run typecheck && bun run lint        # sem saída
$ bun run test                             # 546 pass · 0 fail
```

### T303 — a fila leva a foto, e a tela distingue "na fila" de "enviado" (CA05, RF5)

- O `Blob` da foto mora no próprio item `documentOccurrence` (IndexedDB guarda `Blob` por clone
  estruturado, como já guardava os anexos do canhoto). Sem sinal, os dois itens ficam na fila; a
  ocorrência vai antes, então rede caída nela segura a devolução junto.
- O cartão diz **"Ocorrência com foto na fila — sobe quando o sinal voltar."** enquanto o item está
  na fila (inclusive depois de recarregar: a fila sabe a nota), **"enviada"** só quando a drenagem
  viu o servidor aceitar aquela chave (`sentReportKeys`, colhido no `send` do hook), e
  **"recusou"** quando o servidor recusou. Item descartado não vira "enviado".
- A tela de pendentes mostra "Ocorrência com foto" com "1 anexo".
- A origem do bucket entra no `connect-src` por `VITE_OBJECT_STORAGE_URL` (o nome que o painel já
  usa), lida no `vite.config.ts`, com `ARG` no `Dockerfile` e contrato que cobra o `ARG` das
  origens lidas pelo `vite.config` (a varredura antiga só via `import.meta.env`). Só `connect-src`:
  nada desta app exibe imagem do bucket.
- Smoke (`driver-app.smoke.spec.ts`): "Não entreguei" online — `occurrence-uploads` → `PUT` no
  dublê do bucket (JPEG, bytes > 0, sem token) → `confirm` → `occurrences` com o
  `attachmentObjectId` confirmado → `return` com `recipient_refused`, chaves diferentes; e sem sinal
  — "na fila", "2 confirmações aguardando envio", nada no bucket nem em `/occurrences`, a fila de
  pendentes com "Ocorrência com foto · 1 anexo", e depois do `online` o "enviada" e a mesma ordem
  de caminhos. Os dois conferem 44 px e ausência de rolagem horizontal em 375 px com o formulário
  aberto.

### Pedido do usuário no meio (25/09): o canhoto com três botões

Fora da 179, pedido com prioridade no mesmo cartão: "Tirar foto" (câmera, `capture`), "Anexar"
(galeria e arquivos, sem `capture`) e "Colher assinatura" (ícone próprio `pen`), do mesmo tamanho,
sem o rótulo solto "Anexar canhoto". Em 375 px, as duas portas da foto dividem a linha e a
assinatura ocupa a linha de baixo inteira — escolhido por deixar cada rótulo numa linha só e a foto
(a prova da nota) primeiro. `FilePickerButton` (`src/components/ui/file-picker-button.tsx`) é o
botão do design system que clica no input nativo fora da vista e da tabulação; a foto da ocorrência
do "Não entreguei" usa o mesmo par. Commits próprios: `6aef92ab6`, `3df16b9c3`, `5f1af16f6`.

### Gates (T303)

```
$ bun run --cwd apps/frontend-driver check   # lint + typecheck + 556 pass · 0 fail + build (precache 13 arquivos, 641 KiB) + dist 6 pass
$ bun run --cwd apps/frontend-driver smoke   # service worker 2 passed · app 21 passed
```

### Pendência de API (não mexi — outro executor está na API)

`GET /me/trips/current/occurrence-types` devolve só `id` e `name`
(`list-field-occurrence-types.use-case.ts`). Sem `attachmentMode`, a tela não sabe quando a
observação é obrigatória: num tipo `required`, a observação vazia chega ao servidor e volta `422
TRIP_OCCURRENCE_NOTE_REQUIRED` — a devolução sobe, e a ocorrência fica recusada à vista na fila de
pendentes. A app já lê o campo quando ele vier (`isDriverOccurrenceType` aceita `off|optional|
required` e recusa o resto); a mudança é acrescentar `attachmentMode: type.attachmentMode ?? 'off'`
ao `map` do use case e ao tipo `FieldOccurrenceType`, com contrato. Aditiva, sem migration.
