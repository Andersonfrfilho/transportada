# Evidência — Feature 006 Regras e cálculo de frete

## T001 — ADR e decomposição executável

Data: 2026-07-22

Modelo executor: Codex Sol high recomendado para especificação/revisão de dinheiro,
snapshots, idempotência e migration.

Arquivos criados:

- `specs/006-freight-calculation/spec.md`
- `specs/006-freight-calculation/plan.md`
- `specs/006-freight-calculation/tasks.md`
- `docs/adr/0008-freight-decimal-snapshots.md`

Decisões registradas:

- regra inicial `PERCENTAGE_OF_INVOICE_TOTAL`;
- dinheiro e percentual como decimal seguro, sem `number` binário;
- versionamento de regras e snapshot imutável por cálculo persistido;
- seleção vigente pela data de emissão da NF-e;
- bloqueio de vigência sobreposta para regras ativas equivalentes;
- feature limitada a configuração e simulação, sem lote ou emissão CT-e.

Gate executado:

```text
bunx prettier --write docs/adr/0008-freight-decimal-snapshots.md specs/006-freight-calculation/spec.md specs/006-freight-calculation/plan.md specs/006-freight-calculation/tasks.md
bunx prettier --check docs/adr specs/006-freight-calculation && git diff --check
```

Resultado:

```text
All matched files use Prettier code style!
git diff --check sem apontamentos.
```

Não houve implementação, banco, RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou
segredo nesta tarefa.

## T002 — Contracts do schema de frete e constraints

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por envolver schema, dinheiro,
constraints, tenant e vigência.

Arquivos criados/alterados:

- `apps/api-transportada/test/freight-schema.contract.test.ts`
- `apps/api-transportada/test/freight-schema/aggregator.contract.ts`
- `apps/api-transportada/test/freight-schema/rules.contract.ts`
- `apps/api-transportada/test/freight-schema/calculations.contract.ts`
- `apps/api-transportada/test/freight-schema/tenant-safety.contract.ts`
- `apps/api-transportada/test/freight-schema/tables.ts`
- `apps/api-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`

Contratos definidos:

- exportação agregada de `freightRules`, `freightRuleVersions` e
  `freightCalculations`;
- módulo dedicado `src/database/freight.schema.ts`;
- regra tenant-scoped com tipo percentual, status, prioridade, versão corrente e
  ator por membership;
- versão imutável com `numeric(9,6)` para percentual, `numeric(19,4)` para
  valores, vigência, snapshot e filtros;
- cálculo com snapshot, idempotência tenant-scoped, FKs compostas para NF-e,
  regra e versão;
- checks de status, versão, percentual, valores, mínimo/máximo e vigência;
- segurança tenant, timestamps UTC e ausência de XML/segredos/payload fiscal.

Gate RED executado:

```text
(cd apps/api-transportada && bun test test/freight-schema.contract.test.ts)
```

Resultado esperado:

```text
T003 schema implementation is missing database export: freightRules
```

A falha é intencional e limitada à implementação ausente da T003. Nenhum banco,
migration, RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo foi usado nesta
tarefa.

## T003 — Schema, migration aditiva e rollback

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por envolver migration, dinheiro,
constraints, tenant e rollback.

Arquivos criados/alterados:

- `apps/api-transportada/src/database/freight.schema.ts`
- `apps/api-transportada/src/database/database.schema.ts`
- `apps/api-transportada/drizzle/20260722172720_confused_excalibur/migration.sql`
- `apps/api-transportada/drizzle/20260722172720_confused_excalibur/rollback.sql`
- `apps/api-transportada/drizzle/20260722172720_confused_excalibur/snapshot.json`
- `apps/api-transportada/test/database-migration/support.ts`
- `apps/api-transportada/test/database-migration/database-migration.integration.ts`
- `apps/api-transportada/test/database-migration/static-migration.contract.ts`
- `specs/006-freight-calculation/tasks.md`

Implementado:

- `freight_rules` com tenant, tipo percentual, status, prioridade, versão
  corrente e ator via membership;
- `freight_rule_versions` com vigência, `numeric(9,6)` para percentual,
  `numeric(19,4)` para mínimo/máximo, filtros e snapshot;
- `freight_calculations` com NF-e tenant-scoped, regra, versão, idempotência,
  valores decimais, ajustes, snapshot e detalhes;
- FKs compostas por empresa para NF-e, regra, versão e membership;
- checks de status, versão, percentual, valores, mínimo/máximo e vigência;
- rollback manual reverso, sem `CASCADE`, removendo o journal da migration com
  hash guardado.

Gates executados:

```text
(cd apps/api-transportada && bun test test/freight-schema.contract.test.ts)
bun run --cwd apps/api-transportada db:check
make migration-test
bun run --cwd apps/api-transportada check
```

Resultados:

```text
freight-schema.contract: 7 pass, 0 fail, 77 expect() calls.
db:check: Everything's fine.
migration-test: 9 pass, 0 fail, 129 expect() calls.
api check: 365 pass, 1 skip, 0 fail, 2251 expect() calls; build OK.
```

O skip no `api check` é o teste de integração de migration quando executado sem
`DRIZZLE_TEST_DATABASE_URL`; o mesmo cenário foi coberto pelo `make
migration-test` com PostgreSQL local.

Nenhum RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo participou desta
tarefa. O Postgres local usado pelo migration-test foi encerrado após a coleta
da evidência.

## T005 — Motor de cálculo e snapshots puros

Data: 2026-07-22

Modelo executor recomendado: Codex Terra medium com revisão Sol, porque a
política decimal já estava fechada pelos contracts e a implementação ficou
local, pura e reversível.

Arquivos criados/alterados:

- `apps/api-transportada/src/freight-calculations/domain/freight-calculation-engine.service.ts`
- `specs/006-freight-calculation/tasks.md`

Implementado:

- `createFreightRuleSnapshot` canonicaliza dinheiro para quatro casas,
  percentual para seis casas e valida faixa de percentual;
- `calculatePercentageFreight` usa aritmética inteira por escala, sem `number`
  binário para dinheiro ou percentual;
- cálculo percentual aplica arredondamento `half_up` na escala 4;
- mínimo e máximo são aplicados depois do valor percentual, gerando ajustes
  explícitos;
- mínimo maior que máximo, percentual fora de `0..1` e escala monetária
  inválida falham com códigos estáveis.

Gates executados:

```text
(cd apps/api-transportada && bun test test/freight-calculation-engine.contract.test.ts)
bun run --cwd apps/api-transportada check
```

Resultados:

```text
freight-calculation-engine.contract: 6 pass, 0 fail, 13 expect() calls.
api check: 371 pass, 1 skip, 0 fail, 2264 expect() calls; build OK.
```

O skip no `api check` continua sendo a integração de migration sem
`DRIZZLE_TEST_DATABASE_URL`, já coberta anteriormente por `make migration-test`
na T003.

Nenhum banco, RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo participou
desta tarefa.

## T008 — Contracts da aplicação de simulação

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por fixar elegibilidade da NF-e,
regra vigente, snapshot, idempotência e anti-enumeração antes da implementação.

Arquivos criados/alterados:

- `apps/api-transportada/test/freight-simulation-application.contract.test.ts`
- `apps/api-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Contratos definidos:

- simulação persistente cria um snapshot tenant-scoped para NF-e completa e
  autorizada usando a regra vigente;
- replay idempotente não recalcula nem duplica persistência;
- replay divergente falha com conflito seguro;
- ausência de regra vigente retorna erro de configuração seguro;
- NF-e `summary`, `event`, não autorizada ou sem total confiável é rejeitada
  como inelegível.

Gate RED executado:

```text
(cd apps/api-transportada && bun test test/freight-simulation-application.contract.test.ts)
```

Resultado esperado:

```text
Cannot find module '../src/freight-calculations/application/freight-simulation.use-case.js'
```

A falha é intencional e limitada à implementação ausente da T009. Nenhum banco,
RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo foi usado nesta tarefa.

## T009 — Casos de uso de simulação e consulta

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por envolver idempotência,
anti-enumeração, snapshot imutável, tenant e cálculo monetário persistido.

Arquivos criados/alterados:

- `apps/api-transportada/src/freight-calculations/application/freight-simulation.use-case.ts`
- `apps/api-transportada/test/freight-simulation-application.contract.test.ts`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Implementado:

- factory `createFreightSimulationUseCase` com `execute` tenant-scoped para
  simulação persistente;
- fingerprint de idempotência por operação com replay seguro e conflito
  divergente estável;
- validação de elegibilidade da NF-e antes do cálculo, exigindo documento
  completo, autorizado e com total confiável;
- seleção da regra vigente pela data de emissão e snapshot imutável via motor
  decimal;
- persistência do cálculo com payload exato do contrato, seguida de auditoria e
  registro idempotente;
- tipagem do contexto reduzida ao mínimo autenticado exigido pela aplicação,
  mantendo o `check` agregado verde.

Gates executados:

```text
(cd apps/api-transportada && bun test test/freight-simulation-application.contract.test.ts)
bun run --cwd apps/api-transportada check
make postgres-up
set -a && source ./.env && set +a && \
  API_TEST_DATABASE_URL="$DATABASE_URL" \
  DRIZZLE_TEST_DATABASE_URL="$DATABASE_URL" \
  bun run --cwd apps/api-transportada test:integration
```

Resultados:

```text
freight-simulation-application.contract: 5 pass, 0 fail, 32 expect() calls.
api check: 382 pass, 1 skip, 0 fail, 2327 expect() calls; build OK.
api test:integration com PostgreSQL local: 36 pass, 0 fail, 374 expect() calls.
```

O único skip no `check` agregado permanece sendo a migration integration quando
`DRIZZLE_TEST_DATABASE_URL` não está presente; esse cenário foi coberto na mesma
tarefa pelo `test:integration` executado com PostgreSQL local saudável.

Nenhum RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo participou desta
tarefa. O PostgreSQL local foi usado apenas para os gates de integração da API.

## T010 — Contracts HTTP de regras e simulações

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high com apoio mecânico para matriz de
rotas, permissões e DTOs.

Arquivos criados/alterados:

- `apps/api-transportada/test/freight-http.contract.test.ts`
- `apps/api-transportada/test/freight-http/security-and-cors.contract.ts`
- `apps/api-transportada/test/freight-http/rules-and-simulation.contract.ts`
- `apps/api-transportada/test/freight-http/listing.contract.ts`
- `apps/api-transportada/test/fixtures/freight-http.fixture.ts`
- `apps/api-transportada/test/fixtures/freight-http-payload.fixture.ts`
- `apps/api-transportada/test/fixtures/freight-http-request.fixture.ts`
- `apps/api-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Contratos definidos:

- autenticação, tenant e RBAC antes de parsing para regras e simulação;
- `no-store`, CORS e erros seguros para simulação e listagens;
- DTO estrito para criação de regra, sem aceitar `companyId` ou campos
  calculáveis livres do cliente;
- simulação persistente via idempotency key com `documentId` tenant-scoped;
- listagem paginada e estável de regras e cálculos por NF-e;
- ausência de XML e payload fiscal sensível nas respostas HTTP;
- fronteira explícita de implementação em `createFreightRoutes`.

Gate RED executado:

```text
(cd apps/api-transportada && bun test test/freight-http.contract.test.ts)
```

Resultado esperado:

```text
Cannot find module '../../src/freight/presentation/freight.routes.js'
```

O vermelho ficou concentrado na implementação ausente das rotas HTTP de frete
do T011. Não houve falha residual de payload, fixture ou tipagem antes dessa
fronteira.

## T011 — Endpoints HTTP de frete

Data: 2026-07-22

Modelo executor recomendado: Codex Terra medium com revisão Sol, porque a
fronteira HTTP já estava fechada pelos contracts e a implementação foi
reversível.

Arquivos criados/alterados:

- `apps/api-transportada/src/freight/presentation/freight.routes.ts`
- `apps/api-transportada/src/freight/presentation/freight.schema.ts`
- `apps/api-transportada/src/shared/api.constant.ts`
- `apps/api-transportada/src/http/request-path.service.ts`
- `apps/api-transportada/test/freight-http/rules-and-simulation.contract.ts`
- `apps/api-transportada/test/freight-http/listing.contract.ts`
- `apps/api-transportada/test/fixtures/freight-http.fixture.ts`
- `apps/api-transportada/test/fixtures/freight-http-payload.fixture.ts`
- `apps/api-transportada/test/fixtures/freight-http-request.fixture.ts`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Implementado:

- rotas `GET/POST /freight-rules`, `POST /freight-calculations` e
  `GET /nfe-documents/:id/freight-calculations`;
- policies separadas para `settings.manage` e `freight.simulate`;
- parsing estrito de JSON, paginação, idempotency key e `documentId`/cursores;
- respostas `no-store` e serialização segura sem `companyId`, `createdByUserId`
  ou payload fiscal sensível;
- inclusão dos caminhos de frete no catálogo central de rotas sensíveis para
  cache e logging.

Gates executados:

```text
(cd apps/api-transportada && bun test test/freight-http.contract.test.ts)
bun run --cwd apps/api-transportada check
make postgres-up
set -a && source ./.env && set +a && \
  API_TEST_DATABASE_URL="$DATABASE_URL" \
  DRIZZLE_TEST_DATABASE_URL="$DATABASE_URL" \
  bun run --cwd apps/api-transportada test:integration
```

Resultados:

```text
freight-http.contract: 10 pass, 0 fail, 46 expect() calls.
api check: 392 pass, 1 skip, 0 fail, 2373 expect() calls; build OK.
api test:integration com PostgreSQL local: 36 pass, 0 fail, 374 expect() calls.
```

O único skip no `check` agregado continua sendo a migration integration sem
`DRIZZLE_TEST_DATABASE_URL`; o cenário foi coberto na mesma tarefa pelo
`test:integration` executado com PostgreSQL local.

Nenhum RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo participou desta
tarefa. O PostgreSQL local foi usado apenas para os gates de integração da API.

## T012 — Contracts do frontend de frete

Data: 2026-07-22

Modelo executor recomendado: Codex Terra medium, por ser uma task de matriz de
client/query/permissões/estados sem mudança visual ainda.

Arquivos criados/alterados:

- `apps/frontend-transportada/test/freight.contract.test.ts`
- `apps/frontend-transportada/test/freight/freight.fixture.ts`
- `apps/frontend-transportada/test/freight/client-and-queries.contract.ts`
- `apps/frontend-transportada/test/freight/permissions-and-states.contract.ts`
- `apps/frontend-transportada/test/freight/presentation-boundaries.contract.ts`
- `apps/frontend-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Contratos definidos:

- client autenticado com `no-store` para `GET/POST /freight-rules`,
  `POST /freight-calculations` e
  `GET /nfe-documents/:id/freight-calculations`;
- adapters strict de DTO para regra, simulação e histórico, recusando campos
  internos, números não-decimais e payload fiscal;
- controller/hook separando `settings.manage` de `freight.simulate`;
- view model cobrindo estados `forbidden`, `empty`, `ready`, `adjusted` e
  `error`;
- drafts de apresentação sem `companyId`, XML ou campos calculáveis livres do
  cliente.

Gate RED executado:

```text
(cd apps/frontend-transportada && bun test test/freight.contract.test.ts)
```

Resultado esperado:

```text
Cannot find module '../../src/modules/freight/shared/freightClient.service'
Cannot find module '../../src/modules/freight/shared/freightResponse.validation'
Cannot find module '../../src/modules/freight/hooks/useFreightWorkspace.hook'
Cannot find module '../../src/modules/freight/shared/freightViewModel.service'
Cannot find module '../../src/modules/freight/shared/freightDraft.service'
```

O vermelho ficou concentrado na implementação ausente do módulo `freight` do
frontend, que pertence à T013. Não houve falha residual de fixture, script ou
tipagem antes dessa fronteira.

## T013 — UI Vite de regras e simulação

Data: 2026-07-22

Modelo executor recomendado: Codex Terra medium, porque a superfície do módulo
já estava delimitada pelos contracts e a implementação foi local ao frontend.

Arquivos criados/alterados:

- `apps/frontend-transportada/src/modules/freight/shared/freightClient.service.ts`
- `apps/frontend-transportada/src/modules/freight/shared/freightResponse.validation.ts`
- `apps/frontend-transportada/src/modules/freight/shared/freightDraft.service.ts`
- `apps/frontend-transportada/src/modules/freight/shared/freightViewModel.service.ts`
- `apps/frontend-transportada/src/modules/freight/hooks/useFreightWorkspace.hook.ts`
- `apps/frontend-transportada/src/modules/freight/pages/FreightWorkspace.page.tsx`
- `apps/frontend-transportada/test/freight/client-and-queries.contract.ts`
- `apps/frontend-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Implementado:

- client frontend autenticado para regras, simulação persistente e histórico por
  NF-e, sempre com `no-store`;
- adapters strict de resposta, recusando campos internos, XML e payload
  monetário fora do formato esperado;
- drafts de regra e simulação sem `companyId` livre ou payload fiscal;
- view model de frete com estados `forbidden`, `empty`, `ready` e `adjusted`;
- hook/controller separando `settings.manage` de `freight.simulate` e
  integrando React Query;
- casca inicial da página `FreightWorkspacePage` para o módulo de frete.

Gates executados:

```text
(cd apps/frontend-transportada && bun test test/freight.contract.test.ts)
bun run --cwd apps/frontend-transportada check
```

Resultados:

```text
freight.contract: 5 pass, 0 fail, 49 expect() calls.
frontend check: 43 pass, 0 fail, 288 expect() calls; typecheck/lint/build OK.
```

Nenhum Railway, RabbitMQ, SEFAZ, XML fiscal, PFX ou segredo participou desta
tarefa. O build gerou os artefatos PWA padrão do frontend sem introduzir cache
indevido para endpoints de frete.

## T006 — Contracts da aplicação de regras

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por fixar versionamento,
idempotência, tenant, auditoria e conflito de vigência antes da implementação.

Arquivos criados/alterados:

- `apps/api-transportada/test/freight-rules-application.contract.test.ts`
- `apps/api-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Contratos definidos:

- criação tenant-scoped de regra, primeira versão imutável, auditoria e
  idempotência;
- replay idempotente sem duplicar regra, versão ou audit;
- conflito de replay divergente com erro seguro;
- atualização de regra criando nova versão e preservando a anterior;
- ativação/desativação tenant-scoped com conflito de sobreposição seguro;
- listagem de regras e seleção da versão vigente sempre derivadas do tenant
  autenticado.

Gate RED executado:

```text
(cd apps/api-transportada && bun test test/freight-rules-application.contract.test.ts)
```

Resultado esperado:

```text
Cannot find module '../src/freight-rules/application/freight-rules.use-case.js'
```

A falha é intencional e limitada à implementação ausente da T007. Nenhum banco,
RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo foi usado nesta tarefa.

## T007 — Repositórios e casos de uso de regras

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por envolver versionamento,
idempotência, tenant, auditoria e conflitos de ativação.

Arquivos criados/alterados:

- `apps/api-transportada/src/freight-rules/application/freight-rules.use-case.ts`
- `apps/api-transportada/src/freight-calculations/domain/freight-calculation-engine.service.ts`
- `specs/006-freight-calculation/tasks.md`

Implementado:

- factory `createFreightRulesUseCase` com operações `create`, `update`,
  `activate`, `deactivate`, `list` e `findApplicableVersion`;
- criação tenant-scoped da regra com primeira versão imutável e snapshot
  canônico gerado pelo motor decimal;
- replay idempotente seguro para criação;
- atualização criando nova versão e avançando `currentVersion`;
- mapeamento de conflito de sobreposição para `FREIGHT_RULE_CONFLICT`;
- seleção da versão vigente sem confiar em `companyId` livre do chamador.

Gates executados:

```text
(cd apps/api-transportada && bun test test/freight-rules-application.contract.test.ts)
bun run --cwd apps/api-transportada check
```

Resultados:

```text
freight-rules-application.contract: 6 pass, 0 fail, 31 expect() calls.
api check: 377 pass, 1 skip, 0 fail, 2295 expect() calls; build OK.
```

O skip no `api check` continua sendo a integração de migration sem
`DRIZZLE_TEST_DATABASE_URL`, já coberta anteriormente por `make migration-test`
na T003.

Nenhum banco, RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo participou
desta tarefa.

## T004 — Contracts do motor decimal de cálculo

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por fixar dinheiro, decimal,
arredondamento, mínimo/máximo e invariantes antes da implementação.

Arquivos criados/alterados:

- `apps/api-transportada/test/freight-calculation-engine.contract.test.ts`
- `apps/api-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Contratos definidos:

- regra percentual de 3,5% sobre NF-e de `10000.0000` retorna `350.0000`;
- mínimo é aplicado depois do cálculo percentual e gera ajuste positivo;
- máximo é aplicado depois do cálculo percentual e gera ajuste negativo;
- arredondamento `half_up` em escala 4 cobre caso de meia unidade decimal;
- snapshot canonicaliza dinheiro para quatro casas e percentual para seis casas;
- escala monetária inválida, percentual acima de 1 e mínimo maior que máximo
  falham com códigos estáveis.

Gate RED executado:

```text
(cd apps/api-transportada && bun test test/freight-calculation-engine.contract.test.ts)
```

Resultado esperado:

```text
Cannot find module '../src/freight-calculations/domain/freight-calculation-engine.service.js'
```

A falha é intencional e limitada à implementação ausente da T005. Nenhum banco,
migration, RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo foi usado nesta
tarefa.

## T014 — Jornada responsiva com Playwright

Data: 2026-07-22

Modelo executor recomendado: Codex Terra medium, com revisão posterior em Sol
se necessário.

Arquivos criados/alterados:

- `apps/frontend-transportada/package.json`
- `apps/frontend-transportada/src/main.tsx`
- `apps/frontend-transportada/src/modules/freight/hooks/useFreightWorkspace.hook.ts`
- `apps/frontend-transportada/src/modules/freight/pages/FreightWorkspace.page.tsx`
- `apps/frontend-transportada/test/freight-smoke.helper.ts`
- `apps/frontend-transportada/test/responsive.smoke.spec.ts`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Implementado e ajustado:

- o script `smoke` do frontend passou a carregar explicitamente o `.env` raiz
  para herdar as variáveis `VITE_*`, `KEYCLOAK_*` e as portas do ambiente local;
- o smoke responsivo foi redirecionado para o workspace de frete, cobrindo
  admin, operador e usuário sem permissão;
- o helper dedicado mocka `/auth/me`, regras, simulação e histórico de
  cálculos, preservando o boundary de autenticação e sem persistir token em
  storage;
- o controller/hook de frete passou a preservar o `FreightSimulationResult`
  retornado pela mutação, habilitando a renderização imediata do resultado;
- a página exibe `Resultado da simulacao`, `Total calculado` e o ajuste mínimo
  ou máximo aplicável no fluxo do operador.

Gate executado:

```text
bun run --cwd apps/frontend-transportada smoke
```

Resultado:

```text
responsive.smoke.spec.ts: 3 passed, 0 failed.
```

Cobertura validada:

- mobile `375x812`: admin cria regra padrão sem overflow horizontal;
- tablet `768x1024`: operador simula frete com ajuste mínimo explícito e vê o
  resultado calculado;
- desktop `1280x900`: usuário sem permissão encontra o workspace fechado, sem
  ações administrativas ou de simulação.

## T015 — Integração local e revisão de release

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, com foco em integração final,
gates globais e revisão de release.

Arquivos criados/alterados:

- `apps/api-transportada/drizzle/20260722172720_confused_excalibur/snapshot.json`
- `apps/api-transportada/src/freight-calculations/application/freight-simulation.use-case.ts`
- `apps/api-transportada/test/fixtures/freight-http.fixture.ts`
- `apps/api-transportada/test/freight-http/listing.contract.ts`
- `apps/api-transportada/test/freight-http/rules-and-simulation.contract.ts`
- `apps/api-transportada/test/freight-http/security-and-cors.contract.ts`
- `apps/frontend-transportada/src/modules/freight/hooks/useFreightWorkspace.hook.ts`
- `apps/frontend-transportada/src/modules/freight/pages/FreightWorkspace.page.tsx`
- `apps/frontend-transportada/src/modules/freight/shared/freightClient.service.ts`
- `apps/frontend-transportada/src/modules/freight/shared/freightDraft.service.ts`
- `apps/frontend-transportada/src/modules/freight/shared/freightResponse.validation.ts`
- `apps/frontend-transportada/src/modules/freight/shared/freightViewModel.service.ts`
- `apps/frontend-transportada/test/freight-smoke.helper.ts`
- `apps/frontend-transportada/test/freight/client-and-queries.contract.ts`
- `specs/006-freight-calculation/tasks.md`
- `specs/006-freight-calculation/evidence.md`

Ajustes necessários durante o gate:

- `make check` falhou na primeira passagem apenas por formatação Prettier em
  arquivos de frete; os arquivos listados pelo gate foram normalizados;
- o rerun de `make check` expôs uma incompatibilidade TypeScript na página de
  frete: o fallback da simulação imediata precisava respeitar o shape tipado de
  `FreightCalculationListPage`;
- o primeiro `make dev` falhou porque a porta `53001` estava ocupada por um
  processo `bun` órfão anterior; o processo foi encerrado e o ciclo local foi
  repetido em ambiente limpo.

Gates executados:

```text
bun install --frozen-lockfile
make check
make migration-test
git diff --check
make dev
make smoke
make down
```

Resultados:

```text
bun install --frozen-lockfile: sem mudanças no lockfile.
make check: 392 pass, 1 skip, 0 fail na API; 59 pass, 0 fail no worker; 43 pass, 0 fail no frontend; builds OK.
make migration-test: 9 pass, 0 fail.
git diff --check: sem erros de whitespace ou conflito de patch.
make smoke: healths de API/worker OK; Playwright responsivo 3 passed.
make down: infraestrutura local encerrada e network removida.
```

Revisão de release local:

- nenhuma evidência de mistura entre tenants, ambientes fiscais ou payload
  sensível nos fluxos exercitados;
- sem uso de Railway, SEFAZ real, PFX real ou credenciais reais durante a
  validação;
- o único evento operacional fora do código foi a ocupação prévia da porta
  `53001`, resolvida antes do rerun definitivo.

## Revisão final — correções pós-review

Data: 2026-07-22

Achados corrigidos:

- as rotas reais de frete passaram a ser registradas no bootstrap da API com
  repositório Drizzle dedicado para regras, simulações e listagens;
- a entrada do frontend voltou a preservar o workspace NF-e por padrão e expõe
  o workspace de frete por `/freight` ou preferência de sessão usada pelo smoke;
- o use case de simulação passou a falhar fechado para `documentId` malformado,
  removendo o fallback para `nfe-001`;
- os adapters frontend de frete passaram a validar strings monetárias e
  percentuais no formato decimal contratado.

Gates executados após as correções:

```text
bun test apps/api-transportada/test/freight-simulation-application.contract.test.ts apps/api-transportada/test/freight-http.contract.test.ts apps/frontend-transportada/test/freight.contract.test.ts
bun run --cwd apps/frontend-transportada smoke
make check
git diff --check
make down
```

Resultados:

```text
contratos focados: 21 pass, 0 fail.
frontend smoke: 3 passed.
make check: 393 pass, 1 skip, 0 fail na API; 59 pass, 0 fail no worker; 43 pass, 0 fail no frontend; builds OK.
git diff --check: sem erros.
make down: infraestrutura local encerrada e network removida.
```
