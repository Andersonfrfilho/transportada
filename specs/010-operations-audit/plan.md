# Plano tecnico — Painel operacional e auditoria

## Contexto e premissas

- As features `005` a `009` ja produzem entidades, eventos e estados suficientes
  para uma visao operacional inicial.
- `ProcessingJob` e `AuditLog` aparecem no modelo de dominio como agregados
  transversais, mas ainda precisam de contratos executaveis para schema, API e
  frontend.
- Esta feature nao executa reprocessamento automatico; ela torna o estado
  observavel e auditavel.

## Arquitetura e arquivos afetados

Bounded contexts previstos:

- `apps/api-transportada/src/operations/`
  - consultas de dashboard, timeline e job status;
  - adapters para ler estados dos modulos existentes sem quebrar boundaries.
- `apps/api-transportada/src/audit/`
  - schema, repositorio e rotas de leitura de auditoria;
  - porta para eventos append-only de acoes criticas.
- `apps/frontend-transportada/src/modules/operations/`
  - dashboard operacional;
  - timeline;
  - job status;
  - auditoria com filtros.
- `apps/worker-transportada/src/operations/` somente se houver relay ou
  materializacao futura; a primeira versao deve preferir consultas na API.

## APIs previstas

- `GET /operations/summary`
- `GET /operations/timeline`
- `GET /operations/jobs`
- `GET /audit/events`

Permissoes iniciais:

- `operations.read` para painel, timeline e jobs;
- `audit.read` para auditoria;
- permissoes existentes continuam governando acoes nos modulos originais.

Todas as rotas autenticadas usam `no-store`, DTO strict, cursor validado e
anti-enumeracao cross-tenant.

## Dados, migration e rollback

Tabelas propostas:

- `processing_jobs`
  - `id`, `company_id`, `module`, `entity_type`, `entity_id`, `status`,
    `attempt_count`, `next_attempt_at`, `last_error_code`,
    `last_error_message`, `correlation_id`, timestamps e metadata segura.
- `audit_logs`
  - `id`, `company_id`, `actor_user_id`, `permission`, `action`, `target_type`,
    `target_id`, `result`, `correlation_id`, `reason`, `metadata`, `created_at`.

Indices essenciais:

- `processing_jobs(company_id, status, next_attempt_at)`;
- `processing_jobs(company_id, module, entity_type, entity_id)`;
- `audit_logs(company_id, created_at desc)`;
- `audit_logs(company_id, target_type, target_id, created_at desc)`;
- `audit_logs(company_id, correlation_id)`.

Rollback:

- remover rotas e consumidores de leitura primeiro;
- dropar indices novos;
- dropar tabelas transversais apenas se ainda nao usadas por outras features;
- preservar logs externos e objetos de storage.

## Regras de dominio

- Dashboard e timeline sao leitura; nao disparam efeitos externos.
- Eventos de auditoria sao append-only e nunca editados pela UI.
- Campos `metadata` devem aceitar apenas payload seguro e versionado.
- Mensagens de erro expostas sao curtas, sanitizadas e sem stack trace.
- Status de job usa estados do dominio: `pending`, `processing`, `succeeded`,
  `retry_scheduled`, `failed`, `dead_letter`, `cancelled`.

## Frontend

- Criar modulo `operations` com client, hooks, view models e paginas.
- Usar TanStack Query com polling configurado por tela e cancelamento automatico
  ao desmontar.
- UI deve ser densa e operacional:
  - filtros por periodo, modulo e status;
  - cards compactos de resumo;
  - tabela de jobs;
  - timeline vertical;
  - lista de auditoria paginada.
- Boundaries de permissao devem ser explicitos e sem vazamento de dados.

## Observabilidade

- Eventos/logs recomendados:
  - `operations.summary.viewed`;
  - `operations.timeline.viewed`;
  - `audit.events.viewed`;
  - `operations.job_status.viewed`.
- Logs devem conter `companyId`, `actorUserId`, `correlationId`, filtro
  sanitizado e contagem de resultados, sem payload fiscal.

## Estrategia de testes

- Contracts de schema para `processing_jobs` e `audit_logs`, tenant safety,
  indices, checks e ausencia de payload sensivel.
- Contracts de aplicacao para agregacao, timeline, auditoria, jobs, filtros e
  anti-enumeracao.
- Contracts HTTP para RBAC antes de parse pesado, DTO strict, no-store, cursor e
  erros seguros.
- Contracts frontend para clients, hooks, view models, polling, permissao e
  limpeza de estado sensivel.
- Smoke Playwright responsivo cobrindo dashboard autorizado, usuario sem
  permissao, timeline e auditoria.
- Gate final: `bun install --frozen-lockfile`, `make check`,
  `make migration-test`, `make dev` + `make smoke` + `make down`,
  `git diff --check`.

## Riscos

- Agregacoes podem ficar caras se consultarem muitos modulos sem indices
  adequados.
- Eventos historicos legados podem nao conter todos os campos esperados.
- Polling agressivo pode pressionar API/DB; definir intervalos conservadores.
- Auditoria pode acidentalmente carregar payload sensivel se nao houver
  sanitizacao centralizada.
