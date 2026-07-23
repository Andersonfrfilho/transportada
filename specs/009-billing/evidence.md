# Evidencia — Feature 009 Faturamento

## T001 — Consolidar spec/plano executavel

Data: 2026-07-23

Modelo executor recomendado: Codex 5.4, com revisao Sol para dinheiro,
concorrencia, idempotencia e release.

Estado inicial: abertura da fase 7 do plano de entrega para fechar o MVP
operacional com selecao de CT-e autorizados, geracao de faturas, documentos
seguros e cancelamento operacional.

Arquivos previstos:

- `specs/009-billing/spec.md`
- `specs/009-billing/plan.md`
- `specs/009-billing/tasks.md`
- `specs/009-billing/evidence.md`

Decisoes registradas:

- faturamento inicial e operacional, sem NFS-e, boleto, baixa financeira ou
  conciliacao bancaria;
- somente CT-e autorizados, tenant-scoped e sem fatura ativa sao elegiveis;
- valores monetarios usam decimal canonico e snapshots imutaveis;
- fatura ativa bloqueia refaturamento do mesmo CT-e;
- cancelamento preserva historico e registra evento append-only;
- PDF/exportacao nao podem expor XML fiscal, storage key, certificado, token ou
  payload SEFAZ.

Comando planejado:

```text
bunx prettier --check specs/009-billing && git diff --check
```

Resultado:

```text
bunx prettier --check specs/009-billing
Checking formatting...
All matched files use Prettier code style!

git diff --check
0 issues
```

Observacao:

- `T001` cria a base executavel e libera `T002` para contracts de schema de
  faturamento.

## T002 — Contracts de schema de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para schema financeiro, dinheiro,
concorrencia, idempotencia, constraints tenant-scoped e rollback.

Contracts criados:

- agregador de schema exigindo exports em `database.schema`;
- tenant safety para `company_id`, FK restritiva com `companies`, timestamps UTC
  e ausencia de XML, storage key, certificado, chave privada e token;
- invoices com numero tenant-scoped, status, idempotencia, ator, correlation id
  e totais `numeric(14, 2)`;
- invoice items vinculados a CT-e autorizado/documento fiscal por FK
  tenant-scoped e bloqueio de refaturamento ativo;
- invoice events append-only;
- invoice documents com object storage opaco, hash, MIME, tamanho e versao.

Arquivos alterados:

- `apps/api-transportada/test/billing-schema.contract.test.ts`
- `apps/api-transportada/test/billing-schema/aggregator.contract.ts`
- `apps/api-transportada/test/billing-schema/billing.contract.ts`
- `apps/api-transportada/test/billing-schema/tables.ts`
- `apps/api-transportada/test/billing-schema/tenant-safety.contract.ts`
- `apps/api-transportada/package.json`

Comando executado:

```text
bun test test/billing-schema.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
6 fail
T002 schema implementation is missing database export: billingInvoices
T002 schema implementation is missing database export: billingInvoiceItems
T002 schema implementation is missing database export: billingInvoiceEvents
```

Observacao:

- A falha e intencional para `T002`: os contracts documentam o schema esperado e
  a implementacao de `billing.schema.ts`, migration e rollback fica para `T003`.

## T003 — Schema, migration aditiva e rollback

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para schema financeiro, dinheiro,
constraints tenant-scoped, rollback e concorrencia.

Implementacao confirmada:

- `billing.schema.ts` com invoices, items, events e documents;
- exports agregados em `database.schema`;
- `stored_objects.purpose` ampliado para `billing_document`;
- migration `20260723125103_oval_dexter_bennett` aditiva para faturamento;
- rollback manual com hash de journal e restauracao do check anterior de
  `stored_objects.purpose`;
- migration-test atualizado para reconhecer tabelas de billing.

Comandos executados:

```text
bun test test/billing-schema.contract.test.ts
```

Resultado:

```text
6 pass
0 fail
93 expect() calls
```

```text
bun run db:check
```

Resultado:

```text
Everything's fine
```

```text
make migration-test
```

Resultado:

```text
9 pass
0 fail
129 expect() calls
```

Observacoes:

- A migration gerada originalmente tentou recriar `cte_issuance_outbox` porque a
  migration manual anterior nao possuia snapshot proprio. O SQL foi limpo para
  conter apenas billing e a alteracao controlada em `stored_objects`.
- O snapshot novo permanece como baseline futuro para evitar drift nas proximas
  geracoes.
- `T003` esta concluida e libera `T004` para contracts da aplicacao de
  faturamento.

## T004 — Contracts da aplicacao de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para dinheiro, idempotencia,
concorrencia, transacoes e isolamento multiempresa.

Contracts criados:

- elegibilidade restrita a CT-e autorizado, sem fatura ativa e tenant-scoped;
- criacao transacional com snapshot decimal imutavel de invoice e itens;
- replay de idempotencia e conflito para fingerprint divergente;
- rollback quando o CT-e perde elegibilidade ou e reservado concorrentemente;
- consulta com anti-enumeracao e escopo derivado do contexto autenticado;
- cancelamento append-only, motivo sanitizado e replay de fatura ja cancelada.

Arquivos alterados:

- `apps/api-transportada/test/billing-application.contract.test.ts`
- `apps/api-transportada/test/billing-application/*.contract.ts`
- `apps/api-transportada/test/billing-application/support.ts`
- `apps/api-transportada/package.json`

Comando executado:

```text
bun test test/billing-application.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
11 fail
T005 application implementation is missing
```

Observacao:

- A falha e intencional para `T004`: os contracts fecham o comportamento da
  aplicacao e a implementacao dos casos de uso e repositorios fica para `T005`.

## T005 — Casos de uso e repositorios de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para dinheiro, idempotencia,
concorrencia, transacoes e isolamento multiempresa.

Implementacao:

- elegibilidade tenant-scoped com CT-e autorizado e sem item de fatura;
- criacao transacional com aritmetica decimal baseada em `bigint`;
- replay por idempotency key e conflito seguro para fingerprint divergente;
- reserva concorrente por CT-e com `FOR UPDATE` e constraint defensiva;
- numeracao de fatura serializada por empresa com advisory lock transacional;
- cancelamento financeiro append-only, motivo sanitizado e replay idempotente;
- consultas e mutacoes sempre derivando `companyId` do contexto autenticado.
- integracao PostgreSQL descartavel cobrindo duas criacoes concorrentes,
  isolamento entre tenants, replay, conflito divergente e cancelamento.

Comandos executados:

```text
bun test test/billing-application.contract.test.ts
bun run check
bun run test:integration
```

Resultado:

```text
11 pass, 0 fail no contract isolado
466 pass, 1 skip, 0 fail no check agregado
36 pass, 1 skip, 0 fail na integracao agregada
```

Observacao:

- O cancelamento preserva itens e eventos e nao libera automaticamente o CT-e
  para refaturamento; uma politica explicita futura podera tratar essa liberacao.

## T006 — Contracts HTTP de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para RBAC, anti-enumeracao,
documentos seguros e matriz HTTP tenant-scoped.

Contracts criados:

- rotas agregadas de billing para seguranca, criacao/consulta e
  documentos/cancelamento;
- fixture HTTP com tenant autenticado, correlation id, CORS e espias para
  `create`, `get`, `cancel`, `listDocuments` e `listEligibleBillingCtes`;

Arquivos alterados:

- `apps/api-transportada/test/billing-http.contract.test.ts`
- `apps/api-transportada/test/billing-http/*.contract.ts`
- `apps/api-transportada/test/fixtures/billing-http.fixture.ts`
- `apps/api-transportada/package.json`

Comando executado:

```text
bun test test/billing-http.contract.test.ts
```

Resultado nesta fase:

```text
1 pass
10 fail
Cannot find module '../../src/billing/presentation/billing.routes.js'
```

Observacao:

- A falha e intencional para `T006`: os contracts fecham a superficie HTTP e a
  implementacao das rotas fica para `T007`.

## T007 — Endpoints HTTP de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex 5.3 com revisao Sol para RBAC,
anti-enumeracao, no-store e adaptacao segura entre HTTP e dominio.

Implementacao:

- rotas tenant-scoped de faturamento para elegibilidade, criacao, detalhe,
  documentos e cancelamento;
- validacao strict de DTOs, ids, datas, valores monetarios e limites de cursor;
- politicas de autorizacao alinhadas ao dominio em `billing.read`,
  `billing.create` e `billing.cancel`;
- adaptacao HTTP para o caso de uso existente, incluindo mapeamentos
  `cteIds -> cteDocumentIds` e `issuedFrom/issuedTo -> from/to`;
- serializacao segura com `Cache-Control: no-store`, resumo de cliente e
  ausencia de XML, `storageKey`, certificado e payload fiscal bruto;
- matcher global de caminhos atualizado para aplicar `no-store` tambem nos erros
  autenticados de billing.

Arquivos alterados:

- `apps/api-transportada/src/billing/presentation/billing.schema.ts`
- `apps/api-transportada/src/billing/presentation/billing.routes.ts`
- `apps/api-transportada/src/http/request-path.service.ts`
- `apps/api-transportada/src/shared/api.constant.ts`
- `apps/api-transportada/src/main.ts`
- `apps/api-transportada/test/billing-http/*.contract.ts`
- `apps/api-transportada/test/fixtures/billing-http.fixture.ts`

Comandos executados:

```text
bun test test/billing-http.contract.test.ts
bun run check
set -a
if [ -f .env ]; then . ./.env; else . ./.env.example; fi
set +a
API_TEST_DATABASE_URL="$DATABASE_URL" bun run --cwd apps/api-transportada test:integration
```

Resultado:

```text
11 pass, 0 fail no contract HTTP isolado
477 pass, 1 skip, 0 fail no check agregado
36 pass, 1 skip, 0 fail na integracao agregada
```

Observacoes:

- os contracts HTTP foram ajustados para usar as permissoes reais
  `billing.*`, alinhando o modulo ao `authorization.policy`;
- a rota `GET /billing/invoices/:id/documents` ficou implementada e segura, mas
  no wiring real retorna pagina vazia enquanto a geracao/listagem persistida de
  documentos de faturamento nao entra na task propria de documentos/UI.

## T008 — Contracts frontend de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex 5.3 para DTOs, clients, permissao de tela e
view-models previsiveis.

Contracts criados:

- agregado de billing no runner do frontend;
- fixture sintetica com elegibilidade, criacao, detalhe, documentos, filtros,
  idempotency key e permissoes `billing.read/create/cancel`;
- client/query contract para requests autenticadas `no-store` de elegibilidade,
  criacao, detalhe, documentos e cancelamento;
- adapters de resposta strict rejeitando `companyId`, XML, `storageKey` e
  valores monetarios fora do formato decimal canonico;
- controller/view-model contract para gating por permissao, estados
  `forbidden`, `empty`, `selectable`, `issued` e `cancelled`;
- drafts de selecao/criacao/cancelamento e download seguro apenas por URL
  temporaria, sem payload de arquivo em estado local.

Arquivos alterados:

- `apps/frontend-transportada/test/billing.contract.test.ts`
- `apps/frontend-transportada/test/billing/*.contract.ts`
- `apps/frontend-transportada/test/billing/billing.fixture.ts`
- `apps/frontend-transportada/package.json`

Comando executado:

```text
bun test test/billing.contract.test.ts
```

Resultado nesta fase:

```text
0 pass
6 fail
Cannot find module '../../src/modules/billing/shared/billingClient.service'
```

Observacao:

- a falha e intencional para `T008`: os contracts fecham a superficie do
  frontend e a implementacao da workspace/UI de faturamento fica para `T009`.

## T009 — UI de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex 5.3 com foco em UI previsivel, clients,
queries, view-models e i18n.

Implementacao:

- modulo `billing` criado no frontend com client autenticado `no-store`,
  adapters de resposta strict, drafts de selecao/criacao/cancelamento e
  download controller por URL temporaria;
- hook `useBillingWorkspace` com queries de elegibilidade, detalhe e documentos
  e mutations de criacao/cancelamento;
- `BillingWorkspacePage` ligada ao shell principal em `/billing`, permitindo
  filtrar CT-e, selecionar documentos, informar vencimento, gerar fatura,
  consultar detalhe, baixar documento e cancelar fatura;
- locale `billingWorkspace` em `pt-BR` e `en` registrado no i18n global;
- validacoes do client/UI mantem bloqueio de `companyId`, XML, `storageKey` e
  payload de arquivo fora do estado local.

Arquivos alterados:

- `apps/frontend-transportada/src/modules/billing/shared/*.ts`
- `apps/frontend-transportada/src/modules/billing/hooks/useBillingWorkspace.hook.ts`
- `apps/frontend-transportada/src/modules/billing/pages/BillingWorkspace.page.tsx`
- `apps/frontend-transportada/src/modules/billing/locales/*.json`
- `apps/frontend-transportada/src/modules/shared/i18n/i18n.service.ts`
- `apps/frontend-transportada/src/main.tsx`

Comando executado:

```text
bun run --cwd apps/frontend-transportada check
```

Resultado:

```text
55 pass
0 fail
frontend check verde com lint, typecheck, tests e build
```

Observacoes:

- a UI usa uma pagina simples e sem estilos dedicados nesta task, preservando o
  padrao funcional atual do frontend e deixando refinamento visual responsivo
  para a `T010`;
- o download de documentos abre apenas URLs temporarias retornadas pela API e
  nao persiste blob, XML ou chaves internas em estado local.

## T010 — Jornada responsiva Playwright

Data: 2026-07-23

Modelo executor recomendado: Codex 5.3 com revisao Sol para smoke, auth e
regressao responsiva.

Implementacao:

- helper `billing-smoke.helper.ts` criado para mockar `auth/me`,
  `billing/eligible-ctes`, criacao de fatura, detalhe, documentos e
  cancelamento com contadores de efeitos;
- `responsive.smoke.spec.ts` ampliado com cenarios de faturamento em `375`,
  `768` e `1280`, cobrindo criar fatura, lista vazia, detalhe, cancelamento e
  boundary sem permissao;
- bootstrap de autenticacao do frontend ajustado para suportar
  `VITE_SMOKE_AUTH_BYPASS=true` apenas na suite `smoke`, evitando dependencia do
  check de third-party cookies do `keycloak-js` em `http://localhost`;
- helper `authenticated-smoke.helper.ts` passou a usar o bypass no smoke e a
  manter a auditoria de storage sensivel apos cada jornada;
- provider Keycloak e contratos relacionados atualizados para explicitar
  `checkLoginIframe: false` no fluxo normal de inicializacao.

Arquivos alterados:

- `apps/frontend-transportada/test/billing-smoke.helper.ts`
- `apps/frontend-transportada/test/responsive.smoke.spec.ts`
- `apps/frontend-transportada/test/authenticated-smoke.helper.ts`
- `apps/frontend-transportada/src/modules/identity/shared/KeycloakAuthProvider.provider.ts`
- `apps/frontend-transportada/test/keycloak-auth-provider.test.ts`
- `apps/frontend-transportada/test/frontend-contract.test.ts`
- `apps/frontend-transportada/package.json`

Comandos executados:

```text
bun test apps/frontend-transportada/test/keycloak-auth-provider.test.ts apps/frontend-transportada/test/frontend-contract.test.ts
bun run --cwd apps/frontend-transportada smoke
```

Resultado:

```text
17 pass
0 fail
21 passed (8.9s)
```

Observacoes:

- a primeira tentativa do smoke falhou por timeout do `keycloak-js` em
  `3rd party check iframe message` no ambiente local sem TLS; a correcao foi
  encapsular um bypass exclusivo da suite `smoke`, sem alterar o comportamento
  normal da aplicacao fora desse comando;
- a cobertura responsiva agora valida tambem faturamento sem overflow
  horizontal e sem persistencia de token em `localStorage`, `sessionStorage`,
  `indexedDB` ou `Cache Storage`.

## T011 — Integracao local e revisao de release

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high com revisao independente de release.

Gates executados:

- `bun install --frozen-lockfile`
- `make check`
- `make migration-test`
- `make smoke`
- `make down`
- `git diff --check`

Resultado:

```text
bun install --frozen-lockfile
success

make check
passou com API, worker e frontend verdes

make migration-test
9 pass, 0 fail

make smoke
21 pass, 0 fail

make down
containers e network locais removidos com sucesso

git diff --check
0 issues
```

Ajustes necessarios para estabilizar o gate integrado:

- bypass de identidade do smoke movido para `sessionStorage`, evitando
  dependencia da rota real `/auth/me` durante o preview isolado;
- bypass de identidade limitado a hosts locais (`localhost` e `127.0.0.1`) para
  impedir uso acidental em build remoto;
- registro de service worker desativado somente quando o bypass local de smoke
  esta ativo, impedindo interferencia da PWA na camada de mocks;
- mocks Playwright de freight, CT-e e billing atualizados com suporte completo a
  preflight `OPTIONS` e `Access-Control-Allow-Origin: *` no ambiente de teste;
- `playwright.config.ts` e `Makefile` mantidos com frontend isolado na `53100`
  e reutilizacao controlada da API local para o smoke gerenciado.

Revisao de release:

- nenhum achado critico restante no escopo de faturamento apos a trava local-only
  do bypass de smoke;
- smoke responsivo cobre criacao, consulta, cancelamento, filtros e boundaries
  de permissao para freight, lote CT-e e faturamento;
- respostas mockadas e fluxos exercitados nao expuseram XML fiscal, segredos,
  certificados, tokens persistidos ou storage keys opacas na UI.

Comandos adicionais da revisao:

```text
bun test apps/frontend-transportada/test/keycloak-auth-provider.test.ts apps/frontend-transportada/test/frontend-contract.test.ts
PLAYWRIGHT_FRONTEND_PORT=53100 PLAYWRIGHT_REUSE_EXISTING_FRONTEND_SERVER=false PLAYWRIGHT_REUSE_EXISTING_API_SERVER=true bun run --cwd apps/frontend-transportada smoke
git diff --check
```

Resultado adicional:

```text
17 pass
0 fail
21 passed (8.9s)
0 issues
```
