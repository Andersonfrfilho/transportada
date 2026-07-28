# ADR-0012: Importação agendada de NF-e via cron dedicado

## Contexto

A distribuição DF-e (feature 005) só é disparada sob demanda por um usuário
autenticado com `invoices.import`. Não há puxada recorrente: NF-e emitidas
contra o CNPJ da transportadora só entram quando um operador aciona
manualmente. A feature 011 introduz uma puxada agendada, sem usuário logado.

Três forças de contexto restringem a solução:

1. **Constituição do projeto proíbe Redis/BullMQ.** A regra global `cron.md`
   pede lock distribuído via Redlock/Redis — incompatível aqui.
2. **O schema exige ator com membership.** `nfe_imports.requested_by_user_id` e
   `processing_outbox.actor_user_id` são NOT NULL com FK composta para
   `user_company_memberships`; o envelope `nfe-processing-envelope.schema.ts`
   valida `actorId: z.uuid()` obrigatório na publicação pelo relay. Um disparo
   sem ator violaria a FK **e** a validação Zod do envelope.
3. **Já existe um caminho transacional idempotente** (outbox + relay + consumer
   de distribuição) que não deve ser duplicado nem contornado.

## Decisão

- **App cron dedicado** `apps/cron-transportada`, executado por **K8s CronJob**
  (um ciclo por invocação, stateless), estruturado como **host de múltiplos
  jobs**; cada job tem um identificador de tipo estável (primeiro:
  `nfe.distribution.pull`).
- **Sem RabbitMQ no cron.** O ciclo escreve, em transação, `nfe_imports` +
  `processing_outbox` por empresa elegível. O **relay outbox existente publica**
  em `nfe-distribution.v1`; o consumer de distribuição processa sem alteração.
  O cron é, portanto, **só-Postgres**.
- **Lock distribuído via `pg_try_advisory_lock`** com chave derivada do tipo de
  job — garante uma execução por ciclo sem Redis. Complementado, no
  processamento, pelo lease existente por `(companyId, environment)` do cursor.
- **Ator sintético do sistema (por empresa).** Em vez de relaxar o schema,
  cada empresa com distribuição habilitada recebe um **membership sintético
  ativo** — um `identity_users` de sistema (UUID fixo, sem `external_identities`,
  sem credencial Keycloak) vinculado por `user_company_memberships` à empresa.
  As importações de automação usam esse ator: `requested_by_user_id`/
  `actor_user_id` permanecem **NOT NULL**, a FK composta permanece intacta e o
  envelope `actorId: z.uuid()` é satisfeito sem alteração — nenhuma migração de
  nullabilidade.
- **Discriminador de origem para auditoria.** Novas colunas `triggered_by`
  (`user`|`automation`, default `user`) e `automation_job` distinguem disparo
  humano de automação e **qual** automação, sem depender de inferir pelo id do
  ator. Um CHECK garante coerência (`automation` ⇒ `automation_job` preenchido;
  `user` ⇒ `automation_job` nulo). Sem impacto na nullabilidade do ator.
- **Provisionamento acoplado ao opt-in.** Habilitar
  `company_distribution_settings.scheduled_distribution_enabled` provisiona (de
  forma idempotente) o membership sintético da empresa; o ciclo do cron só
  considera empresas cujo membership sintético já existe.

## Consequências

- Migração adiciona `triggered_by`+`automation_job`+CHECK em `nfe_imports` e
  `processing_outbox` na API **e** na cópia de schema do worker
  (`processing.schema.ts`); cria a tabela `company_distribution_settings`; o
  cron mantém uma **terceira cópia** das tabelas que lê/escreve. Divergência de
  schema entre as três é um risco operacional a vigiar.
- O ator sintético é **não-humano em `user_company_memberships`** — poluição
  aceita conscientemente em troca de manter FK/NOT NULL/envelope intactos.
  Consultas de usuários reais devem filtrar o ator de sistema (flag/UUID
  conhecido).
- Provisionar o membership sintético por empresa é um **custo operacional no
  onboarding/opt-in** (não no runtime do cron); idempotente e reversível ao
  desabilitar a distribuição.
- Auditoria distingue disparo humano de automação e **qual** automação
  (`automation_job`), habilitando múltiplos crons no futuro sem novo app.
- O cron herda automaticamente idempotência, retry/DLQ e cooldown anti-656 do
  caminho outbox→relay→consumer — nada disso é reimplementado.
- Desvio consciente do `cron.md` global (Redis→Postgres) — registrado aqui;
  aceitável porque a constituição do projeto tem precedência sobre a regra
  global.

## Alternativas consideradas

- **Ator nulo (nullable + CHECK, "opção C"):** relaxava
  `requested_by_user_id`/`actor_user_id` para nullable com CHECK "ator humano ou
  automação nomeada". Rejeitada: quebra a validação `actorId: z.uuid()`
  obrigatória do envelope na publicação pelo relay (o relay falharia no Zod
  antes de publicar) e exige migração de nullabilidade em tabela fiscal
  crítica. O ator sintético evita ambos.
- **Atribuir a um admin humano:** zero migração, mas auditoria mente e a FK
  `onDelete restrict` quebra se o admin sai. Rejeitada.
- **Redis/Redlock (conforme `cron.md`):** proibido pela constituição.
- **Cron publica direto na exchange:** contornaria o outbox, perdendo
  atomicidade e idempotência. Rejeitada em favor do outbox.
- **Scheduler in-process no worker/API:** acopla agendamento ao runtime e
  dificulta escala/observabilidade; K8s CronJob externo é o padrão.

## Validação

- `make migration-test`: migração + rollback em Postgres descartável; linhas
  antigas recebem `triggered_by='user'` pelo default sem violar CHECK/FK.
- Contract test de concorrência: duas instâncias, só uma obtém o advisory lock.
- Contract test de elegibilidade: empresa em cooldown/sem certificado/sem
  `scheduled_distribution_enabled`/sem membership sintético é pulada.
- Contract test de origem: insert `triggered_by='automation'` com
  `automation_job` nulo (ou `triggered_by='user'` com job preenchido) falha na
  CHECK; ator continua NOT NULL nos dois casos.
- Contract test de ator sintético: importação de automação referencia o
  membership sintético ativo da empresa; sem membership, o enfileiramento falha
  fechado.
- `make check` verde com as três cópias de schema sincronizadas.
