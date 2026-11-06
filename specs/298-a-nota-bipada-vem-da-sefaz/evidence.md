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

## T2.3 Orçamento atômico (D3, RF7)

`DrizzleAccessKeyLookupBudgetRepository` (`apps/worker-transportada/src/nfe-access-key-lookup/infrastructure/drizzle-access-key-lookup-budget.repository.ts`), constantes (15, 60 min, 65 min) em `domain/nfe-access-key-lookup-budget.constant.ts`.

- `reserve({companyId, environment, now})`: uma instrução `INSERT ... ON CONFLICT (company_id, environment) DO UPDATE ... WHERE (blocked_until is null or <= now) and (janela vencida or used_in_window < 15) RETURNING`; janela vencida (`window_started_at <= now - 1 h`) reinicia em `now` com `used = 1`. O `WHERE` do `DO UPDATE` é reavaliado sobre a linha travada, por isso a corrida no último lugar tem uma vencedora. Sem linha retornada → `{reserved:false, notBefore}` com `notBefore = max(window_started_at + 1 h, blocked_until)` (leitura posterior, só informativa).
- `block656`: upsert com `blocked_until = greatest(existente, now + 65 min)`; não toca `window_started_at` nem `used_in_window` (linha nova nasce com `used = 0`).
- Integração (`test/nfe-access-key-lookup-budget.integration.test.ts`, Postgres real, 7 casos): contagem 14→0 e 16ª recusada com `notBefore` = fim da janela; janela reinicia após 1 h; duas reservas concorrentes com 14 usadas → exatamente uma passa e `used = 15`; 40 concorrentes → exatamente 15; bloqueio 656 recusa por 65 min com `notBefore = blocked_until`, inclusive com a janela já vencida (62 min), e volta a reservar em `blocked_until` com `budgetLeft 14`; `block656` sem linha cria o bloqueio; empresas e ambientes separados. Arquivo adicionado a `test:integration` do `package.json`.
- O Postgres de teste (`localhost:65432`) não tinha a migration da T1.1; apliquei com `bun --env-file=../../.env.test run db:migrate` na API antes de rodar.

Gates: `bun run typecheck` (raiz) `0`; worker `bun run lint` `0`; worker `bun run test`: `2979 pass, 0 fail`; worker `bun --env-file=../../.env.test run test:integration`: `381 pass, 4 skip, 0 fail` (385 testes, 71 arquivos, `EXIT=0`, 54 s) — inclui os 7 novos.

## T2.4 Consumidor, repositório, topologia e `main.ts`

Código novo no worker: `messaging/nfe-access-key-{envelope.schema,rabbitmq-topology}.ts` (rota `nfe-access-key.v1`, retry 5 s × 3, fila morta, igual à distribuição), `nfe-access-key-lookup/application/{process-access-key-lookup.use-case,process-access-key-lookup.types}.ts`, `infrastructure/{drizzle-access-key-lookup.repository,access-key-lookup-document-storage}.ts`, `domain/nfe-access-key-lookup.constant.ts`, `runtime/nfe-access-key-consumer.service.ts` (prefetch 1). Fiação em `main.ts` (publisher, consumidor, relay, fechamento, `startAccessKeyLookupConsumer` injetável; os dois contratos de runtime ganharam o dublê).
Tocados: `outbox-relay.service.ts` (monta o envelope da busca com `lookupId`, recusa entrada sem ele), `drizzle-outbox.repository.ts` (lê `payload.lookupId`), `nfe-outbox-publisher.service.ts` (quarta rota), `nfe-import-storage.gateway.ts` (`buildDocumentKey` exportada) e `drizzle-nfe-distribution.repository.ts` (ver abaixo).

Decisões:

- Idempotência por `processed_messages` pelo `PersistentProcessedMessageService` (a tabela tem FK para `processing_outbox`, então o teste de integração semeia a linha de outbox). `waiting` é desfecho como os outros: a reentrega do mesmo evento dá ack; quem reenfileira (T2.5) emite evento novo.
- Ordem: lookup → RF6 (documento já existe: lookup `imported` + import `completed` com `duplicated = 1`, sem item, sem SEFAZ, sem orçamento) → `querying` + `attempts + 1` → reserva → perfil/certificado (`DrizzleNfeDistributionProfileRepository`, só em memória) → gateway → política T2.1.
- `procNFe`: `prepareDistributionItem` (o mesmo gunzip/sha256/leitura da distribuição), upload antes da transação, depois **uma** transação: `lockAccessKey` → `stored_objects` → `nfe_documents` (`source = 'access_key'`, `onConflictDoNothing`) → filhos por `writeDocumentChildren` → `nfe_import_items` (ordinal 1, `sourceEntry = chave`, `source_nsu/environment` nulos) → lookup `imported` (+`document_id`, `c_stat 138`, `finished_at`) → import `completed` (1/1/1, ou `duplicated = 1` se a distribuição chegou entre a checagem e a escrita). A inserção do documento é cópia de ~40 linhas da distribuição (o dela é método privado da classe); preferi não refatorar a distribuição nesta task.
- Chave do XML diferente da chave da busca → `NFE_ACCESS_KEY_LOOKUP_DOCUMENT_MISMATCH` (defeito, sobe: retry e, esgotado, `abandon`).
- Conflito no bucket (mesma chave = mesmo XML) vira referência ao objeto existente em vez de falha (`access-key-lookup-document-storage.ts`).
- Recusa (`refused`) e falha (`failed`): lookup fechado com motivo e `c_stat` (`137` para consulta vazia), import `failed` com `terminal_error = {reason}` e contadores zerados. 656: `block656`, lookup `waiting` com `not_before = agora + 65 min`, import continua `queued`; sem reserva: `waiting` com o `notBefore` devolvido.
- `unmapped` → `warn` `nfe_access_key_lookup_unmapped_outcome` com `cStat`. Todo desfecho loga `nfe_access_key_lookup_finished` `{lookupId, companyId, accessKeyLast4, status, reason?, cStat?, budgetLeft?}`; contrato prova que a chave inteira não aparece no log.
- Consumidor: erro → `retry` até `maxRetries`; esgotado → `abandon` (lookup `failed/sefaz_unavailable` + import `failed`, senão o índice de busca ativa travaria a chave) e fila morta.
- **Correção na distribuição achada pelo teste de integração:** `DrizzleNfeDistributionRepository.#insertStoredObject` usava `onConflictDoNothing` e depois apontava o item para o `objectId` próprio; se a busca por chave já tinha gravado a linha do mesmo endereço, a FK do item falhava. Agora o item aponta para o id que existe (`returning` + leitura). Sem mudança de comportamento no caminho sem conflito (integração da distribuição verde).

Gates:

- `bun run typecheck` (raiz, 7 apps): `0`. Worker `bun run lint`: `0`.
- Worker `bun run test`: `2998 pass, 0 fail` (era 2979; +14 do contrato do caso de uso, +2 do relay, +2 de roteamento/topologia, +1 do runtime).
- Contrato do caso de uso (`process-access-key-lookup.contract.ts`, 15 casos): procNFe, já veio pela distribuição, resNFe, 640, 656, timeout, unmapped, orçamento esgotado, RF6, lookup ausente/terminal, `querying`/`waiting` retomados, reentrega do mesmo evento (SEFAZ uma vez só), chave divergente, `abandon`.
- Integração nova (`nfe-access-key-lookup-consumer.integration.test.ts`, Postgres real, 5 casos): procNFe vira documento com participantes e `source = 'access_key'`, contadores 1/1/1, orçamento 1, e a mesma chave chegando depois pela distribuição não duplica (1 linha); distribuição primeiro → lookup `imported` apontando o documento existente, `duplicated = 1`, SEFAZ e orçamento intocados; documento surgindo entre a checagem e a escrita → `isDuplicate`, 1 linha; recusa 640 fecha lookup e falha o import com `terminal_error`; o claim do relay devolve `lookupId`.
- Worker `bun --env-file=../../.env.test run test:integration`: `386 pass, 4 skip, 0 fail` (390 testes, 72 arquivos).
- Arquivos novos nas listas do `package.json`: `nfe-access-key-lookup-consumer.integration.test.ts` (o contrato novo entra pelo `nfe-access-key-lookup.contract.test.ts`, já listado).

## T2.5 Reenfileirar as buscas em `waiting` (D5)

A rotina agendada de NF-e do worker é `nfe.distribution.pull` (`src/nfe-distribution-pull/application/nfe-distribution-pull.routine.ts`). Ganhou a dependência opcional `requeue` (`AccessKeyLookupRequeuePort`), chamada **depois** de enfileirar a distribuição e **mesmo sem empresa elegível** (a espera da busca por chave não depende do cursor). Ligada em `main.ts`.
Novos: `domain/requeue-waiting-lookups.policy.ts` (`computeRemainingBudget`, `selectLookupsToRequeue`, puros), `application/requeue-waiting-lookups.port.ts`, `infrastructure/drizzle-access-key-lookup-requeue.repository.ts`.

Decisões:

- Uma transação: `select … where status = 'waiting' and not_before <= agora and import_id is not null order by created_at, id limit 200 for update skip locked` → leitura do orçamento (sem reservar) → escolhe, por `(empresa, ambiente)`, as mais antigas até o que sobra → lookup `queued` com `not_before = null` + novo evento `transportada.nfe.access-key.requested` no outbox (mesmo payload `{companyId, importId, lookupId}`, ator = quem pediu, `triggered_by = 'user'` como o da API). Busca que fica de fora do orçamento segue `waiting` e a rodada seguinte tenta.
- Orçamento restante = 0 com `blocked_until` aberto; janela vencida = 15; sem linha = 15; senão `15 − used_in_window`. Não desconta buscas já `queued`/`querying` da empresa (a especificação pede só a leitura do que a janela deixou); o consumidor reserva de verdade e devolve a busca a `waiting` se faltar.
- Contador novo `requeued` só aparece quando o passo está ligado (os contratos antigos da rotina seguem iguais); `requeued > 0` conta como trabalho feito (`succeeded`). Falha do passo: log `nfe_access_key_requeue_failed` só com o nome do erro, ciclo fecha `unexpected_error`; a linha segue `waiting`, então a próxima rodada repete. Pedido de parada pula o passo.
- `CLAUDE.md` do worker ganhou um item sobre o trilho da busca por chave.

Gates:

- `bun run typecheck` (raiz, 7 apps): `0`. Worker `bun run lint`: `0`. `prettier --check` em `src`, `test`, `package.json`, `CLAUDE.md`: limpo.
- Worker `bun run test`: `3007 pass, 0 fail` (era 2998; +9 do contrato: 4 do orçamento restante, 2 da escolha, 3 da rotina).
- Integração nova (`nfe-access-key-lookup-requeue.integration.test.ts`, Postgres real, 5 casos): devolve a busca vencida com evento novo e a mesma referência; não toca em busca com `not_before` futuro, sem import ou já fora de `waiting`; com 13 de 15 usadas devolve só as duas mais antigas e o orçamento continua 13; bloqueio 656 aberto não devolve nada; 3 chamadas concorrentes sobre 8 buscas geram exatamente 8 eventos, um por busca.
- Worker `bun --env-file=../../.env.test run test:integration`: `391 pass, 4 skip, 0 fail` (395 testes, 73 arquivos).
- Arquivos novos nas listas do `package.json`: `nfe-access-key-lookup-requeue.integration.test.ts` (o contrato novo entra por `job-run.contract.test.ts`, já listado).

## Revisão da Fase 2 — correções

Achado → correção → teste (worker, salvo indicação).

Segurança

- S1 — 656 era por trilho → um bloqueio por `(empresa, ambiente)` para o serviço inteiro. O consumidor da distribuição chama `budget.block656` ao receber 656 e, antes de `consultarDFe`, trata `blocked_until > agora` como rate-limited (mesmo caminho do cooldown do cursor; lease liberado, inclusive se a leitura falhar). Não reserva da cota de 15/h. Teste: `nfe-distribution/shared-sefaz-block.contract.ts` (4) e, em Postgres, `nfe-access-key-lookup-budget.integration.test.ts` (656 do pull bloqueia `reserve` sem gastar `used_in_window`; `readBlockedUntil` por empresa/ambiente).
- S2 — ambiente do orçamento = ambiente chamado. `profile.loadEnvironment` (leitura barata, sem decifrar) antes do `reserve`; divergência de `lookup.environment` → log `environment_mismatch` (warn), erro não repetível, a busca fecha `failed/sefaz_unavailable` pelo `abandon` (sem migration, sem motivo novo). Teste: contrato (reserva no ambiente do perfil; divergência não reserva nem consulta) + integração (orçamento intacto, lookup `failed`).
- S3 — checagem de parte. `isCompanyPartyOfDocument` (emitente, destinatário, transportador, `autXML` lido do XML porque o pacote fiscal não o expõe; o mapper do pacote não foi alterado). Não é parte → `refused/not_interested`, XML não é gravado. Teste: contrato com 4 papéis (emitente, destinatário, transportador, `autXML`), não-parte e `autXML` de outra empresa.
- S4 — `importId` do envelope ≠ `lookup.import_id` → erro não repetível (`IMPORT_ID_MISMATCH`), sem SEFAZ. Teste: contrato.
- S5 — conflito de armazenamento. O adaptador relê o objeto existente e compara o SHA-256; diferente → erro não repetível (`STORAGE_SHA_CONFLICT`). O repositório também compara o `sha256` da linha de `stored_objects` já existente. Teste: contrato do adaptador (2) e integração (`importDocument` com SHA diferente rejeita e a busca continua `queued`).
- S6 — `gunzipSync` com `maxOutputLength` de 10 MB (`NFE_DISTRIBUTION_MAX_DECOMPRESSED_XML_BYTES`). Teste: docZip que infla além do teto é recusado.

Código

- C1 — o reenfileiramento descontava só `used_in_window`. Agora: cria (se faltar) e trava com `select … for update`, em ordem fixa, as linhas de orçamento dos escopos devidos (linha nova nasce com janela vencida para não encurtar a hora), e subtrai as buscas `queued|querying` do escopo. Teste: policy (`inFlightCount`) e integração (15 reenfileiradas; as 5 seguintes do ciclo seguinte ficam `waiting`; 3 chamadas concorrentes com 6 de resto geram exatamente 6 eventos).
- C2 — falha do `abandon` não é mais engolida: `safeLogError` (`nfe_access_key_abandon_failed`, companyId/lookupId/eventId) e `retry` enquanto houver tentativa, senão fila morta. Teste: `access-key-lookup-hardening.contract.ts` (roteamento do consumidor, 6 casos).
- C3 — `NfeAccessKeyLookupError` / `NfeAccessKeyLookupNonRetryableError` (`domain/nfe-access-key-lookup.error.ts`): import ausente, `importId` divergente, documento divergente, ambiente divergente, conflito de SHA. O consumidor vai direto a `abandon` + fila morta, sem retry nem nova consulta. Comentário no caso de uso: queda entre a reserva e a SEFAZ custa uma unidade do orçamento. Teste: roteamento acima.
- C4 — `nfe-documents/infrastructure/nfe-document-insert.persistence.ts` (`insertNfeDocument`, com `companyId` além dos campos pedidos) usado pelos repositórios da busca e da distribuição. Testes de distribuição existentes verdes.
- C5 — log de erro com mensagem truncada em 200 só quando não contém `<` (`describeLookupErrorForLog`); o aviso de desfecho não mapeado leva `schema`. Teste: política de log e contrato do aviso.
- C6 — `drizzle-access-key-lookup.repository.ts` dividido em ciclo de vida + `-import.persistence.ts` + `-statements.persistence.ts`; caso de uso dividido em `process-…use-case.ts`, `apply-…-outcome.ts`, `…-finished.log.ts`; todos os arquivos novos/alterados ≤ 200 linhas; funções ≤ 40; um parâmetro objeto (`logLookupFinished`, `applyLookupOutcome`); erros tipados (inclusive "linha do orçamento sumiu"); constantes `SEFAZ_UNAVAILABLE_REASON`, `NFE_ACCESS_KEY_LOOKUP_FINISHED_LOG`, `NFE_ACCESS_KEY_EVENT_TYPE.REQUESTED`; o alias `DrizzleOutboxRepository as DrizzleProcessedMessageRepository` saiu do `main.ts` (usa o nome real da classe).
- C7 — `completeWithExistingDocument` grava o item `duplicated` apontando para o objeto XML do documento existente. Teste: integração (item `duplicated` com `source_object_id`/`sha` do documento).
- C8 — `error.code` de três dígitos só vale como cStat com mensagem começando por `SEFAZ `; código estranho com outra mensagem sobe. Teste: gateway/hardening. O ramo `startsWith('SEFAZ NFeDistribuicaoDFe cStat')` não é morto (cobre `cStat : erro desconhecido`, caso já testado), foi mantido.
- C9 — 656 passa `cStat` ao `markWaiting`; `reserve` antes de `markQuerying` (recusa não gasta tentativa); guardas de status (`queued|querying|waiting`) no `where` de `markWaiting`, `markImported` e `closeWithoutDocument` (este só fecha o import se fechou a busca). Teste: contrato (ordem e `cStat`) e integração (lookup terminal não se move).
- C10 — `nfe-distribution-repository.integration.test.ts`: objeto gravado antes pela busca no mesmo endereço → a distribuição reaproveita a linha (documento e itens apontam para ela), sem erro de FK e sem duplicata na repetição.

Gates:

- `bun run typecheck` (raiz, 7 apps): `0`. Worker `bun run lint`: `0`. `prettier` nos arquivos tocados: limpo.
- Worker `bun run test`: `3034 pass, 0 fail` (era 3007).
- Worker `bun --env-file=../../.env.test run test:integration`: `399 pass, 4 skip, 0 fail` (403 testes, 73 arquivos).
- API não tocada; nenhuma migration.

## T3.0 — leitor de mão (RF11e)

Commit `44dcf67ba`. Primitivo `@/components/ui/key-reader-field` com input não controlado: Enter ou Tab (com
`preventDefault`) fecha a leitura e limpa o campo na hora, sem perder leituras seguidas com menos de 100 ms entre elas
(teste sintético: três leituras em sequência chegam inteiras). `findNfeAccessKeyInScan`
(`src/modules/shared/nfeScannedKey.service.ts`) acha a chave de 44 caracteres no padrão `CHAVE_PATTERN` em qualquer
posição do texto e valida o DV mod-11, inclusive com CNPJ alfanumérico. O contrato cobre:

- Code-128 cru;
- QR certo com `p=` e com `chNFe=`;
- QR embaralhado por leitor US num ABNT2 (`?`→`:`, `/`→`;`, `:`→`Ç`, `=`→`]`, `&`→`°`);
- prefixo e sufixo configurados no leitor;
- chave alfanumérica minúscula.

Texto sem chave válida é ignorado; `onUnreadable` é opcional e alimenta a contagem de "ilegível" da página de NF-e.

O foco é persistente: autofocus, volta ao campo quando um diálogo sai da tela ou dispara `close`, e `focus()` fica
exposto pelo ref. O selo alterna entre "Leitor pronto" e "Clique aqui para voltar a ler". Uma rajada de 8 ou mais
teclas com menos de 30 ms entre elas, fora de qualquer campo, é desviada para o leitor com o buffer inteiro (não perde
os primeiros caracteres). Digitação em outros campos não é tocada. A câmera continua como caminho secundário. Doc em
`docs/frontend/barcode-scanner.md`.

Gates: typecheck da raiz limpo; `test` do painel com 8672 pass / 0 fail, mais `test:hooks` com 1451 pass / 0 fail;
lint com 0 erros.

**Pendente (manual, T4.1):** evidência com o leitor real do cliente, inclusive configurado em layout US num ABNT2 e
com sufixo Tab.

## T3.1 — cliente, polling e linha (RF9, RF10)

Commit `e05063932`. O módulo novo `src/modules/nfe-access-key-lookup/` tem quatro partes:

- o cliente HTTP, com guardas de tipo nas respostas;
- o modelo puro de estado da linha: `parseAccessKey`, `deriveRowFlags` (`canAdd`, `canSendXml`, `canRetry`) e
  `describeRowState`;
- o motor da fila, com agendador injetável, envolvido pelos hooks `useAccessKeyLookupQueue` e `useAccessKeyLookup`;
- o componente `AccessKeyLookupRow`.

Os contratos cobrem:

- o agrupamento de 500 ms: uma chamada de `access-key-checks` por rajada, e o lote fecha em 200 chaves;
- a chave repetida: marca `alreadyScanned` e não cria linha nova nem busca;
- o polling a cada 3 s (nenhuma chamada em 2,999 s), que para nos estados terminais;
- o teto de 10 min, que leva a `stalled` e permite tentar de novo;
- `stop` e `start`, que sobrevivem ao StrictMode;
- `markXmlImported` e `recheck`, para a volta do "Enviar XML";
- o componente, com um caso por estado;
- os locales pt-BR e en, com as mesmas chaves.

Gates: typecheck da raiz com 0 erros; `test` do painel saiu com 0 (`test:hooks` 1466 pass / 0 fail, suíte pura nova
com 31 pass); lint com 0 erros.

## T3.2 — criação da viagem lista a nota bipada (RF9, RF10)

Comportamento novo: o bipe da criação não acrescenta mais nada à viagem. Cada leitura vira uma linha em **Notas
encontradas** (marcada "Bipada"), acima da busca; a nota só entra com "Acrescentar", inclusive a já cadastrada.

- `TripNoteIntake` (novo): campo `KeyReaderField` (leitor de mão primeiro), câmera como segundo caminho, lista de
  notas encontradas com `AccessKeyLookupRow`, "Acrescentar todas as prontas (n)" e a busca existente
  (`TripDocumentSearch`). A nota que já tem linha bipada sai da lista da busca (sem duplicar por id).
- `useBippedNotes` (novo): `useAccessKeyLookupQueue` + consulta do cadastro da nota quando a linha fica pronta
  (`findNfeDocumentByAccessKey`, a mesma do bipe antigo). "Acrescentar" chama `stageDocuments` do `useTripQuickCreate`,
  o mesmo caminho da busca; nota em outra viagem (`alreadyOnTrip`) ou não autorizada mostra o aviso existente e não
  oferece "Acrescentar". "Acrescentar todas" leva só `canAdd` sem bloqueio. Recusada (menos `cancelled`/`denied`):
  `FileField` "Enviar XML" (`POST /nfe-imports/xml`) e, depois do envio, `recheck(chave)` → pronta; sem nota após o
  envio, aviso na linha. `Tentar de novo` nas falhas já previstas e na consulta do cadastro. O foco volta ao leitor
  depois de cada leitura, "Acrescentar", "Acrescentar todas" e "Enviar XML"; o fechamento do diálogo já é coberto por
  `useKeyReaderFocus` (T3.0). A lista é da tela aberta: fechar o diálogo desmonta a fila e para o polling.
- Removido: o acréscimo direto do bipe e o beco sem saída `notFound`. Em `useTripQuickCreate`: `acceptScan`,
  `submitTyped`, `typedNote`, `canScan`, `isScannerOpen`/`openScanner`/`closeScanner`, `lookupAccessKey`. Em
  `tripQuickCreate.service.ts`: `acceptQuickCreateScan`, `resolveQuickCreateEntry`, `refuseQuickCreateEntry`,
  `isQuickCreateEntryPending`, o status `resolving` e as recusas `notFound`/`lookupFailed`. Locale: `resolving`,
  `refusal.notFound`, `refusal.lookupFailed`; `quickCreate.intro` reescrito.
- Testes que fixavam o comportamento antigo: `test/trip/quick-create.contract.ts` (os quatro testes de
  `acceptQuickCreateScan`/`resolveQuickCreateEntry` viraram `stageQuickCreateDocuments`; o teste do campo digitado
  agora cobra `KeyReaderField` + câmera); `test/trip/assembly-draft.contract.ts` (recusa `notFound` → `notAuthorized`);
  `test/trip-hooks/typed-note-number.contract.ts` (saiu o bloco "inserção rápida aceita o número").
- Contrato novo (critério 4): `test/trip-hooks/bipped-notes.contract.ts` — cadastrada, desconhecida importada e
  recusada dão três linhas, nenhuma entra sozinha; "Acrescentar todas" leva só as prontas (2 de 4: sem a recusada e
  sem a que está em outra viagem); nota em outra viagem sem "Acrescentar"; foco volta ao leitor.

⚠️ Digitar o **número** da nota no campo da criação deixou de existir (o campo só lê chave); o número se busca em
"Buscar notas". Decisão do dono a confirmar.
