# Tarefas — 262

> Nenhum `[NEEDS CLARIFICATION]` desta spec bloqueia código. As Q3/Q4 da 252 seguem abertas e bloqueiam **ligar** a rotina
> (passo do usuário), não estas tasks. Migration **só staging**. **Ordem obrigatória:** a Fase 1 (painel tolerante) é publicada
> em staging **antes** de qualquer task da Fase 3 que mande a permissão nova na API (D10: `/auth/me` quebraria para todo
> `company-admin`). **Gate A** (passo do usuário, **só nomes, a saída nunca contém um valor**) antes da **publicação da Fase 4
> inteira** (a T4.2 já deixa de ler a variável), em staging **e produção**. **A 252 já está em `main`** (#155, #156, #159).
> ADR-0102 **aceita em 2026-10-09**; as emendas E1–E16 da T0.1 estão aplicadas aqui e em `evidence.md` § T0.1.

Uma task por vez, na ordem. Cada task fecha com: **contrato vermelho antes** (pelo motivo certo), `bun run typecheck`, lint
com a app como cwd, teste pelo **script `test` do `package.json`** (nunca `bun test` cru; na API, contrato e integração são dois
comandos de dentro de `apps/api-transportada`: `bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration`; arquivo avulso com `./`), integração contra um Postgres **que responda**
(pular não é passar), **prova por mutação**, `bun run format:check` na raiz (com `prettier --write` nos `.md` tocados), **commit
isolado** com caminhos explícitos (`--no-verify`, nunca `git add -A`) e evidência em `evidence.md`. Teste novo entra na lista
explícita do `package.json` da app. Migration pede também `make migration-test` e `bun run db:generate` = `no_changes`.

## Quadro

| Task | Modelo                       | Mecânica? | Aceite por comando? | Migration | Prints  | Depende de                    |
| ---- | ---------------------------- | --------- | ------------------- | --------- | ------- | ----------------------------- |
| T0.1 | 🧠 `opus`                    | não       | não                 | —         | —       | —                             |
| T0.2 | `haiku`                      | sim       | sim (grep)          | —         | —       | T0.1                          |
| T1.1 | `haiku`                      | sim       | sim                 | —         | —       | T0.2                          |
| T1.2 | `haiku`                      | sim       | sim                 | —         | —       | T0.2                          |
| T2.1 | `sonnet`                     | não       | sim                 | —         | —       | T0.2                          |
| T2.2 | 🧠 `sonnet` (revisão `opus`) | não       | sim                 | **sim**   | —       | T2.1                          |
| T3.1 | `haiku`                      | sim       | sim                 | —         | —       | T1.2 **em staging**           |
| T3.2 | `sonnet`                     | não       | sim                 | —         | —       | T2.2                          |
| T3.3 | `sonnet`                     | não       | sim                 | —         | —       | T3.1, T3.2                    |
| T3.4 | `sonnet`                     | não       | sim                 | —         | —       | T2.2                          |
| T4.1 | `sonnet`                     | não       | sim                 | —         | —       | T2.2, T3.2                    |
| T4.2 | `sonnet`                     | não       | sim                 | —         | —       | T4.1, T1.1, Gate A (publicar) |
| T4.3 | `haiku`                      | sim       | sim                 | —         | —       | T4.2 + **Gate A**             |
| T5.1 | `sonnet`                     | não       | sim                 | —         | —       | T3.3, T3.4                    |
| T5.2 | `sonnet`                     | não       | sim + print         | —         | **sim** | T5.1                          |
| T5.3 | `sonnet`                     | não       | sim + print         | —         | **sim** | T5.2, T4.2                    |
| T6.1 | `sonnet` (revisão `opus`)    | não       | parcial             | —         | **sim** | todas                         |

## Fase 0 — Decisão e conferência

> 🤖 Modelo: `haiku` (T0.1 é 🧠 — `opus`)

- [x] **T0.1** 🧠 Validar o **ADR-0102** e as D1–D11 da `spec.md` contra `origin/staging` com `architect` `opus`: modelo de
      dados e nomes (≤ 63 bytes), AAD, desfechos (`token_missing` como contador e `credential_unreadable` como desfecho), ordem de
      publicação (a guarda de `/auth/me`), saída das variáveis, emendas ao ADR-0100. Status "proposta" → "aceita"; divergência vira
      emenda no lugar e nota em `evidence.md`. Reconferir a numeração (262 / 0102) contra `origin/staging` e as branches abertas.
      **Feita em 2026-10-09:** 16 emendas (E1–E16) aplicadas no texto, ADR-0102 **aceita**; evidência em `evidence.md` § T0.1.
- [x] **T0.2** Conferir os fatos do `plan.md` § Contexto (arquivo e linha) e o próximo timestamp de migration livre. Aceite:
      tabela "citado → real" em `evidence.md`; `rtk proxy grep -n` em cada citação. **Feita em 2026-10-09:** tabela em
      `evidence.md` § T0.2; próximo timestamp de migration: maior que `20261009205256` (E15).

## Fase 1 — O painel aprende antes (publicar sozinha)

> 🤖 Modelo: `haiku`

- [x] **T1.1** `credential_unreadable` no `failureOutcomes` de `holiday.provider.pull` em
      `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts` (primeira das quatro cópias), com o contrato
      `test/shared/job-catalog.contract.ts` do painel. Aceite: `bun run typecheck`, `bun run lint`, `bun run test` (cwd
      `apps/frontend-transportada`) verdes; mutação: tirar a palavra deixa o contrato vermelho. ⚠️ **O contrato de paridade
      do painel lê o fonte do catálogo da API**: o nome só no painel o deixaria vermelho. Por isso há a lista
      `PENDING_API_FAILURE_OUTCOMES` no contrato: o painel **sem os pendentes** iguala a API, e cada pendente tem de estar
      **ausente da API** e **presente no painel** — o contrato fica vermelho sozinho quando a API receber o nome (T3.1).
- [x] **T1.2** `holiday-import.configure` conhecida pelo painel: `COMPANY_PERMISSIONS` (`identity/queries/useAuthMe.query.ts`),
      `PERMISSION_GROUPS` (`identity/shared/permissionGroups.constant.ts`, grupo de Configurações), locales do módulo `identity`
      (pt/en, rótulo "Configurar a chave e o orçamento da importação de feriados"). Contrato vermelho antes: `/auth/me` com a
      permissão é aceito por `isAuthMeResponse` (`test/identity/permission-matrix.contract.ts` ou contrato da guarda). Aceite: os
      três comandos do painel verdes; mutação: tirar a permissão da lista → o contrato da guarda fica vermelho. ⚠️ Mesma
      armadilha, em dois contratos que leem a API (`test/frontend-contract.test.ts` "keeps the allowlist in sync…" e
      `permission-matrix.contract.ts` "não inventa…"): a lista `PENDING_API_PERMISSIONS`
      (`test/identity/pending-api-permissions.fixture.ts`) os isenta, com a mesma regra autofechante (ausente da API, presente no painel).
- [ ] **Publicação da Fase 1** em staging (`git fetch && git rebase origin/staging && … && git push origin HEAD:staging`),
      Deploy verde registrado em `evidence.md` **antes** da T3.1.

## Fase 2 — Dado

> 🤖 Modelo: `sonnet` (T2.2 é 🧠 — revisão `opus` em passada separada)

- [x] **T2.1** Contratos do modelo **antes**: estático (nomes explícitos, cada um ≤ 63 bytes, nenhum padrão do drizzle, CHECKs
      do ADR-0102 §3, `rollback.sql` = `DROP TABLE` + journal com `ROW_COUNT`) e asserção de banco (CHECK recusa dica sem envelope,
      envelope sem dica, dica de 3 e 5 caracteres, dica com espaço, orçamento 0 e 1.000.001, segundo `provider`, `provider`
      desconhecido; aceita a linha sem chave e a linha com os três campos). Vermelho pelo motivo certo (tabela ausente). Feita em 2026-10-09: evidência em `evidence.md` § Fases 2 e 3.
- [x] **T2.2** 🧠 Migration `<timestamp>_holiday_provider_settings` (timestamp **maior que `20261009205256`**: a última de
      `origin/staging` é `20261009160300`, mas `work/spec-260` carrega `20261009170338`, `20261009171836` e `20261009205256`, ainda
      fora de staging; **gerar na hora** com `bun run db:generate` e regenerar o `snapshot.json` se a 260 entrar antes) com
      `migration.sql`, `rollback.sql`, `snapshot.json`; schema Drizzle na API
      (`database/holiday-provider-settings.schema.ts`, exportado em `database.schema.ts`) e cópia só com colunas no worker
      (`src/database/holiday-provider-settings.schema.ts`) com a paridade em `test/holiday-provider-pull/schema-parity.contract.ts`.
      Aceite: `make migration-test`; `bun run db:generate` = `no_changes`; `bun run db:test` com o banco nativo; contratos da API e do
      worker verdes. Revisão `opus` separada. **Só staging.** (CA1) Feita em 2026-10-09 (`20261009223052_holiday_provider_settings`): evidência em `evidence.md` § Fases 2 e 3. **A revisão `opus` separada continua pendente.**

## Fase 3 — API

> 🤖 Modelo: `sonnet` (T3.1 em `haiku`). **T3.1 só depois da Fase 1 em staging.**

- [x] **T3.1** Permissão `holiday-import.configure` **no fim** de `TRANSPORTADA_PERMISSIONS` (`authorization.policy.ts` 116, depois
      de `occurrences.decide`: o contrato do painel compara as listas com igualdade **ordenada**) e **no fim** da lista do papel
      `company-admin` (`identity/domain/authorization.policy.ts`), com `test/authorization.contract.test.ts`,
      `test/user-administration-application/role-permissions.contract.ts` e `test/separator-role.contract.test.ts`; e
      `credential_unreadable` nas cópias do catálogo da **API** e do **cron**, **atualizando a lista do próprio contrato de cada
      uma** (`test/job-catalog/catalog.contract.ts`, entrada `holiday.provider.pull`: API 157, cron 149; API e cron **não** leem o
      fonte uns dos outros nem do worker, que atualiza a dele na T4.1). Aceite: contratos da API e `bun run test` do cron verdes; mutação: a permissão em `operator` derruba o contrato do
      papel. **Conferir antes do commit que a Fase 1 está em `origin/staging`** (`git merge-base --is-ancestor`). **Apagar as pendências do painel**: `PENDING_API_PERMISSIONS` (o
      arquivo `test/identity/pending-api-permissions.fixture.ts` e seus usos em `frontend-contract.test.ts` e
      `permission-matrix.contract.ts`) e `PENDING_API_FAILURE_OUTCOMES` (`test/shared/job-catalog.contract.ts`), restaurando a
      igualdade estrita (`toEqual(CATALOG)` sem `withoutPendingOutcomes`) — a asserção "ausente da API" fica vermelha **sozinha**
      quando a API concede a permissão e o desfecho (T1.1/T1.2), e o **mesmo commit da T3.1** apaga as listas. (CA10, CA11) Feita em 2026-10-09: evidência em `evidence.md` § Fases 2 e 3.
- [x] **T3.2** Selo da chave: `business-calendar/application/holiday-provider-token-secret.service.ts` (RF2, AAD
      `transportada:holiday-provider-token:v1:${settingsId}`, plaintext zerado, envelope `.strict()`, erro tipado sem mensagem do
      provedor). Plaintext fixado: UTF-8 de JSON `{"token":"…"}` validado com `.strict()` e a mesma regex
      (`^[\x21-\x7E]{16,512}$`) na abertura e na API (o worker repete na T4.1). Contrato: abre com o AAD da linha, **não** abre com
      outro id, nem com outro `provider`; envelope malformado → erro tipado; plaintext com campo a mais ou token fora da regex →
      erro tipado. Mutação: AAD sem o id; `finally` sem zerar; `.strict()` removido. Feita em 2026-10-09: evidência em `evidence.md` § Fases 2 e 3.
- [x] **T3.3** Rotas da instalação (RF3–RF5): `GET`/`PUT /holiday-imports/provider-settings` e `DELETE …/token`, caso de uso,
      repositório (único importador da tabela global: estender `holiday-import-global-isolation.contract.ts` e o `SUPPORT_ONLY`
      de `test/business-calendar-schema/tenant-safety.contract.ts`), auditoria na mesma transação, `no-store`, limitador
      `postgres` (`holiday-provider-settings`, 10/h) listado em `test/rate-limited-routes.contract.test.ts`, constantes de
      orçamento com paridade com o worker (constantes em `apps/api-transportada/src/shared/holiday-provider.constant.ts`, **não**
      em `business-calendar/domain`; paridade estendida em `worker test/holiday-provider-pull/parity.contract.ts`). O caso de uso
      gera o `settingsId` (`crypto.randomUUID()`) **antes** de selar e o insere explicitamente (nunca pelo default; molde
      `contractor-mail.port.ts` 109–114); `INSERT … ON CONFLICT DO NOTHING` que não insere nada → descarta o envelope e `409`.
      Auditoria: `appendBusinessCalendarAudit` ganha o parâmetro `permission` opcional (padrão `settings.manage`; aqui
      `holiday-import.configure`), o alvo `holiday_provider_settings` e as ações novas em `BUSINESS_CALENDAR_AUDIT_ACTION`; IP em
      `metadata.ipAddress`. Contratos e integração **antes**: chaves exatas da resposta; `400` sem eco (chave
      sentinela procurada no corpo); `403` com `settings.manage` sem `holiday-import.configure`; `409` de versão; `429` no 11º;
      sentinela ausente de resposta, log e **todas** as colunas de `audit_logs`; salvar igual não audita; `DELETE` idempotente.
      Aceite: os dois comandos de teste da API (contrato + `./test/integration/holiday-provider-settings.integration.ts`), 0 skip;
      mutações: lista branca vaza o envelope; auditoria leva a dica; `.strict()` removido; limitador removido; `UPDATE` sem
      `version`. (CA2–CA5) Feita em 2026-10-09: evidência em `evidence.md` § Fases 2 e 3.
- [x] **T3.4** Interruptor da empresa (RF6): `GET|PUT /company-settings/holiday-import` (`settings.manage`), upsert só de
      `is_enabled`, auditoria só quando muda. Integração: o cursor de uma linha existente não muda; empresa B não altera a A;
      `companyId` no corpo → `400`; `GET` sem linha = `true`/`default`. Auditoria com o alvo `company_holiday_import_settings`,
      **`entity_id` = `companyId`** (a PK é `company_id` e `audit_logs.entity_id` é `uuid not null`) e `permission = 'settings.manage'` (o padrão do helper). Mutação: `DO UPDATE SET` com o cursor; sem filtro de
      empresa; auditoria sempre. (CA6) Feita em 2026-10-09: evidência em `evidence.md` § Fases 2 e 3.

## Fase 4 — Worker

> 🤖 Modelo: `sonnet` (T4.3 em `haiku`). ⚠️ **T4.1–T4.3 ficam commitadas localmente e são publicadas num push só, depois do
> Gate A** (a T4.2 já deixa de ler a variável: o registro não usa mais `config.holidayProviderPull`).

- [ ] **T4.1** Leitor e selo no worker: `application/holiday-provider-token-secret.service.ts` (cópia por valor, só `decrypt`),
      paridade do AAD **e do formato do plaintext** com a API (molde `test/contractor-mail/credential-secret-parity.contract.ts`),
      `infrastructure/drizzle-holiday-provider-settings.reader.ts` (`ready` / `token_missing` / `token_unreadable`), e
      `credential_unreadable` na cópia do catálogo do **worker** (`src/shared/job-catalog.constant.ts` e a lista do próprio
      contrato `test/job-catalog/catalog.contract.ts`, entrada na linha 148). Qualquer erro na abertura vira `token_unreadable`,
      **inclusive o Zod do envelope**, que no molde (`contractor-mail-credential-secret.service.ts` 85) fica fora do `try`: o parse
      entra no `try` da cópia. **A T4.1 vem antes da T4.2, obrigatoriamente:** `run-job-cycle.ts` 176 (`isJobOutcome`) transforma
      desfecho fora do catálogo do worker em `unexpected_error`. Integração contra Postgres: sem linha; linha sem chave; chave
      selada pela cópia da API; envelope com `keyId` fora do chaveiro → `token_unreadable`; envelope malformado →
      `token_unreadable`.
- [ ] **T4.2** A rotina é registrada sempre e lê a configuração por ciclo (RF8; precedente do registro: `trip.location.purge`,
      `main.ts` 1302 — **não** `geocoding.refine`, que só é registrada com a chave): `holiday-provider-pull.registry.ts` sem o
      `return {}` (linha 42) e com o `envelopeProvider` do `main.ts`; a busca recebe chave e orçamento do ciclo; `token_missing`,
      `token_unreadable` e `credential_unreadable` no resumo. Contratos **antes**: sem linha → 0 requisições, `token_missing = 1`,
      descoberta e aplicação rodaram, `succeeded`; envelope ilegível → 0 requisições, `credential_unreadable`; com chave → o
      `Authorization` do fornecedor falso é o da chave do banco e o orçamento é o do banco **com `coalesce(monthly_request_budget, 4500)`
      (M1: a coluna é NULL = padrão; cobrir linha com orçamento NULL e com orçamento definido; a constante é a de
      `FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET`)**; troca entre dois ciclos vale no
      segundo; `token-privacy.contract.ts` com a chave vinda do banco (sentinela em log, contadores, desfecho). Aceite:
      `bun run test` e `bun run build` do worker; integrações `holiday-fetch`, `holiday-apply`, `job-run-execution` 0 skip;
      mutações: ler da variável; ignorar o orçamento do banco; `token_unreadable` virar `succeeded`. (CA7, CA8)
- [ ] **Gate A (passo do USUÁRIO, antes da PUBLICAÇÃO da Fase 4 inteira — T4.1–T4.3 num push só — e do deploy do worker):** em
      staging **e produção** (o worker de produção já roda a 252 e lê a variável: aqui o gate é obrigatório), conferir **só o
      nome** da variável. **A saída nunca pode conter um valor.** ⚠️ O `railway variables` comum no worker, mesmo "filtrando o
      nome", imprime a linha com o valor da chave e a queima (`security.md` §4): **não use**. Use um comando que imprima só nomes:
      `railway variables --service worker --environment <env> --json | jq -r 'keys[] | select(startswith("FERIADOS_API"))'`
      (**confira antes** que `--json` existe na versão instalada, com `railway variables --help`; na dúvida use a aba
      **Variables** do Railway, que mascara o valor). Se `FERIADOS_API_TOKEN` existir com valor, o usuário cola a mesma chave na
      tela (ou pelo `PUT` da T3.3) **antes** do deploy do worker. Registrar em `evidence.md` "existe / não existe" por ambiente,
      **sem valor** (nem parcial, nem os 4 últimos caracteres).
- [ ] **T4.3** Saída das variáveis (RF10, D4): `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` fora de
      `config/environment.schema.ts`, `HolidayProviderPullEnvironment`/`WorkerEnvironment`, `.env.example` e `.railway/railway.ts`;
      contratos `environment.contract.ts`/`registration.contract.ts` ajustados sem afrouxar o `toEqual`. Aceite: `rtk proxy grep -rn
"FERIADOS_API_TOKEN\|FERIADOS_API_MONTHLY_REQUEST_BUDGET" apps .env.example .railway` = só documentação histórica; testes do
      worker verdes. ⚠️ O `railway config apply` que apaga a variável é passo do usuário. (CA9)

## Fase 5 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Cliente, guardas (chaves exatas), query e mutation de `/holiday-imports/provider-settings` e
      `/company-settings/holiday-import`, no padrão `useHolidayImport.*`; mensagens por código (`400` campo a campo, `409`, `429`,
      `403`). Contratos de guarda antes. Aceite: os três comandos do painel; mutação: guarda aceita chave a mais.
- [ ] **T5.2** Bloco "Chave da FeriadosAPI" e liga/desliga (RF11) na aba Calendário, **antes** de `HolidayImportStatus` (linha 45 de
      `BusinessCalendarPanel.component.tsx`): o liga/desliga é o `Checkbox` do design system com rótulo explícito (como
      `SaturdayBlock.component.tsx` 5; **não** existe `button role="switch"` no painel), o carregando é `@/components/ui/skeleton`;
      o painel só recebe `canManage` (`CompanySettings.page.tsx` 256), então ganha **prop nova** para `holiday-import.configure`
      (escrever pela tela exige as **duas** permissões: a aba só aparece com `settings.manage`). Campo de senha nunca preenchido de volta,
      dica, orçamento, uso do mês, remover com confirmação, só leitura sem `holiday-import.configure`, texto da rotina pausada,
      estados, acessibilidade, pt/en, dois temas. Contratos de DOM antes (campo vazio ao abrir com chave e depois de salvar; o
      corpo do `PUT` sem `token` quando o campo está vazio; sem a permissão não há botão). **Prints** 375/768/1280, claro e
      escuro, aprovados pelo usuário antes de publicar. (CA12)
- [ ] **T5.3** Manchetes do cartão (RF12, D8): "sem chave", "chave ilegível", "orçamento do mês atingido", com a prioridade de
      D8 e o texto de "aguardando" que só manda despausar quando há chave; locale `businessCalendar` pt/en (inclui o texto de
      `credential_unreadable`). O `status` **não** expõe o orçamento (`holiday-import.schema.ts` da API só tem
      `monthlyRequests`): o painel compara `monthlyRequests` com o `monthlyRequestBudget` do `GET` do RF3, com `>=` (casa com o
      worker, `holiday-fetch.query.ts` 70). **Reescrever os textos que mandam olhar "sem token" em Operações**
      (`businessCalendar.locale.json` 281, 289 e 290, e o `.en`). Contratos por prioridade antes; mutações por manchete. **Prints** aprovados. (CA12)

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final `opus`)

- [ ] **T6.1** Documentação viva (`plan.md` § Documentação viva, **inclusive `docs/ai-context/cron-transportada.md` ~linha 145**,
      que cita `FERIADOS_API_TOKEN` e diz que o cron "nunca lê o token"), `docs/SECURITY.md` (entrada nova da 262: a exceção ao
      §4/§5, quem alcança, o que audita, o limitador, a chave nunca em resposta/log/auditoria, **a chave em claro na memória da
      API durante o `PUT`**; a emenda da entrada da 252 passa de "planejada" a "feita"; e as linhas ~67–68 da 252 — "API … nunca
      leem o token" e "o token existe só no serviço do worker" — passam a dizer que a API recebe e sela a chave), ADR-0100/ADR-0102
      com o estado real; revisão final `code-reviewer` `opus` em passada separada com a
      auditoria do §15 do `code-standart.md` (N+1, `Promise.all`, logs sem PII, sanitização); revisão de design e usabilidade com o
      usuário (tela real contra os prints aprovados).

## Publicação

Fase 1 sozinha → Fase 2 + Fase 3 (migration, API, catálogo da API e do cron) → **Gate A** (só nomes, staging e produção) → Fase 4
(worker, T4.1–T4.3 num push só) → Fase 5 (telas, com prints aprovados). Produção: a 252 **já está em `main`** (#155, #156, #159) e
o worker de produção lê a variável, então o **Gate A em produção é obrigatório**; PRs separados: painel tolerante → migration +
API + cron (**aprovação própria**, migration) → **Gate A em produção** → worker → telas; em cada PR conferir a lista de commits
contra `main` e montar por `cherry-pick` sobre `origin/main`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/262-a-chave-da-feriadosapi-se-configura-no-painel/ (leia spec.md, plan.md,
tasks.md e docs/adr/0102-a-chave-da-feriadosapi-mora-selada-no-banco.md antes de começar; leia também ADR-0100 e
specs/252-*/tasks.md § "Roteiro do 1º ciclo real"). Worktree próprio a partir de origin/staging (fetch antes). Uma task por vez,
na ordem do tasks.md.
Modelos: T0.1 🧠 → architect model=opus · T0.2, Fase 1, T3.1, T4.3 → executor model=haiku · Fase 2 → executor model=sonnet,
T2.2 🧠 com revisão separada por architect model=opus · Fases 3, 4 e 5 → executor model=sonnet · T6.1 → executor model=sonnet
e revisão final → code-reviewer model=opus em passada separada.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com contrato vermelho antes, typecheck, lint com cwd na app, teste pelo script do package.json (na API, contrato
E integração, 0 skip, Postgres que responda), mutação, format:check na raiz e commit isolado com caminhos explícitos
(--no-verify, nunca git add -A/stash/reset/amend), evidência em evidence.md.
ORDEM OBRIGATÓRIA: a Fase 1 (painel tolerante: catálogo com credential_unreadable e a permissão holiday-import.configure na
guarda de /auth/me) vai a staging e tem Deploy verde ANTES da T3.1 — a API com a permissão antes do painel derruba o painel de
todo company-admin.
Pare e pergunte antes de: o Gate A (conferir FERIADOS_API_TOKEN no Railway é passo do usuário, em staging E produção — só
NOMES, a saída nunca contém valor; o Gate A vem antes de publicar a Fase 4 inteira),
railway config apply, deploy/PR de produção, migration em produção, configurar ou pedir a chave da FeriadosAPI, despausar a
rotina holiday.provider.pull, qualquer tela publicada sem print aprovado, e qualquer [NEEDS CLARIFICATION] que surgir.
```
