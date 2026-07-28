# Plano técnico — Importação agendada de NF-e (cron dedicado)

## Contexto e premissas

Reaproveita todo o caminho da feature 005 (outbox → relay → consumer de
distribuição). O cron **não** consulta SEFAZ nem publica no RabbitMQ: ele apenas
escreve `nfe_imports` + `processing_outbox` por empresa elegível, em transação, e
o **relay outbox existente (worker) publica** em `nfe-distribution.v1`. O cron é
só-Postgres. Decisões arquiteturais em [ADR-0012](../../docs/adr/0012-scheduled-nfe-import-cron.md).

## Arquitetura e arquivos afetados

**Nova app `apps/cron-transportada`** (Bun puro, sem framework; espelha
convenções de `worker-transportada`):

```
apps/cron-transportada/
  src/
    main.ts                         # composition root: config → resolve job → run cycle → exit code
    config/environment.ts           # env validado (zod): DATABASE_URL, FISCAL_ENVIRONMENT, CRON_JOB, PAGE_SIZE
    runtime/run-cycle.ts            # advisory lock → dispatch job → release (finally)
    jobs/job-registry.ts            # id do job → runner
    jobs/nfe-distribution-pull/
      nfe-distribution-pull.job.ts  # descritor: JOB_ID = 'nfe.distribution.pull'
      application/select-eligible-companies.use-case.ts
      application/enqueue-distribution.use-case.ts   # tx: nfe_imports + processing_outbox
    database/
      companies.schema.ts           # CÓPIA (read): company_distribution_settings + certificado ativo + membership sintético
      nfe.schema.ts                 # CÓPIA (write): nfe_imports + triggered_by/automation_job
      processing.schema.ts          # CÓPIA (write): processing_outbox + triggered_by/automation_job
      distribution-cursor.schema.ts # CÓPIA (read): next_allowed_at por (companyId, environment)
    logging/cycle-logger.ts         # traceId por ciclo, formato [traceId][ts][cron-transportada]
  package.json                      # lista EXPLÍCITA de arquivos de teste
  test/
    nfe-distribution-pull/
      eligibility.contract.ts
      enqueue.contract.ts
      concurrency.contract.ts
```

**API (`apps/api-transportada`)** — migração + schema fonte:

- `src/database/nfe.schema.ts` — `triggered_by` + `automation_job` + CHECK de
  coerência (ator permanece NOT NULL).
- `src/database/processing.schema.ts` — idem para `processing_outbox`.
- `src/database/company-distribution-settings.schema.ts` (nova tabela) —
  `company_id` (PK/FK), `scheduled_distribution_enabled boolean NOT NULL DEFAULT false`.
- Provisionamento do **ator sintético**: `identity_users` de sistema (UUID fixo)
  - `user_company_memberships` ativo por empresa ao habilitar a distribuição
    (use-case idempotente).
- `drizzle/NNNN_*.sql` — migração + rollback ao lado.
- Ajustar inserts existentes (`request-nfe-import.use-case.ts`) para setar
  `triggered_by='user'` explicitamente.

**Worker (`apps/worker-transportada`)** — sincronizar cópia:

- `src/database/processing.schema.ts` e onde `nfe_imports` for lido/escrito.

## Contratos/API/eventos

- **Sem novo endpoint HTTP** e **sem novo envelope**: reusa
  `nfe-processing-envelope.schema.ts` e a exchange `nfe-distribution.v1`.
- O `processing_outbox` gravado pelo cron é idêntico ao gravado pela API para
  `source='distribution'`, exceto o ator (membership sintético) + colunas de
  origem (`triggered_by='automation'`, `automation_job`).
- Entrada do cron: argv/env `CRON_JOB=nfe.distribution.pull` (default único job
  hoje); `FISCAL_ENVIRONMENT` explícito.

## Dados, migration e rollback

DDL (esboço, uma migração):

```sql
-- nfe_imports (ator permanece NOT NULL)
ALTER TABLE nfe_imports ADD COLUMN triggered_by text NOT NULL DEFAULT 'user';
ALTER TABLE nfe_imports ADD COLUMN automation_job text;
ALTER TABLE nfe_imports ADD CONSTRAINT nfe_imports_origin_ck CHECK (
  (triggered_by = 'user'       AND automation_job IS NULL) OR
  (triggered_by = 'automation' AND automation_job IS NOT NULL)
);
-- processing_outbox (mesma forma; actor_user_id permanece NOT NULL)

-- flag de opt-in em tabela dedicada (company_settings não é tabela real)
CREATE TABLE company_distribution_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  scheduled_distribution_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- FK onDelete RESTRICT (estilo da casa: company_fiscal_profiles/view_preferences),
-- não CASCADE — company_id nunca é hard-deletado neste sistema.
```

- **Ator sintético (sem migração de nullabilidade):** um `identity_users` de
  sistema (UUID fixo) e um `user_company_memberships` ativo por empresa são
  provisionados ao habilitar a distribuição. As importações de automação
  referenciam esse ator → `requested_by_user_id`/`actor_user_id` continuam NOT
  NULL, FK composta e envelope `actorId: z.uuid()` intactos.
- **Não destrutiva:** linhas antigas recebem `triggered_by='user'` pelo default
  → CHECK satisfeito; nenhuma coluna existente muda de nullabilidade.
- **Rollback** ao lado: `DROP TABLE company_distribution_settings`, drop das
  constraints/colunas de origem; opcionalmente remover memberships sintéticos
  (seguro porque não há disparo de automação antes do cron rodar).
- `make migration-test` valida ida e volta em Postgres descartável.
- **Três cópias de schema** (API fonte, worker, cron) — sincronizar na mesma PR.

## Segurança e tenant

- `companyId` sempre do registro/seleção no banco; nunca de payload.
- Ambiente fiscal explícito por ciclo; homologação/produção nunca misturados.
- Elegibilidade falha fechada: sem certificado válido/`scheduled_distribution_enabled`/
  membership sintético → empresa pulada.
- Ator sintético é não-humano; consultas de usuários reais filtram o UUID de
  sistema conhecido. Ele não tem `external_identities` nem credencial Keycloak.
- Nunca logar certificado, senha ou XML; o cron nem carrega o certificado (isso
  é do consumer). XML não trafega.

## Idempotência e concorrência

- **Advisory lock:** `pg_try_advisory_lock(hashtext('cron:'||JOB_ID))` no início
  do ciclo; `pg_advisory_unlock` no `finally`. Segunda instância sai limpa.
- **Idempotência do enfileiramento:** `idempotency_key` derivada estável por
  empresa+ambiente+bucket-de-ciclo (bucket = timestamp agendado truncado à
  cadência), sob o unique `(company_id, idempotency_key)` de `nfe_imports` →
  dois ciclos sobrepostos não duplicam a mesma empresa.
- **Cooldown anti-656:** o cron pula empresas com `next_allowed_at > now`; o
  consumer reforça a janela ao processar (defesa em profundidade).
- Falha isolada por empresa (transação por empresa) não contamina o ciclo.

## Observabilidade

- `traceId` único por ciclo; logs `[traceId][timestamp][cron-transportada][JOB_ID]`.
- Contadores por ciclo: avaliadas, elegíveis, enfileiradas, puladas por cooldown,
  puladas por elegibilidade, falhas isoladas.
- Auditoria de horário: `nfe_imports.created_at` + cursor `next_allowed_at`.

## Estratégia de testes

Contract-first (teste antes da implementação), lista explícita no `package.json`
do cron:

- `eligibility.contract.ts` — seleção pula cooldown e sem-certificado; inclui só
  elegíveis.
- `enqueue.contract.ts` — grava `nfe_imports`+`processing_outbox` de automação
  (ator = membership sintético, `triggered_by='automation'`, `automation_job`
  correto) numa transação; idempotência bloqueia duplicado no mesmo bucket.
- `concurrency.contract.ts` — duas execuções, só uma obtém o advisory lock.
- Migração: `make migration-test` (ida/volta) + teste de CHECK (insert inválido
  falha) + `tenant-safety.contract` das queries novas.
- Regressão: consumer de distribuição inalterado (suite 005 verde).
- Gate: `make check` com as três cópias de schema sincronizadas.

## ADRs

- [ADR-0012](../../docs/adr/0012-scheduled-nfe-import-cron.md) — cron dedicado,
  advisory lock sem Redis, ator sintético do sistema + origem de automação.

## Riscos e mitigação

| Risco                                                      | Mitigação                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Divergência entre as 3 cópias de schema                    | sincronizar na mesma PR; `make check` + contract de schema                    |
| CHECK de origem quebra inserts existentes da API           | default `triggered_by='user'`; ajustar inserts explícitos; teardown em testes |
| Ator sintético não provisionado antes do enqueue           | opt-in provisiona membership; enqueue falha fechado sem ele                   |
| Enfileiramento duplicado em ciclos sobrepostos             | advisory lock + idempotency_key por bucket                                    |
| Cron enfileira empresa que perderá validade de certificado | consumer falha fechado (comportamento 005); cron só enfileira                 |
| Desvio do `cron.md` (Redis) mal compreendido em revisão    | ADR-0012 documenta e justifica                                                |
