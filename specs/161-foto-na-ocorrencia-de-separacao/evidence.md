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
