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

## T1.3 — rotas da busca por chave (verde)

Código novo em `apps/api-transportada/src/nfe-access-key-lookups/`: `application/` (`request-access-key-lookup.use-case.ts`,
`get-access-key-lookup.use-case.ts`, `nfe-access-key-lookup.{types,constant,error}.ts`), `infrastructure/drizzle-nfe-access-key-lookup.repository.ts`,
`presentation/nfe-access-key-lookups.{routes,schema}.ts`. Tocados: `src/main.ts` (fiação), `src/shared/api.constant.ts` (caminho),
`src/shared/tax-id.service.ts` (reexporta `isChaveDvValid` do pacote fiscal — único ponto de importação, como `CHAVE_PATTERN`).

Decisões:
- Ambiente da busca = `company_fiscal_profiles.environment` (o mesmo que o cartão de status da distribuição lê); sem perfil → `409 NFE_DISTRIBUTION_NOT_CONFIGURED` (erro já existente).
- Ordem na transação: ambiente → `found` → busca ativa → recusa recente (RF8) → **claim** da busca (`insert … on conflict do nothing`, sem `import_id`) →
  `nfe_imports` → `attachImport` → outbox. O claim vem antes do import para quem perde a corrida não deixar um import órfão; o índice único parcial é quem decide.
- Recusa reutilizável (RF8): `status = 'refused'`, motivo em `not_interested|not_found|expired|cancelled|denied`, `finished_at` nas últimas 24 h. Falha transitória e `summary_only` não entram.
- `idempotency_key` do import = `nfe-access-key-lookup:<lookupId>`; `request_fingerprint` = HMAC de (empresa, ambiente, chave) sob a operação `nfe-access-key-lookup.request`.
- Resposta serializa ausentes como `null` (convenção do repo), não como chave omitida.
- POST com teto por usuário em memória (60/min), já que o upload de NF-e não tem teto e esta rota gasta o orçamento da SEFAZ; GET sem teto.
- Id malformado no GET → `404` (o roteador, formato `canonicalUuid` padrão); corpo com campo a mais ou sem `accessKey` → `400 INVALID_REQUEST`; chave inválida (44 posições + DV) → `400 INVALID_ACCESS_KEY`.
- Sem OpenAPI nesta API (CLAUDE.md da app e docs/ai-context): o contrato são os schemas Zod e os contratos de teste; não há geração nem teste de cobertura de rotas a manter.

Gates:
- `bun run typecheck` (raiz, 7 apps): `TC=0`.
- `bun run lint` (API): `LINT=0`.
- Contrato novo: `27 pass, 0 fail` (era `0 pass, 27 fail`).
- Integração nova: `9 pass, 0 fail` (banco descartável; transação única, rollback do outbox, `found`, repetição, 8 POSTs concorrentes → 1/1/1, RF8 23 h/25 h, falha transitória, sem perfil, GET 404 entre empresas).
- API contrato completo (`bun --env-file=../../.env.test test --timeout 120000`): `14056 pass, 0 fail, 26 skip` (era 14029 + 27), `EXIT=0`.
- API `test:integration` completo: `1947 pass, 8 skip, 0 fail`, 345 arquivos, `EXIT=0` (4405 s).

## T1.4 — verificação em lote das chaves (verde)

`POST /v1/nfe-documents/access-key-checks`, `{ accessKeys: string[] }` (1..200, `.strict()`), permissão `invoices.read`, teto de 60/min por usuário (igual ao POST da T1.3).
Mora no módulo dono de `/nfe-documents` (`apps/api-transportada/src/nfe-documents/`), em arquivos próprios (a rota e o repositório existentes passam de 400 e 900 linhas):
`application/{check-access-keys.use-case,nfe-document-access-key-check.{types,constant,error}}.ts`,
`infrastructure/drizzle-nfe-document-access-key-check.repository.ts`, `presentation/nfe-document-access-key-checks.{routes,schema}.ts`.
Tocados: `src/main.ts` (fiação), `src/shared/api.constant.ts` (caminho), `package.json` (3 arquivos de teste novos nas listas), e `test/fixtures/nfe-access-key-lookup-http.fixture.ts` (exporta `createTestRouter`/`authenticatedContext`).

Decisões:
- Cada chave passa por trim + caixa alta, 44 posições (`CHAVE_PATTERN`) e DV (`isChaveDvValid`). Qualquer inválida → `400 INVALID_ACCESS_KEY` com **todas** em `details` (`accessKeys.<índice>`, a chave na mensagem), antes de tocar o banco.
- Duplicadas (inclusive em outra caixa) são deduplicadas depois da canonicalização; uma entrada por chave distinta, na ordem da primeira ocorrência.
- Uma query: `where company_id = $ctx and access_key in (...)`; `companyId` só do contexto autenticado. Chave de outra empresa volta `documentId: null`.
- Roteamento: o método (POST) separa de `GET /nfe-documents/:id`; teste prova que o GET no caminho fixo cai no 404 do id malformado sem chamar `getDocument`.

Gates:
- `bun run typecheck` (raiz, 7 apps): `0`.
- `bun run lint` (API): `0`.
- Contrato novo: `13 pass, 0 fail` (rota 11 casos + caso de uso 1, incl. 200 chaves, 201 e lista vazia → 400, todas as inválidas listadas, 403, teto, sem captura por `:id`).
- Integração nova: `2 pass, 0 fail` (isolamento entre empresas e chave desconhecida em 1 query contada; lote de 200 chaves distintas em 1 query).
- API contrato completo: `14069 pass, 0 fail, 26 skip` (era 14056 + 13).
- API `test:integration` completo: `1949 pass, 8 skip, 0 fail`, 1957 testes em 346 arquivos, `EXIT=0` (6933 s).

## Revisão da Fase 1 — correções

Achado → correção → teste:
1. Corrida do claim lançava `Error` simples quando a vencedora já terminara → perdedor lê `findLatestLookup` (qualquer status, `created_at desc limit 1`) e devolve `existing`; sem nada para ler, refaz o claim uma vez e depois lança `ApiError` 409 `NFE_ACCESS_KEY_LOOKUP_CONFLICT`. `createQueuedLookup` extraído (`executeRequest` < 40 linhas). Testes: contrato `request-use-case` (vencedora ativa, vencedora terminada, retry cria, 409 tipado) e integração com Postgres real forçando o claim a perder contra um lookup `failed` já gravado (devolve esse lookup, nenhum import criado).
2. Rate limit `memory` → `postgres` (entre réplicas), 120/min por usuário nas duas rotas, objetos em `src/shared/nfe-access-key-rate-limit.constant.ts` (escopos próprios); comentário corrigido (quem protege o orçamento da SEFAZ é o do worker). Testes: `route.contract` das duas rotas (`toEqual` do objeto).
3. Teto de 500 buscas ativas por empresa → `429 NFE_ACCESS_KEY_LOOKUP_QUEUE_FULL` (`countActiveLookups` dentro da transação, antes do claim). Testes: contrato 500 → 429 sem claim, 499 → cria; rota repassa o código; integração conta só ativas da própria empresa.
4. `NFE_ACCESS_KEY_LOOKUP_ACTIVE_STATUSES` em `nfe.schema.ts`, usada no repositório e no índice parcial; `'queued'` e `'nfe_import'` viraram constantes. `bun run db:generate` → `no_changes` (SQL idêntico, sem migration nova).
5. `accessKeys[]` com `z.string().max(64)`; `details` só com `accessKeys.<índice>` e mensagem fixa (a chave não é ecoada; o POST da busca nunca ecoou). Testes: item de 65 caracteres → 400 `INVALID_REQUEST`; resposta não contém a chave.
6-8. `tmp/ops/producao-consulta-por-chave.sh`: `COMPANY_ID` validado como UUID e entre aspas no comando remoto; confirmação exige TTY (`[ -t 0 ]`); sem linha `__RESULT__` imprime "sem resultado — verifique manualmente (a consulta pode ter contado no limite)" e sai 1. `bash -n` ok; recusa sem TTY e com UUID inválido conferidas à mão.

Gates:
- `bun run typecheck` (raiz, 7 apps): `0`. `bun run lint` (API): `0`.
- API contrato completo: `14076 pass, 0 fail, 26 skip`.
- Integração dos arquivos do módulo (`nfe-access-key-lookups` 11 pass, `nfe-document-access-key-checks`, `migration-completeness`) + `database-migration.contract.test.ts`: `201 pass, 7 skip, 0 fail`.
- O `test:integration` completo ficou verde em 17bd8b4ec (1949 pass); este delta toca só o módulo novo (sem migration), então não foi repetido.

## T2.1 Política pura de desfecho

`resolveAccessKeyLookupOutcome` (`apps/worker-transportada/src/nfe-access-key-lookup/domain/access-key-lookup-outcome.policy.ts`): entrada = `AccessKeyLookupGatewayResult` (`document` | `not-found` | `sefaz-rejection{cStat}` | `unavailable`), saída `imported-candidate | refused{reason} | failed{sefaz_unavailable} | waiting`.
- Tabela: `procNFe` → candidato; `resNFe` → `summary_only`; vazio/`217` → `not_found`; `640` → `not_interested`; `632` → `expired`; `653` → `cancelled`; `654` → `denied`; `593` → `certificate_mismatch`; `656` → `waiting`; indisponível → `failed`.
- cStat fora da tabela (e schema inesperado, ex.: `procEventoNFe`) → `failed/sefaz_unavailable` com `unmapped: true` (+ `cStat`): quem consome registra log/alerta; nada derruba o processo.
- Contrato: `test/nfe-access-key-lookup/access-key-lookup-outcome.contract.ts`, 13 casos (tabela), via `test/nfe-access-key-lookup.contract.test.ts` (adicionado à lista do `package.json`).

Gates: `bun run typecheck` (raiz) `0`; worker `bun run lint` `0`; worker `bun run test`: `2970 pass, 0 fail` (115 arquivos); `db:generate` após o rebase: `no_changes`. Integração do worker: sem arquivo novo nesta task, não rodada.

## T2.2 Gateway `consultarPorChave`

`nfe-distribution-gateway.ts` e `adatechnology-nfe-distribution-provider.factory.ts` ganham `consultarPorChave({config, chaveNfe})`, que devolve `AccessKeyLookupGatewayResult` (entrada da política T2.1). O pacote (`@adatechnology/fiscal-provider@0.4.0`, só a API pública) devolve `DfeItem | undefined` e **lança `Error` cru** para qualquer cStat fora de 137/138; não expõe cStat estruturado. Mapeamento em `nfe-access-key-lookup-result.mapper.ts`:
- item → `document` (leva `schema` e `xmlDecoded`; nada é logado); `undefined` (137) → `not-found`;
- cStat: (1) `error.code` de 3 dígitos (rejeição tipada), (2) regex `\bcStat (\d{3})\b` na mensagem — é o único caminho que o pacote usa hoje (`SEFAZ NFeDistribuicaoDFe cStat NNN: …` e `(cStat 656)`); `rawResponse` nunca é lido;
- `FISCAL_TIMEOUT`/`FISCAL_CONNECTION_ERROR` (por `code`, não por `instanceof`) e mensagem `SEFAZ … cStat : …` sem número (corpo não-SEFAZ, ex. HTML de 5xx) → `unavailable`;
- qualquer outro erro (chave inválida, certificado) **sobe** — é defeito, não desfecho.
Fixture de teste: `consultarPorChave?` opcional no tipo local para não tocar nos ~20 dublês do consumidor existente.

Contrato: `test/nfe-access-key-lookup/access-key-lookup-gateway.contract.ts`, 9 casos (config mapeada, 137, seis cStat pela mensagem, 656, `code` tipado sem ler `rawResponse`, timeout/conexão com classes reais do pacote, corpo sem cStat, erro alheio sobe, gateway factory repassa).

Gates: `bun run typecheck` (raiz) `0`; worker `bun run lint` `0`; worker `bun run test`: `2979 pass, 0 fail` (era 2970 + 9). Sem integração nova.
