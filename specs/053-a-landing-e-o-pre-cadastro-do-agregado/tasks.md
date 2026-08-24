# 053 — A landing genérica e o pré-cadastro do agregado · tasks

## Fase 0 — Decisão registrada

> 🤖 Modelo: `opus` 🧠

### T001 🧠 — ADR-0041: o SDK de usuário entra pela landing

Adoção parcial de `@adatechnology/user-module`/`user-contracts`/`user-ui`, com os sete pontos da
auditoria e o motivo de o `identity` do painel não mudar. Registra também o app novo, a configuração
runtime em vez de `VITE_*`, `landing_settings` por raiz de CNPJ, e a exceção declarada de
"configuração perto do efeito" para a aba Site.

- **Arquivos:** `docs/adr/0041-a-landing-e-generica-e-o-sdk-entra-por-ela.md`
- **Aceite:** revisão humana
- **Verificação:** —

## Fase 1 — A configuração da landing

> 🤖 Modelo: `sonnet` (T002 e T004 são 🧠 — migration e rota anônima)

### T002 🧠 — `landing_settings` por raiz de CNPJ

`cnpj_root` como PK (`CNPJ_ROOT_PATTERN`), marca, contatos, cor de destaque em hex, seções em JSONB
com CHECK de forma, e `updated_at`. Sem linha, o produto serve o padrão — a ausência é caso normal,
não erro.

- **Arquivos:** `drizzle/<ts>_landing_settings/` (migration + `rollback.sql`),
  `src/database/landing.schema.ts` (novo), `database.schema.ts`
- **Aceite:** `test/landing-schema/settings.contract.ts` (novo),
  `test/database-migration/static-migration.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`, `make migration-test`

### T003 — A raiz do CNPJ resolve o grupo

`resolveCompanyGroupRoot` em `shared/tax-id.service.ts` a partir de `company_fiscal_profiles.cnpj`, e
`listGroupUnits` devolvendo as empresas da mesma raiz com nome, endereço e telefone.

- **Arquivos:** `src/shared/tax-id.service.ts`, `src/landing/domain/company-group.policy.ts` (novo),
  `src/landing/infrastructure/drizzle-company-group.repository.ts` (novo)
- **Aceite:** `test/landing-domain/company-group.contract.ts` (novo) — raiz alfanumérica, matriz
  `0001` primeiro, uma empresa só devolve lista de um
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T004 🧠 — As rotas públicas e a aba Site

`GET /public/landing-settings` (anônima, cacheável, marca + unidades + seções) e
`GET /public/landing-logo` (anônima, `ETag` do `sha256` já gravado em `company_logos`,
`cache-control` público — ao contrário da rota do painel, que é `no-store`).
`GET`/`PUT /company-settings/landing` sob `settings.manage`, escopo `company`.

O texto e a cor são **sanitizados na escrita**: hex validado, texto puro, sem marcação além de
`*`/`_`.

- **Arquivos:** `src/landing/presentation/landing.{routes,schema}.ts` (novos),
  `src/companies/presentation/company-logo.routes.ts` (rota pública irmã),
  `src/http/router.service.ts` (allowlist anônima), `docs/SECURITY.md`
- **Aceite:** `test/landing-http/public-settings.contract.ts` (novo),
  `test/identity-http/anonymous-routes.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 2 — A candidatura

> 🤖 Modelo: `sonnet` (T005 é 🧠 — migration)

### T005 🧠 — A tabela da candidatura

`aggregate_applications` com `company_id` (a unidade escolhida), dados declarados, estado, revisão e
`driver_id` anulável. Para a checagem de existência: `duplicate_driver_id` (FK anulável para
`fleet_drivers`), `resubmitted_at` e `latest_submission` (JSONB anulável, o reenvio que não virou
linha). Unique parcial `(company_id, tax_id) where status = 'pending'`. CHECK de estado,
de documento (`CPF_PATTERN`/`CNPJ_PATTERN` de `shared/tax-id.service.ts`) e de `rejection_reason`
exigido em `rejected`.

- **Arquivos:** `drizzle/<ts>_aggregate_applications/`, `src/database/fleet.schema.ts`,
  `database.schema.ts`
- **Aceite:** `test/fleet-schema/aggregate-applications.contract.ts` (novo),
  `test/fleet-schema/tenant-safety.contract.ts`, `test/database-migration/static-migration.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`, `make migration-test`

### T006 — Domínio e use cases

`submit`, `list`, `approve`, `reject`. `approve` chama o use case de `POST /fleet/drivers` na mesma
transação — sem segundo caminho de criação de motorista. A unidade enviada é validada contra a raiz
do grupo: candidatura não entra em empresa de outra raiz.

`submit` faz a **checagem de existência** antes de gravar, na mesma transação:
`aggregate-application-duplicate.policy.ts` resolve candidatura aberta (reenvio: atualiza
`resubmitted_at` e `latest_submission`, não insere), documento já motorista na raiz do grupo
(`duplicate_driver_id`) e, quando a Fase 5 existir, conta de landing pelo e-mail. Duplicado **nunca**
recusa sozinho e **nunca** muda a resposta — quem decide é o operador, e o `202` é invariável.
`approve` com `duplicate_driver_id` vincula à ficha existente em vez de criar outra.

- **Arquivos:** `src/fleet/domain/aggregate-application.{policy,error}.ts`,
  `src/fleet/domain/aggregate-application-duplicate.policy.ts` (novo),
  `src/fleet/application/aggregate-applications.use-case.ts`, `fleet.port.ts`,
  `src/fleet/infrastructure/drizzle-aggregate-application.repository.ts`, `main.ts`
- **Aceite:** `test/fleet-application/aggregate-applications.contract.ts` (novo) — reenvio não
  duplica linha, documento de motorista existente marca sem recusar, aprovar duplicado vincula,
  duas aprovações concorrentes perdem no `INSERT` e não na conferência
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T007 — As rotas da candidatura

`POST /public/aggregate-applications` (anônima, `202` invariável — inclusive quando o documento já é
conhecido; **não** existe rota pública de "este documento já existe", que seria a sonda que o `202`
fecha) e `GET /aggregate-applications`,
`POST /aggregate-applications/{id}/approve|reject` (`fleet.manage`, escopo `company`).

- **Arquivos:** `src/fleet/presentation/aggregate-application.{routes,schema}.ts`,
  `src/http/router.service.ts`, `docs/SECURITY.md`
- **Aceite:** `test/fleet-http/aggregate-applications.contract.ts` (novo)
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 3 — A landing

> 🤖 Modelo: `sonnet` (T008 é 🧠 — app novo, CSP e build)

### T008 🧠 — `apps/frontend-landing` sobe

Vite 7 + React 19, PWA, tokens copiados de `frontend-transportada/src/styles/index.css`, CSP gerada no
build com o mesmo plugin fail-closed, `Dockerfile` com `ARG VITE_APP_ENV`, entrada no `Makefile`, nos
scripts da raiz e no `deploy.yml`.

- **Arquivos:** `apps/frontend-landing/**`, `package.json` da raiz, `Makefile`,
  `.github/workflows/deploy.yml`
- **Aceite:** `test/shared/content-security-policy.contract.ts`,
  `test/shared/deployment-environment.contract.ts` (cópias no app novo)
- **Verificação:** `bun run --cwd apps/frontend-landing test`, `bun run build`

### T009 — A configuração chega em runtime

`useLandingSettings.query.ts` sobre `GET /public/landing-settings`, com o padrão dos `*.locale.json`
quando não há linha. A cor vira `--color-accent` em `:root`; hex inválido cai no token padrão.

- **Arquivos:** `src/modules/shared/landingSettings.{service,validation}.ts`,
  `src/modules/shared/useLandingSettings.query.ts`
- **Aceite:** `test/shared/landing-settings.contract.ts` (novo) — sem literal de cliente em `src/`,
  ausência de configuração não quebra a página, cor inválida não vaza para o CSS
- **Verificação:** `bun run --cwd apps/frontend-landing test`

### T010 — As seções institucionais

Herói, o que a transportadora oferece, requisitos, "Onde estamos" (uma unidade por filial) e a chamada
para o formulário. Texto configurado, com o padrão acentuado nos locales. Renderização por
`createElement` — `dangerouslySetInnerHTML` não aparece no app.

- **Arquivos:** `src/modules/landing/**`, locales
- **Aceite:** `test/landing/section-rendering.contract.ts` (novo),
  `test/shared/locale-accents.contract.ts` (cópia no app novo)
- **Verificação:** `bun run --cwd apps/frontend-landing test`

### T011 — O formulário de pré-cadastro

Campos com os tokens `--field-*`, máscara de CPF/CNPJ e telefone, e o select de **Unidade** oculto
quando a raiz tem uma empresa só. **O CEP é digitado**: `GET /postal-codes/{cep}` exige
`addresses.read` e escopo de empresa, e abri-la a anônimo entregaria a varredura da base de endereços
oito dígitos por vez — exatamente o que a ADR-0040 evitou. Envio anônimo, agradecimento
indistinguível por documento.

Aqui a entrega já é completa para o cliente: o candidato se pré-cadastra e o operador aprova, sem
nenhuma conta de landing existir.

- **Arquivos:** `src/modules/application/**`, `shared/landingClient.service.ts`
- **Aceite:** `test/application/pre-registration-form.contract.ts` (novo),
  `test/design-system/field-metrics.contract.ts`
- **Verificação:** `bun run --cwd apps/frontend-landing test`

## Fase 4 — O painel

> 🤖 Modelo: `sonnet`

### T012 — A aba Site em configurações

Formulário da marca, upload de logo reusando `PUT /company-settings/logo`, seletor de cor e os textos
de seção, com link de pré-visualização. Entra em `SETTINGS_PANEL_PLACEMENT` com a exceção anotada.

- **Arquivos:** `frontend-transportada/src/modules/company-settings/**`,
  `company-settings/shared/companySettingsTabs.service.ts`
- **Aceite:** `test/company-settings/tabs.contract.ts`,
  `test/company-settings/landing-panel.contract.ts` (novo)
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T013 — A aba Candidaturas na Frota

Tabela pelo contrato de `docs/frontend/data-tables.md`, com aprovar e recusar. Aprovar abre a ficha já
preenchida pela candidatura; recusar exige motivo. Linha com `duplicate_driver_id` leva o distintivo
**"já cadastrado"** com link para a ficha, e ali aprovar diz **vincular** — é o único lugar do produto
onde a colisão de documento é mostrada, porque é o único lado autenticado dela. Reenvio aparece pelo
`resubmitted_at`, com os dados novos ao lado dos gravados.

- **Arquivos:** `frontend-transportada/src/modules/fleet/**`
- **Aceite:** `test/fleet/aggregate-applications-tab.contract.ts` (novo),
  `test/shared/mutation-invalidation.contract.ts`
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

## Fase 5 — O SDK de usuário da landing

> 🤖 Modelo: `sonnet` (T014 é 🧠 — schema e sessão paralelos ao `identity`)

Esta fase vem por último de propósito. O pré-cadastro já funciona inteiro sem login nenhum, então o
único risco de infraestrutura da spec — um segundo depósito de usuário no mesmo Postgres (ADR-0041,
item 7) — não bloqueia a entrega que o cliente vê. Se ela escorregar, o que já está de pé continua
servindo.

### T014 🧠 — `user-module` montado em schema próprio

`createUserModule` com `tenancy` por empresa, `passwordReset` apontando para a landing e e-mail pelo
`@adatechnology/email-provider` já instalado. Rotas sob prefixo próprio pelo adaptador
`@adatechnology/user-module/http/fetch`, montadas no `Bun.serve` existente. `runUserMigrations` roda
no mesmo passo de migration da API, **nunca no boot**.

- **Arquivos:** `apps/api-transportada/package.json` (3 dependências novas),
  `src/landing-identity/` (composição), `src/config/environment.schema.ts`, `main.ts`
- **Aceite:** `test/landing-identity/user-module-mount.contract.ts` (novo) — schema `user` isolado,
  rotas do SDK fora do prefixo do painel, `identity` intocado
- **Verificação:** `bun run --cwd apps/api-transportada test`, `make migration-test`

### T015 — A candidatura casa com a conta da landing

`aggregate_applications.landing_user_id` e `GET /landing/my-application`, autenticada pela sessão do
SDK — o interessado vê a própria candidatura e só ela.

- **Arquivos:** migration, repositório, `aggregate-application.routes.ts`
- **Aceite:** `test/fleet-http/aggregate-applications.contract.ts` (caso negativo de vazamento)
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T016 — Conta e acompanhamento, com o SDK headless

`UserProvider`, `useSignIn`, `usePasswordReset` e `useProfile` de `@adatechnology/user-ui`. **Nenhum
componente renderizado do pacote** — os campos são nossos.

- **Arquivos:** `apps/frontend-landing/package.json`, `src/modules/account/**`
- **Aceite:** `test/account/sdk-headless-only.contract.ts` (novo) — varre `src/**/*.tsx` e falha se
  algum export renderizado de `@adatechnology/user-ui` for importado
- **Verificação:** `bun run --cwd apps/frontend-landing test`

## Gate final

`make check` · `make migration-test` · `make smoke` · evidência em `evidence.md`.

## Depois desta spec

**054 — a filial existe.** Criar empresa irmã por raiz de CNPJ e trocar de empresa na sessão. Hoje
`PROVISION_COMPANY_ID` é singular, `POST /companies` não existe, `companies.manage` está reservada
sem consumidor, e o token carrega uma empresa só. A 053 desenha para filial e funciona com uma
empresa; a 054 é quem a torna criável.
