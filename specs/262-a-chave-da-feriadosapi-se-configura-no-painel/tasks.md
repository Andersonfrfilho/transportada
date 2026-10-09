# Tarefas — 262

> Nenhum `[NEEDS CLARIFICATION]` desta spec bloqueia código. As Q3/Q4 da 252 seguem abertas e bloqueiam **ligar** a rotina
> (passo do usuário), não estas tasks. Migration **só staging**. **Ordem obrigatória:** a Fase 1 (painel tolerante) é publicada
> em staging **antes** de qualquer task da Fase 3 que mande a permissão nova na API (D10: `/auth/me` quebraria para todo
> `company-admin`). **Gate A** (passo do usuário) antes do deploy do worker (T4.3).

Uma task por vez, na ordem. Cada task fecha com: **contrato vermelho antes** (pelo motivo certo), `bun run typecheck`, lint
com a app como cwd, teste pelo **script `test` do `package.json`** (nunca `bun test` cru; na API, contrato e integração são dois
comandos de dentro de `apps/api-transportada`: `bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration`; arquivo avulso com `./`), integração contra um Postgres **que responda**
(pular não é passar), **prova por mutação**, `bun run format:check` na raiz (com `prettier --write` nos `.md` tocados), **commit
isolado** com caminhos explícitos (`--no-verify`, nunca `git add -A`) e evidência em `evidence.md`. Teste novo entra na lista
explícita do `package.json` da app. Migration pede também `make migration-test` e `bun run db:generate` = `no_changes`.

## Quadro

| Task | Modelo                       | Mecânica? | Aceite por comando? | Migration | Prints  | Depende de          |
| ---- | ---------------------------- | --------- | ------------------- | --------- | ------- | ------------------- |
| T0.1 | 🧠 `opus`                    | não       | não                 | —         | —       | —                   |
| T0.2 | `haiku`                      | sim       | sim (grep)          | —         | —       | T0.1                |
| T1.1 | `haiku`                      | sim       | sim                 | —         | —       | T0.2                |
| T1.2 | `haiku`                      | sim       | sim                 | —         | —       | T0.2                |
| T2.1 | `sonnet`                     | não       | sim                 | —         | —       | T0.2                |
| T2.2 | 🧠 `sonnet` (revisão `opus`) | não       | sim                 | **sim**   | —       | T2.1                |
| T3.1 | `haiku`                      | sim       | sim                 | —         | —       | T1.2 **em staging** |
| T3.2 | `sonnet`                     | não       | sim                 | —         | —       | T2.2                |
| T3.3 | `sonnet`                     | não       | sim                 | —         | —       | T3.1, T3.2          |
| T3.4 | `sonnet`                     | não       | sim                 | —         | —       | T2.2                |
| T4.1 | `sonnet`                     | não       | sim                 | —         | —       | T2.2, T3.2          |
| T4.2 | `sonnet`                     | não       | sim                 | —         | —       | T4.1, T1.1          |
| T4.3 | `haiku`                      | sim       | sim                 | —         | —       | T4.2 + **Gate A**   |
| T5.1 | `sonnet`                     | não       | sim                 | —         | —       | T3.3, T3.4          |
| T5.2 | `sonnet`                     | não       | sim + print         | —         | **sim** | T5.1                |
| T5.3 | `sonnet`                     | não       | sim + print         | —         | **sim** | T5.2, T4.2          |
| T6.1 | `sonnet` (revisão `opus`)    | não       | parcial             | —         | **sim** | todas               |

## Fase 0 — Decisão e conferência

> 🤖 Modelo: `haiku` (T0.1 é 🧠 — `opus`)

- [ ] **T0.1** 🧠 Validar o **ADR-0102** e as D1–D11 da `spec.md` contra `origin/staging` com `architect` `opus`: modelo de
      dados e nomes (≤ 63 bytes), AAD, desfechos (`token_missing` como contador e `credential_unreadable` como desfecho), ordem de
      publicação (a guarda de `/auth/me`), saída das variáveis, emendas ao ADR-0100. Status "proposta" → "aceita"; divergência vira
      emenda no lugar e nota em `evidence.md`. Reconferir a numeração (262 / 0102) contra `origin/staging` e as branches abertas.
- [ ] **T0.2** Conferir os fatos do `plan.md` § Contexto (arquivo e linha) e o próximo timestamp de migration livre. Aceite:
      tabela "citado → real" em `evidence.md`; `rtk proxy grep -n` em cada citação.

## Fase 1 — O painel aprende antes (publicar sozinha)

> 🤖 Modelo: `haiku`

- [x] **T1.1** `credential_unreadable` no `failureOutcomes` de `holiday.provider.pull` em
      `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts` (primeira das quatro cópias), com o contrato
      `test/shared/job-catalog.contract.ts` do painel. Aceite: `bun run typecheck`, `bun run lint`, `bun run test` (cwd
      `apps/frontend-transportada`) verdes; mutação: tirar a palavra deixa o contrato vermelho. ⚠️ **O contrato de paridade
      do painel lê o fonte do catálogo da API**: acrescentar o nome só no painel o deixaria vermelho. Por isso o `failureOutcomes`
      do painel passou a ser exigido como **superconjunto** do da API (demais chaves seguem em igualdade). **A igualdade volta na
      T3.1**, quando a API receber o nome: restaurar o `toEqual` completo e apagar os testes de superconjunto.
- [ ] **T1.2** `holiday-import.configure` conhecida pelo painel: `COMPANY_PERMISSIONS` (`identity/queries/useAuthMe.query.ts`),
      `PERMISSION_GROUPS` (`identity/shared/permissionGroups.constant.ts`, grupo de Configurações), locales do módulo `identity`
      (pt/en, rótulo "Configurar a chave e o orçamento da importação de feriados"). Contrato vermelho antes: `/auth/me` com a
      permissão é aceito por `isAuthMeResponse` (`test/identity/permission-matrix.contract.ts` ou contrato da guarda). Aceite: os
      três comandos do painel verdes; mutação: tirar a permissão da lista → o contrato da guarda fica vermelho.
- [ ] **Publicação da Fase 1** em staging (`git fetch && git rebase origin/staging && … && git push origin HEAD:staging`),
      Deploy verde registrado em `evidence.md` **antes** da T3.1.

## Fase 2 — Dado

> 🤖 Modelo: `sonnet` (T2.2 é 🧠 — revisão `opus` em passada separada)

- [ ] **T2.1** Contratos do modelo **antes**: estático (nomes explícitos, cada um ≤ 63 bytes, nenhum padrão do drizzle, CHECKs
      do ADR-0102 §3, `rollback.sql` = `DROP TABLE` + journal com `ROW_COUNT`) e asserção de banco (CHECK recusa dica sem envelope,
      envelope sem dica, dica de 3 e 5 caracteres, dica com espaço, orçamento 0 e 1.000.001, segundo `provider`, `provider`
      desconhecido; aceita a linha sem chave e a linha com os três campos). Vermelho pelo motivo certo (tabela ausente).
- [ ] **T2.2** 🧠 Migration `<timestamp>_holiday_provider_settings` (timestamp depois do último de `origin/staging` na hora de
      gerar — hoje `20261009160300`) com `migration.sql`, `rollback.sql`, `snapshot.json`; schema Drizzle na API
      (`database/holiday-provider-settings.schema.ts`, exportado em `database.schema.ts`) e cópia só com colunas no worker
      (`src/database/holiday-provider-settings.schema.ts`) com a paridade em `test/holiday-provider-pull/schema-parity.contract.ts`.
      Aceite: `make migration-test`; `bun run db:generate` = `no_changes`; `bun run db:test` com o banco nativo; contratos da API e do
      worker verdes. Revisão `opus` separada. **Só staging.** (CA1)

## Fase 3 — API

> 🤖 Modelo: `sonnet` (T3.1 em `haiku`). **T3.1 só depois da Fase 1 em staging.**

- [ ] **T3.1** Permissão `holiday-import.configure` em `TRANSPORTADA_PERMISSIONS` e no papel `company-admin`
      (`identity/domain/authorization.policy.ts`), com `test/authorization.contract.test.ts`,
      `test/user-administration-application/role-permissions.contract.ts` e `test/separator-role.contract.test.ts`; e
      `credential_unreadable` nas cópias do catálogo da **API** e do **cron** (paridade `test/job-catalog/catalog.contract.ts` nas
      duas). Aceite: contratos da API e `bun run test` do cron verdes; mutação: a permissão em `operator` derruba o contrato do
      papel. **Conferir antes do commit que a Fase 1 está em `origin/staging`** (`git merge-base --is-ancestor`). **Devolver a
      igualdade ao contrato do painel** (`test/shared/job-catalog.contract.ts`): `toEqual` completo do catálogo e fim dos testes de
      superconjunto, agora que a API tem `credential_unreadable` (T1.1). (CA10, CA11)
- [ ] **T3.2** Selo da chave: `business-calendar/application/holiday-provider-token-secret.service.ts` (RF2, AAD
      `transportada:holiday-provider-token:v1:${settingsId}`, plaintext zerado, envelope `.strict()`, erro tipado sem mensagem do
      provedor). Contrato: abre com o AAD da linha, **não** abre com outro id, nem com outro `provider`; envelope malformado →
      erro tipado. Mutação: AAD sem o id; `finally` sem zerar.
- [ ] **T3.3** Rotas da instalação (RF3–RF5): `GET`/`PUT /holiday-imports/provider-settings` e `DELETE …/token`, caso de uso,
      repositório (único importador da tabela global: estender `holiday-import-global-isolation.contract.ts` e o `SUPPORT_ONLY`
      de `test/business-calendar-schema/tenant-safety.contract.ts`), auditoria na mesma transação, `no-store`, limitador
      `postgres` (`holiday-provider-settings`, 10/h) listado em `test/rate-limited-routes.contract.test.ts`, constantes de
      orçamento com paridade com o worker. Contratos e integração **antes**: chaves exatas da resposta; `400` sem eco (chave
      sentinela procurada no corpo); `403` com `settings.manage` sem `holiday-import.configure`; `409` de versão; `429` no 11º;
      sentinela ausente de resposta, log e **todas** as colunas de `audit_logs`; salvar igual não audita; `DELETE` idempotente.
      Aceite: os dois comandos de teste da API (contrato + `./test/integration/holiday-provider-settings.integration.ts`), 0 skip;
      mutações: lista branca vaza o envelope; auditoria leva a dica; `.strict()` removido; limitador removido; `UPDATE` sem
      `version`. (CA2–CA5)
- [ ] **T3.4** Interruptor da empresa (RF6): `GET|PUT /company-settings/holiday-import` (`settings.manage`), upsert só de
      `is_enabled`, auditoria só quando muda. Integração: o cursor de uma linha existente não muda; empresa B não altera a A;
      `companyId` no corpo → `400`; `GET` sem linha = `true`/`default`. Mutação: `DO UPDATE SET` com o cursor; sem filtro de
      empresa; auditoria sempre. (CA6)

## Fase 4 — Worker

> 🤖 Modelo: `sonnet` (T4.3 em `haiku`, depois do **Gate A**)

- [ ] **T4.1** Leitor e selo no worker: `application/holiday-provider-token-secret.service.ts` (cópia por valor, só `decrypt`),
      paridade do AAD com a API (molde `test/contractor-mail/credential-secret-parity.contract.ts`),
      `infrastructure/drizzle-holiday-provider-settings.reader.ts` (`ready` / `token_missing` / `token_unreadable`), e
      `credential_unreadable` na cópia do catálogo do **worker** (paridade). Integração contra Postgres: sem linha; linha sem
      chave; chave selada pela cópia da API; envelope com `keyId` fora do chaveiro → `token_unreadable`.
- [ ] **T4.2** A rotina é registrada sempre e lê a configuração por ciclo (RF8): `holiday-provider-pull.registry.ts` sem o
      `return {}` e com o `envelopeProvider` do `main.ts`; a busca recebe chave e orçamento do ciclo; `token_missing`,
      `token_unreadable` e `credential_unreadable` no resumo. Contratos **antes**: sem linha → 0 requisições, `token_missing = 1`,
      descoberta e aplicação rodaram, `succeeded`; envelope ilegível → 0 requisições, `credential_unreadable`; com chave → o
      `Authorization` do fornecedor falso é o da chave do banco e o orçamento é o do banco; troca entre dois ciclos vale no
      segundo; `token-privacy.contract.ts` com a chave vinda do banco (sentinela em log, contadores, desfecho). Aceite:
      `bun run test` e `bun run build` do worker; integrações `holiday-fetch`, `holiday-apply`, `job-run-execution` 0 skip;
      mutações: ler da variável; ignorar o orçamento do banco; `token_unreadable` virar `succeeded`. (CA7, CA8)
- [ ] **Gate A (passo do USUÁRIO, antes da T4.3 e do deploy do worker):** em staging e produção, conferir **só o nome**
      (`railway variables --service worker --environment <env>` filtrando `FERIADOS_API`, ou a aba Variables) — nunca imprimir
      valor. Se `FERIADOS_API_TOKEN` existir com valor, o usuário cola a mesma chave na tela (ou pelo `PUT` da T3.3) **antes** do
      deploy do worker. Registrar em `evidence.md` "existe / não existe" por ambiente, sem valor.
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
- [ ] **T5.2** Bloco "Chave da FeriadosAPI" e interruptor (RF11) na aba Calendário: campo de senha nunca preenchido de volta,
      dica, orçamento, uso do mês, remover com confirmação, só leitura sem `holiday-import.configure`, texto da rotina pausada,
      estados, acessibilidade, pt/en, dois temas. Contratos de DOM antes (campo vazio ao abrir com chave e depois de salvar; o
      corpo do `PUT` sem `token` quando o campo está vazio; sem a permissão não há botão). **Prints** 375/768/1280, claro e
      escuro, aprovados pelo usuário antes de publicar. (CA12)
- [ ] **T5.3** Manchetes do cartão (RF12, D8): "sem chave", "chave ilegível", "orçamento do mês atingido", com a prioridade de
      D8 e o texto de "aguardando" que só manda despausar quando há chave; locale `businessCalendar` pt/en (inclui o texto de
      `credential_unreadable`). Contratos por prioridade antes; mutações por manchete. **Prints** aprovados. (CA12)

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final `opus`)

- [ ] **T6.1** Documentação viva (`plan.md` § Documentação viva), `docs/SECURITY.md` (entrada nova da 262: a exceção ao §4/§5,
      quem alcança, o que audita, o limitador, a chave nunca em resposta/log/auditoria; e a emenda da entrada da 252 passa de
      "planejada" a "feita"), ADR-0100/ADR-0102 com o estado real; revisão final `code-reviewer` `opus` em passada separada com a
      auditoria do §15 do `code-standart.md` (N+1, `Promise.all`, logs sem PII, sanitização); revisão de design e usabilidade com o
      usuário (tela real contra os prints aprovados).

## Publicação

Fase 1 sozinha → Fase 2 + Fase 3 (migration, API, catálogo da API e do cron) → **Gate A** → Fase 4 (worker) → Fase 5 (telas, com
prints aprovados). Produção: **depois** dos três PRs da 252 (ou junto do PR2 dela), em PRs separados: painel tolerante → migration +
API + worker + cron (**aprovação própria**, migration) → telas; em cada PR conferir a lista de commits contra `main` e montar por
`cherry-pick` sobre `origin/main`.

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
Pare e pergunte antes de: o Gate A (conferir FERIADOS_API_TOKEN no Railway é passo do usuário — nunca imprimir valor),
railway config apply, deploy/PR de produção, migration em produção, configurar ou pedir a chave da FeriadosAPI, despausar a
rotina holiday.provider.pull, qualquer tela publicada sem print aprovado, e qualquer [NEEDS CLARIFICATION] que surgir.
```
