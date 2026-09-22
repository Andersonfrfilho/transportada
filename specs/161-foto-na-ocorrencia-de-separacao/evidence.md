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
