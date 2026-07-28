# Evidence — Importação agendada de NF-e (cron dedicado)

Referências: [spec.md](./spec.md) · [plan.md](./plan.md) · [tasks.md](./tasks.md) ·
[ADR-0012](../../docs/adr/0012-scheduled-nfe-import-cron.md).

---

## Fase 0 — Migração de dados (ator sintético + origem de automação)

### T001 — Contract de migração/origem (RED antes da DDL)

- Arquivo novo: `apps/api-transportada/test/nfe-schema/actor-origin.contract.ts`.
- Registrado no entrypoint `test/nfe-schema.contract.test.ts` (import da suíte).
- Afirma, de forma estática (drizzle `getTableConfig`):
  - `nfe_imports` e `processing_outbox` ganham `triggered_by text` (NOT NULL) e
    `automation_job text` (nullable);
  - o ator permanece NOT NULL (`requested_by_user_id` / `actor_user_id`);
  - CHECK de coerência `nfe_imports_origin_ck` / `processing_outbox_origin_ck`
    (`user` ⇒ `automation_job` nulo; `automation` ⇒ preenchido) — qualquer outro
    valor de `triggered_by` reprova a própria CHECK de coerência.
- Comportamento runtime de "insert viola CHECK" é coberto por T007
  (`make migration-test`); esta suíte é estática, coerente com o restante de
  `test/nfe-schema/`.

Saída (RED esperado, test-first):

```
(fail) NF-e automation origin schema > marks nfe_imports rows ... [triggered_by/automation_job ausentes]
(fail) NF-e automation origin schema > mirrors the origin discriminator on processing_outbox ...
 16 pass
 2 fail
```

Vermelho pelas colunas/CHECK ainda inexistentes — pronto para a DDL (T002/T003).

### T002 + T003 — DDL de origem (nfe_imports + processing_outbox)

- Schema fonte:
  - `src/database/nfe.schema.ts` — `NFE_ORIGIN_TRIGGERS`/`NfeOriginTrigger`;
    colunas `triggered_by text NOT NULL DEFAULT 'user'` e `automation_job text`;
    CHECK `nfe_imports_origin_ck`. Ator (`requested_by_user_id`) **permanece NOT NULL**.
  - `src/database/processing.schema.ts` — espelha `triggered_by`/`automation_job`
    - CHECK `processing_outbox_origin_ck`; `actor_user_id` **permanece NOT NULL**.
- Migração (única, combinada com T004 — "mesma migração" do plano):
  `drizzle/20260726200635_scheduled_nfe_automation_origin/migration.sql`
  (só-aditivo: `CREATE TABLE company_distribution_settings` + 4 `ADD COLUMN` +
  1 FK + 2 `ADD CONSTRAINT ... CHECK`).
- Rollback ao lado (`rollback.sql`): drop da tabela + CHECKs + colunas aditivas +
  remoção da entrada no journal (hash `33db0a486ee4…`); ator nunca tocado.
- Testes existentes ajustados às novas colunas: `imports.contract.ts` (lista
  exata + required sem `automation_job`), `processing.contract.ts` (idem);
  `static-migration.contract.ts` (nova migração registrada na lista esperada).

Runtime "insert viola CHECK" + linhas legadas recebendo `triggered_by='user'`
serão exercitados em T007 (`make migration-test`).

### T004 — Tabela de opt-in `company_distribution_settings`

- Schema novo: `src/database/company-distribution-settings.schema.ts`
  (`company_id` uuid PK/FK companies `onDelete restrict` — estilo da casa,
  igual a `company_fiscal_profiles`/`view_preferences`, não CASCADE;
  `scheduled_distribution_enabled boolean NOT NULL DEFAULT false`; timestamps).
- Agregado em `database.schema.ts` (`export *` + `databaseSchema`).
- Contract test novo: `test/fiscal-schema/company-distribution-settings.contract.ts`
  (registrado no entrypoint) — forma, PK, tipos, FK; não toca no agregador das
  seis tabelas fiscais nem na enumeração nfe (que exige FK `restrict`).
- Incluída na migração combinada acima.

Saída consolidada Fase 0 (T001–T004):

```
# bun run db:check
Everything's fine 🐶🔥
# bun test nfe-schema + fiscal-schema + database-migration + identity-schema
 38 pass · 1 skip · 0 fail · 506 expect() calls
# bun run typecheck
(clean)
```

### T005 — Ator sintético de sistema + provisionamento idempotente

- Constante: `src/identity/domain/system-distribution-actor.constant.ts` —
  `SYSTEM_DISTRIBUTION_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000006'`
  (distinto dos seeds locais, que vão até `…005`). Ator não-humano, sem
  `external_identities`/Keycloak; consultas de usuários reais devem excluí-lo.
- Port: `src/companies/application/enable-scheduled-distribution.port.ts` —
  `ScheduledDistributionUnitOfWorkPort` + transação com `ensureSystemActor`,
  `ensureCompanyMembership`, `enableScheduledDistribution`.
- Use-case: `src/companies/application/enable-scheduled-distribution.use-case.ts`
  — `execute({ companyId })` numa única transação: garante o `identity_users` de
  sistema (fixo), garante `user_company_memberships` ativo da empresa, liga
  `scheduled_distribution_enabled`. `companyId` do contexto, nunca de payload.
  Idempotência real (ON CONFLICT DO NOTHING) fica no repositório Drizzle, a ser
  criado quando o toggle for exposto (sem endpoint HTTP nesta feature — plan).
- Contract test: `test/companies/synthetic-actor.contract.ts` (entrypoint novo
  `test/companies.contract.test.ts`, registrado no `package.json`).

Saída (RED → GREEN):

```
# RED (use-case ainda inexistente)
error: Cannot find module '.../enable-scheduled-distribution.use-case.js'
 0 pass · 1 fail
# GREEN
 5 pass · 0 fail · 18 expect() calls
  ✓ provisiona ator de sistema + membership ativo + liga a flag
  ✓ idempotente — reexecução não duplica ator/membership
  ✓ um único ator de sistema compartilhado entre memberships por empresa
  ✓ provisiona só a empresa informada, nunca escopo maior
  ✓ rollback do ator e membership quando ligar a flag falha
# bun run typecheck
(clean)
```

⚠️ Não relacionado ao T005: a suíte completa da API acusa 3 falhas em
`digital-certificate-application` — refactor **não-commitado anterior** de
`DigitalCertificateRejectedError` (códigos granulares) ainda incompleto no
use-case. Fora do escopo da feature 011; não é regressão desta task.

### T006 — Inserts existentes marcam `triggered_by='user'` explícito

- `src/nfe-imports/infrastructure/drizzle-nfe-import.repository.ts`:
  - `createImport` → `.insert(nfeImports).values({ …, triggeredBy: 'user' })`.
  - `saveOutbox` → `.insert(processingOutbox).values({ …, triggeredBy: 'user' })`.
- `automation_job` permanece nulo nesses caminhos (usuário) → CHECK de coerência
  satisfeito. `queueRetry` é UPDATE de linha já criada — origem herdada, sem
  alteração. Nenhum outro ponto de escrita dessas tabelas na API (grep).

Saída:

```
# bun run typecheck
(clean)
# bun test nfe-import-application + nfe-schema + nfe-distribution-status + nfe-http
 56 pass · 0 fail · 405 expect() calls
```

### T007 — Migração ida+volta em Postgres descartável (validação ao vivo)

Base efêmera criada por script (mesmo `runDatabaseMigrations` do harness), grafo
mínimo de FK (company + identity_user + membership) para inserir linhas reais em
`nfe_imports`. 10/10 verificações:

```
  ✓ migração completa aplicou na base descartável (up)
  ✓ linha legada (sem triggered_by) recebe default 'user' + automation_job null → CHECK ok
  ✓ linha de automação (automation + automation_job) aceita
  ✓ automation sem automation_job → bloqueado (nfe_imports_origin_ck)
  ✓ user com automation_job preenchido → bloqueado (nfe_imports_origin_ck)
  ✓ requested_by_user_id nulo → bloqueado (not-null)
  ✓ company_distribution_settings default scheduled_distribution_enabled=false
  ✓ processing_outbox_origin_ck presente
  ✓ ator NOT NULL preservado (requested_by_user_id, actor_user_id)
  ✓ rollback (down) removeu tabela, colunas de origem e a entrada do journal
```

⚠️ O alvo `make migration-test` (bundle `db:test` = `database-migration.contract`

- `local-identity-seed.integration`) fica **vermelho por drift pré-existente e
  não-relacionado**: `LOCAL_IDENTITY_ROLES` foi expandido de `['viewer']` para os 5
  papéis no working tree, mas `local-identity-seed.integration.ts` ainda espera
  `[{ role: 'viewer' }]`. A migração da feature 011 em si passa ida+volta (acima).

---

## Fase 1 — Sincronizar cópias de schema (worker + cron)

### T008 — Cópia worker em paridade (`triggered_by` + `automation_job`)

- `apps/worker-transportada/src/database/processing.schema.ts` — `processingOutbox`
  ganha `triggered_by text NOT NULL` + `automation_job text` (estilo minimalista da
  cópia: sem default/`$type`/CHECK — o worker não roda migration nem insere aqui).
- `apps/worker-transportada/src/database/nfe.schema.ts` — `nfeImports` ganha
  `NFE_ORIGIN_TRIGGERS`/`NfeOriginTrigger` + `triggered_by` (`$type` + `.default('user')`)
  e `automation_job`, seguindo o estilo rico dessa cópia.
- Confirmado por grep: os dois repositórios do worker
  (`drizzle-nfe-distribution.repository.ts`, `drizzle-nfe-import-consumer.repository.ts`)
  só executam `.update(nfeImports)` — **nunca** `insert(nfeImports)`/`insert(processingOutbox)`;
  a origem é herdada da criação na API. Ator NOT NULL preservado.

Saída:

```
# bun run typecheck
(clean)
# bun run --cwd apps/worker-transportada test
 111 pass · 0 fail · 261 expect() calls (inclui nfe-distribution + outbox-relay)
```

### T009 — Scaffold `apps/cron-transportada`

- Estrutura nova (Postgres-only, sem RabbitMQ): `package.json` (deps
  `drizzle-provider`/`drizzle-orm`/`logger`/`zod`), `tsconfig.json` (NodeNext
  strict + `exactOptionalPropertyTypes`), `eslint.config.js` (espelho do worker).
- `src/config/cron.constant.ts` — `CRON_JOBS = ['nfe.distribution.pull']`,
  `CRON_FISCAL_ENVIRONMENTS`, `CRON_DEFAULT_PAGE_SIZE`/`CRON_MAX_PAGE_SIZE = 50`,
  `CRON_PROJECT_NAME = 'cron-transportada'`.
- `src/config/cron.types.ts` — `CronEnvironment` + `CronLogger`.
- `src/config/environment.schema.ts` — `parseCronEnvironment` (zod) valida
  `DATABASE_URL` (protocolo postgres), `FISCAL_ENVIRONMENT`, `CRON_JOB` (enum),
  `PAGE_SIZE` (coerce int 1..50, default 50), `LOG_LEVEL`, `APP_ENV`;
  `CronConfigurationError` genérico (não vaza credencial). Nome segue a
  convenção da casa (`.schema.ts`, igual a api/worker) em vez do literal
  `environment.ts` do plano.
- `src/logging/cycle-logger.service.ts` — `createCronLogger` +
  `createCycleContext`/`runWithCycleContext` produzindo a máscara
  `[traceId][ts][cron-transportada][JOB_ID]` (JOB_ID no trace stack), via
  `@adatechnology/logger`.
- `src/main.ts` — entrypoint mínimo de scaffold (parse env + logger). Lógica de
  ciclo/advisory-lock fica em T016.
- Root `package.json` liga o cron nos scripts `build`/`lint`/`test`/`typecheck`.

Saída:

```
# bun run --cwd apps/cron-transportada typecheck
(clean)
# lint
(clean)
# build
Bundled 4 modules — main.js 2.38 KB
# test ./test/environment.contract.test.ts
 5 pass · 0 fail · 5 expect() calls
```

### T010 — Cópias de schema do cron (paridade com a API)

Cópias standalone em `apps/cron-transportada/src/database/` (colunas + defaults +
`$type`, **sem** FK/CHECK/unique — estilo do worker; o cron não roda migration):

- `nfe.schema.ts` — `nfe_imports` (write do enqueue): `triggered_by`/`automation_job`
  - `NFE_IMPORT_SOURCES`/`NFE_ORIGIN_TRIGGERS`/`NFE_IMPORT_STATUSES`.
- `processing.schema.ts` — `processing_outbox` (write do enqueue):
  `triggered_by`/`automation_job` + `PROCESSING_EVENT_TYPES`.
- `company-distribution-settings.schema.ts` — read do opt-in.
- `distribution-cursor.schema.ts` — `nfe_distribution_cursors` (read do cooldown
  `next_allowed_at`), PK composta (company, environment).
- `identity.schema.ts` — companies + identity_users + user_company_memberships
  (membership sintético para leitura; alvos de FK do insert de automação).
- `digital-certificate.schema.ts` — read de `status` + janela (`valid_from`/
  `expires_at`) para elegibilidade "certificado válido"; **`secret_envelope`
  nunca é copiado/selecionado pelo cron** (só precisa de status+validade).

Duas cópias além da lista literal do plano (`identity`, `digital-certificate`)
foram necessárias para as regras de elegibilidade de T011 — registradas aqui.
A verificação de paridade real (insert/select nas colunas contra o banco migrado)
acontece nos contracts da Fase 2 (T011–T013) e na integração T017.

Saída:

```
# bun run --cwd apps/cron-transportada typecheck
(clean)
# lint
(clean)
# test
 5 pass · 0 fail
```

---

## Fase 1 concluída (T008–T010)

Três cópias de schema sincronizadas: worker (`processing`+`nfe_imports`) e cron
(6 tabelas). App `cron-transportada` scaffoldado (Postgres-only) e ligado aos
gates do root.

---

## Fase 0 concluída (T001–T007)

Migração de dados fechada: discriminador de origem + ator sintético + opt-in,
tudo numa migração combinada não-destrutiva com rollback guardado.

**Bloqueios pré-existentes no working tree (não da 011) — corrigidos por decisão
do usuário ("Eu corrijo os dois"), antes dos gates finais T019:**

1. `digital-certificate-application` — refactor não-commitado de
   `DigitalCertificateRejectedError` vazava códigos granulares (`CERTIFICATE_INVALID`,
   `DIGITAL_CERTIFICATE_CNPJ_MISMATCH`, `CERTIFICATE_VALIDATION_FAILED`) como `code`
   ao cliente, ferindo o contrato de segurança `expectRejectedWithoutEnumeration`.
   Corrigido: construtor de `DigitalCertificateRejectedError` volta a no-arg
   (`code: 'DIGITAL_CERTIFICATE_REJECTED'` genérico); os 3 `throw` do use-case
   voltam a `new DigitalCertificateRejectedError()`. `DigitalCertificateProfileMissingError`
   (novo, usado) preservado. Verif.: `bun test digital-certificate-application +
digital-certificates-http` → 50 pass / 0 fail; typecheck limpo.
2. `local-identity-seed.integration` — teste esperava `[{ role: 'viewer' }]` mas o
   seed expandiu `LOCAL_IDENTITY_ROLES` para 5 papéis. Corrigido: expectativa
   derivada de `LOCAL_IDENTITY_ROLES` (ordenado asc). Verif.: `make migration-test`
   (`database-migration.contract` + `local-identity-seed.integration`) → 9 pass / 0 fail.

---

## Fase 2 — Job de puxada (lógica pura, contract-first)

### T011 — Contract de elegibilidade (RED antes do use-case)

- Novo: `apps/cron-transportada/test/nfe-distribution-pull/eligibility.contract.ts`
  - entrypoint `test/nfe-distribution-pull.contract.test.ts` (registrado no
    `package.json`). 11 casos: inclui elegível; carrega `environment` no resultado;
    pula cooldown (`next_allowed_at > now`) e inclui cooldown já vencido; pula flag
    `false`; pula sem certificado ativo (retired/ausente) e fora da janela
    (expirado/ainda-não-válido no instante do ciclo); pula sem membership sintético;
    pula empresa `disabled`; mistura → só elegíveis.
- RED antes de T014 (módulo `select-eligible-companies.use-case` ausente) → GREEN
  depois: **11 pass / 0 fail**.

### T012 — Contract de enqueue (RED antes do use-case)

- Novo: `test/nfe-distribution-pull/enqueue.contract.ts` + entrypoint. 5 casos:
  plano de automação (import `source=distribution`/`triggered_by=automation`/
  `automation_job=nfe.distribution.pull`/`requested_by=ator sintético`/
  `status=queued`; outbox `event_type=transportada.nfe.distribution.requested`/
  `aggregate_type=nfe_import`); coerência
  `import.id === outbox.aggregate_id === outbox.payload.importId`, `event_version=1n`,
  `received_count=0n`; `idempotency_key` derivada do bucket (empresa+environment+
  cadência) e gravada no import; duplicado no mesmo bucket → `enqueued=false` (um só
  plano); bucket vira → key nova.
- RED antes de T015 → GREEN depois: **5 pass / 0 fail**.

### T013 — Contract de concorrência (RED antes do wiring)

- Novo: `test/nfe-distribution-pull/concurrency.contract.ts`. Duas execuções
  simultâneas, só uma obtém `pg_try_advisory_lock`; a outra sai limpa (exit 0, zero
  enfileiramentos); ciclos sequenciais ambos adquirem (2º é duplicado idempotente);
  falha isolada por empresa não derruba o ciclo.
- RED antes de T016 → GREEN depois: **3 pass / 0 fail** (suíte cron 24/24).

### T014 — `select-eligible-companies` (use-case + port + policy)

- `application/select-eligible-companies.use-case.ts` + `.port.ts` +
  `domain/distribution-eligibility.policy.ts` — predicado puro de elegibilidade
  (empresa ativa + flag + membership sintético + certificado ativo na janela + fora
  do cooldown) sobre candidatos do `DistributionCandidateSourcePort`; devolve
  `{companyId, environment}` só dos elegíveis. `companyId` **sempre da fonte
  (banco)**, nunca de payload.
- Verif.: typecheck + lint limpos, **11/11 pass** (T011 verde).

### T015 — `enqueue-distribution` (use-case + port + policies)

- `application/enqueue-distribution.use-case.ts` + `.port.ts` +
  `domain/{distribution-pull.constant,distribution-idempotency.policy,system-distribution-actor.constant}.ts`
  — monta o `DistributionEnqueuePlan` (import + outbox de automação, ator sintético
  `…006`, `payload.importId=import.id`, espelhando o `saveOutbox` da API:
  `aggregate_type=nfe_import`, `event_version=1n`, envelope `{importId}`), delega ao
  `DistributionEnqueueGatewayPort.persist`. `idempotency_key` truncada à cadência
  (`Math.floor(now/bucketMs)*bucketMs`), `requestFingerprint=idempotencyKey`.
- Verif.: **5/5 pass**, typecheck + lint limpos (T012 verde).

### T016 — Wiring do ciclo + adapters Drizzle

- `nfe-distribution-pull/{run-cycle.ts,job-registry.ts,nfe-distribution-pull.job.ts}`
  - `main.ts` + `infrastructure/{drizzle-advisory-lock,drizzle-distribution-candidate.source,drizzle-distribution-enqueue.gateway,crypto-identifiers}.ts`.
- Advisory lock de sessão via `pg_try_advisory_lock(hashtextextended('cron:'||JOB_ID,0))`,
  `pg_advisory_unlock` no `finally`; conexão fixada em `max:1` (o lock atravessa as
  transações por empresa). Source lê
  `company_distribution_settings ⋈ companies ⋈ membership(ator …006) ⋈ certificado
ativo ⋈ cursor(ambiente)` e loga `evaluatedCount`. Gateway insere import+outbox
  numa transação e captura `23505` → `enqueued=false` (skip idempotente). `main` roda
  o ciclo dentro do trace de ciclo; exit 1 só se `failedCount>0`.
- Verif.: typecheck + lint limpos, **suíte cron 24/24 pass** (T013 verde).

---

## Fase 3 — Integração, gates e infra

### T017 — Regressão relay→consumer (origem de automação, "sem alteração")

- Bloco `automation-origin distribution regression (T017)` em
  `apps/worker-transportada/test/outbox-relay.contract.test.ts`: linha de outbox de
  automação (ator sintético `…006`, `event_type=transportada.nfe.distribution.requested`,
  `aggregate_id=importId`) é reivindicada + publicada pelo relay **sem alteração** na
  topologia de distribuição, e o envelope resultante passa no gate exato do consumer
  (`nfeProcessingEnvelopeV1Schema.parse` + `type=distribution.requested`,
  `payload.importId=aggregateId`). O relay ignora `triggered_by`/`automation_job`
  (seleciona colunas explícitas) → nenhuma mudança no relay/consumer é necessária.
- Verif.: worker typecheck + lint limpos, **suíte contract worker 112/112 pass**.

### T018 — Manifesto K8s CronJob

- `deploy/cron/nfe-distribution-pull.cronjob.yaml` — ConfigMap
  `cron-transportada-config` + CronJob `cron-transportada-nfe-distribution-pull`.
  `CRON_JOB=nfe.distribution.pull`, `schedule "0 * * * *"` espelhando
  `CADENCE_MINUTES=60` (regra de coerência em spec.md → "## Configuração e cadência"),
  `timeZone America/Sao_Paulo`, `concurrencyPolicy Forbid` + `backoffLimit 0` +
  `restartPolicy Never`. `DATABASE_URL` **só via `secretKeyRef`** (nunca em ConfigMap
  nem log). Hardening: `runAsNonRoot`/10001, `readOnlyRootFilesystem`,
  `allowPrivilegeEscalation false`, `drop: ["ALL"]`, seccomp `RuntimeDefault`.
- Verif.: `Bun.YAML.parse` (2 docs OK) + lint offline de invariantes:

```
manifest lint OK — 2 docs, all invariants pass
```

(kubeconform/kubectl dry-run é o linter de CI pretendido; indisponível offline,
cluster inacessível.)

### T019 — `make check` completo (gate total verde)

```
MAKE_CHECK_EXIT=0
# format:check   → All matched files use Prettier code style! (após `bun run format`)
# lint           → api + worker + cron + frontend limpos (--max-warnings=0)
# typecheck      → 4 apps limpos (tsc --noEmit)
# test           → root 6 · api 486 (39 files) · worker 112 · cron 24 · frontend 109 · 0 fail
# build          → api + worker + cron + frontend (vite + PWA) ok
```

Três cópias de schema (`api/src/database`, `worker/src/database`,
`cron/src/database`) sincronizadas — paridade validada pelo typecheck + suítes.

**Bloqueios pré-existentes de WIP não commitado no frontend (fora da 011) —
corrigidos por decisão do usuário ("Corrigir os 3 erros do frontend"):**

1. `companySettingsClient.service.ts:12` — import `CompanyProfileLookupResponse` não
   usado (já re-exportado por `export … from`). Removido do bloco `import type`.
2. `CompanySettingsForm.component.tsx:118` — `no-misused-promises`: handler async
   em atributo `() => void`. Envolvido em `() => void lookupProfile()`.
3. `keycloak-auth-provider.test.ts:86` — regressão: `logout()` não chamava
   `clearToken`. `KeycloakAuthProvider.provider.ts#logout` passa a limpar o token
   local antes de redirecionar ao endpoint de logout do Keycloak.

---

## Feature 011 concluída

Puxada agendada de NF-e (Distribuição DF-e) entregue como app cron dedicado
(`apps/cron-transportada`, Postgres-only, sem RabbitMQ/Redis): o cron só
**enfileira** (import + outbox de automação numa transação, idempotente por bucket
de cadência via advisory lock + unique `(company_id, idempotency_key)`); o outbox
relay e o consumer de distribuição existentes processam **sem alteração**. Migração
de origem de automação + ator sintético não-destrutiva com rollback guardado.
Manifesto K8s revisável (segredo referenciado, nunca commitado). Gate total
`make check` verde. Nada commitado — aguardando pedido explícito do usuário.
