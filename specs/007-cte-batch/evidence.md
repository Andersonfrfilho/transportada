# Evidência — Feature 007 Lotes e emissão de CT-e

## T001 — ADR e consolidar spec/plano

Data: 2026-07-22

Modelo executor recomendado: Opus (alto).

Estado inicial: criação da estrutura de spec/plan/tasks e decisões de escopo.

Arquivos previstos:

- `specs/007-cte-batch/spec.md`
- `specs/007-cte-batch/plan.md`
- `specs/007-cte-batch/tasks.md`
- `docs/adr/0009-cte-batch-workflow.md`

Pendências pendentes:

- Definir contrato detalhado de gateway de submissão CT-e mock/real.
- Mapear limites de payload de lote por ambiente de homologação futura.
- Decidir se eventos de status ficam em tabela dedicada ou em outbox próprio.

Comandos planejados:

```text
bunx prettier --check docs/adr specs/007-cte-batch && git diff --check
```

Resultado:

```text
Checking formatting...
All matched files use Prettier code style!
```

Observação:

- Ajustes de formatação foram aplicados em `spec.md`, `tasks.md`, `plan.md`, `evidence.md` e
  `docs/adr/0009-cte-batch-workflow.md`.
- `T001` está concluída e liberada para a `T002`.

## T002 — Contracts do schema de lote e constraints

Data: 2026-07-22

Modelo executor recomendado: Opus (alto).

Arquivos criados:

- `apps/api-transportada/test/cte-batch-schema.contract.test.ts`
- `apps/api-transportada/test/cte-batch-schema/aggregator.contract.ts`
- `apps/api-transportada/test/cte-batch-schema/tenant-safety.contract.ts`
- `apps/api-transportada/test/cte-batch-schema/batches.contract.ts`
- `apps/api-transportada/test/cte-batch-schema/tables.ts`

Comando executado:

```text
cd apps/api-transportada && bun test test/cte-batch-schema.contract.test.ts
```

Resultado esperado (falha intencional):

- os quatro exports da feature ainda não existem no schema;
- o arquivo `apps/api-transportada/src/database/cte-batch.schema.ts` ainda não existe.

Falhas observadas:

- `T002 schema implementation is missing database export: cteBatches`
- `exports every CT-e batch table from the database schema` com `undefined` nos exports

Status: `T002` registrada com sucesso de contrato vermelho para orientar a implementação da `T003`.

## T003 — Schema de lote, migration aditiva e rollback

Data: 2026-07-22

Modelo executor recomendado: Opus (alto).

Arquivos criados/alterados:

- `apps/api-transportada/src/database/cte-batch.schema.ts`
- `apps/api-transportada/src/database/database.schema.ts`
- `apps/api-transportada/drizzle/20260722225555_robust_viper/migration.sql`
- `apps/api-transportada/drizzle/20260722225555_robust_viper/rollback.sql`
- `apps/api-transportada/drizzle/20260722225555_robust_viper/snapshot.json`
- `apps/api-transportada/test/database-migration/static-migration.contract.ts`
- `apps/api-transportada/test/database-migration/database-migration.integration.ts`
- `apps/api-transportada/test/database-migration/support.ts`

Comandos executados:

```text
cd apps/api-transportada && bun test test/cte-batch-schema.contract.test.ts
cd apps/api-transportada && bun run db:check
make migration-test
```

Resultado:

```text
bun test test/cte-batch-schema.contract.test.ts
6 pass
0 fail

bun run db:check
Everything's fine

make migration-test
9 pass
0 fail
```

Observação:

- Migration aditiva `20260722225555_robust_viper` cria tabelas tenant-scoped de lote, itens,
  eventos e registros de submissão com FKs por empresa, checks de estado/idempotência e rollback
  manual sem `CASCADE`.
- `T003` está concluída e libera a `T004`.

## T004 — Contracts de domínio e snapshot de submissão

Data: 2026-07-22

Modelo executor recomendado: Opus (alto).

Arquivos criados:

- `apps/api-transportada/test/cte-batch-application.contract.test.ts`
- `apps/api-transportada/test/cte-batch-application/support.ts`
- `apps/api-transportada/test/cte-batch-application/create-and-eligibility.contract.ts`
- `apps/api-transportada/test/cte-batch-application/submit-idempotency.contract.ts`
- `apps/api-transportada/test/cte-batch-application/state-and-lookup.contract.ts`

Comando executado:

```text
cd apps/api-transportada && bun test test/cte-batch-application.contract.test.ts
```

Resultado esperado (falha intencional):

```text
0 pass
8 fail
T004 application implementation is missing:
Cannot find module '../../src/cte-batches/application/cte-batch.use-case.js'
```

Status: `T004` registrada com contrato vermelho para orientar a implementação da `T005`.

## T005 — Casos de uso de lote e estado

Data: 2026-07-22

Modelo executor recomendado: Opus (alto).

Arquivos criados/alterados:

- `apps/api-transportada/src/cte-batches/application/cte-batch.use-case.ts`
- `apps/api-transportada/test/cte-batch-application/state-and-lookup.contract.ts`

Comandos executados:

```text
cd apps/api-transportada && bun test test/cte-batch-application.contract.test.ts
cd apps/api-transportada && bun run check
set -a; . ./.env; set +a; bun run --cwd apps/api-transportada test:integration
```

Resultado:

```text
bun test test/cte-batch-application.contract.test.ts
8 pass
0 fail

bun run check
407 pass
1 skip
0 fail

bun run --cwd apps/api-transportada test:integration
35 pass
1 skip
0 fail
```

Observação:

- A primeira execução de `test:integration` sem ambiente falhou por ausência de
  `API_TEST_DATABASE_URL`/`DATABASE_URL`; a execução com `.env` carregado passou.
- A implementação mantém `companyId` derivado do contexto, cria snapshots de cálculo nos itens,
  registra eventos de estado, trata replay/divergência de idempotência e usa erro 404 seguro para
  ausência/cross-tenant.
- `T005` está concluída e libera a `T006`.

## T006 — Contracts HTTP de lotes de CT-e

Data: 2026-07-22

Modelo executor recomendado: Opus (alto) + OpenCode para matriz mecânica.

Arquivos criados:

- `apps/api-transportada/test/cte-batch-http.contract.test.ts`
- `apps/api-transportada/test/cte-batch-http/security-and-cors.contract.ts`
- `apps/api-transportada/test/cte-batch-http/create-submit-and-query.contract.ts`
- `apps/api-transportada/test/fixtures/cte-batch-http.fixture.ts`

Comando executado:

```text
cd apps/api-transportada && bun test test/cte-batch-http.contract.test.ts
```

Resultado esperado inicial (falha intencional):

```text
1 pass
8 fail
Cannot find module '../../src/cte-batches/presentation/cte-batch.routes.js'
```

Status: `T006` registrada com contrato vermelho para orientar a implementação da `T007`.

## T007 — Endpoints HTTP de lote e submit/cancel

Data: 2026-07-22

Modelo executor recomendado: Sonnet (médio) + revisão Opus.

Arquivos criados/alterados:

- `apps/api-transportada/src/cte-batches/presentation/cte-batch.schema.ts`
- `apps/api-transportada/src/cte-batches/presentation/cte-batch.routes.ts`
- `apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch.repository.ts`
- `apps/api-transportada/src/main.ts`
- `apps/api-transportada/src/http/request-path.service.ts`
- `apps/api-transportada/src/shared/api.constant.ts`
- `apps/api-transportada/src/identity/domain/authorization.policy.ts`
- `apps/api-transportada/test/authorization.contract.test.ts`
- `apps/api-transportada/test/tenant-context.contract.test.ts`
- `apps/api-transportada/test/auth-me.contract.test.ts`
- `apps/api-transportada/test/integration/auth-me.integration.ts`
- `apps/api-transportada/test/fixtures/cte-batch-http.fixture.ts`

Comandos executados:

```text
cd apps/api-transportada && bun test test/cte-batch-http.contract.test.ts
cd apps/api-transportada && bun run check
set -a; . ./.env; set +a; bun run --cwd apps/api-transportada test:integration
```

Resultado:

```text
bun test test/cte-batch-http.contract.test.ts
9 pass
0 fail

bun run check
416 pass
1 skip
0 fail

bun run --cwd apps/api-transportada test:integration
35 pass
1 skip
0 fail
```

Observação:

- Rotas `POST /cte-batches`, `GET /cte-batches`, `GET /cte-batches/:id`,
  `POST /cte-batches/:id/submit`, `POST /cte-batches/:id/cancel` e
  `GET /cte-batches/:id/events` foram implementadas com `no-store`, DTO estrito e RBAC antes do
  parser.
- A matriz RBAC passou a incluir `cte.manage` e `cte.submit`, refletindo CTE-001 e CTE-002.
- A API real registra as rotas CT-e batch em `main.ts` com repositório Drizzle tenant-scoped.
- `T007` está concluída e libera a `T008`.

## T008 — Contracts frontend de lotes

Data: 2026-07-22

Modelo executor recomendado: Sonnet (médio).

Arquivos criados:

- `apps/frontend-transportada/test/cte-batch.contract.test.ts`
- `apps/frontend-transportada/test/cte-batch/cte-batch.fixture.ts`
- `apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts`
- `apps/frontend-transportada/test/cte-batch/permissions-and-states.contract.ts`
- `apps/frontend-transportada/test/cte-batch/presentation-boundaries.contract.ts`

Comando executado:

```text
cd apps/frontend-transportada && bun test test/cte-batch.contract.test.ts
```

Resultado esperado (falha intencional):

```text
0 pass
5 fail
Cannot find module '../../src/modules/cte-batch/...'
```

Status: `T008` registrada com contrato vermelho para orientar a implementação da `T009`.

## T009 — UI Vite de lotes

Data: 2026-07-22

Modelo executor recomendado: Sonnet (médio).

Arquivos criados:

- `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchClient.service.ts`
- `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchResponse.validation.ts`
- `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchDraft.service.ts`
- `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchViewModel.service.ts`
- `apps/frontend-transportada/src/modules/cte-batch/hooks/useCteBatchWorkspace.hook.ts`

Comandos executados:

```text
cd apps/frontend-transportada && bun test test/cte-batch.contract.test.ts
cd apps/frontend-transportada && bun run check
```

Resultado:

```text
bun test test/cte-batch.contract.test.ts
5 pass
0 fail

bun run check
43 pass
0 fail
vite build OK
```

Observação:

- O client CT-e batch usa bearer em memória, `cache: no-store`, headers de idempotência em criação
  e submissão, e rotas `/cte-batches` sem `companyId`.
- Os adaptadores rejeitam campos de tenant e payload fiscal sensível (`companyId`, XML ou payload
  extra) por DTO estrito.
- Controller/view model expõem controles apenas para `cte.manage` e `cte.submit`, mapeando estados
  `draft`, `processing`, `terminal`, `empty`, `loading`, `error` e `forbidden`.
- `T009` está concluída e libera a `T010`.

## T010 — Jornada e permissões com Playwright

Data: 2026-07-22

Modelo executor recomendado: Sonnet (médio) + revisão Opus.

Arquivos criados/alterados:

- `apps/frontend-transportada/src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx`
- `apps/frontend-transportada/src/main.tsx`
- `apps/frontend-transportada/src/modules/cte-batch/hooks/useCteBatchWorkspace.hook.ts`
- `apps/frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts`
- `apps/frontend-transportada/test/cte-batch-smoke.helper.ts`
- `apps/frontend-transportada/test/responsive.smoke.spec.ts`

Comandos executados:

```text
make identity-bootstrap
cd apps/frontend-transportada && bun run check
cd apps/frontend-transportada && bun run smoke
```

Resultado:

```text
make identity-bootstrap
6 pass
0 fail
Keycloak healthy
db:migrate OK
db:seed:local OK

bun run check
43 pass
0 fail
vite build OK

bun run smoke
6 passed
0 failed
```

## Revisão extra — filtros avançados da workspace de lotes

Data: 2026-07-23

Objetivo:

- completar operação de filtros avançados no workspace de lotes no frontend;
- incluir `statusNe` e contador numérico com operador `Ne` por padrão de filtros;
- disponibilizar limpeza de filtros para acelerar jornadas de reuso.

Arquivos alterados:

- `apps/frontend-transportada/src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx`

Observação:

- esta revisão não altera contratos backend nem regras de autorização; apenas melhora
  usabilidade e consistência da camada de consulta no frontend.

Verificação local (agregada no gate):

```text
bun run --cwd apps/frontend-transportada check
```

Evidência:

- filtros com valor de igualdade e diferença (`statusEq`, `statusNe`, campos numéricos)
  continuam cobertos;
- botão `Limpar filtros` adicionado para resetar rapidamente os campos de busca.

Observação:

- A primeira execução do smoke falhou antes da UI porque `localhost:58080` não tinha Keycloak
  ativo; o alvo oficial `make identity-bootstrap` subiu o ambiente local e semeou a identidade.
- A UI `/cte-batches` foi conectada ao resolver principal por rota e por
  `sessionStorage.transportada.workspace = "cte-batch"`, seguindo o padrão do workspace de frete.
- O smoke cobre 375px com criação/submissão por `cte.manage` + `cte.submit`, 768px com submissão
  sem controles de gestão e 1280px com cancelamento por `cte.manage` sem controle de submissão.
- O allowlist de `auth/me` no frontend foi alinhado para `cte.manage` e `cte.submit`, mantendo
  validação estrita e falha fechada.
- `T010` está concluída e libera a `T011`.

## T011 — Integração local e revisão de release

Data: 2026-07-22

Modelo executor recomendado: Opus (alto) + reviewer independente.

Arquivos ajustados durante o gate:

- `apps/api-transportada/drizzle/20260722225555_robust_viper/snapshot.json`
- `apps/api-transportada/src/cte-batches/application/cte-batch.use-case.ts`
- `apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch.repository.ts`
- `apps/api-transportada/src/cte-batches/presentation/cte-batch.routes.ts`
- `apps/api-transportada/src/database/cte-batch.schema.ts`
- `apps/api-transportada/src/identity/domain/authorization.policy.ts`
- `apps/api-transportada/test/database-migration/static-migration.contract.ts`
- `apps/api-transportada/test/fixtures/cte-batch-http.fixture.ts`
- `apps/frontend-transportada/src/modules/cte-batch/hooks/useCteBatchWorkspace.hook.ts`
- `apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts`
- `apps/frontend-transportada/test/cte-batch/permissions-and-states.contract.ts`

Comandos executados:

```text
bun install --frozen-lockfile
make check
bunx prettier --write <11 arquivos apontados pelo format:check>
make check
make migration-test
git diff --check
```

Resultado:

```text
bun install --frozen-lockfile
Checked 591 installs across 715 packages (no changes)

make check (primeira execução)
falhou apenas em format:check com 11 arquivos

bunx prettier --write
11 arquivos formatados

make check (segunda execução)
realm-contract: 6 pass
api tests: 393 pass, 1 skip
worker tests: 59 pass
frontend tests: 43 pass
builds API/worker/frontend OK

make migration-test
9 pass
0 fail

git diff --check
sem saída
```

Status:

- `T011` concluída com gates verdes, sem deploy, sem SEFAZ real e sem publicação externa.

## Revisão pós-T011 — correções de release

Data: 2026-07-22

Achados corrigidos:

- Mutações de lote CT-e passaram a executar dentro de `execute` transacional no repositório
  Drizzle, cobrindo criação, submissão, cancelamento e transições.
- Criação de lote passou a fazer replay/conflito de idempotência antes de inserir novo lote.
- `version` do lote passou a ser incrementada com `version + 1` em cada transição, em vez de ficar
  fixada em `2`.
- Paginação de eventos passou a usar `occurred_at`, alinhada ao índice e à semântica da timeline.
- Contratos de aplicação foram ampliados para cobrir transação e idempotência de criação.

Comandos executados:

```text
cd apps/api-transportada && bun test test/cte-batch-application.contract.test.ts test/cte-batch-http.contract.test.ts test/cte-batch-schema.contract.test.ts
bunx prettier --write apps/api-transportada/src/cte-batches/application/cte-batch.use-case.ts apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch.repository.ts apps/api-transportada/test/cte-batch-application/support.ts apps/api-transportada/test/cte-batch-application/create-and-eligibility.contract.ts apps/api-transportada/test/cte-batch-application/submit-idempotency.contract.ts apps/api-transportada/test/cte-batch-application/state-and-lookup.contract.ts
make check
make migration-test
cd apps/frontend-transportada && bun run smoke
```

Resultado:

```text
CT-e batch contracts
25 pass
0 fail

make check
realm-contract: 6 pass
api tests: 393 pass, 1 skip
worker tests: 59 pass
frontend tests: 43 pass
builds API/worker/frontend OK

make migration-test
9 pass
0 fail

bun run smoke
6 passed
0 failed
```
