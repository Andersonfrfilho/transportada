# Evidencia — Feature 010 Painel operacional e auditoria

## T001 — Consolidar spec/plano executavel

Data: 2026-07-23

Modelo executor recomendado: Opus para especificacao, com revisao Opus por
envolver auditoria, seguranca e leitura transversal de dados tenant-scoped.

Estado inicial:

- features `001` a `009` sem tasks pendentes reais;
- fase 7 do plano de entrega concluida com faturamento;
- fase 8 definida no plano como `painel/auditoria`.

Arquivos criados:

- `specs/010-operations-audit/spec.md`
- `specs/010-operations-audit/plan.md`
- `specs/010-operations-audit/tasks.md`
- `specs/010-operations-audit/evidence.md`

Decisoes registradas:

- primeira entrega usa polling controlado, mantendo SSE como extensao futura;
- dashboard, timeline, jobs e auditoria sao leitura operacional e nao disparam
  reprocessamentos automaticos;
- `companyId` sempre vem do contexto autenticado;
- auditoria requer `audit.read`; painel/timeline/jobs usam `operations.read`;
- respostas e eventos expostos nunca incluem XML fiscal, storage key,
  certificado, token, stack trace ou payload fiscal bruto.

Comando planejado para fechamento da task:

```text
bunx prettier --check specs/010-operations-audit && git diff --check
```

Resultado:

```text
bunx prettier --check specs/010-operations-audit
All matched files use Prettier code style!

git diff --check
0 issues
```

Observacao:

- `T001` conclui a especificacao executavel da fase 8 e libera `T002` para
  contracts de schema de operations/audit.

## T002 — Contracts de schema de operations/audit

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) para schema transversal, auditoria,
tenant safety, indices e bloqueio de payload sensivel.

Contracts criados:

- agregador exigindo exports em `database.schema`;
- tenant safety para `company_id`, FK restritiva com `companies` e ausencia de
  XML, storage key, certificado e token;
- `processingJobs` com estados operacionais, retry, dead letter, correlation id,
  metadata segura e indices por tenant/status/modulo/entidade;
- `auditLogs` append-only com ator, permissao, acao, alvo, resultado, motivo
  sanitizado, metadata segura e FK tenant-scoped para membership do usuario.

Arquivos alterados:

- `apps/api-transportada/test/operations-schema.contract.test.ts`
- `apps/api-transportada/test/operations-schema/*.contract.ts`
- `apps/api-transportada/test/operations-schema/tables.ts`
- `apps/api-transportada/package.json`

Comando executado:

```text
bun test apps/api-transportada/test/operations-schema.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
5 fail
T003 schema implementation is missing database export: processingJobs
auditLogs ainda nao possui permission/result/target/metadata e FK tenant-scoped de ator
```

Observacao:

- A falha e intencional para `T002`: os contracts fecham o schema esperado e a
  implementacao de `processingJobs`, o ajuste de `auditLogs`, migration e
  rollback ficam para `T003`.

## T003 — Schema, migration aditiva e rollback

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) por envolver schema transversal,
auditoria, tenant safety, migration e rollback.

Arquivos alterados:

- `apps/api-transportada/src/database/processing.schema.ts`
- `apps/api-transportada/src/database/fiscal.schema.ts`
- `apps/api-transportada/src/database/database.schema.ts`
- `apps/api-transportada/drizzle/20260723153157_clammy_scarlet_spider/migration.sql`
- `apps/api-transportada/drizzle/20260723153157_clammy_scarlet_spider/rollback.sql`
- `apps/api-transportada/test/database-migration/static-migration.contract.ts`
- `apps/api-transportada/test/database-migration/database-migration.integration.ts`
- `apps/api-transportada/test/database-migration/support.ts`
- `apps/api-transportada/test/operations-schema/operations-audit.contract.ts`

Implementacao:

- criada a tabela `processing_jobs` com `company_id`, status operacional,
  modulo, entidade, tentativas, proxima tentativa, erro sanitizado, correlation
  id, metadata segura, indices tenant-scoped e checks de dominio;
- expandida `audit_logs` com permissao, alvo, resultado, motivo e metadata
  segura, preservando `entity_type`, `entity_id`, `before_snapshot` e
  `after_snapshot` legados;
- adicionada FK tenant-scoped de ator para `user_company_memberships`;
- registrada migration aditiva e rollback manual guardado por hash/journal.

Comandos executados:

```text
bun test apps/api-transportada/test/operations-schema.contract.test.ts
```

Resultado:

```text
5 pass
0 fail
79 expect() calls
```

```text
bun run --cwd apps/api-transportada db:check
```

Resultado:

```text
Everything's fine
```

```text
bun run --cwd apps/api-transportada db:generate
```

Resultado:

```text
{"status":"ok","dialect":"postgresql","migration_path":"drizzle/20260723153157_clammy_scarlet_spider/migration.sql"}
```

```text
make migration-test
```

Resultado inicial:

```text
2 fail
nova migration ausente da lista estatica e rollback.sql ausente
```

Acao corretiva:

- atualizada a lista versionada de migrations;
- adicionada constante `OPERATIONS_TABLES` para `processing_jobs`;
- criado rollback seguro da migration nova;
- removida tentativa incorreta de rollback de `audit_logs.correlation_id`, que
  ja existia antes desta migration.

Resultado final:

```text
9 pass
0 fail
129 expect() calls
```

```text
bun run --cwd apps/api-transportada typecheck
bun run --cwd apps/api-transportada lint
```

Resultado:

```text
tsc --noEmit: sucesso
eslint --max-warnings=0: sucesso
```

Observacao:

- `T003` conclui schema/migration/rollback para operations/audit e libera
  `T004` para contracts da aplicacao.

## T004 — Contracts da aplicacao de operations/audit

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) por cobrir auditoria, permissao,
anti-enumeracao, filtros tenant-scoped e sanitizacao transversal.

Arquivos criados/alterados:

- `apps/api-transportada/test/operations-application.contract.test.ts`
- `apps/api-transportada/test/operations-application/support.ts`
- `apps/api-transportada/test/operations-application/summary.contract.ts`
- `apps/api-transportada/test/operations-application/timeline.contract.ts`
- `apps/api-transportada/test/operations-application/jobs.contract.ts`
- `apps/api-transportada/test/operations-application/audit.contract.ts`
- `apps/api-transportada/package.json`

Contracts cobertos:

- summary operacional tenant-scoped, filtros por periodo/modulo/status e
  ausencia de payload sensivel;
- timeline ordenada por entidade/correlation id, ausencia segura para missing e
  cross-tenant;
- jobs em retry/dead letter sem reprocessamento automatico e com limite maximo
  seguro;
- auditoria paginada, filtravel por ator/alvo/resultado/correlation id e negada
  antes de parse caro quando falta `audit.read`.

Comando executado:

```text
bun test apps/api-transportada/test/operations-application.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
7 fail
T005 application implementation is missing: Cannot find module '../../src/operations/application/operations.use-case.js'
```

Observacao:

- A falha e intencional para `T004`; ela fecha o contrato de aplicacao e libera
  `T005` para implementar casos de uso e repositorios.

## T005 — Casos de uso e repositorios operations/audit

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) por envolver leitura transversal,
tenant-scope, sanitizacao, auditoria e repositorio SQL.

Arquivos criados/alterados:

- `apps/api-transportada/src/operations/application/operations.use-case.ts`
- `apps/api-transportada/src/operations/infrastructure/drizzle-operations.repository.ts`
- `apps/api-transportada/test/fiscal-schema/audit-log.contract.ts`
- `apps/api-transportada/test/integration/company-settings-repository/company-settings-integration.fixture.ts`
- `apps/api-transportada/test/integration/company-settings-repository/sequence-and-rollback.integration.ts`
- `apps/api-transportada/test/integration/digital-certificate-repository/digital-certificate-integration.fixture.ts`
- `apps/api-transportada/test/integration/digital-certificate-repository/rotation-and-isolation.integration.ts`

Implementacao:

- adicionada factory `createOperationsUseCase`;
- `companyId` sempre derivado de `context.companyId`, ignorando seletores livres;
- permissao `operations.read` aplicada antes de consultas de summary, timeline e
  jobs;
- permissao `audit.read` aplicada antes de consulta de auditoria;
- limite maximo de pagina definido em 100;
- sanitizacao recursiva remove chaves sensiveis como XML, payload, content,
  storage key, certificado, senha, private key e token;
- repositorio Drizzle consulta `processing_jobs` e `audit_logs` com filtros
  tenant-scoped, cursor e ordenacao estavel;
- fixtures legadas de integracao passaram a criar memberships antes de gerar
  eventos de auditoria, conforme nova FK tenant-scoped.

Comandos executados:

```text
bun test apps/api-transportada/test/operations-application.contract.test.ts
```

Resultado:

```text
7 pass
0 fail
39 expect() calls
```

```text
bun run --cwd apps/api-transportada typecheck
bun run --cwd apps/api-transportada lint
```

Resultado:

```text
tsc --noEmit: sucesso
eslint --max-warnings=0: sucesso
```

```text
bun run --cwd apps/api-transportada check
```

Resultado final:

```text
489 pass
1 skip
0 fail
build: sucesso
```

```text
set -a; . ./.env; set +a; bun run --cwd apps/api-transportada test:integration
```

Resultado inicial:

```text
2 fail
audit fixtures antigas nao criavam user_company_memberships exigidas pela nova FK tenant-scoped
```

Resultado final:

```text
36 pass
1 skip
0 fail
314 expect() calls
```

Observacao:

- `T005` conclui a camada de aplicacao e repositorio de leitura; `T006` deve
  fechar contracts HTTP para RBAC antes de parse pesado, DTO strict, no-store,
  cursores e erros seguros.

## T006 — Contracts HTTP operations/audit

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) + modelo economico para matriz de
filtros, por envolver RBAC, DTO strict, no-store, cursores e erros seguros.

Arquivos criados/alterados:

- `apps/api-transportada/test/operations-http.contract.test.ts`
- `apps/api-transportada/test/operations-http/security-and-cors.contract.ts`
- `apps/api-transportada/test/operations-http/query.contract.ts`
- `apps/api-transportada/test/operations-http/audit.contract.ts`
- `apps/api-transportada/test/fixtures/operations-http.fixture.ts`
- `apps/api-transportada/package.json`

Contracts cobertos:

- `GET /operations/summary`;
- `GET /operations/timeline`;
- `GET /operations/jobs`;
- `GET /audit/events`;
- autenticacao com `no-store`;
- `operations.read` antes de consultas operacionais;
- `audit.read` antes de filtros de auditoria;
- serializacao `{ data, page }` para listas;
- limite de jobs limitado a 100;
- erros seguros sem vazar `companyId`;
- ausencia de XML, storage key e tokens nas respostas.

Comando executado:

```text
bun test apps/api-transportada/test/operations-http.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
9 fail
Cannot find module '../../src/operations/presentation/operations.routes.js'
```

Observacao:

- A falha e intencional para `T006`; ela fecha o contrato HTTP e libera `T007`
  para implementar as rotas.

## T007 — Endpoints HTTP operations/audit

Data: 2026-07-23

Modelo executor recomendado: Opus + revisao Opus por envolver rotas
tenant-scoped, RBAC, no-store, permissao nova e serializacao segura.

Arquivos criados/alterados:

- `apps/api-transportada/src/operations/presentation/operations.routes.ts`
- `apps/api-transportada/src/shared/api.constant.ts`
- `apps/api-transportada/src/http/request-path.service.ts`
- `apps/api-transportada/src/main.ts`
- `apps/api-transportada/src/identity/domain/authorization.policy.ts`
- `apps/api-transportada/test/authorization.contract.test.ts`
- `apps/api-transportada/test/tenant-context.contract.test.ts`
- `apps/api-transportada/test/auth-me.contract.test.ts`
- `apps/api-transportada/test/fixtures/operations-http.fixture.ts`

Implementacao:

- registrados `GET /operations/summary`, `GET /operations/timeline`,
  `GET /operations/jobs` e `GET /audit/events`;
- adicionada permissao `operations.read` na matriz tipada e no retorno de
  `/auth/me` para roles com leitura operacional;
- mantido `audit.read` separado para auditoria;
- adicionada allowlist de `no-store` e logging seguro para os novos paths;
- queries HTTP rejeitam campos desconhecidos, validam limite e cursor e capam
  limite em 100;
- respostas de lista usam `{ data, page: { nextCursor } }`;
- serializacao defensiva remove campos sensiveis por nome antes de responder.

Comandos executados:

```text
bun test apps/api-transportada/test/operations-http.contract.test.ts
```

Resultado:

```text
9 pass
0 fail
34 expect() calls
```

```text
set -a; . ./.env; set +a; bun run --cwd apps/api-transportada test:integration
```

Resultado:

```text
36 pass
1 skip
0 fail
314 expect() calls
```

```text
bun run --cwd apps/api-transportada check
```

Resultado:

```text
498 pass
1 skip
0 fail
build: sucesso
```

Observacao:

- `T007` conclui a parte de API da feature 010. A proxima etapa e `T008`,
  contracts frontend para client, hooks, view models, polling, permissao e
  limpeza de estado sensivel.

## T008 — Contracts frontend operations/audit

Data: 2026-07-23

Modelo executor recomendado: Opus por ser contrato frontend previsivel,
com revisao Opus posterior para seguranca/payload sensivel.

Arquivos criados/alterados:

- `apps/frontend-transportada/test/operations.contract.test.ts`
- `apps/frontend-transportada/test/operations/operations.fixture.ts`
- `apps/frontend-transportada/test/operations/client-and-queries.contract.ts`
- `apps/frontend-transportada/test/operations/permissions-and-states.contract.ts`
- `apps/frontend-transportada/test/operations/polling-and-cleanup.contract.ts`
- `apps/frontend-transportada/package.json`

Contracts cobertos:

- client autenticado para summary, timeline, jobs e audit;
- requests com `cache: "no-store"` e bearer token;
- adapters DTO strict rejeitando `companyId`, XML, certificado, storage key e
  token;
- controller separando `operations.read` de `audit.read`;
- view model com estados `forbidden`, `ready`, `empty`, `loading` e `error`;
- polling conservador apenas com jobs nao terminais;
- controller de filtros limpando dados sensiveis em reset/cleanup.

Comando executado:

```text
bun test apps/frontend-transportada/test/operations.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
6 fail
Cannot find module '../../src/modules/operations/...'
```

Observacao:

- A falha e intencional para `T008`; ela fecha o contrato frontend e libera
  `T009` para implementar client, hooks, view model e UI operacional.

## T009 — UI operacional

Data: 2026-07-23

Modelo executor recomendado: Opus + revisao Opus por envolver boundaries
de payload sensivel, polling controlado, permissao segregada e consistencia de
estado no dashboard.

Arquivos criados/alterados:

- `apps/frontend-transportada/src/modules/operations/shared/operationsClient.service.ts`
- `apps/frontend-transportada/src/modules/operations/shared/operationsResponse.validation.ts`
- `apps/frontend-transportada/src/modules/operations/shared/operationsViewModel.service.ts`
- `apps/frontend-transportada/src/modules/operations/hooks/useOperationsDashboard.hook.ts`
- `apps/frontend-transportada/src/modules/operations/pages/OperationsDashboard.page.tsx`
- `apps/frontend-transportada/src/modules/operations/styles/operationsWorkspace.module.css`
- `apps/frontend-transportada/src/modules/operations/locales/operationsWorkspace.locale.json`
- `apps/frontend-transportada/src/modules/operations/locales/operationsWorkspace.en.locale.json`
- `apps/frontend-transportada/src/modules/shared/i18n/i18n.service.ts`
- `apps/frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts`
- `apps/frontend-transportada/src/main.tsx`
- `apps/frontend-transportada/test/nfe-workspace-smoke.helper.ts`
- `apps/frontend-transportada/test/operations/polling-and-cleanup.contract.ts`

Implementacao:

- criado client autenticado e `no-store` para summary, timeline, jobs e audit;
- adicionados adapters DTO strict com rejeicao de campos sensiveis como XML,
  `storageKey`, `token`, `companyId`, certificados e payloads arbitrarios;
- criado controller/hook do dashboard com segregacao entre `operations.read` e
  `audit.read`, polling apenas para jobs nao terminais e cleanup de filtros;
- criada pagina `/operations` com cards de resumo, lista de jobs, timeline e
  auditoria, integrada ao `auth/me` e aos estados `loading`, `empty`, `error`,
  `forbidden` e `ready`;
- registradas traducoes pt/en e entrada no bootstrap principal do frontend;
- corrigido helper de smoke legado para tipagem compativel com Playwright.

Comandos executados:

```text
bun test apps/frontend-transportada/test/operations.contract.test.ts
```

Resultado:

```text
6 pass
0 fail
38 expect() calls
```

```text
bun run --cwd apps/frontend-transportada check
```

Resultado:

```text
eslint .: sucesso
tsc --noEmit: sucesso
61 pass
0 fail
vite build: sucesso
PWA generateSW: sucesso
```

Observacao:

- `T009` conclui o dashboard operacional e libera `T010` para o smoke
  responsivo em 375/768/1280 com foco em overflow horizontal, jobs, timeline,
  auditoria e estado sem permissao.

## T010 — Smoke responsivo

Data: 2026-07-23

Modelo executor recomendado: Opus + revisao Opus por ser uma validacao E2E
previsivel, mas com impacto direto em boundary visual, permissao e fluxo real.

Comando executado:

```text
bun run --cwd apps/frontend-transportada smoke
```

Resultado:

```text
21 passed
0 fail
Playwright smoke: sucesso
```

Cobertura relevante observada:

- viewports mobile, tablet e desktop sem overflow horizontal;
- dashboard operacional com jobs, timeline e auditoria responsivos;
- boundary segura para usuario sem permissao;
- regressao cruzada preservada para frete, CT-e e faturamento.

Observacao:

- `T010` conclui a validacao responsiva da feature 010 e libera `T011` para o
  gate agregado local e revisao final de release.

## T011 — Integracao local e revisao de release

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) + reviewer por envolver release
review, ambiente local, migrations, worker, mensageria, auditoria e gates
agregados.

Achado de release corrigido:

- `make dev` subia API, frontend e worker sem garantir migrations locais antes
  do worker consultar os outboxes;
- em banco local defasado, o relay CT-e falhava por ausencia de
  `cte_issuance_outbox`, mas o loop compartilhado registrava a falha como
  `nfe_outbox_relay_failed`;
- o alvo `dev` agora depende de `identity-bootstrap up`, aplicando migration e
  seed local antes dos processos Bun;
- `OutboxRelayLoop` recebeu `failureMessage` explicita, mantendo logs
  separados para `nfe_outbox_relay_failed` e `cte_outbox_relay_failed`.

Arquivos alterados na revisao:

- `Makefile`
- `test/keycloak-realm.contract.test.ts`
- `apps/worker-transportada/src/outbox/application/outbox-relay-loop.service.ts`
- `apps/worker-transportada/src/main.ts`
- `apps/worker-transportada/test/nfe-runtime.contract.test.ts`

Comandos executados:

```text
bun install --frozen-lockfile
```

Resultado:

```text
Checked 591 installs across 715 packages
no changes
```

```text
bun test test/keycloak-realm.contract.test.ts
bun test apps/worker-transportada/test/nfe-runtime.contract.test.ts
```

Resultado:

```text
keycloak realm contract: 6 pass, 0 fail
NF-e worker runtime contract: 3 pass, 0 fail
```

```text
make dev
make smoke
make down
```

Resultado:

```text
db:migrate executado antes do startup Bun
db:seed:local executado antes do startup Bun
api_started
worker_started
0 ocorrencias de *_outbox_relay_failed durante a janela observada
Playwright smoke: 21 passed, 0 fail
make down: sucesso
```

```text
make check && make migration-test
```

Resultado:

```text
format:check: sucesso
lint: sucesso
typecheck: sucesso
api contracts: 463 pass, 1 skip, 0 fail
worker contracts: 78 pass, 0 fail
frontend contracts: 61 pass, 0 fail
build API/worker/frontend: sucesso
migration-test: 9 pass, 0 fail
```

```text
git diff --check
```

Resultado:

```text
0 issues
```

Observacao:

- `T011` conclui a revisao de release local da feature 010 com gates verdes,
  ambiente encerrado e sem erro recorrente de relay no worker apos migrations.
