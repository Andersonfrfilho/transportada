# Feature 011 — Importação agendada de NF-e (cron dedicado)

## Problema e resultado

A distribuição DF-e da SEFAZ (feature 005) já funciona ponta a ponta, mas só é
disparada **sob demanda por um usuário logado** com `invoices.import`: alguém
precisa clicar. Não existe puxada automática recorrente, então NF-e emitidas
contra o CNPJ da transportadora só entram quando um operador lembra de acionar.

O resultado desta feature é uma **puxada agendada e sem usuário logado**: um app
cron dedicado (`apps/cron-transportada`) executa periodicamente, identifica as
empresas elegíveis, e **enfileira** uma distribuição por empresa publicando na
exchange RabbitMQ `nfe-distribution.v1` já existente. O consumer de distribuição
(`createNfeDistributionConsumer`) processa como hoje — o cron **não** consulta a
SEFAZ inline. A janela anti-656 (`next_allowed_at`) continua sendo respeitada, o
XML fiscal nunca trafega, e cada ciclo é auditável por `traceId` e por
`nfe_imports.created_at`.

O app cron nasce como **host de múltiplos jobs**: cada automação tem um
identificador estável de tipo (ex.: `nfe.distribution.pull`). Futuras rotinas
(geração de faturas, limpeza, reprocessos) entram como novos jobs no mesmo host,
sem criar outro app, e cada importação registra **qual** automação a originou.

## Premissas decididas

- Bun continua runtime, package manager e test runner; o cron usa `Bun` puro,
  **sem** framework de scheduler in-process.
- O agendamento externo é um **K8s CronJob** (uma execução por ciclo); o app é
  stateless e idempotente por ciclo.
- Proibido Redis/BullMQ (constituição do projeto). O lock distribuído exigido
  pelo `cron.md` global é feito com **PostgreSQL advisory lock** por tipo de job
  e/ou o **lease existente por `(companyId, environment)`** do cursor de
  distribuição — **nunca** Redlock/Redis. O desvio do `cron.md` é registrado em
  ADR (0012) com justificativa.
- O cron **apenas enfileira** (publica na exchange); o processamento pesado e a
  consulta SEFAZ permanecem no worker. Nada de processar inline.
- **Identidade do ator (decisão fechada — ator sintético do sistema):**
  `requested_by_user_id` (em `nfe_imports`) e `actor_user_id` (em
  `processing_outbox`) permanecem **NOT NULL**. Cada empresa com distribuição
  habilitada tem um **membership sintético ativo** (um `identity_users` de
  sistema, UUID fixo, sem credencial Keycloak) que serve de ator às importações
  de automação — mantendo FK composta e envelope `actorId: z.uuid()` intactos. A
  origem é identificada por `triggered_by = 'automation'` + `automation_job =
'<id do job>'`.
- `companyId` nunca vem de payload; o cron itera empresas persistidas e deriva o
  tenant do próprio registro. `invoices.import`/contexto de usuário **não** se
  aplicam a um disparo de automação.
- Migração toca a API (2 tabelas) e **a cópia de schema do worker**
  (`processing.schema.ts`) — migrations só rodam na API; o worker reflete por
  cópia.
- Cadência, habilitação por empresa, tamanho de página e ambiente fiscal são
  **configuráveis** e falham fechado; homologação e produção nunca se misturam.
- Nenhuma app importa código-fonte de outra; o cron fala com o banco e com o
  RabbitMQ pelos providers já usados (`@adatechnology/rabbitmq-provider`).
- XML, certificado, senha e payload fiscal sensível **nunca** são logados nem
  atravessam o envelope.

## Fora do escopo

| Item                                                   | Motivo                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Novo scheduler in-process (cron dentro do worker/API)  | o agendamento é externo (K8s CronJob); o app só executa um ciclo |
| Redis/Redlock para o lock distribuído                  | proibido pela constituição; lock é via Postgres                  |
| Consulta SEFAZ dentro do cron                          | toda chamada externa continua no consumer do worker              |
| Manifestação do destinatário / regras legais inferidas | não pertencem a esta feature                                     |
| UI de configuração de agendamento                      | MVP usa config/flag por empresa; tela dedicada vem depois        |
| Outras automações (faturas, limpeza)                   | esta feature entrega o host + o job `nfe.distribution.pull`      |
| Deploy K8s real / manifests de produção                | somente após gates locais e aprovação humana                     |
| Usar o certificado real em testes automatizados        | testes usam gateway fake e credencial efêmera/sintética          |

## Histórias priorizadas

### P1 — Puxar NF-e automaticamente, sem usuário logado

**História:** Como operação fiscal, quero que as NF-e sejam buscadas
periodicamente sem ninguém precisar clicar, respeitando o cooldown da SEFAZ.

**Critérios de aceite:**

1. **WHEN** o job `nfe.distribution.pull` executa um ciclo **THEN** ele **SHALL**
   selecionar apenas empresas com distribuição habilitada, configuração fiscal e
   certificado ativo válido, de forma paginada.
2. **WHEN** uma empresa elegível está fora da janela anti-656
   (`next_allowed_at` nulo ou `<= now`) **THEN** o job **SHALL** criar um
   `nfe_imports` de automação e o outbox event correspondente na mesma
   transação; o relay **SHALL** publicar na exchange `nfe-distribution.v1`.
3. **WHEN** o cursor da empresa ainda está em cooldown (`next_allowed_at > now`)
   **THEN** o job **SHALL** pular a empresa sem enfileirar e sem consultar a
   SEFAZ.
4. **WHEN** uma empresa não tem configuração fiscal ou certificado válido
   **THEN** o job **SHALL** pular essa empresa e **SHALL NOT** abortar o ciclo
   inteiro.
5. **WHEN** a importação é criada por automação **THEN** ela **SHALL** ter
   `requested_by_user_id` apontando para o membership sintético da empresa (NOT
   NULL), `triggered_by = 'automation'` e `automation_job` igual ao
   identificador do job.
6. **WHEN** o consumer de distribuição recebe a mensagem enfileirada pelo cron
   **THEN** ele **SHALL** processar exatamente como no fluxo sob demanda,
   incluindo lease, cursor NSU e cooldown anti-656.

**Teste independente:** um ciclo sintético com três empresas (uma elegível, uma
em cooldown, uma sem certificado) enfileira só a elegível, pula as outras e
gera um `nfe_imports` de automação com o ator sintético da empresa.

### P1 — Origem de automação rastreável com ator sintético

**História:** Como responsável por auditoria, quero saber que uma importação foi
feita pelo sistema e **qual** automação a disparou, sem um humano falso no
registro.

**Critérios de aceite:**

1. **WHEN** a migração é aplicada **THEN** `nfe_imports.requested_by_user_id` e
   `processing_outbox.actor_user_id` **SHALL** permanecer NOT NULL, e as colunas
   `triggered_by` e `automation_job` **SHALL** existir em ambas.
2. **WHEN** um registro tem `triggered_by = 'user'` **THEN** ele **SHALL** ter
   `automation_job` nulo; **WHEN** `triggered_by = 'automation'` **THEN**
   `automation_job` **SHALL** ser não nulo — garantido por CHECK constraint. Em
   ambos os casos o ator permanece não nulo (humano ou sintético).
3. **WHEN** registros existentes são migrados **THEN** eles **SHALL** receber
   `triggered_by = 'user'` sem violar a FK composta nem exigir backfill de ator.
4. **WHEN** o worker lê/insere nessas tabelas **THEN** a cópia de schema do
   worker **SHALL** refletir as mesmas colunas e constraints.
5. **WHEN** o envelope de distribuição trafega **THEN** ele **SHALL NOT** ganhar
   autoridade sobre tenant/ator; o consumer continua derivando do registro
   persistido e rejeitando divergência.

**Teste independente:** inserir um `nfe_imports` de automação sem ator passa;
inserir um com `triggered_by='automation'` e ator preenchido (ou job nulo)
falha na constraint.

### P2 — Um único ciclo por vez, observável, sem Redis

**História:** Como operação, quero garantir que duas instâncias do cron não
disparem o mesmo ciclo em paralelo, e conseguir auditar cada execução.

**Critérios de aceite:**

1. **WHEN** duas instâncias do job iniciam no mesmo ciclo **THEN** apenas uma
   **SHALL** obter o advisory lock do PostgreSQL e executar; a outra **SHALL**
   encerrar sem efeito.
2. **WHEN** um ciclo inicia **THEN** ele **SHALL** gerar um `traceId` único e
   emitir logs no formato `[traceId][timestamp][cron-transportada]...` com
   contadores (avaliadas, elegíveis, enfileiradas, puladas por cooldown, puladas
   por elegibilidade).
3. **WHEN** um ciclo termina ou falha **THEN** o lock **SHALL** ser liberado e o
   próximo ciclo **SHALL** poder executar.
4. **WHEN** logs são emitidos **THEN** certificado, senha e XML **SHALL NOT**
   aparecer.

**Teste independente:** duas execuções concorrentes contra o mesmo Postgres —
só uma processa; a segunda registra "lock não adquirido" e sai.

## Requisitos funcionais e de segurança

- **RF-01** — App `apps/cron-transportada` com entrypoint que executa **um
  ciclo e termina** (adequado a K8s CronJob), com um **registro de jobs** por
  identificador de tipo estável.
- **RF-02** — Job `nfe.distribution.pull`: seleção paginada de empresas
  elegíveis (distribuição habilitada + config fiscal + certificado válido +
  fora da janela anti-656).
- **RF-03** — Para cada elegível, criar `nfe_imports` (source `distribution`,
  `triggered_by='automation'`, `automation_job='nfe.distribution.pull'`, ator =
  membership sintético da empresa) + outbox event, em transação; relay publica
  em `nfe-distribution.v1`.
- **RF-04** — Reaproveitar o consumer de distribuição existente sem alteração de
  comportamento (lease, cursor NSU, cooldown anti-656).
- **RF-05** — Migração: adicionar `triggered_by` (default `'user'`) e
  `automation_job` em `nfe_imports` e `processing_outbox`, com CHECK de
  coerência e rollback ao lado; ator permanece NOT NULL.
- **RF-06** — Criar tabela `company_distribution_settings`
  (`scheduled_distribution_enabled`); habilitá-la provisiona (idempotente) o
  ator sintético da empresa (`identity_users` de sistema + membership ativo).
- **RF-07** — Refletir a migração na cópia de schema do worker
  (`processing.schema.ts`) e onde `nfe_imports` for consumido.
- **RS-01** — Lock distribuído via `pg_try_advisory_lock` (chave derivada do
  tipo de job); **nunca** Redis/Redlock.
- **RS-02** — `companyId` derivado do banco/registro, nunca de payload.
- **RS-03** — Nunca logar/commitar certificado, senha, chave privada ou XML;
  XML não trafega no envelope.
- **RS-04** — Homologação e produção nunca se misturam; o ambiente fiscal do
  ciclo é explícito e falha fechado.
- **RS-05** — Elegibilidade falha fechada: sem certificado/config válida →
  empresa pulada, ciclo continua.

## Dados e constraints mínimos

- `nfe_imports.requested_by_user_id`: **permanece `uuid NOT NULL`**. A FK
  composta `(requested_by_user_id, company_id) → user_company_memberships`
  permanece intacta; automação usa o ator sintético da empresa.
- `nfe_imports.triggered_by`: `text NOT NULL DEFAULT 'user'` ∈ {`user`,
  `automation`}.
- `nfe_imports.automation_job`: `text NULL` (id do job quando automação).
- CHECK `nfe_imports_origin_ck`:
  `(triggered_by='user' AND automation_job IS NULL)`
  `OR (triggered_by='automation' AND automation_job IS NOT NULL)`.
- `processing_outbox.actor_user_id` (NOT NULL) / `triggered_by` /
  `automation_job`: espelham o mesmo modelo e CHECK
  (`processing_outbox_origin_ck`).
- `company_distribution_settings`: `company_id uuid PK/FK companies`,
  `scheduled_distribution_enabled boolean NOT NULL DEFAULT false`, timestamps.
- Ator sintético: um `identity_users` de sistema (UUID fixo em `*.constant.ts`,
  sem `external_identities`) + `user_company_memberships` ativo por empresa
  habilitada; consultas de usuários reais filtram o UUID conhecido.
- Unicidade `(company_id, idempotency_key)` de `nfe_imports` é preservada; a
  chave de idempotência de um disparo de automação é derivada de forma estável
  por empresa+ciclo para evitar enfileiramento duplo no mesmo ciclo.

## Estados

Reaproveita os estados de `nfe_imports` da feature 005 (pending →
processing/completed/rate-limited etc.). Esta feature **não** cria estados
novos; só adiciona a **origem** (`triggered_by`) ortogonal ao estado.

## Casos extremos

- Ciclo sem nenhuma empresa elegível → nenhum enfileiramento, log de ciclo
  vazio, sucesso.
- Empresa elegível mas já com importação de automação pendente no mesmo ciclo →
  idempotência por `idempotency_key` evita duplicar.
- Lock não adquirido (outra instância ativa) → segunda instância sai limpa.
- Falha ao publicar em uma empresa → não contamina as demais; outbox/relay
  garantem reentrega; o ciclo registra a falha isolada.
- Certificado expira entre a seleção e o processamento → o consumer falha
  fechado (comportamento 005), o cron não muda.
- Migração em base com linhas antigas → todas viram `triggered_by='user'` sem
  backfill de ator; nenhuma violação de CHECK/FK.

## Rastreabilidade

| História                                  | Requisitos                                      |
| ----------------------------------------- | ----------------------------------------------- |
| P1 — Puxar NF-e automaticamente           | RF-01, RF-02, RF-03, RF-04, RS-02, RS-04, RS-05 |
| P1 — Origem rastreável com ator sintético | RF-05, RF-06, RF-07, RS-03                      |
| P2 — Um ciclo por vez, observável         | RS-01, RS-03, RF-01                             |

## Critérios de sucesso

- Um ciclo do cron contra Postgres + RabbitMQ reais enfileira só as empresas
  elegíveis e gera `nfe_imports` de automação com o ator sintético da empresa e
  `automation_job` correto.
- Duas instâncias concorrentes: só uma executa (advisory lock).
- Consumer de distribuição processa o enfileirado sem alteração de
  comportamento; cooldown anti-656 continua honrado.
- Migração aplica e faz rollback em Postgres descartável (`make
migration-test`); linhas antigas continuam válidas.
- Cópia de schema do worker sincronizada; `make check` verde.
- Nenhum log de ciclo contém certificado, senha ou XML.

## Decisões fechadas e pendências não bloqueantes

**Fechadas:**

- **Disparo:** app cron dedicado (`apps/cron-transportada`), K8s CronJob, host
  de múltiplos jobs com identificador de tipo estável.
- **Ator:** ator sintético do sistema (membership sintético por empresa) +
  `triggered_by`/`automation_job`; ator permanece NOT NULL, FK e envelope
  intactos. Opt-in em `company_distribution_settings`.
- **Lock:** PostgreSQL advisory lock / lease existente; sem Redis (desvio do
  `cron.md` registrado em ADR 0012).

**Não bloqueantes — todas fechadas:**

- Chave de idempotência do disparo de automação: **empresa+timestamp truncado à
  cadência** (`Math.floor(now/bucketMs)*bucketMs`), sob o unique
  `(company_id, idempotency_key)`. Fechada em T015.
- Flag "distribuição habilitada" por empresa: **coluna nova** em
  `company_distribution_settings`. Fechada em T014/RF-06.
- Enum de `triggered_by` no Drizzle: **`text` + CHECK** (constituição proíbe
  ENUM nativo). Fechada na migração.
- **Cadência default do CronJob: 60 min** (`schedule: "0 * * * *"`), espelhada em
  `CADENCE_MINUTES=60` (default) — o schedule do CronJob e o bucket de
  idempotência **devem** usar o mesmo valor. Fechada em T016/T018 (ver
  "Configuração e cadência").

## Configuração e cadência

O cron é parametrizado por env validado (`config/environment.schema.ts`), falha
fechado e nunca mistura ambientes fiscais:

| Variável             | Origem no K8s | Default | Observação                                 |
| -------------------- | ------------- | ------- | ------------------------------------------ |
| `DATABASE_URL`       | **Secret**    | —       | segredo; nunca em ConfigMap nem em log     |
| `FISCAL_ENVIRONMENT` | ConfigMap     | —       | `homologation`\|`production`, explícito    |
| `CRON_JOB`           | ConfigMap     | —       | `nfe.distribution.pull` (único job hoje)   |
| `CADENCE_MINUTES`    | ConfigMap     | `60`    | **deve** casar com o `schedule` do CronJob |
| `PAGE_SIZE`          | ConfigMap     | `50`    | tamanho de página da seleção               |
| `LOG_LEVEL`          | ConfigMap     | `info`  | —                                          |
| `APP_ENV`            | ConfigMap     | `local` | `production` desliga o pretty-print        |

**Regra de cadência:** o `schedule` do CronJob (cron expression) e
`CADENCE_MINUTES` derivam do mesmo intervalo. Default = 60 min → `"0 * * * *"` e
`CADENCE_MINUTES=60`. Alterar a cadência exige mudar **os dois** juntos, senão o
bucket de idempotência deixa de coincidir com a janela de execução. Ciclos
sobrepostos são tolerados: o advisory lock deixa só um instância ativa e o unique
de idempotência colapsa disparos duplicados por empresa na mesma janela.
`concurrencyPolicy: Forbid` reforça isso no nível do K8s.
