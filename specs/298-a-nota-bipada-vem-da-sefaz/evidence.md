# Evidência — 298

## Diagnóstico de origem (06/11/2026, produção, só leitura)

- 924712, 924713, 924725, 924727, 924728: nenhuma linha em `nfe_documents`, `trip_documents` ou `nfe_import_items`.
- Cursor DF-e em dia: `ult_nsu = max_nsu = 55935`, `updated_at` 11:05 UTC, importações horárias `completed`.
- Série 2 do mesmo emitente presente só de 924741 a 924809 (emitidas 03/11); nada abaixo de 924741.
- 316 notas `source = 'upload'`, 96 delas em viagem: importação manual já alimenta viagens.

## T0.1 — script de consulta por chave

Escrito (somente script; **nenhuma chamada a SEFAZ ou à produção foi feita**):

- `tmp/ops/producao-consulta-por-chave.sh <chave>`: valida 44 dígitos, avisa que conta 1 das 20 consultas/hora do CNPJ,
  exige digitar `sim`, e roda `railway ssh -p 62de4c69-… -s worker -e production` com o helper em base64.
  `REPO="${REPO:-$(git rev-parse --show-toplevel)}"`, sem caminho fixo.
- `tmp/ops/producao-consulta-por-chave.mjs`: roda no container do worker (`bun -e`, cwd da app). Reusa do `dist/` o
  `DrizzleNfeDistributionProfileRepository` + `createDigitalCertificateSecretService` (mesmo certificado/perfil da rotina de
  distribuição), faz **uma** `NfeDistribuicaoProvider.consultarPorChave` e imprime só linhas `__RESULT__`: `ambiente`, `cStat`,
  `xMotivo`, `schema`. O `cStat`/`xMotivo` vêm da resposta bruta (intercepta `fetchSefaz`), porque o pacote 0.4.0 **lança**
  `Error` para qualquer cStat fora de 137/138 (656 com texto próprio) e devolve `undefined` no 137: sem isso o cStat se perderia.
  Nunca imprime XML, certificado ou senha; mensagem de erro só sai se for da SEFAZ.

Como rodar (Arch, `railway whoami` ok): `bash tmp/ops/producao-consulta-por-chave.sh <chave de uma nota de 06/11>`.
Uma só empresa no banco é escolhida sozinha; havendo mais de uma, `COMPANY_ID=<uuid>`.

Validação feita: `bash -n` (ok), parse do helper (`bun build --no-bundle`, ok), quoting do `sh -c`/`bun -e` testado local com
payload trivial. `shellcheck` não instalado.

**Rodar em produção: pendente de aprovação humana — cStat ainda não registrado.** Registrar aqui `cStat`/`xMotivo`/`schema`
ao rodar.

## T1.1 — migration aditiva

Migration: `apps/api-transportada/drizzle/20261106120034_nfe_access_key_lookups/` (`migration.sql`, `rollback.sql`,
`snapshot.json`), gerada por `bun run db:generate --name nfe_access_key_lookups` (drizzle-kit não atualizado).

SQL, só aditivo (sem DROP de tabela/coluna, sem NOT NULL retroativo):
- `CREATE TABLE nfe_access_key_lookups`: `id`, `company_id`, `environment`, `access_key`, `status`, `reason`, `c_stat`,
  `not_before`, `document_id`, `import_id`, `requested_by_user_id`, `correlation_id`, `attempts`, `finished_at`, timestamps.
  CHECKs: ambiente, regex da chave (a mesma de `nfe_documents`), status (6 valores), motivo (9 valores, nulo ou da lista),
  `imported` ⇒ `document_id`, `refused` ⇒ `reason`, `waiting` ⇒ `not_before`, `attempts >= 0`. `UNIQUE (company_id, id)`.
  FKs compostas: `(company_id, document_id)` → `nfe_documents`, `(company_id, import_id)` → `nfe_imports`,
  `(requested_by_user_id, company_id)` → `user_company_memberships`.
- Índice único parcial `nfe_access_key_lookups_active_unique` em `(company_id, environment, access_key)` WHERE status em
  queued/querying/waiting.
- Índice `nfe_access_key_lookups_refusal_window_idx` em `(company_id, environment, access_key, finished_at DESC)` (RF8).
- Índice parcial `nfe_access_key_lookups_waiting_not_before_idx` em `(status, not_before)` WHERE status = 'waiting'.
- `CREATE TABLE nfe_access_key_lookup_budgets`: PK `(company_id, environment)`, `window_started_at`, `used_in_window`
  (≥ 0), `blocked_until`, `updated_at`. CHECK de ambiente.
- Widening de CHECK (DROP + ADD): `nfe_imports_source_check`, `nfe_documents_source_check` aceitam `'access_key'`;
  `processing_outbox_event_type_check` aceita `'transportada.nfe.access-key.requested'`.

Rollback (manual, com aprovação): recusa se houver outbox com o novo evento; apaga as duas tabelas; reclassifica
`source = 'access_key'` para `'upload'` (nfe_documents e nfe_imports) e recoloca as três CHECKs antigas; remove a linha do
journal, com a checagem de exatamente uma linha removida.

Código alterado:
- `src/database/nfe.schema.ts` (API): `NFE_IMPORT_SOURCES` + `access_key`; constantes de status e motivo; as duas tabelas; CHECKs.
- `src/database/processing.schema.ts` (API): whitelist do evento.
- `src/nfe-imports/application/nfe-import.types.ts`: tipo do modelo de leitura de `source` (`'access_key' | 'distribution' | 'upload'`).
  O tipo de entrada do comando ficou estreito de propósito (quem produz `access_key` é a T1.3).
- `src/database/nfe.schema.ts` (worker): cópia por valor, com as duas tabelas, tipos de status/motivo e `NfeImportSource`.
  Sem CHECKs, como o resto da cópia.
- Pins de teste atualizados: `test/nfe-schema/{imports,documents,processing}.contract.ts`,
  `test/database-migration/static-migration.contract.ts` (lista de pastas) e `support.ts` (`NFE_TABLES`).
- `deploy/staging-refresh/prune-source.sql`: `nfe_access_key_lookup_budgets` e `nfe_access_key_lookups` como `empty`. O
  contrato de Drizzle (spec 291) falhou sem isso: tabela nova sem política quebra o CI.

Não alterado (decisão para a T1.3): `processing_outbox` tem `aggregate_type = 'nfe_import'` e FK composta
`(company_id, aggregate_id) → nfe_imports`. O evento novo, cujo agregado é a busca, não cabe nessa FK. Ver o relatório da T1.1.
O relay do worker (`outbox-relay.service.ts`, `drizzle-outbox.repository.ts`) tem union de tipos de evento; não foi tocado (lógica de worker é T2).

Gates (saída final de cada um):
- `bun run typecheck` (raiz, todas as apps): `ROOT_TC_EXIT=0`. API e worker: `EXIT=0`.
- `make migration-test`: `231 pass, 0 fail (4649 expects), 8 arquivos`, `EXIT=0`.
- Integração de migration (aplica tudo num banco descartável, roda os rollbacks de trás para frente, reaplica):
  `bun test ./test/database-migration/database-migration.integration.ts` com `DATABASE_URL` do `.env.test`: `1 pass, 0 fail`.
  Esse arquivo não está em nenhum script de `package.json`; cobriu o rollback novo.
- API, contrato completo (`bun --env-file=../../.env.test test --timeout 120000`): `14029 pass, 0 fail, 26 skip`, `EXIT=0`
  (depois de ajustar o recorte do staging-refresh; antes do ajuste, 1 fail).
- API `db:test` e contratos de schema/migration (`nfe-schema`, `database-migration`, `migration-chain`, `deploy`):
  `230 pass, 0 fail` e `212 pass, 0 fail`.
- Worker `bun run test`: `2957 pass, 0 fail, 114 arquivos`, `EXIT=0`.
- `bun run lint` (API e worker): `EXIT=0` nas duas apps.

## T1.2 — contratos da busca por chave (vermelho)

Contratos escritos antes de qualquer código de produção (`src/nfe-access-key-lookups/` não existe).

Arquivos (todos na lista explícita do `package.json`: `test` e `test:integration`):
- `test/nfe-access-key-lookups.contract.test.ts` (entrada) + `test/nfe-access-key-lookups/{route,request-use-case,get-use-case}.contract.ts`
- `test/integration/nfe-access-key-lookups.integration.ts` (banco descartável: transação única, rollback, `found`, repetição,
  8 POSTs concorrentes → 1 busca/1 import/1 evento, RF8 a 23 h e 25 h, falha transitória reperguntada, sem perfil fiscal → 409, GET 404 entre empresas)
- `test/fixtures/nfe-access-key-lookup{,-http}.fixture.ts`

Vermelho medido:
- `bun --env-file=../../.env.test test --timeout 120000 ./test/nfe-access-key-lookups.contract.test.ts`: `0 pass, 27 fail`
  (`Cannot find module .../nfe-access-key-lookups/...`).
- `bun --env-file=../../.env.test test ./test/integration/nfe-access-key-lookups.integration.ts`: `0 pass, 1 fail, 1 error`
  (módulo do caso de uso ausente).
