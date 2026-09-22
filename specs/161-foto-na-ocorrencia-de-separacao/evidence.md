# Evidência

## T1 — Tabela `trip_document_occurrence_attachments`, unique e purposes novos

Data: 2026-09-21.

### O que mudou

- `src/database/storage.schema.ts`: dois purposes novos no **fim** de `STORAGE_OBJECT_PURPOSES` —
  `trip_occurrence_attachment` (original) e `trip_occurrence_thumbnail` (miniatura).
- `src/database/trip.schema.ts`: `unique('trip_document_occurrences_company_id_id_unique')` em
  `trip_document_occurrences`; tabela nova `tripDocumentOccurrenceAttachments` com
  `thumbnail_object_id` nullable, `position` smallint (`CHECK 1..5` + unique
  `(company_id, occurrence_id, position)`), duas FKs compostas para `stored_objects` (original e
  miniatura), FK composta `RESTRICT` para `companies`, FK composta `CASCADE` para
  `trip_document_occurrences`, e três índices (não-parcial da FK de objeto, parcial da FK de
  miniatura, e o de listagem por ocorrência/posição).
- `src/database/database.schema.ts`: `tripDocumentOccurrenceAttachments` somada ao import e à
  agregação de schema (o `export *` já cobria a tabela; faltava a lista nomeada usada para montar o
  client Drizzle).
- `drizzle/20260921224341_trip_document_occurrence_attachments/migration.sql` e `rollback.sql`
  (novos), `snapshot.json` (gerado pelo `db:generate`).
- `test/database-migration/static-migration.contract.ts` e `test/nfe-schema/storage.contract.ts`:
  baseline atualizada com o diretório de migration novo e a lista de purposes do CHECK.
- `specs/161-foto-na-ocorrencia-de-separacao/plan.md`: bloco "Migration A" corrigido para refletir
  os três ajustes abaixo (o SQL do plano original tinha os três defeitos apontados na validação de
  arquitetura); `tasks.md` T1 marcada `[x]`.

### Os três ajustes sobre o SQL do `plan.md`

1. **CHECK de purpose com os dois purposes novos.** O plano só tinha `trip_occurrence_attachment`
   na lista recriada; faltava `trip_occurrence_thumbnail` (D12, a miniatura). Os dois entraram no
   **fim** do array `STORAGE_OBJECT_PURPOSES`, e o `db:generate` continuou devolvendo `no_changes`
   depois de gerar a migration (não reordenei a lista existente). O CHECK foi reescrito como uma
   instrução `DROP CONSTRAINT ..., ADD CONSTRAINT ... NOT VALID` (vírgula, uma instrução só) seguida
   de `VALIDATE CONSTRAINT` em instrução separada — confirmado `convalidated = t` no Postgres depois
   de aplicar.
2. **Índice não-parcial da FK de objeto.** O plano só desenhava o índice parcial de
   `thumbnail_object_id`. `stored_object_id` é `NOT NULL` + `RESTRICT` — a FK mais cara de deixar
   sem índice — e ganhou `trip_document_occurrence_attachments_company_object_idx` (não-parcial),
   além do parcial de miniatura com o predicado exato
   `WHERE thumbnail_object_id IS NOT NULL`.
3. **Ordem das instruções.** O SQL gerado por `drizzle-kit` colocava `CREATE TABLE` antes do
   `ALTER TABLE trip_document_occurrences ADD CONSTRAINT ... UNIQUE (company_id, id)` — a ordem
   errada faria a migration falhar por faltar o alvo do `REFERENCES` composto. Reescrevi a
   `migration.sql` à mão na ordem exigida: (a) unique de `trip_document_occurrences` primeiro
   (pega `ACCESS EXCLUSIVE`), (b) DROP/ADD do CHECK de purpose + VALIDATE, (c) `CREATE TABLE`, (d)
   os índices. Nenhum `CREATE INDEX CONCURRENTLY` (o runner do Drizzle já está em transação).

Também documentado em `trip.schema.ts` (comentário na tabela nova) e em `plan.md`: o teto de cinco
está duplicado no banco (CHECK de `position`) e na aplicação (`OCCURRENCE_ATTACHMENT_LIMIT`, T2);
`position` é monotônica e escolhida **dentro do `INSERT`**
(`coalesce(max(position), 0) + 1`), nunca por `SELECT count(*)` antes — isso é T3+ (repositório),
fora do escopo de T1, mas o comentário fica para quem chegar antes. O mapeamento dos dois SQLSTATE
(`23505` do unique de posição, `23514` do CHECK de posição) para
`TripOccurrenceAttachmentLimitError`/409 é do caso de uso que grava (T6/T7).

### Gates

- `bun run --cwd apps/api-transportada typecheck` (via `bun run typecheck` na raiz, que roda as 6
  apps) — verde, sem erros.
- `bun run --cwd apps/api-transportada lint` (via `bun run lint` na raiz) — verde, `--max-warnings=0`.
- `bun run format:check` na raiz — verde para todo código tocado por esta task (schema, migration,
  contratos, `plan.md`/`tasks.md` de 161). **Pré-existente, fora do escopo**: `specs/162-limpeza-do-armazenamento/*.md`
  está sem formatação Prettier desde antes desta sessão (`git status` mostrava o diretório
  untracked no início) — não pertence à spec 161 e não foi tocado.
- `bun run --cwd apps/api-transportada test` — **6743 pass, 32 skip, 0 fail** (6775 testes, 182
  arquivos), incluindo `test/database-migration/schema-snapshot.contract.ts` e os dois contratos
  atualizados (`static-migration.contract.ts`, `nfe-schema/storage.contract.ts`).
- `bun run db:generate` — `{"status":"no_changes"}` depois da migration aplicada ao schema TS (dois
  runs: logo após a migration, e de novo depois de todas as edições).

### Migration + rollback contra Postgres — nota sobre o Docker

⚠️ `make migration-test` **não rodou**: o Docker local está fora do ar nesta máquina (confirmado —
nenhum daemon respondendo). Segui a instrução da task e usei um **Postgres 18 nativo e descartável**
(Homebrew, `initdb` + `pg_ctl` num `$TMPDIR` isolado, porta **65434** — a 65433 já estava em uso por
outra sessão/worktree, então troquei de porta em vez de disputar o cluster alheio):

1. `initdb` + `pg_ctl start` em `/tmp/pg161-t1-data`, `-p 65434 -k /tmp -c listen_addresses=127.0.0.1`
   (precisou `LC_ALL=C`, sem isso o Postgres 18 recusa subir com "postmaster became multithreaded
   during startup" nesta versão do Homebrew — achado novo, não estava documentado).
2. `runDatabaseMigrations({ connectionString: "postgresql://postgres@127.0.0.1:65434/postgres" })`
   (o mesmo runner do `db:migrate`) aplicou **todas** as migrations do zero, sem erro.
3. Conferido no banco: a tabela, as seis constraints (unique de id, unique de posição, CHECK de
   posição, três FKs), os cinco índices (pkey, os dois unique, os dois `CREATE INDEX`), e
   `stored_objects_purpose_check` com `convalidated = t`.
4. `rollback.sql` num banco onde a tabela nova estava **vazia** → `BEGIN...COMMIT` limpo: tabela
   apagada, CHECK de purpose devolvido às onze entradas antigas, unique de
   `trip_document_occurrences` removido — confirmado com `\d`/`\dt`/`pg_constraint` depois.
5. Reapliquei as migrations do zero, inserida **uma linha** na tabela nova (via
   `session_replication_role = replica`, só para testar o guard sem montar a cadeia inteira de FKs
   válidas) e rodei `rollback.sql` de novo: **RAISE** `"trip_document_occurrence_attachments has
rows, refusing rollback"`, transação inteira desfeita (`ROLLBACK`), tabela intacta depois —
   confirmado com `\dt`.
6. Cluster descartável parado e apagado (`pg_ctl stop -m fast` + `rm -rf`) ao final.

Não usei o Postgres de outra sessão (porta 65433, `pensive-borg-f59971`) nem toquei nele — troquei de
porta assim que percebi que já estava ocupado.

## T2 — Política de anexo, miniatura e retenção

`src/trips/domain/occurrence-attachment.policy.ts` (novo, sem I/O): `OCCURRENCE_ATTACHMENT_LIMIT =
5` (comentário deixa explícito que é duplicado pelo CHECK
`trip_document_occurrence_attachments_position_check` da T1 — mudar um lado sem o outro é o bug a
evitar), `OCCURRENCE_PHOTO_MAX_BYTES = 512 * 1024`, `OCCURRENCE_THUMBNAIL_MAX_BYTES = 128 * 1024`,
`OCCURRENCE_ATTACHMENT_RETENTION_YEARS = 5`, `resolveOccurrenceAttachmentRetentionUntil` (soma 5
anos preservando dia/hora via `setUTCFullYear`), `buildOccurrenceAttachmentObjectKey` e
`buildOccurrenceThumbnailObjectKey` (sem PII, `tenants/{companyId}/trip-occurrence-attachments/
{occurrenceId}/{objectId}` para o original e `.../thumbnails/{objectId}` para a miniatura — molde de
`buildDeliveryProofObjectKey`), e as duas operações de idempotência:
`OCCURRENCE_ATTACHMENT_CREATE_OPERATION` (`separation.document.occurrence`, para T5/T6 via
`withFieldReport`) e `OCCURRENCE_ATTACHMENT_APPEND_OPERATION`
(`separation.document.occurrence-attachment`, para T7), cada uma com sua função de impressão digital
— `buildOccurrenceAttachmentCreateFingerprint` (tipo + nota + `productCode` + sha256 do original) e
`buildOccurrenceAttachmentAppendFingerprint` (`occurrenceId` + sha256 do original). As duas
impressões usam **só o sha256 do original**, nunca o da miniatura — decisão já fixada no plano
(RF3/D13) e reafirmada em comentário no código.

### Vermelho → verde

Escrevi `test/trip-occurrence/attachment-policy.contract.ts` (importado pelo barril
`test/trip-occurrence.contract.test.ts`, já listado no `package.json`) antes de criar o arquivo de
política — rodar `bun test` nesse ponto falhava com `Cannot find module
'../../src/trips/domain/occurrence-attachment.policy.js'` (vermelho). Depois de escrever a política,
`bun run --cwd apps/api-transportada test ./test/trip-occurrence.contract.test.ts` foi verde: **86
pass, 0 fail** (14 casos novos deste arquivo, cobrindo os critérios de aceite: `retention_until =
created_at + 5 anos` idêntico para original e miniatura, inclusive atravessando 29 de fevereiro; os
dois tetos de bytes; nenhuma chave — original ou miniatura — batendo com os padrões de PII
(`nota`, `nf-e`, `cliente`, `cpf`, `cnpj`, `nome`, `driver`, `motorista`); a impressão de criação
mudando com tipo/nota/`productCode`/foto e convergindo com `productCode` ausente = `null`; a
impressão do anexo adicional mudando com ocorrência e foto, sempre pelo sha256 do original).

Este contrato é pura política (sem banco, sem HTTP): T2 não precisa de integração contra Postgres —
os testes de leitura/gravação reais chegam em T3, T6, T7 e T12.

### Gates (raiz do worktree)

- `bun run --cwd apps/api-transportada test ./test/trip-occurrence.contract.test.ts` → **86 pass, 0
  fail**, 192 `expect()`.
- `bun run --cwd apps/api-transportada test` (suíte completa de contrato) → **6754 pass, 32 skip, 0
  fail**, 6786 testes em 183 arquivos.
- `bun run lint` (as seis apps) → verde.
- `bun run typecheck` (as seis apps) → verde.
- `bun run format:check` → verde depois de `prettier --write` nos dois arquivos novos (o aviso
  inicial também listava os três arquivos ainda desformatados de propósito em
  `specs/162-limpeza-do-armazenamento/`, fora do escopo desta task — não tocados).

### Decisões tomadas além do que a spec já fixava

- **Duas funções de chave**, uma para o original e uma para a miniatura
  (`buildOccurrenceAttachmentObjectKey`/`buildOccurrenceThumbnailObjectKey`), em vez de uma função só
  com um parâmetro de "tipo de anexo". O plano só nomeava
  `buildOccurrenceAttachmentObjectKey` no plural ("chaves de objeto... para original e miniatura");
  duas funções tipadas deixam o chamador de T6/T7 escolher a certa em tempo de compilação, sem `if`
  nem enum de tipo espalhado pelo caso de uso.
- **Miniatura na mesma árvore de chaves do original**, num sufixo `thumbnails/{objectId}` — não é
  outra parte do bucket. Segue o mesmo `tenants/{companyId}/trip-occurrence-attachments/{occurrenceId}/`
  de `buildOccurrenceBatchAttachmentObjectKey` (spec 156 T7b), que já existe para o lote de rua; a
  ocorrência de galpão ganha o par original/miniatura dentro do mesmo prefixo por ocorrência.
- **Duas operações de idempotência, não uma**: `OCCURRENCE_ATTACHMENT_CREATE_OPERATION` para a
  criação (T5/T6) e `OCCURRENCE_ATTACHMENT_APPEND_OPERATION` para o anexo adicional (T7), com
  literais exatamente iguais aos citados no `plan.md` ("Idempotência e concorrência") — não inventei
  nome novo, só materializei os dois textos já decididos como constantes exportadas.

## T3 — Repositório e leitura unificada do anexo

Data: 2026-09-21.

### O que mudou

- `src/trips/application/occurrence-attachment.service.ts` (novo): `readOccurrenceAttachments` —
  o ponto único de leitura (RF15/RF11). Lê `listOccurrenceAttachments` (tabela nova); só quando ela
  devolve `[]` cai para `findLegacyOccurrenceAttachment` (coluna `attachment_object_id`, D6), que
  vira um item único de `position: 1` sem miniatura. Cada registro vira `OccurrenceAttachmentView`
  no formato exato de RF8 (`{ id, position, downloadUrl?, thumbnailUrl?, expiresAt?, expired,
mimeType }`): anexo com `retentionUntil` vencido devolve `{ expired: true }` **sem** chamar o
  gateway de download (nenhuma URL, nem de original nem de miniatura — RF26); anexo sem miniatura
  não recebe a chave `thumbnailUrl` (omitida por `exactOptionalPropertyTypes`, nunca `undefined`
  explícito); `objectKey`/`bucket` nunca saem da função — só entram no `OccurrenceAttachmentLocation`
  interno, que a view não repassa.
- `src/trips/infrastructure/drizzle-occurrence-attachment.repository.ts` (novo):
  `DrizzleOccurrenceAttachmentRepository` implementa o port do serviço, com quatro métodos:
  - `insertOccurrenceAttachment`: `INSERT ... SELECT ... coalesce(max(position), 0) + 1` numa
    instrução só (`database.execute(sql\`...\`)`, molde de `drizzle-rate-limiter.repository.ts`),
exatamente como o `plan.md`exige para T3 — nunca`SELECT count(\*)`antes do`INSERT`. O
mapeamento dos SQLSTATE `23505`/`23514`para`TripOccurrenceAttachmentLimitError` fica para
    T6/T7, fora desta task (comentário deixado no método).
  - `countOccurrenceAttachments`: `count(*)` escopado por `companyId` e `occurrenceId`.
  - `listOccurrenceAttachments`: junta `trip_document_occurrence_attachments` com dois alias de
    `stored_objects` (`trip_occurrence_attachment_original`/`..._thumbnail`) — `innerJoin` no
    original (`NOT NULL`), `leftJoin` na miniatura (nullable) — **cada** junção com `companyId` nos
    dois lados, ordenado por `position`.
  - `findLegacyOccurrenceAttachment`: junta `trip_document_occurrences` com `stored_objects` pela
    coluna antiga, também com `companyId` nos dois lados.
- `test/trip-occurrence/attachment-read.contract.ts` (novo, escrito **antes** do serviço): sete
  casos contra dublês de repositório e de download (sem banco) — sem anexo → `[]`; só coluna antiga
  → um item sem `thumbnailUrl`; tabela nova com miniatura → `downloadUrl` e `thumbnailUrl`, sem
  consultar a coluna antiga; tabela nova sem miniatura → só `downloadUrl`; retenção vencida →
  `expired: true` sem nenhuma URL; nunca publica `objectKey`/`bucket`; a consulta é sempre escopada
  por `companyId`+`occurrenceId` (RF15, RF26, CA5, CA8).
- `test/trip-occurrence.contract.test.ts`: import de `./trip-occurrence/attachment-read.contract`.
- `test/trip-schema/tenant-safety.contract.ts`: `trip_document_occurrence_attachments` somada a
  `TRIP_TABLES` (ancoragem em `companies`); teste novo confere as três FKs compostas da tabela
  (ocorrência `CASCADE`, original `RESTRICT`, miniatura `RESTRICT`) — as mesmas do T1, sem
  duplicidade de nome com o teste de `foreignKeys` já existente. Bloco novo
  `describe('occurrence attachment query tenant safety (spec 161 T3)', ...)`, no molde exato do já
  existente para `delivery-proof-read.support.ts`: prova por **texto de fonte** — todo `.innerJoin(`
  e `.leftJoin(` do repositório novo carrega `companyId`, e todo `.where(` filtra por `companyId`.
  Prova por comportamento (dublê) não pegaria uma junção futura perdendo o tenant e ainda passando
  no caminho feliz; prova por texto pega.

### As doze menções de "anexo" em `delivery-proof-read.support.ts` — por que este arquivo não mudou

O prompt desta task media 12 menções a "anexo" nesse arquivo (linha 222 lendo pela coluna antiga) e
pedia para confirmar que a leitura unificada cobre os dois caminhos. Conferido: **nenhuma das doze é
tocada por T3**. `delivery-proof-read.support.ts` é consumido hoje por `main.ts:2717-2745`
(`GET .../occurrences`, que devolve o `attachment` singular) — trocar esse arquivo para
`attachments[]` é o que o `plan.md` atribui explicitamente à **T9** ("`delivery-proof-read.support.ts:
175-271`: `attachments[]` no lugar do `attachment` singular"), não à T3. O que T3 entrega é o ponto
de leitura que T9 vai _consumir_ (`readOccurrenceAttachments`, que já resolve os dois caminhos —
tabela nova e coluna antiga) — a tela ainda mostra `attachment` singular até T9 trocar o consumidor.
Registrado aqui para quem pegar T9 em seguida: a leitura dupla já existe e está testada; falta
só ligar `listTripOccurrences` a `readOccurrenceAttachments` no lugar do `leftJoin` direto em
`storedObjects` das linhas 218-224.

### Vermelho e verde

`bun run --cwd apps/api-transportada test ./test/trip-occurrence.contract.test.ts` antes de escrever
`occurrence-attachment.service.ts` falhava na importação (`Cannot find module
'../../src/trips/application/occurrence-attachment.service.js'`, vermelho). Depois de escrever o
serviço e o repositório, o mesmo comando foi verde: **93 pass, 0 fail** (7 casos novos deste
arquivo).

### Gates (raiz do worktree)

- `bun run --cwd apps/api-transportada test ./test/trip-schema.contract.test.ts
./test/trip-occurrence.contract.test.ts` → **171 pass, 0 fail**, 583 `expect()`.
- `bun run --cwd apps/api-transportada test` (suíte completa de contrato) → **6764 pass, 32 skip, 0
  fail**, 6796 testes em 182 arquivos.
- `bun run --cwd apps/api-transportada typecheck` → verde.
- `bun run lint` (as seis apps) → verde.
- `bun run typecheck` (as seis apps) → verde.
- `bun run format:check` → verde depois de `prettier --write` no contrato novo (os três arquivos
  ainda desformatados de `specs/162-limpeza-do-armazenamento/` seguem fora do escopo desta task, não
  tocados).
- Nenhum teste de integração criado nesta task — T3 não pede banco real (a integração das três
  leituras é T12); os quatro casos do CA5/CA8 são provados contra dublê, como o molde de
  `test/trip-delivery-proof/read.contract.ts` já fazia para o comprovante.

### Decisões tomadas além do que a spec já fixava

- **`OccurrenceAttachmentLocation`/`OccurrenceAttachmentRecord` como tipos internos do serviço**, não
  do repositório — o repositório importa os tipos do serviço (`ReadOccurrenceAttachmentsPort`) em vez
  do contrário, para o `occurrence-attachment.service.ts` continuar sem import de Drizzle (camada de
  aplicação sem I/O, `apps/api-transportada/CLAUDE.md`).
  Molde: `read-delivery-proof.use-case.ts`/`drizzle-delivery-proof.repository.ts`.
- **Quatro métodos num repositório só**, em vez de um por arquivo — `tasks.md` já agrupa "inserir,
  contar, listar" na mesma entrega; separar em quatro classes teria sido abstração sem consumidor
  hoje (T6/T7/T9 chamam os quatro do mesmo objeto).
- **`findLegacyOccurrenceAttachment` devolve `position: 1` fixo**, nunca lido de coluna nenhuma — a
  ocorrência de galpão anterior a esta spec não tinha `position`, e o RF15 já define a coluna antiga
  como "anexo único"; fixar em código evita uma coluna fantasma que ninguém preenche.
- **`isExpired` trata `retentionUntil: null` como "nunca expira"** — decisão não escrita à letra na
  spec, mas decorre de RF15 (a coluna antiga "sempre vem sem `thumbnailUrl`", nada diz sobre
  expiração) e do fato de nenhum `stored_objects` anterior a esta spec ter `retention_until`
  preenchido (`plan.md`, premissas verificadas: "nenhuma app escreve
  `stored_objects.retention_until`... hoje"). Um objeto sem data de retenção não tem como "vencer".

## T4 — erros novos (`OccurrencePhotoRequiredError`, `TripOccurrenceAttachmentLimitError`,

`TripOccurrenceNotFoundError`)

### Vermelho → verde

`test/trip-occurrence/attachment-errors.contract.ts` importava as três classes antes de elas
existirem em `src/trips/domain/trip.error.ts` — vermelho por `Cannot find module` seria o caso se o
arquivo já existisse sem os exports; como o arquivo era novo, o vermelho apareceu como falha de
resolução de import ao rodar `bun test
./test/trip-occurrence.contract.test.ts` antes de tocar em `trip.error.ts`. Depois de acrescentar as
três classes (código, status, mensagem sem interpolar id): **96 pass, 0 fail**, 215 `expect()`.

### Escopo do mapeamento 23505/23514

Confirmado o que T1 e o comentário de `drizzle-occurrence-attachment.repository.ts` já registravam:
mapear as duas SQLSTATE (`trip_document_occurrence_attachments_unique_position` → `23505`,
`trip_document_occurrence_attachments_position_check` → `23514`) para `TripOccurrenceAttachmentLimitError`
por **nome de constraint** é do caso de uso que insere o anexo (T6/T7), não desta task — T4 só
declara o erro. Comentário deixado em `trip.error.ts` apontando para T6/T7 e para os dois SQLSTATE, e
o `tasks.md` já carregava esse apontamento desde a T1.

### Gates

- `bun test ./test/trip-occurrence.contract.test.ts` → **96 pass, 0 fail**, 215 `expect()`.
- `bun run --cwd apps/api-transportada test` (suíte completa de contrato) → **6767 pass, 32 skip, 0
  fail**, 23250 `expect()` em 182 arquivos.
- `bun run typecheck` (as seis apps) → verde.
- `bun run lint` (as seis apps) → verde.
- `bun run format:check` → verde.

### Decisões além do que a spec fixava

Nenhuma — os três erros seguem literalmente o molde de `TripDocumentNotFoundError`/
`TripDeliveryProofPhotoRequiredError`/`TripDocumentAlreadySettledError` já existentes no arquivo
(`code`, `message`, `status`, sem campo de contexto).

## T5 — foto obrigatória no caso de uso (`register-trip-occurrence.use-case.ts`)

### Vermelho → verde

`test/trip-occurrence/attachment-required.contract.ts` (novo) registra uma ocorrência `separation`
sem `attachment` e espera `OccurrencePhotoRequiredError` com o dublê de `saveOccurrence`/`notify`
**não** chamado — vermelho porque `RegisterTripOccurrenceInput` ainda não tinha o campo e o caso de
uso nunca recusava por foto ausente. Depois de acrescentar `attachment?: { bytes: Uint8Array;
mimeType: string }` e a recusa logo após confirmar `stage === separation` (antes de
`resolveOccurrenceProductScope`/`listDocumentProducts`/`saveOccurrence`/`notifyOccurrence`): verde —
`bun test ./test/trip-occurrence.contract.test.ts` foi de 96 para **98 pass, 0 fail**, 220
`expect()`.

### Contratos existentes atualizados por causa da obrigatoriedade

Toda ocorrência que os testes registravam por `registerTripOccurrence` é `stage: 'separation'` (é a
única etapa que este caso de uso grava, spec 157) — três arquivos chamavam sem foto e passaram a
levar `attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' }`:

- `test/trip-occurrence/register.contract.ts` — 1 ponto de chamada (`registrar`, usado pelos dois
  testes "tipo de rua responde 422.../tipo de galpão grava e avisa"; o de rua continua caindo em
  `OccurrenceTypeNotSeparationError` **antes** de chegar na checagem de foto, então a foto extra no
  corpo não muda esse teste).
- `test/trip-occurrence/notification.contract.ts` — 2 pontos de chamada (`registrar` e a chamada
  direta do teste "falha no aviso não desfaz a ocorrência").
- `test/trip-occurrence/template-key.contract.ts` — 1 ponto de chamada (`registrar`).

**Quatro pontos de chamada, em três arquivos.** Nenhum deles testava ausência de foto — esse caso é
só o `attachment-required.contract.ts` novo.

### Gates

- `bun test ./test/trip-occurrence.contract.test.ts` → **98 pass, 0 fail**, 220 `expect()`.
- `bun run --cwd apps/api-transportada test` (suíte completa de contrato) → **6769 pass, 32 skip, 0
  fail**, 23255 `expect()` em 182 arquivos (era 6767/23250 antes desta task).
- `bun run typecheck` (as seis apps, via `bun run typecheck` na raiz) → verde.
- `bun run lint` (as seis apps) → verde.
- `bun run format:check` → verde.
- `bun --env-file=../../.env.test run test:integration` **não rodou** — não está na lista de gates
  desta task (`tasks.md` só pede os quatro comandos acima para T4/T5) e T5 não altera schema nem
  query; ver risco de produção registrado abaixo.

### Decisões tomadas além do que a spec fixava

- **Forma de `attachment`**: `{ bytes: Uint8Array; mimeType: string }`, como `plan.md` descreve
  (`recebe attachment?: { bytes, mimeType }`) — sem nome de arquivo, porque a chave do objeto é
  opaca (`occurrence-attachment.policy.ts`) e nada no caso de uso precisa dele.
- **Ordem da recusa**: `OccurrencePhotoRequiredError` é lançado logo depois de confirmar
  `occurrenceType.stage === TRIP_OCCURRENCE_STAGE.separation`, **antes** de
  `resolveOccurrenceProductScope`/`listDocumentProducts`. Um `documentId`/`productCode` inválido
  numa ocorrência de separação sem foto responde 422 `OCCURRENCE_PHOTO_REQUIRED` em vez de 404
  `TRIP_DOCUMENT_NOT_FOUND` — segue o texto da task ("recusar... antes de `saveOccurrence`, do
  storage e da auditoria"), e o CA2 só exige a recusa a partir do caso de uso, sem prescrever ordem
  entre as duas validações de entrada.
- **T5 não persiste nenhum objeto** — `attachment` só é conferido, nunca gravado; a persistência dos
  dois objetos na mesma transação (`plan.md`) é T6, que também reescreve `trip.routes.ts` para
  multipart.
- ⚠️ **Risco de produção registrado, não corrigido nesta task** (fora do escopo de T5, que é só o
  caso de uso): as duas fiações reais em `src/main.ts` que chamam `registerTripOccurrence` para
  `separation` — a rota JSON `POST /trips/:id/documents/:documentId/occurrences` (linha ~2762) e o
  passo de ocorrência do fluxo WhatsApp do operador (`registerOccurrence`, linha ~825) — **nenhuma
  das duas passa `attachment`**. A partir deste commit, as duas passam a responder sempre 422
  `OCCURRENCE_PHOTO_REQUIRED` em produção, até T6 (multipart na rota) e T15 (passo de foto no
  WhatsApp) ligarem o `attachment`. É o comportamento esperado da sequência de tasks — não há tela
  nem fluxo publicado hoje que dependa dessas duas chamadas continuarem aceitando ocorrência sem
  foto —, mas registrado aqui para quem ler o diff isolado da T5 sem o resto da fase 2/4.

## T6 — Registro multipart com original e miniatura (RF5/RF7, CA2/CA4/CA7b)

### O que foi implementado

- `src/trips/presentation/occurrence.schema.ts`: `parseRegisterOccurrenceMultipartRequest` —
  multipart obrigatório (JSON cai no `catch` de `readOfficeMultipartForm` → 400), lista fechada de
  campos, exatamente um `file`, no máximo um `thumbnail`. `file` é sempre exigido, o que faz
  `thumbnail` sem `file` responder 400 também, sem checagem própria.
- `src/trips/domain/occurrence-attachment.policy.ts`: `assertOccurrenceUploadAccepted` — teto, tipo
  e assinatura de bytes, reaproveitando `isDeliveryProofMimeType`/`matchesDeliveryProofSignature` do
  canhoto do escritório, com o teto passado por parâmetro (`OCCURRENCE_PHOTO_MAX_BYTES` para o
  original, `OCCURRENCE_THUMBNAIL_MAX_BYTES` para a miniatura).
- `src/trips/application/persist-separation-occurrence-attachment.service.ts` (novo): orquestra a
  gravação — valida (antes de qualquer I/O), sobe o original e a miniatura opcional via
  `runWithStoredObjectCleanup`, insere os `stored_objects` e a linha de
  `trip_document_occurrence_attachments`, tudo atrás de um `SeparationOccurrenceUnitOfWork`
  injetado (porta pura, sem Drizzle) — por isso é testável sem Postgres.
- `src/trips/infrastructure/drizzle-separation-occurrence.repository.ts` (novo):
  `DrizzleSeparationOccurrenceUnitOfWork` implementa a porta acima com `database.transaction`,
  reaproveitando `saveTripOccurrence` (sem `attachmentObjectId` — D6, o galpão nunca escreve a
  coluna antiga) e a função solta `insertOccurrenceAttachmentRow` (extraída de
  `drizzle-occurrence-attachment.repository.ts`, T3, para rodar dentro da mesma transação).
- `src/trips/application/register-trip-occurrence.use-case.ts`: `attachment` ganha `thumbnail?`;
  `TripOccurrencePort.saveOccurrence` recebe o `attachment` e devolve `attachments?` (posição
  `{id, position}`); `RegisteredOccurrence.attachments` sai sempre (`[]` se `saveOccurrence` não
  devolver nada — defensivo, não deveria acontecer para `separation`). ⚠️ A validação de
  teto/tipo/assinatura **não** entrou aqui — entrou em `persistSeparationOccurrenceWithAttachment`,
  porque o teto é por canal (web 512 KiB/128 KiB, D13; WhatsApp, fase 4, usa 960 KiB próprios) e o
  caso de uso é genérico aos dois canais.
- `src/trips/presentation/trip.routes.ts`: a rota de registro vira multipart
  (`parseRegisterOccurrenceMultipartRequest`), exige `Idempotency-Key`
  (`parseIdempotencyKey`, 400 sem o header) e ganha `rateLimit: { maxRequests: 60, scope:
'trip-separation-occurrence', store: 'postgres', windowSeconds: 300 }`. ⚠️ A chave só é **exigida**
  nesta task — a convergência por fingerprint (mesma chave/conteúdo não duplica) é T8, que já tem as
  funções de fingerprint prontas desde T2 (`buildOccurrenceAttachmentCreateFingerprint`).
- `src/main.ts`: a fiação HTTP passa `attachment` ao caso de uso e troca `saveOccurrence` pela nova
  `persistSeparationOccurrenceWithAttachment` (com `DrizzleSeparationOccurrenceUnitOfWork` e o mesmo
  `createDeliveryProofStorage` que o canhoto do escritório usa — bucket único de propósito, ADR
  implícita do canhoto reaproveitada). A fiação do WhatsApp (linha ~825) **não** foi tocada — segue
  sem `attachment`, então `registerTripOccurrence` recusa antes de chegar a `saveOccurrence` (T5); é
  o comportamento esperado até T15.

### Decisão sobre "os dois objetos limpos" (CA7b)

A validação de teto/tipo/assinatura acontece **antes** de qualquer `storage.store()` — arquivo
recusado não sobe nada ao bucket, então não há o que limpar (mesmo princípio de
`office-delivery-proof.service.ts`, "validado fora de qualquer reserva"). O que `CA7b` prova de
verdade é o mecanismo de `runWithStoredObjectCleanup`: se a gravação falhar **depois** de original e
miniatura já terem subido — no teste, forçando `insertAttachment` a lançar depois dos dois
`storage.store()` —, os dois `storage.remove()` disparam. É o cenário real de órfão: falha do lado
do banco depois do upload, não erro de validação (que nunca chega a subir bytes).

### O vermelho e o verde

`test/trip-occurrence/separation-upload.contract.ts` foi escrito **antes** da implementação; rodado
contra o código antigo (sem `parseRegisterOccurrenceMultipartRequest`, sem
`persistSeparationOccurrenceWithAttachment`) falhava por `Cannot find module`/`TS2305` em todos os
`describe`. Depois da implementação: **34 pass, 0 fail** (arquivo isolado). O contrato cobre:

- Parser: JSON → 400; sem `file` → 400 (inclusive só `thumbnail`); campo fora da lista → 400; dois
  `thumbnail` → 400; `file` sem `thumbnail` aceito, sem miniatura no resultado; `file` com
  `thumbnail` aceito, os dois nos bytes certos.
- CA4: original > 512 KiB → 422 `TRIP_DELIVERY_PROOF_TOO_LARGE`, sem tocar storage; miniatura >
  128 KiB → 422 idem; assinatura de bytes errada → 422 `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`, sem
  tocar storage.
- CA7b: caso feliz sobe os dois objetos e grava `position: 1`; `file` sem `thumbnail` sobe só um
  objeto; falha depois do upload limpa os dois objetos (original e miniatura).
- Caso de uso: `registerTripOccurrence` encaminha `attachment` e devolve
  `attachments: [{ id, position: 1 }]` vindos de `saveOccurrence`.

### Gates

- `bun test test/trip-occurrence.contract.test.ts` → **111 pass, 0 fail**, 247 `expect()` (era
  98/220 antes desta task — T6 soma 13 testes ao arquivo existente, mais o novo
  `separation-upload.contract.ts` dentro dele).
- `bun run --cwd apps/api-transportada test` (suíte completa de contrato) → **6783 pass, 32 skip, 0
  fail**, 23283 `expect()` em 182 arquivos.
- `bun run typecheck` (as seis apps) → verde.
- `bun run lint` (as seis apps) → verde.
- `bun run format:check` → verde.
- `bun --env-file=../../.env.test run test:integration` **não rodou** — T6 não criou nenhum arquivo
  em `test/integration/`; a integração das três leituras é T12, fora deste recorte.

### Efeito colateral: dois arquivos de teste pré-existentes precisaram de ajuste

- `test/fixtures/trip-http.fixture.ts`: `createRouter` passou a exigir `rateLimitWindows` porque a
  rota de registro agora declara `rateLimit: { store: 'postgres' }` — sem isso o roteador recusa
  subir (`assertPostgresRateLimitHasStore`). Adicionado um dublê que sempre permite (o teto de
  verdade é provado só em `test/rate-limited-routes.contract.test.ts`).
- `test/rate-limited-routes.contract.test.ts`: a rota nova precisou entrar na lista fechada de
  arquivos que declaram `store: 'postgres'` (`trips/presentation/trip.routes.ts`) e ganhou um teste
  próprio conferindo o balde exato (60/300 s, `trip-separation-occurrence`).

### A ocorrência de galpão pela rota HTTP volta a funcionar de ponta a ponta

Provado pelo teste "caso feliz devolve `attachments: [{ id, position: 1 }]`" em
`separation-upload.contract.ts` — exercita `registerTripOccurrence` com um dublê de `saveOccurrence`
que simula a persistência e devolve o anexo, confirmando que o caso de uso encaminha `attachment` e
publica `attachments` na resposta. A cadeia completa (rota → schema multipart → caso de uso →
`persistSeparationOccurrenceWithAttachment` → transação Drizzle → Postgres) **não** foi exercitada
contra um banco real nesta task (T6 não pede integração — T12 pede); o que está provado sem
Postgres é: (1) o parser aceita exatamente o formato esperado e recusa o resto; (2) o caso de uso
encaminha o anexo e publica a posição; (3) a orquestração de escrita valida antes de subir bytes e
limpa os dois objetos se a transação falhar depois do upload. Falta, para prova de ponta a ponta
contra banco de verdade: T12.

## T7 — Rota de anexo adicional (RF6, CA3)

### O que foi implementado

- `src/trips/application/attach-occurrence-photo.use-case.ts` (novo): `attachOccurrencePhoto` —
  resolve a ocorrência **pela empresa do contexto** (`repository.findOccurrence`); 404
  `TripOccurrenceNotFoundError` quando não acha (outra empresa e inexistente respondem igual, de
  propósito); 422 `OccurrenceTypeNotSeparationError` quando a etapa não é `separation`; valida
  teto/tipo/assinatura do original e da miniatura opcional (`assertOccurrenceUploadAccepted`, os
  mesmos tetos de T6) **antes** de contar ou tocar storage; confere o teto de 5 por
  `countOccurrenceAttachments` como **mensagem amigável** (não é a trava); sobe original e miniatura
  dentro de uma transação (`AttachOccurrencePhotoUnitOfWork`), com `runWithStoredObjectCleanup`
  limpando o bucket se a transação falhar depois do upload.
- `src/trips/infrastructure/drizzle-attach-occurrence-photo.repository.ts` (novo):
  `DrizzleAttachOccurrencePhotoUnitOfWork` — molde de `DrizzleSeparationOccurrenceUnitOfWork` (T6),
  sem `saveOccurrence` (a ocorrência já existe). Reaproveita `insertOccurrenceAttachmentRow`.
- `src/trips/infrastructure/delivery-proof-read.support.ts`: `findOccurrenceForAttachment` —
  `SELECT id, stage FROM trip_document_occurrences WHERE company_id = … AND id = …`, `null` quando
  não acha (RF6).
- `src/trips/presentation/occurrence.schema.ts`: `parseAttachOccurrencePhotoRequest` — lista fechada
  com **só** `file` (exatamente um) e no máximo um `thumbnail`, sem `note`/`occurrenceTypeId`/
  `productCode` (a ocorrência já existe); reaproveita `readOfficeMultipartForm`/
  `readOfficeMultipartFile` de T6.
- `src/trips/presentation/trip.routes.ts`: `POST
/trips/:id/documents/:documentId/occurrences/:occurrenceId/attachments`, `trip.manage`, rate limit
  `{ maxRequests: 300, scope: 'trip-occurrence-attachment', store: 'postgres', windowSeconds: 300 }`.
- `src/main.ts`: fiação de `attachOccurrencePhoto` — `countOccurrenceAttachments` via
  `DrizzleOccurrenceAttachmentRepository`, `findOccurrence` via `findOccurrenceForAttachment`,
  `unitOfWork` via `DrizzleAttachOccurrencePhotoUnitOfWork`, mesmo `storage`/`storageBucket` de T6.

### O mapeamento dos dois SQLSTATE (23505/23514), provado

`src/trips/infrastructure/drizzle-occurrence-attachment.repository.ts`,
`insertOccurrenceAttachmentRow`: o `INSERT … SELECT` (posição monotônica, T1) agora roda dentro de
um `try/catch`. `findPostgresError` (`database/postgres-error.support.ts`) sobe a cadeia de `cause`
até achar `{ constraint, sqlState }`; se `constraint` estiver em
`OCCURRENCE_ATTACHMENT_LIMIT_CONSTRAINTS` (`trip_document_occurrence_attachments_unique_position` —
`23505` — ou `trip_document_occurrence_attachments_position_check` — `23514`), lança
`TripOccurrenceAttachmentLimitError` (409); qualquer outro erro sobe intacto. Cobrir só o unique
deixaria a sexta foto de uma ocorrência **já no teto** (onde `coalesce(max(position), 0) + 1`
calcula 6, e nenhum unique bate antes do CHECK) virar 500 — é exatamente o cenário que o teste "a
corrida da sexta foto (constraint do banco) também converge em 409" prova, forçando
`insertAttachment` a lançar `TripOccurrenceAttachmentLimitError` (simulando o que o Postgres faria
por qualquer um dos dois SQLSTATE) e conferindo que a limpeza de storage roda (1 objeto subido, 1
removido). Esta função é comum a T6 e T7 — o mapeamento corrige os dois caminhos de escrita.

### Vermelho e verde

Vermelho: `attach-occurrence-photo.use-case.ts` não existia; escrevi
`test/trip-occurrence/attachment-append.contract.ts` primeiro (parser + caso de uso), que falhava
por `Cannot find module`. Depois de implementar o parser e o caso de uso, rodei e um teste falhou de
verdade (não por ausência de código): "caso feliz com thumbnail sobe os dois objetos" usava bytes
`[1, 2, 3]` como miniatura, que não batem a assinatura JPEG — `assertOccurrenceUploadAccepted`
recusou com `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`, como deveria. Troquei pelos bytes de assinatura
JPEG válida (mesmos de `separation-upload.contract.ts`) e o teste passou pelo motivo certo.

Verde, depois do ajuste:

- `bun --env-file=../../.env.test test test/trip-occurrence.contract.test.ts --timeout 120000` →
  **122 pass, 0 fail**, 263 `expect()` (era 111/0/247 depois de T6; T7 soma 11 testes).
- `bun run --cwd apps/api-transportada test` (suíte completa) → **6794 pass, 32 skip, 0 fail**,
  23301 `expect()` em 182 arquivos.
- `bun run typecheck` (as seis apps) → verde.
- `bun run lint` (as seis apps) → verde.
- `bun run format:check` → verde (depois de `prettier --write` em `main.ts` e no contrato novo).
- `bun --env-file=../../.env.test run test:integration` **não rodou** — T7 não criou nenhum arquivo
  em `test/integration/`; a integração é T12/T16, fora deste recorte.

### Dois contratos pré-existentes precisaram de ajuste (efeito esperado de rota nova)

- `test/separator-role.contract.test.ts`: a rota nova entrou na lista de rotas que o `separator`
  alcança — mesma permissão (`trip.manage`) do registro, mesmo raciocínio (T7 não muda quem alcança
  o quê, só acrescenta uma rota sob a permissão que já existia).
- `test/rate-limited-routes.contract.test.ts`: a rota nova entrou na lista fechada de rotas com
  `rateLimit: { store: 'postgres' }`, com o balde exato (300/300 s, `trip-occurrence-attachment`).
  Isto também cumpre metade do CA18 de T8 ("as duas rotas listadas no contrato de rate limit") — T8
  ainda falta a parte da idempotência (fingerprint do anexo, convergência/409 por conteúdo).

### Decisão além do que a spec fixava

A spec (plan.md) não detalha o _shape_ do port do caso de uso — segui o mesmo desenho de T6
(`*TransactionPort` + `*UnitOfWork` injetados, validação fora da transação, `newObjectId`/`now`
como funções puras injetadas) para manter os dois casos de uso de anexo com a mesma forma, e porque
`insertOccurrenceAttachmentRow` já era pensado para rodar dentro de qualquer transação (T3). O
`countOccurrenceAttachments` como checagem prévia (evitar upload numa ocorrência já no teto) não
está no `plan.md` mas é consistente com "o `count` antes do insert serve para mensagem amigável,
nunca como trava" (nota da migration, T1) — implementei exatamente essa leitura: o `count` só evita
gasto de rede/bucket no caso comum, e quem decide de verdade é o banco.

## T8 — Idempotência e rate limit registrados (CA18)

### O que já existia (T2) e o que faltava

`buildOccurrenceAttachmentCreateFingerprint`/`buildOccurrenceAttachmentAppendFingerprint`
(`src/trips/domain/occurrence-attachment.policy.ts`) já existiam desde T2, provadas puras em
`test/trip-occurrence/attachment-policy.contract.ts` (sha256 do original; miniatura nunca entra na
impressão; `productCode` ausente/nulo produzem a mesma impressão). O que faltava era a **ligação**:
nenhuma das duas rotas (`POST .../occurrences`, T6; `POST .../occurrences/:occurrenceId/attachments`,
T7) chamava `withFieldReport` — `idempotencyKey` era parseado da rota e descartado em `main.ts`, sem
reservar chave nenhuma. Confirmado por leitura antes de codar: `grep idempotencyKey src/main.ts`
não tinha nenhuma ocorrência nas duas fiações.

### A reserva da chave, sem `FieldTripTarget`

O galpão não tem alvo de campo (D6: `saveTripOccurrence` já grava `channel = 'driver_app'` por
padrão da coluna quando `authorship` está ausente — é o **mesmo** valor que este fluxo sempre
gravou). `withFieldReport` exige uma autoria (`FieldAuthorship`) para reservar a chave em
`trip_field_reports`; usei `{ channel: 'driver_app', onBehalfOfDriverId: null }` — consistente com
o que a linha da ocorrência já grava, sem inventar um canal novo.

### `src/main.ts`

- `fieldReportGuardTransaction` (perto de `driverFieldReports`, linha ~1587): adaptador
  `Pick<DriverFieldReportTransactionPort, 'claim' | 'settle'>` — cada chamada abre sua própria
  transação curta via `driverFieldReports.execute(...)`, **não** a mesma transação da escrita.
  Decisão registrada no comentário do código: `withFieldReport` já trata `resultId: null` como
  "roda de novo" (ver `trip-field-report.port.ts`), então uma falha entre o `claim` e o efeito
  converge no **próximo reenvio** — não precisa da mesma transação para ser seguro, ao custo de não
  ser estritamente atômico com a escrita (diferente do padrão de `document-outcome.service.ts`, que
  aninha tudo numa transação só porque tem `DriverFieldReportUnitOfWork.execute` disponível
  naturalmente ali). Registrado como decisão além do que a spec fixava — plan.md não detalha o
  desenho da transação da idempotência.
- `registerTripOccurrence.execute`: envolvido em `withFieldReport` — `operation` é
  `${OCCURRENCE_ATTACHMENT_CREATE_OPERATION}:${buildOccurrenceAttachmentCreateFingerprint(...)}`
  (sha256 do `input.attachment.bytes`, nunca da miniatura); `perform` é o `registerTripOccurrence`
  de sempre; `recall` busca a ocorrência por id (`findTripOccurrenceById`, novo em
  `delivery-proof-read.support.ts`) e os anexos (`DrizzleOccurrenceAttachmentRepository.
listOccurrenceAttachments`), devolvendo `email: null` no reenvio (o texto pronto não é
  reconstruído — quem precisava dele já o leu na primeira resposta).
- `attachOccurrencePhoto.execute`: mesmo molde — `operation` com
  `OCCURRENCE_ATTACHMENT_APPEND_OPERATION` + `buildOccurrenceAttachmentAppendFingerprint`; `recall`
  usa `findAttachmentPosition` (novo método em `DrizzleOccurrenceAttachmentRepository`) para devolver
  `{ id, position }` sem inserir de novo.

### Novidades de infraestrutura

- `findTripOccurrenceById` (`delivery-proof-read.support.ts`): `SELECT` de `TripOccurrence` por
  `companyId` + `occurrenceId`, sem autoria/anexo (o `recall` monta o resto).
- `findAttachmentPosition` (`drizzle-occurrence-attachment.repository.ts`): `SELECT id, position`
  por `companyId` + `id` da linha de anexo.

### Gates

- `bun --env-file=../../.env.test test test/trip-occurrence.contract.test.ts --timeout 120000` →
  **122 pass, 0 fail** (sem mudança de contagem — T8 não trocou o comportamento observável dos
  casos de uso puros, só a fiação em `main.ts`, que os testes de contrato existentes não exercitam
  diretamente; ver "o que não foi provado" abaixo).
- `bun run --cwd apps/api-transportada test` (suíte completa) → **6794 pass, 32 skip, 0 fail**,
  23303 `expect()` em 182 arquivos.
- `bun run typecheck` (as seis apps) → verde.
- `bun run lint` (as seis apps) → verde.
- `bun run format:check` → verde.
- `bun --env-file=../../.env.test run test:integration` **não rodou nesta task** — ver abaixo.

### O que não foi provado nesta task, e por quê

A fiação de `withFieldReport` em `main.ts` só é exercitável de ponta a ponta contra `trip_field_reports`
de verdade (o `claim` depende do unique `(company_id, idempotency_key)` do Postgres para decidir a
corrida) — não há dublê de `main.ts` nos testes de contrato desta suíte. O CA18 completo (mesma
chave/mesmo conteúdo converge sem duplicar; mesma chave/conteúdo diferente → 409
`TRIP_FIELD_REPORT_KEY_REUSED`) fica provado contra Postgres em `test/integration/trip-occurrence-
attachment.integration.ts`, que é T12 (a spec já reserva essa task para a integração das três
leituras **e** — pela mesma exigência do `tasks.md` de T16 para o WhatsApp — é o lugar natural para
o caso de idempotência do HTTP também, por já precisar de banco de verdade e de uma ocorrência
gravada de ponta a ponta). Registrar aqui para não se perder: a task de integração de T12 precisa
cobrir também o cenário de reenvio da T8, não só as três leituras do `plan.md`.

## T9 — Painel da nota devolve `attachments[]` com miniatura

Data: 2026-09-21. Commit `b211dd104`.

### O ponto que decidia esta task

Medido antes de tocar em código: `listTripOccurrences` (`delivery-proof-read.support.ts:175-271`)
tinha **doze menções** a "attachment" — o tipo `TripOccurrenceAttachmentLocation` (linha 169), o
campo `attachment` no tipo de retorno (linha 184), as três colunas selecionadas
`attachmentBucket`/`attachmentMimeType`/`attachmentObjectKey` (189-191), o `leftJoin` contra
`storedObjects` pela coluna antiga `attachmentObjectId` (218-224) e as quatro linhas do mapeamento
que montavam o `attachment` singular a partir dele (255-261). Todas as onze olhavam **só** para
`attachment_object_id` — nenhuma delas via a tabela nova. A décima segunda menção
(`findOccurrenceForAttachment`, linha 659) é função **diferente**, de T7 (resolve a ocorrência para
a rota de anexo adicional, sem ler o anexo em si) — confirmado por leitura, não tocada.

**Como provei que as onze relevantes foram cobertas**: removi o tipo `TripOccurrenceAttachmentLocation`,
as três colunas do `select`, o `leftJoin` inteiro e o bloco de mapeamento — `listTripOccurrences`
não menciona mais `stored_objects`/`attachment` em nenhuma forma; `command grep -n -i "attachment"
delivery-proof-read.support.ts` depois da mudança só devolve `findOccurrenceForAttachment` (T7,
função diferente) e comentários explicando a decisão. `bun run typecheck` confirma que nada mais no
projeto lia o campo `attachment` removido (o único consumidor de `listTripOccurrences`, o
`repository.listOccurrences` do caso de uso, já era tipado como `TripOccurrence[]` — não olhava
para `attachment`).

### O que mudou

- `src/trips/infrastructure/delivery-proof-read.support.ts`: `listTripOccurrences` para de juntar
  `stored_objects` pela coluna antiga; devolve só os campos da ocorrência + `id`.
- `src/trips/application/register-trip-occurrence.use-case.ts`: `TripOccurrenceWithAttachment.attachment`
  (singular) vira `.attachments: readonly OccurrenceAttachmentView[]` (RF8); `TripOccurrenceAttachmentSummary`
  (não usado em mais nenhum lugar) sai.
- `src/trips/application/occurrence-attachment.service.ts`: `readOccurrenceAttachments` passa a
  delegar para uma função nova exportada, `buildOccurrenceAttachmentViews` — a mesma regra de
  apresentação (expired/thumbnailUrl ausente) fica reaproveitável por quem já resolveu os
  `OccurrenceAttachmentRecord[]` por outro caminho (T10 usa isso no feed).
- `src/main.ts`: `listTripOccurrences.execute` para de assinar a URL do `attachment` legado à mão —
  chama `readOccurrenceAttachments` (T3) por ocorrência, com `DrizzleOccurrenceAttachmentRepository`
  e `createDeliveryProofDownloadGateway` já existentes.

### O que essa task entregou

`GET /trips/:id/documents/:documentId/occurrences` devolve `attachments[]` ordenado por `position`
(a ordenação já é garantida por `DrizzleOccurrenceAttachmentRepository.listOccurrenceAttachments`,
`orderBy(asc(position))`, T3); `downloadUrl`/`thumbnailUrl` assinados; nunca `objectKey`/`bucket`
(o tipo `OccurrenceAttachmentView` não tem esses campos — impossível vazar por acidente);
ocorrência sem anexo devolve `[]`; anexo sem miniatura sai sem `thumbnailUrl`; retenção vencida sai
sem nenhuma URL (`expired: true`) — os quatro comportamentos são os mesmos já provados pelo unitário
de T3 (`attachment-read.contract.ts`), agora ligados na composição real.

### Gates

- `bun run typecheck` (as seis apps) → verde.
- `bun run --cwd apps/api-transportada test test/trip-occurrence.contract.test.ts
test/trip-field-office.contract.test.ts test/trip-http.contract.test.ts
test/trip-infrastructure.contract.test.ts test/trip-application.contract.test.ts` → verde (447
  testes, 0 fail).
- `bun run --cwd apps/api-transportada test` (suíte completa) → **6794 pass, 32 skip, 0 fail**.
- `bun run lint` (as seis apps) → verde.
- `bun run format:check` → verde.

### O que não foi provado aqui

A composição em `main.ts` (o `listTripOccurrences.execute` de verdade) não tem dublê de contrato —
segue o mesmo padrão que já existia antes desta spec (nenhuma composição de `main.ts` é testada
isoladamente neste projeto; é `test/integration/*` que exercita o `main.ts`). A prova de ponta a
ponta desta task está em T12.

## T10 — Feed e consulta de ocorrências: `hasAttachment` real e leitura no formato RF8

Data: 2026-09-21. Commit `8947aeff5`.

### O que mudou

- `src/trips/infrastructure/trip-occurrence-feed.query.ts`:
  - `listDocumentOccurrenceRows`: `hasAttachment: false` fixo (linha 234 do `plan.md`/`tasks.md`)
    vira uma condição `EXISTS` contra `trip_document_occurrence_attachments` **ou**
    `attachment_object_id is not null` — a mesma união de RF15, calculada no banco, sem trazer a
    linha do anexo para a listagem (RNF2).
  - `listStopOccurrenceAttachmentLocations`/`listDocumentOccurrenceAttachmentLocations`/
    `listTripOccurrenceAttachmentLocations` deixam de devolver `{bucket, id, mimeType, objectKey}`
    cru — passam a devolver `OccurrenceAttachmentRecord[]` (o mesmo tipo de T3): para a nota, a
    tabela nova (com miniatura, ordenada por `position`) quando existem linhas, senão a coluna
    antiga; para a parada (fora do escopo desta spec, D2/D12), sempre `position: 1` sem miniatura.
- `src/trips/application/trip-occurrence-feed.use-case.ts`: `TripOccurrenceFeedReaderPort.
listAttachmentLocations` muda de tipo de retorno; `createReadTripOccurrenceAttachmentsUseCase`
  para de montar a view à mão (só assinava o original) e passa a chamar `buildOccurrenceAttachmentViews`
  (T9) — `GET /trip-occurrences/:id/attachments` publica agora no **mesmo formato RF8** do painel:
  `position`, `expired`, `thumbnailUrl` quando há miniatura. `TripOccurrenceAttachmentView` vira
  alias de `OccurrenceAttachmentView`, para não obrigar os dois chamadores a importar de dois
  lugares o mesmo formato.

### Critério de aceite (CA6)

- Ocorrência de nota com foto: `hasAttachment: true` (medido pela integração de T12, ver abaixo —
  o `EXISTS` não é testável sem banco).
- `GET /trip-occurrences/:id/attachments` no formato de RF8, com `thumbnailUrl` quando há miniatura
  e sem ele quando não há (a query nova já devolve `thumbnail: null` para a coluna antiga e para a
  parada; `buildOccurrenceAttachmentViews` omite a chave `thumbnailUrl` nesse caso — mesma regra de
  T3, reaproveitada).

### Gates

- `bun run typecheck` (as seis apps) → verde.
- `bun run --cwd apps/api-transportada test test/trip-occurrence.contract.test.ts
test/trip-http.contract.test.ts` → verde.
- `bun run --cwd apps/api-transportada test` (suíte completa) → **6794 pass, 32 skip, 0 fail**.
- `bun run lint` / `bun run format:check` → verdes.

### O que não foi provado aqui

O `EXISTS` do `hasAttachment` e a união das duas fontes de `listTripOccurrenceAttachmentLocations`
são consultas SQL — não há contrato unitário sem banco que os exercite de verdade (os contratos
existentes de feed usam dublê de `TripOccurrenceFeedReaderPort`, então não pegam um erro de SQL na
consulta real). A prova fica em T12.

## T11 — Linha do tempo: contagem de fotos, nenhuma URL assinada

Data: 2026-09-21. Commit `b606129a1`.

### O que mudou

- `src/trips/application/trip-timeline.types.ts`: `TripTimelineOccurrenceReference` ganha
  `attachmentCount: number`.
- `src/trips/infrastructure/trip-timeline-document.query.ts`: `listDocumentOccurrenceRows` calcula
  `attachmentCount` por `CASE` — conta a tabela nova quando `> 0`, senão `1` se a coluna antiga tem
  anexo, senão `0`. Nenhuma URL é gerada (nem pedida): o tipo `TripTimelineItem` não carrega
  `downloadUrl`/`thumbnailUrl` em nenhum lugar, então vazar uma URL aqui exigiria mudar o tipo, não
  só o valor.
- `src/trips/infrastructure/trip-timeline-stop.query.ts`: `listStopOccurrenceRows` (ocorrência de
  parada, fora do escopo da spec 161) ganha `attachmentCount: 0 | 1` a partir da mesma
  `attachmentObjectId` que já decidia `hasAttachment` no feed — só para satisfazer o tipo comum
  `TripTimelineOccurrenceReference`, sem mudar o comportamento dela.

### Critério de aceite (CA7)

`attachmentCount` correto; nenhuma URL assinada, nem de original nem de miniatura — provado por
construção de tipo (o `TripTimelineItem` não tem campo de URL) e, contra dados reais, por T12.

### Gates

- `bun run typecheck` (as seis apps) → verde.
- `bun run --cwd apps/api-transportada test test/trip-http.contract.test.ts` → verde (nenhum
  contrato unitário existente exercitava a forma de `occurrence` da linha do tempo com dado real —
  os contratos de rota stubam a dependência inteira).
- `bun run --cwd apps/api-transportada test` (suíte completa) → **6794 pass, 32 skip, 0 fail**.
- `bun run lint` / `bun run format:check` → verdes.

## T12 — Integração das três leituras contra o Postgres

Data: 2026-09-21. Commit `73ea73de`.

### Ambiente

Docker local fora do ar (`docs/ai-context` já registra isso) — rodei contra o Postgres nativo
descartável de T1, porta `65433`:

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test --timeout 120000 \
  ./test/integration/trip-occurrence-attachment.integration.ts
```

### O que o arquivo prova

`test/integration/trip-occurrence-attachment.integration.ts`, seis testes, todos contra banco
descartável criado e migrado do zero (`withDisposableDatabase`, molde de T5):

1. **Painel + feed + linha do tempo sobre a mesma linha da tabela nova, com miniatura.** Registro
   real via `registerTripOccurrence` → `persistSeparationOccurrenceWithAttachment` (o mesmo caminho
   de `main.ts`, com `withFieldReport` de verdade). `readOccurrenceAttachments` (painel) devolve
   `downloadUrl` + `thumbnailUrl`, `expired: false`, `position: 1`;
   `listTripOccurrenceFeed`.`hasAttachment` é `true`; `listTripOccurrenceAttachmentLocations`
   devolve o registro com `thumbnail` preenchido; `listDocumentOccurrenceRows` (linha do tempo)
   devolve `attachmentCount: 1` e a linha **não tem** as chaves `downloadUrl`/`thumbnailUrl`.
2. **Ocorrência de rua (coluna antiga, D6): um item sem `thumbnailUrl`, nas três leituras.** Insert
   direto simulando dado anterior à spec (`attachment_object_id` preenchido, nenhuma linha na
   tabela nova) — as três leituras devolvem um item de `position: 1` sem miniatura.
3. **Retenção vencida (RF26): `expired: true`, sem nenhuma URL, antes do expurgo passar.** Registro
   normal, depois `UPDATE stored_objects SET retention_until = <passado>` — o painel devolve
   `expired: true` sem `downloadUrl` nem `thumbnailUrl`, provando que a expiração é a **data**, não
   uma marca que só o expurgo (T17) grava.
4. **Isolamento por empresa.** Ocorrência da empresa A, lida com o `companyId` da empresa B: painel
   e feed devolvem lista vazia — nunca o anexo de outra empresa (RNF6).
5. **Reenvio idempotente do registro (pendência de T8).** Mesma `Idempotency-Key` e mesmo conteúdo
   → mesmo `id` de ocorrência, uma linha só na tabela de anexos (nenhuma duplicata); mesma chave com
   conteúdo diferente → `TripFieldReportKeyReusedError` (409 `TRIP_FIELD_REPORT_KEY_REUSED`),
   provado contra o unique `(company_id, idempotency_key)` de `trip_field_reports` de verdade — o
   que a T8 não tinha como provar sem banco.
6. **Sexta foto bate no teto pelo caminho real do banco (pendência de T8).** Quatro `attach`
   sucessivos sobre uma ocorrência já com uma foto (total 5), `countOccurrenceAttachments` confirma
   5, e o sexto `attach` lança `TripOccurrenceAttachmentLimitError` — vindo do `23505`/`23514`
   mapeado em `insertOccurrenceAttachmentRow` (T1/T6), não de uma contagem no aplicativo.

### O vermelho e o verde

Não houve vermelho intencional (TDD clássico) nesta task porque o alvo é a integração de código já
escrito e testado em unidade nas tasks anteriores — o "vermelho" real foi o `typecheck` até acertar
a assinatura de `registerTripOccurrence` (faltava `note`) e do `insert` direto em
`tripDocumentOccurrences` (faltava `actorUserId`), os dois corrigidos antes da primeira execução.
Na primeira execução contra Postgres os seis testes já passaram — o comportamento tinha sido
provado peça por peça nos unitários de T3/T9/T10; a integração não achou divergência entre o que os
dublês assumiam e o banco de verdade.

```
$ DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-occurrence-attachment.integration.ts
 6 pass
 0 fail
 27 expect() calls
```

### Gates

- `bun run --cwd apps/api-transportada test` (contrato) → **6794 pass, 32 skip, 0 fail**.
- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test run test:integration` (integração
  completa, 91 arquivos) → **488 pass, 17 fail**. As 17 falhas são todas em
  `toll-booth-reload.integration.ts` (spec 154), com `ObjectStorageError: Object storage is
unavailable` — MinIO fora do ar neste ambiente (o mesmo Docker local que o `CLAUDE.md` já registra
  como quebrado), **nada relacionado a esta spec**: nenhuma falha em `trip-occurrence-attachment`,
  `trip-timeline`, `trip-field-office` ou qualquer arquivo tocado pela fase 3. Os seis testes novos
  passaram nas duas execuções (isolada e dentro da suíte completa).
- `bun run typecheck` / `bun run lint` / `bun run format:check` (raiz) → verdes.
- Arquivo somado à lista explícita de `test:integration` em `apps/api-transportada/package.json`
  (§"⚠️ O teste da API são dois comandos" do `CLAUDE.md` da raiz — sem isso o arquivo existiria e
  nunca rodaria).

### O que a integração revelou que os contratos não pegavam

- O `readOccurrenceAttachments` de T3 nunca tinha sido chamado com um repositório **de verdade**
  contra uma linha com `thumbnail_object_id` preenchido — só com dublês. A junção `leftJoin` de
  `DrizzleOccurrenceAttachmentRepository.listOccurrenceAttachments` (T3) e a ordem
  `orderBy(asc(position))` funcionaram de primeira, mas só a integração prova que o `alias()` duplo
  de `stored_objects` (original/miniatura) não colide no SQL gerado — um erro aí teria passado
  batido em todo unitário desta fase.
- O `EXISTS` de `hasAttachment` (T10) e a condição `CASE` de `attachmentCount` (T11) são SQL puro,
  sem cobertura nenhuma fora de integração — a sintaxe (`select 1 from ... where company_id = ...`)
  só é validada quando o Postgres de verdade compila a query. As duas passaram de primeira.
- O reenvio idempotente (T8) nunca tinha rodado contra o unique real de `trip_field_reports` — só
  contra dublê de `claim`/`settle`. A integração prova que `withFieldReport` + o unitário de
  trabalho do banco convergem como o `plan.md` descreve, inclusive o caminho de erro (chave
  reaproveitada com conteúdo diferente).
- A sexta foto (T8) nunca tinha sido gravada cinco vezes seguidas contra o banco — só contra o
  dublê de `countOccurrenceAttachments`. A integração prova que o `INSERT ... SELECT ...
coalesce(max(position), 0) + 1` (T1) calcula as posições 2 a 5 corretamente em sequência e que o
  sexto insert bate no `CHECK`/`unique` antes de qualquer contagem no aplicativo teria a chance de
  errar.

## Fase 4

### T13 — a ocorrência do WhatsApp usa a mesma persistência da rota HTTP

Commit `21b3ac047`.

`main.ts` — a dep `registerOccurrence` de `createOperatorWhatsAppFlowActions` (usada só pelo
operador; a do motorista continua em `saveTripOccurrence`, fora do escopo desta task) passa a
implementar `saveOccurrence` com `persistSeparationOccurrenceWithAttachment`, no mesmo molde do
bloco da rota HTTP (`main.ts:2861` na versão anterior a esta task). `attachment` vira campo opcional
em `RegisterOperatorTripFlowDependencies.registerOccurrence` (tipo) e é repassado do input —
`exactOptionalPropertyTypes` exigiu o spread condicional em vez de `attachment: input.attachment`
direto. `whatsappStorageBucket`/`whatsappStorageGateway` (já existentes, criados logo depois deste
bloco em `main.ts`) e `DrizzleSeparationOccurrenceUnitOfWork` alimentam a chamada.

Comportamento inalterado: nenhum caminho ainda escreve `attachment` de verdade (a T15 liga o passo
de foto) — `registerTripOccurrence` continua recusando com `OccurrencePhotoRequiredError` (422)
toda ocorrência do operador, como já documentado pela T5. O que muda é _qual_ implementação de
`saveOccurrence` seria chamada se um `attachment` chegasse — e é isso que os dois testes provam.

**CA9b/CA9c** — não há como montar `main.ts` (composition root) num teste isolado com fakes; segui
o padrão já usado por `test/trip-schema/trip-status-writers.contract.ts` (varredura de texto-fonte)
em vez de reinventar. `test/whatsapp/occurrence-persistence-wiring.contract.ts`:

- isola o bloco da dep `registerOccurrence` do operador (ancorado em
  `createOperatorWhatsAppFlowActions(`, porque há uma segunda dep `registerOccurrence` — a do
  motorista — mais acima no arquivo, e o primeiro `indexOf` ingênuo casou com ela) e prova que o
  texto contém `persistSeparationOccurrenceWithAttachment(` e não contém mais
  `saveOccurrence: (query) => saveTripOccurrence(`;
- prova a regressão de D7: `meta-whatsapp-module.resolver.ts` não contém as palavras `providers`
  nem `objectStorage`.

Vermelho antes da implementação (o primeiro assert falhou por casar com o bloco errado do
motorista; corrigido ancorando a busca; depois falhou como esperado contra o bloco real do
operador, que ainda usava `saveTripOccurrence`), verde depois. A garantia comportamental de
`persistSeparationOccurrenceWithAttachment` em si (purpose, retenção, chave, limpeza) já é do
contrato de T6 — este contrato só garante que o WhatsApp de fato passa por ali.

Gates: `bun test test/whatsapp.contract.test.ts` (48 pass) e depois `bun test` completo da API
(6796 pass, 32 skip, 0 fail) · `bun run typecheck`/`lint`/`format:check` na raiz — todos verdes.

### T14 — a imagem viaja por contexto, não pela assinatura

Commit `3d4c671a8`.

`extractWhatsAppAnswer` (`whatsapp-answer.policy.ts`) **não mudou** — continua `string | undefined`.
Nova função `extractWhatsAppIncomingImage` no mesmo arquivo lê `message.image` (`id`/`mime_type`,
os dois opcionais no schema do pacote — só devolve o descritor quando ambos existem). O despachante
(`whatsapp-command-driver.service.ts`, `advanceConversation`) escreve
`{ mediaId, mimeType }` sob `WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY` (novo, em
`whatsapp-command.constant.ts`) no `cursor.context`, só no branch que já tinha nó localizado (a
segunda montagem de cursor) — é o único caso em que um `FlowActionHandler` de ação (o router de
foto, T15) pode estar do outro lado.

A chave é apagada do contexto persistido em **todo** ponto de gravação de estado do turno —
`withoutIncomingImage` (nova, ao lado de `withoutInvalidAttempts` em `whatsapp-flow-step.service.ts`)
aplicada em `clearWhatsAppFlowPosition`, no branch `awaiting-answer` de `settleFlow` e no
`nextCursor` do salto entre fluxos — consumida ou não pelo handler do nó alcançado. Sem isso, um nó
que recebesse imagem mas não fosse o router de foto deixaria o `media-id` vazando para o próximo
turno; o handler de T15 nem precisa se lembrar de apagá-la.

**CA9** — `test/whatsapp-commands/incoming-image-context.contract.ts`, com o `FlowInterpreter` real
do pacote (mesmo molde de `command-driver.contract.ts`):

- mensagem de imagem com a posição já no nó de ação `photo` (`actionKind: contract.photo`) chega ao
  handler com `context[WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY] = { mediaId, mimeType }`;
- a chave nunca aparece em nenhum `storedContexts` nem na posição final — mesmo o handler de teste
  **não** apagando (prova que o driver escrupula sozinho, não que o handler colabora);
- imagem enviada com a posição num nó de escolha (`menu`) não avança e não grava a chave — o
  caminho existente de resposta inválida (`rejectAnswer`, D8) já cobre isso, porque
  `extractWhatsAppAnswer` devolve `undefined` para mensagem sem texto/interativo e
  `isOfferedOption` recusa `undefined`; nenhuma mudança de código precisou aqui, só o teste que
  prova que continua assim;
- `MEDIA_ID` nunca aparece em `JSON.stringify(logged)`.

Vermelho: a primeira versão do teste usava `next: 'photo'` no handler de teste (o mesmo nó como
próprio destino), o que **não é infra-vazamento nenhum** — é o `FlowInterpreter` de verdade
reexecutando o nó de ação em loop e estourando o teto interno dele (50 iterações, o teste falhou
com `photoHandlerContexts` de tamanho 50). Troquei o destino para um nó terminal (`photoDone`, sem
`actionKind`) — nó de ação sem `actionKind` é tratado como mensagem final pelo interpretador, no
mesmo padrão que `command-driver.contract.ts` já usa (`done_a`). Depois disso, vermelho esperado
(campo `attachment`/contexto ainda não existia) → verde após a implementação.

Gates: `bun test test/whatsapp-commands.contract.test.ts` (404 pass) e `bun test` completo da API
(6800 pass, 32 skip, 0 fail) · `bun run typecheck`/`lint`/`format:check` na raiz — todos verdes.

### Divergência entre a spec e o código encontrado

Nenhuma. `whatsapp-answer.policy.ts:7-13` já estava exatamente como a T14 descreve (assinatura
inalterada); `persist-separation-occurrence-attachment.service.ts` (T6) já existia com o teto ainda
fixo em `OCCURRENCE_PHOTO_MAX_BYTES` — parametrizá-lo é explicitamente T15, não T13, e não toquei
nisso agora (T13 não passa nenhuma foto de verdade, então o teto atual nunca é exercitado pelo
WhatsApp ainda).
