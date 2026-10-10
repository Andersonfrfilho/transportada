# Evidência — 262

## Desenho (2026-10-09, `architect` `opus`, só documentação)

Branch `work/spec-feriados-config` a partir de `origin/staging` `c1a0fed8f` (`git fetch origin` exit 0; `git switch -c` exit 0).
Nenhum arquivo de código, teste ou migration foi tocado; sem push.

### Numeração conferida

- `ls specs` em `origin/staging`: a última é `260-a-nota-que-volta-ao-barracao-fica-disponivel`.
- Branches e worktrees (`git for-each-ref` de `refs/heads` e `refs/remotes`, `git ls-tree` de `specs/` e `docs/adr/` em cada uma, e
  `ls` de `specs/`/`docs/adr/` nos 97 worktrees de `git worktree list`, inclusive `.claude/worktrees/*` e `../transportada-wt/*`):
  - **260 colide:** `260-a-nota-que-volta-ao-barracao-fica-disponivel` (staging) e `260-o-chat-chega-ao-app-do-motorista`
    (`work/spec-260`, `scratch/spec-260-preview` e a árvore principal). A do chat deve ser renumerada — **261 fica livre para ela**.
  - Nenhuma `261`–`26x` em branch ou worktree.
  - ADR: `0100` em staging; `0101-a-conversa-tem-assunto-e-protocolo` na branch do chat; `0099` reservada pela 251. **0102 livre.**
  - PRs abertos (`gh pr list`): só #157/#158 da 259.
- **Escolhidos: spec 262, ADR 0102.** Reconferir antes de publicar (T0.1), porque outras sessões estão numerando 259–26x.

### Lido antes de escrever (regra do `CLAUDE.md` da raiz)

ADR-0100 inteiro; `specs/252-…/{spec,plan,tasks}.md` inteiros e `evidence.md` § T3.5, "Fechamento da Fase 3", "2ª rodada da Fase 3",
T4.1, T6.1 (quadro, passos do usuário, roteiro do 1º ciclo, runbook), T6.1b, "Índice de nfe_addresses" e "Cartão de status honesto";
`docs/SECURITY.md` (entradas da 252 e da 252 T4.1); `~/.claude/rules/rules/security.md` §4–§5; `apps/worker-transportada/CLAUDE.md`
inteiro; `apps/api-transportada/CLAUDE.md` (núcleo, calendário e importação); `specs/239-o-expurgo-se-liga-na-tela/spec.md` D3/D4/CA9
(o precedente de variável que sai quando a configuração vira tela); ADR-0004 e `0063-a-resposta-por-e-mail-decide-a-taxa.md` §7;
`specs/_template`.

### O que o código mostrou diferente do pedido

| Esperado no pedido                                                     | O código                                                                                                                                                                                         | Decisão                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| D5: registrar `ENCRYPTION_*` no worker (passo de infraestrutura)       | O worker **já** exige o chaveiro no boot (`main.ts` 527, `config/cryptographic-configuration.schema.ts` 34–35) e `.railway/railway.ts` 166–167 já o dá; abre NFS-e, certificado e Resend com ele | Nenhum passo de infra; AAD com paridade                                                                        |
| D1: coluna `key_id`                                                    | Os três precedentes (`nfse_provider_credentials`, `digital_certificates`, `contractor_mail_settings`) guardam só `secret_envelope jsonb`; o envelope carrega `keyId`                             | Sem coluna à parte; conferência por `token_envelope->>'keyId'`                                                 |
| D1: `holiday_provider_installation_settings`                           | 38 bytes: `…_monthly_request_budget_check` passaria de 63                                                                                                                                        | `holiday_provider_settings` (25), prefixo das globais da 252                                                   |
| D3: no-op com desfecho `skipped`                                       | Não existe `skipped`: `JOB_WRAPPER_OUTCOMES` = `succeeded`, `cancelled`, `abandoned`, `unexpected_error`; precedente `geocoding.refine` fecha `succeeded` com chave ausente                      | Sem chave = contador `token_missing`, desfecho pelo resto; chave ilegível = `credential_unreadable` (4 cópias) |
| D3: "sem token/orçamento/ligada, fecha como no-op"                     | As três etapas já pulam a empresa desligada (`coalesce(s.is_enabled, true)`); a descoberta e a aplicação só tocam o banco                                                                        | Sem chave só a busca não roda; descoberta e aplicação seguem                                                   |
| D2: `PATCH`/`PUT` de `isEnabled` dentro de `/holiday-imports/settings` | Escopo e permissão diferentes (empresa × instalação); o status já devolve `isEnabled`; o molde da empresa é `/company-settings/*`                                                                | `/holiday-imports/provider-settings` (instalação) e `/company-settings/holiday-import` (empresa)               |
| D2: só `settings.manage`                                               | `settings.manage` é concedível por grupo; o painel **recusa** `/auth/me` com permissão desconhecida (`useAuthMe.query.ts` 120–128, 162)                                                          | `holiday-import.configure` (D6) e painel **antes** da API (D10)                                                |
| Painel: status passa a dizer "sem chave"                               | A guarda do `status` é de chaves **exatas** (`holidayImportGuards.validation.ts`); campo novo nele exigiria painel antes de novo                                                                 | "Sem chave" vem do `GET` novo; o `status` não muda de forma                                                    |
| D7 (pedido): manter fallback por uma versão ou aposentar               | Precedente 239 D3: a variável saiu com um Gate A; schema do worker não `.strict()`                                                                                                               | Aposentar, com Gate A                                                                                          |

### Fatos conferidos (amostra; a T0.2 confere todos)

- `environment.schema.ts` do worker: `FERIADOS_API_MONTHLY_REQUEST_BUDGET`/`FERIADOS_API_TOKEN` 101–102; `toHolidayProviderPull` 272–288;
  `optionalToken` 440–444.
- `holiday-provider-pull.registry.ts` 36–41 (`return {}` sem configuração); `main.ts` 1473 (chamada) e 527 (chaveiro).
- `run-job-cycle.ts` 102–113 (`job_run_routine_missing` → `unexpected_error`).
- Catálogo `holiday.provider.pull`: API 293, cron 298, painel 284, worker 303.
- `holiday-discovery.query.ts` 39, `holiday-fetch.query.ts` 33, `holiday-apply.query.ts` 16 (`coalesce(s.is_enabled, true)`);
  upsert do cursor em `drizzle-holiday-discovery.store.ts` 88–107 (não toca `is_enabled`).
- `audit_logs` exige `company_id` e `actor_user_id` com FK de membership (`fiscal-operation.schema.ts` 37–90).
- `useAuthMe.query.ts` 120–128 (`isLiteralArray`) e 162 (`permissions` contra `COMPANY_PERMISSIONS`).
- Última migration de staging: `20261009160300_nfe_addresses_participant_index`.
- Sem mecanismo de reautenticação (grep de `step-up`, `reauth`, `max_age`, `acr_values` nas apps: nada).

### Abertos

Nenhum `[NEEDS CLARIFICATION]` novo. Seguem da 252: Q3 (plano/cota) e Q4 (termos de uso), passos do usuário para **ligar**.

## T0.1 — Revisão `opus` do desenho: emendas E1–E16 (2026-10-09)

Revisão `architect` `opus` do ADR-0102 e das D1–D11 contra o código. As 16 emendas foram **aplicadas no texto** (`spec.md`,
`plan.md`, `tasks.md`, ADR-0102, nota no ADR-0100 e `docs/SECURITY.md`); aqui está o registro de cada uma. Aplicação em
`work/262-t0b` a partir de `origin/staging` `a5868f369` (com a Fase 1; `git fetch origin` exit 0; `git switch -c` exit 0;
`bun install --frozen-lockfile` exit 0). Só documentação: nenhum arquivo de `apps/**/src`, teste ou migration foi tocado; sem
push. Cada citação de arquivo e linha das emendas foi reconferida na árvore de `origin/staging` (HEAD = `origin/staging`) antes de
ser escrita; o que divergiu está na coluna "correção" e na T0.2.

| #   | O que estava                                                                                                         | O que o código mostra                                                                                                                                                                                                                                                                                                                                                                                                                                                | Correção aplicada                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | T1.2/T3.1 sem a forma autofechante e sem a posição da permissão                                                      | Dois contratos do painel leem o código da API: `test/frontend-contract.test.ts` ("keeps the allowlist in sync…", linha 266, `expect(frontendPermissions).toEqual(apiPermissions)` ordenado) e `test/identity/permission-matrix.contract.ts` ("não inventa permissão que a API não concede", linha 137); `TRANSPORTADA_PERMISSIONS` termina em `occurrences.decide` (`authorization.policy.ts` 116); o locale exige `label` **e** `where` (`permission-matrix` 94–95) | `holiday-import.configure` no **fim** das três listas; T3.1 apaga `PENDING_API_PERMISSIONS` no mesmo commit; spec RF7, plan Fase 1/3, tasks T3.1. A Fase 1 já fez isso (`evidence.md` § Fase 1, `PENDING_API_PERMISSIONS` em `pending-api-permissions.fixture.ts`); **não repetido aqui**                                                                               |
| E2  | Catálogo: só "painel primeiro", sem dizer que os contratos leem o fonte da API e que cada app repete a própria lista | `test/shared/job-catalog.contract.ts` lê o fonte da API (`API_CATALOG_SOURCE`); worker, cron e API repetem a lista em `test/job-catalog/catalog.contract.ts` (entrada `holiday.provider.pull`: worker 148, cron 149, API 157); `run-job-cycle.ts` 176 (`isJobOutcome`) rebaixa desfecho fora do catálogo do worker a `unexpected_error`                                                                                                                              | Spec RF9, plan Fase 3/4, tasks T3.1 (API e cron), T4.1 (worker) e "T4.1 antes da T4.2 é obrigatória"; `PENDING_API_FAILURE_OUTCOMES` já feito na Fase 1                                                                                                                                                                                                                 |
| E3  | Gate A mandava `railway variables --service worker --environment <env>` "filtrando o nome"                           | Esse comando **imprime a linha com o valor** da chave: queimaria o segredo (`security.md` §4)                                                                                                                                                                                                                                                                                                                                                                        | Spec D4, tasks (Gate A), ADR-0102 D4, plan (riscos e ordem): comando que imprime **só nomes** (`--json` + `jq -r 'keys[] \| select(startswith("FERIADOS_API"))'`) **com aviso de que a flag `--json` não foi confirmada** na versão instalada, ou a aba Variables (mascarada); regra "a saída nunca pode conter um valor"; o comando perigoso só aparece como proibição |
| E4  | "A 252 ainda não está em `main`"; "a 262 entra junto com o PR2 dela"; Status do ADR "depois da promoção da 252"      | A 252 **está em `main`**: `a158bd687` (#155), `4d01307c4` (#156), `63b55be61` (#159), todas de 2026-10-09 (`git merge-base --is-ancestor` exit 0 nas três); catálogo da API, migration `20261009040622_holiday_provider_import` e `apps/worker-transportada/src/holiday-provider-pull/` em `origin/main`                                                                                                                                                             | Cabeçalho e D10 da spec, Status do ADR-0102, item 7 do plano, § Publicação e Gate A do tasks, "Fora do escopo": produção sem "junto do PR2"; **Gate A em produção obrigatório**                                                                                                                                                                                         |
| E5  | Gate A "antes da T4.3"                                                                                               | A T4.2 já deixa de ler a variável: o registro não usa mais `config.holidayProviderPull` (`holiday-provider-pull.registry.ts` 41–42 e 60–65)                                                                                                                                                                                                                                                                                                                          | Gate A antes da **publicação da Fase 4 inteira**: T4.1–T4.3 commitadas localmente e publicadas num push só; no Quadro a T4.2 depende do Gate A para publicar; plan (fase 4, ordem 3)                                                                                                                                                                                    |
| E6  | RF2/RF4 sem o `settingsId` explícito, sem o formato do plaintext e sem o caso `ON CONFLICT DO NOTHING`               | O AAD precisa do id antes da linha existir (molde `contractor-mail.port.ts` 109–114); o Zod do envelope no molde do worker fica **fora** do `try` (`contractor-mail-credential-secret.service.ts` 85)                                                                                                                                                                                                                                                                | Spec D5, RF2, RF4; ADR-0102 D5; plan Fase 3/4; tasks T3.2, T3.3, T4.1: `crypto.randomUUID()` antes de selar; `ON CONFLICT DO NOTHING` sem inserção → descarta o envelope e `409`; plaintext `{"token":"…"}` `.strict()` com a mesma regex; paridade cobre AAD **e** plaintext; erro de abertura (inclusive o Zod do envelope) → `token_unreadable`                      |
| E7  | D3 e ADR D3 citavam `geocoding.refine` como precedente de "registrada sempre"                                        | `geocoding.refine` é registrada **só** com a chave (`main.ts` 1242–1251); o precedente certo é `trip.location.purge` (`main.ts` 1302; `apps/worker-transportada/CLAUDE.md` 160–169); o registro parcial é permitido (`CLAUDE.md` do worker 19–25)                                                                                                                                                                                                                    | Spec D3, ADR-0102 D3, plan, tasks T4.2: precedente `trip.location.purge`; `geocoding.refine` só como "ausência de chave não é falha"                                                                                                                                                                                                                                    |
| E8  | D10 justificava a ordem dizendo que o painel quebraria também com o desfecho                                         | Só a **permissão** quebra o painel (`useAuthMe.query.ts` `isLiteralArray` 122–130, uso 164; 120–128 e 162 antes da Fase 1; idem em `origin/main`); o desfecho **não** (`holidayImportGuards.validation.ts` 62 aceita qualquer string; `isJobOutcome` só em `nfeWorkspaceClient.service.ts` 551); o app do motorista não valida `permissions`                                                                                                                         | Ordem mantida; justificativa corrigida na spec D10 e no ADR-0102 D10: obrigação da permissão; catálogo primeiro por convenção da 252 e direção do contrato de paridade                                                                                                                                                                                                  |
| E9  | RF11 pedia `button role="switch"`                                                                                    | Não existe no painel (só um seletor de string em `tripRowClick.service.ts`); o molde é o `Checkbox` (`SaturdayBlock.component.tsx` 5; `frontend CLAUDE.md` 54–57), `@/components/ui/skeleton` existe; `BusinessCalendarPanel` só recebe `canManage` (`CompanySettings.page.tsx` 256)                                                                                                                                                                                 | Spec RF11, plan Fase 5, tasks T5.2: `Checkbox` com rótulo, skeleton no carregando, bloco antes de `HolidayImportStatus`, prop nova para `holiday-import.configure`; escrever exige as **duas** permissões                                                                                                                                                               |
| E10 | RF12 não dizia de onde vem o orçamento nem que os textos "sem token" ficam obsoletos                                 | O `status` só tem `monthlyRequests` (`holiday-import.schema.ts` 104 e 123); `holiday-fetch.query.ts` 70 só reivindica com `requests < budget`; `businessCalendar.locale.json` 281, 289 e 290 mandam olhar "sem token" em Operações                                                                                                                                                                                                                                   | Spec D8/RF12, plan Fase 5, tasks T5.3: orçamento por `monthlyRequestBudget` do `GET` do RF3, `>=`; T5.3 reescreve os textos (pt e `.en`)                                                                                                                                                                                                                                |
| E11 | Constantes do orçamento na API em `business-calendar/domain`                                                         | `apps/api-transportada/src/shared/holiday-provider.constant.ts` já é importado por `database/holiday-provider.schema.ts` 31 e `database/schema-check.constant.ts` 16; o schema não importa de domínio (`api CLAUDE.md` 65); paridade vive em `worker test/holiday-provider-pull/parity.contract.ts`                                                                                                                                                                  | Spec RF10, plan Fase 3, tasks T3.3: constantes em `src/shared/holiday-provider.constant.ts`                                                                                                                                                                                                                                                                             |
| E12 | RF4/RF6 não tratavam o helper de auditoria                                                                           | `appendBusinessCalendarAudit` fixa `permission = 'settings.manage'` (`business-calendar-audit.support.ts` 36; constante em `business-calendar-audit.constant.ts` 7) e tem alvo fechado (9–16); IP em `metadata.ipAddress` (35); `audit_logs.entity_id` é `uuid not null` (`fiscal-operation.schema.ts` 55) e a PK de `company_holiday_import_settings` é `company_id`                                                                                                | Spec RF4/RF6, plan, tasks T3.3/T3.4: parâmetro `permission` opcional, alvos `holiday_provider_settings` e `company_holiday_import_settings`, ações novas, IP em `metadata.ipAddress`; no RF6 `entity_id` = `companyId`                                                                                                                                                  |
| E13 | Documentos vivos sem `cron-transportada.md` e sem a frase de `SECURITY.md` sobre quem lê o token                     | `docs/ai-context/cron-transportada.md` 143–146 cita `FERIADOS_API_TOKEN` e diz que o cron "nunca … lê o token"; `docs/SECURITY.md` 67–70 diz que "API … nunca … leem o token" e que o token existe só no worker: deixa de ser verdade (a API recebe e sela a chave, em claro na memória durante o `PUT`)                                                                                                                                                             | Plan § Documentação viva e tasks T6.1 ganharam os dois arquivos; spec Riscos e ADR-0102 § Riscos registram a chave em claro na memória da API; `docs/SECURITY.md`: ponteiro nas linhas 67–68 e a nota "Emenda planejada" ampliada (o ai-context **não** foi editado agora, só a T6.1 o fará)                                                                            |
| E14 | Citações de linha imprecisas                                                                                         | `return {}` do registro na linha **42** (não 41); montagem da busca em **59–71**; `contractor-mail.schema.ts` **47–95**. Divergência da própria emenda: a emenda diz que o status no `BusinessCalendarPanel` fica na linha 44, mas a **45** é a de `HolidayImportStatus` (a 44 é `StateHolidaySection`, a 8 o import)                                                                                                                                                | Corrigidas em spec, plan e ADR-0102; mantido **45** para o status                                                                                                                                                                                                                                                                                                       |
| E15 | T2.2 dizia "hoje `20261009160300`"                                                                                   | `work/spec-260` tem `20261009170338_conversation_subject`, `20261009171836_conversation_protocol` e `20261009205256_quick_reply_driver_audience`, fora de staging; a última de staging é `20261009160300`                                                                                                                                                                                                                                                            | Timestamp **maior que `20261009205256`**, gerado na hora; regenerar o `snapshot.json` se a 260 entrar antes (plan Fase 2, tasks T2.2)                                                                                                                                                                                                                                   |
| E16 | Nomes `token_unreadable`/`credential_unreadable` sem justificativa                                                   | A NFS-e usa a causa `credential_unreadable` mas grava o desfecho `credential_missing` (`nfse-status-pull-failure.policy.ts` 27); na 262 chave ausente não é falha                                                                                                                                                                                                                                                                                                    | Justificativa registrada na spec D3 e no ADR-0102 D3; `credential_unreadable` tem 21 caracteres (`JOB_OUTCOME_MAX_LENGTH` = 40)                                                                                                                                                                                                                                         |

**Numeração (reconferida em 2026-10-09):** 260 colide (`260-a-nota-que-volta-ao-barracao-fica-disponivel` em staging e
`260-o-chat-chega-ao-app-do-motorista` em `work/spec-260`); 261 livre; ADR 0101 tomado em `work/spec-260`; 262 e 0102 únicos
(`git ls-tree` de `origin/staging` e de `work/spec-260`).

**Escopo e segurança:** nenhuma emenda muda o escopo de produto (chave + orçamento + liga/desliga; token cifrado no banco pelo
chaveiro; a tela **não** despausa a rotina; permissão `holiday-import.configure`). A E3 deixa o Gate A mais seguro, a E4 torna o
Gate A em produção obrigatório e a E13 só **declara** um risco que já existia na decisão (a API recebe a chave em claro no `PUT`).
**Nenhum `[NEEDS CLARIFICATION]` novo.** A E9 tem uma consequência de UX a conhecer: quem tem `holiday-import.configure` por
grupo mas não `settings.manage` não alcança a aba; é o comportamento desejado da D6 e está dito no RF11.

**Status do ADR-0102:** proposta → **aceita (2026-10-09)**; ADR-0100 acompanha ("aceita em 2026-10-09" na linha de emenda).

## T0.2 — Citado → real (2026-10-09)

Conferido com `sed -n`/`grep -n -F` na árvore de `origin/staging` `a5868f369`. "Real" é a linha de hoje; a coluna "citado" é a do
`plan.md` ou da emenda. Onde a Fase 1 mexeu no arquivo, o número andou e está marcado.

| Citado                                                                                                                                                                                                                     | Real                                                                                                               | Veredito                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `environment.schema.ts` 98–102 / 272–288 / 440–463 (worker)                                                                                                                                                                | `FERIADOS_API_*` 101–102; `toHolidayProviderPull` 273–288; `optionalToken` 440; orçamento 447–463                  | ok                        |
| `shared/worker.types.ts` 82                                                                                                                                                                                                | `readonly holidayProviderPull?` na 82                                                                              | ok                        |
| `holiday-provider-pull.registry.ts` 36–41                                                                                                                                                                                  | `return {}` na **42**                                                                                              | corrigido (E14): 36–42    |
| registry, montagem da busca 58–70                                                                                                                                                                                          | **59–71** (`budget` em 60, `token` em 65)                                                                          | corrigido (E14)           |
| `main.ts` 527 / 588 / 998 / 1039 / 1473                                                                                                                                                                                    | chaveiro 527; `createSecretEnvelopeProvider` 588, 998, 1039; registro 1473                                         | ok                        |
| `main.ts` 1242–1251 (`geocoding.refine`) / 1302 (`trip.location.purge`)                                                                                                                                                    | 1242–1251 registra só com a chave; 1302 é `[TRIP_LOCATION_PURGE_JOB]`                                              | ok (E7)                   |
| `run-job-cycle.ts` 102–113 / 176                                                                                                                                                                                           | `routine === undefined` 102–113; `isJobOutcome` 176                                                                | ok                        |
| `JOB_WRAPPER_OUTCOMES` 30–35 (worker)                                                                                                                                                                                      | 30–35 (o tipo na 36)                                                                                               | ok                        |
| `cryptographic-configuration.schema.ts` 34–35                                                                                                                                                                              | `ENCRYPTION_ACTIVE_KEY_ID` 34, `ENCRYPTION_KEYRING_JSON` 35                                                        | ok                        |
| `.railway/railway.ts` 166–171                                                                                                                                                                                              | `ENCRYPTION_*` 166–167; `FERIADOS_API_MONTHLY_REQUEST_BUDGET` 169; `FERIADOS_API_TOKEN` 171                        | ok                        |
| catálogo `holiday.provider.pull`: worker 297–306, API 293, cron 298, painel 284                                                                                                                                            | `job:` na API 293, cron 298, worker 303 (bloco 297–306); painel **289** (bloco 283–288, com a Fase 1)              | ok (painel: Fase 1 andou) |
| `holiday-discovery.query.ts` 39 / `holiday-fetch.query.ts` 33 / `holiday-apply.query.ts` 16                                                                                                                                | `coalesce(s.is_enabled, true)` nas três linhas                                                                     | ok                        |
| `holiday-fetch.query.ts` 70                                                                                                                                                                                                | `where … requests < ${input.budget}`                                                                               | ok (E10)                  |
| `drizzle-holiday-discovery.store.ts` 88–107                                                                                                                                                                                | `upsertCursor` a partir da 88                                                                                      | ok                        |
| `holiday-import.schema.ts` (API) 100–123                                                                                                                                                                                   | `monthlyRequests` nas linhas 104 e 123; não há orçamento                                                           | ok (E10)                  |
| `fiscal-operation.schema.ts` 37–90 / 55                                                                                                                                                                                    | `audit_logs` na 38; `entityId` uuid not null na 55                                                                 | ok (E12)                  |
| `business-calendar-audit.support.ts` 36 / 35; `business-calendar-audit.constant.ts` 7 / 9–16                                                                                                                               | `permission` na 36, `metadata.ipAddress` na 35; constante na 7; alvos 9–16                                         | ok (E12)                  |
| `contractor-mail.port.ts` 109–114                                                                                                                                                                                          | comentário 109–113 e `settingsId` na 114                                                                           | ok (E6)                   |
| `contractor-mail-credential-secret.service.ts` (worker) 85                                                                                                                                                                 | `envelopeSchema.parse` na 85, fora do `try`                                                                        | ok (E6)                   |
| `contractor-mail.schema.ts` 47–89                                                                                                                                                                                          | tabela de 47 a **95**                                                                                              | corrigido (E14)           |
| `nfse-status-pull-failure.policy.ts` 27                                                                                                                                                                                    | `credential_unreadable: 'credential_missing'`                                                                      | ok (E16)                  |
| `authorization.policy.ts` `settings.manage` 122–138; `cargo.measure` 95–100                                                                                                                                                | definição na 35, concessão ao `company-admin` na 138; comentário 95–100; lista termina na 116                      | ajustado (E1)             |
| `useAuthMe.query.ts` 120–128, 162, 197–198                                                                                                                                                                                 | `isLiteralArray` **122–130**, uso **164**, `IDENTITY_AUTH_ME_INVALID` na 200 (Fase 1 somou 2 linhas)               | ajustado (E8)             |
| `holidayImportGuards.validation.ts` 33, 62                                                                                                                                                                                 | `LAST_RUN_KEYS` 33; `isString(value.outcome)` 62                                                                   | ok (E8)                   |
| `nfeWorkspaceClient.service.ts` 551                                                                                                                                                                                        | único uso de `isJobOutcome` no painel                                                                              | ok (E8)                   |
| `BusinessCalendarPanel.component.tsx` 41–48 / status na 44 (emenda)                                                                                                                                                        | seções 42–47; `HolidayImportStatus` na **45** (44 é `StateHolidaySection`)                                         | emenda corrigida (E14)    |
| `CompanySettings.page.tsx` ~256                                                                                                                                                                                            | `<BusinessCalendarPanel canManage={props.canManageSettings} …/>` na 256                                            | ok (E9)                   |
| `SaturdayBlock.component.tsx` 5; `frontend CLAUDE.md` 54–57                                                                                                                                                                | `import { Checkbox }` na 5; texto da revisão de design 54–57                                                       | ok (E9)                   |
| `businessCalendar.locale.json` 281, 289, 290                                                                                                                                                                               | "token inválido" na 281; "sem token" na 289 e 290                                                                  | ok (E10)                  |
| `identity.locale.json` 445–448; `permission-matrix.contract.ts` 93–94                                                                                                                                                      | `settings.manage` com `label`/`where` em 445–448; expectativas em **94–95**                                        | ajustado (E1)             |
| `frontend-contract.test.ts` ~264–296; `permission-matrix` 136–147                                                                                                                                                          | teste na **266**; "não inventa" na **137** (a Fase 1 reescreveu os dois)                                           | ajustado (E1)             |
| `test/shared/job-catalog.contract.ts` 23–26, 68                                                                                                                                                                            | leitura do fonte da API no topo; igualdade na **81** (Fase 1 acrescentou os pendentes)                             | ajustado (E2)             |
| `test/job-catalog/catalog.contract.ts` worker 148, cron 149, API 157                                                                                                                                                       | linha do `job:` de `holiday.provider.pull` em cada uma                                                             | ok (E2)                   |
| `api-transportada/src/shared/holiday-provider.constant.ts`; `schema.ts` 31; `schema-check` 16                                                                                                                              | arquivo existe; importado nas linhas 31 e 16                                                                       | ok (E11)                  |
| `api CLAUDE.md` 65; `worker CLAUDE.md` 19–25, 160–169                                                                                                                                                                      | "o schema não importa de domínio" na 65; registro parcial 19–25; expurgo 160–169                                   | ok (E7, E11)              |
| `http/router.service.ts` 76–81; `request-parsing.service.ts` 58–71                                                                                                                                                         | `rateLimit` 76–81; `parseAgainstSchema` devolve `{ field, message }` 58–71                                         | ok                        |
| `tenant-safety.contract.ts` 15 (`SUPPORT_ONLY`)                                                                                                                                                                            | `const SUPPORT_ONLY = [` na 15                                                                                     | ok                        |
| `docs/spec/railway.md` 93 / 287–290; `specs/239-…/spec.md` D3 140–163                                                                                                                                                      | "omitir é apagar" na 93; rotação do chaveiro 287–290; D3 a partir da 140                                           | ok                        |
| `docs/ai-context/cron-transportada.md` ~145; `docs/SECURITY.md` 67–68                                                                                                                                                      | 143–146 cita `FERIADOS_API_TOKEN`; SECURITY 67–70 diz quem lê o token                                              | ok (E13)                  |
| Último timestamp de migration em staging                                                                                                                                                                                   | `20261009160300_nfe_addresses_participant_index`; `20261009040622_holiday_provider_import` (252)                   | ok                        |
| Próximo timestamp livre                                                                                                                                                                                                    | maior que `20261009205256` (`work/spec-260`, fora de staging)                                                      | corrigido (E15)           |
| Nomes ≤ 63 bytes: tabela 25; `_provider_unique` 41; `_provider_check` 40; `_budget_check` 38; `_version_check` 39; `_token_check` 37; `_pkey` 30; `holiday_provider_installation_settings_monthly_request_budget_check` 67 | `wc -c` em cada nome: 25, 30, 41, 40, 38, 39, 37 e 67 (o nome `installation` tem 38 na tabela); só o de 67 estoura | ok (justifica D1)         |
| `credential_unreadable` 21 ≤ `JOB_OUTCOME_MAX_LENGTH` 40                                                                                                                                                                   | `JOB_OUTCOME_MAX_LENGTH = 40` em `job-catalog.constant.ts` 323 (worker)                                            | ok                        |
| 252 em `main`                                                                                                                                                                                                              | `a158bd687`, `4d01307c4`, `63b55be61` são ancestrais de `origin/main`                                              | ok (E4)                   |

Sem conflito de rotas: `grep -rn -F "provider-settings"` e `"company-settings/holiday-import"` em `apps/api-transportada/src` = 0
ocorrência (só existe a base `/holiday-imports`, `shared/api.constant.ts` 134).

## Fase 1 — O painel aprende antes

Branch `work/262-f1` a partir de `origin/staging` (`git fetch origin` exit 0; `git switch -c` exit 0); `bun install --frozen-lockfile`
ok. Sem push.

### Formato das pendências (autofechante)

Dois contratos do painel leem o código da API e quebram se o painel conhecer algo antes dela. Em vez de afrouxá-los, cada um ganhou uma
lista de **pendentes**: o painel **sem** os pendentes iguala a API; cada pendente tem de estar **ausente da API** e **presente no painel**.
Quando a API receber o item, o contrato fica vermelho sozinho e a T3.1 é obrigada a apagar a lista e restaurar a igualdade estrita.

- Desfechos: `PENDING_API_FAILURE_OUTCOMES` em `test/shared/job-catalog.contract.ts`.
- Permissões: `PENDING_API_PERMISSIONS` em `test/identity/pending-api-permissions.fixture.ts`, usada por **dois** contratos:
  `test/frontend-contract.test.ts` ("keeps the allowlist in sync with the API authorization policy", que compara `COMPANY_PERMISSIONS`
  com a API **em ordem**; existia além do `permission-matrix`) e `test/identity/permission-matrix.contract.ts` ("não inventa
  permissão que a API não concede").

### T1.1 — `credential_unreadable` no catálogo do painel

- `jobCatalog.constant.ts`: `credential_unreadable` no fim de `failureOutcomes` de `holiday.provider.pull`.
- Vermelho antes: `shared.contract` 424 pass / 1 fail (o painel não tinha o nome).
- Mutações (restauradas, `diff --quiet` = 0): tirar a palavra do painel → vermelho ("every pending outcome is known to the panel…");
  tirar `malformed_response` do painel → vermelho (igualdade); **a API ganhar** `credential_unreadable` → vermelho em 2 testes
  (autofechamento).

### T1.2 — `holiday-import.configure` no painel

- `COMPANY_PERMISSIONS` (no fim, após `occurrences.decide`), grupo `settings` de `PERMISSION_GROUPS`, locales pt/en
  (`label` "Configurar a chave e o orçamento da importação de feriados" e `where`).
- Contrato novo `test/identity/holiday-import-permission.contract.ts` (importado por `identity.contract.test.ts`): `isAuthMeResponse`
  aceita o `/auth/me` com a permissão e continua recusando uma desconhecida; o grupo de Configurações a oferece.
- Vermelho antes (commit `9de8356d0`): 2 fail (guarda recusava; grupo sem a permissão).
- Mutações (restauradas, `diff --quiet` = 0): tirar de `COMPANY_PERMISSIONS` → 2 fail (`frontend-contract` e a guarda); **a API
  ganhar** a permissão → 2 fail (`frontend-contract` e a lista de pendentes do `permission-matrix`).

### Gates da Fase 1 (cwd `apps/frontend-transportada`)

`bun run typecheck` exit 0; `bun run lint` exit 0 (0 erros, 16 avisos antigos, nenhum em arquivo tocado); `bun run test` exit 0 —
7853 pass / 0 fail (suíte principal) + 1247 pass / 0 fail (`test:hooks`, parte do script `test`).

## Fases 2 e 3 — Dado e API

Branch `work/262-f23` a partir de `origin/staging` `a34f2ca34` (`git fetch origin` exit 0; `git switch -c` exit 0; `bun install
--frozen-lockfile` exit 0; staging não andou até o fim: `git log HEAD..origin/staging` vazio). Sem push. Postgres **nativo**
descartável 18.4 na porta 65452 (banco `transportada_test` e a administração em `postgres`), `.env.test` de teste por link para o
scratchpad com valores obviamente falsos; nada de produção foi lido nem tocado. Docker não foi usado: o `make migration-test` é
`DRIZZLE_TEST_DATABASE_URL=… bun run db:test`, que rodei direto contra o banco nativo.

SHAs (ordem de execução): T2.1 `1d18952b0` · T2.2 `299f2a478` + `b4fbbdbda` (contrato estático endurecido pela mutação) · T3.1 contratos
`4c76a8175`, código `95826896a` · T3.2 contrato `bbc808d63`, código `05c96aff9` · T3.3 contratos `24bb78ec2`, código `831fa93d9` · T3.4 contratos
`f32975895`, código `5f458ce58` · pesos de shard `2f8c055fb`.

### T2.1 — contratos do modelo (vermelho antes)

`test/database-migration/holiday-provider-settings.{constant,static.contract,assertion}.ts` + a lista de tabelas em `support.ts`
(`HOLIDAY_PROVIDER_SETTINGS_TABLES`, **não** a `HOLIDAY_PROVIDER_TABLES` da 252: acrescentá-la derrubava dois contratos estáticos da 252, que
exigem as seis tabelas dela no `rollback.sql` dela). Estático: 6 nomes explícitos com o tamanho em bytes que o ADR contou (38, 30, 40, 41, 37, 39) e ≤ 63; diretório mais novo que `20261009205256_quick_reply_driver_audience` (E15) e **último** da cadeia; uma só `CREATE TABLE`; sem
`ALTER/DROP/UPDATE/DELETE/INSERT/ENUM/REFERENCES`; CHECK da chave com `is not null` à parte para a dica e para a data; `rollback.sql` = `BEGIN`,
`DROP TABLE`, journal com `ROW_COUNT`, `COMMIT`, sem `CASCADE` e sem recusa. Banco: dez colunas na ordem, seis constraints, aceita a linha sem chave
e a com os três campos; recusa dica sem envelope, envelope sem dica, dica de 3 e 5 caracteres, com espaço, não ASCII, envelope `[]` e `"…"`
(string), data sem dica, orçamento 0, −5 e 1.000.001, `version` 0, `provider` desconhecido e o segundo `feriadosapi` (`23505`); aceita o
orçamento 1 e 1.000.000; o rollback roda **com** uma chave gravada (D11) e a migration volta a subir. Vermelho pelo motivo certo:
`_holiday_provider_settings migration is required` (4 testes estáticos) e a lista de tabelas do `database-migration.integration` (146 pass / 5 fail).

### T2.2 — migration, schema e paridade

- `drizzle/20261009223052_holiday_provider_settings/{migration.sql,rollback.sql,snapshot.json}` (gerada com `db:generate`, timestamp > `20261009205256`;
  comentário de cabeçalho e `rollback.sql` à mão). Schema Drizzle da API (`src/database/holiday-provider-settings.schema.ts`, exportado em
  `database.schema.ts`), cópia só com as colunas no worker e paridade coluna a coluna em `test/holiday-provider-pull/schema-parity.contract.ts`
  (o regex de tipo ganhou `bigint|jsonb`; 10 colunas). Constantes do orçamento na API em `src/shared/holiday-provider.constant.ts` com **os mesmos
  nomes do worker** (`FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET` = 4500, `FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET` = 1.000.000, mais o mínimo e a
  lista de fornecedores), porque o contrato de paridade compara a declaração pelo nome; paridade em `test/holiday-provider-pull/parity.contract.ts`.
- ⚠️ O Postgres 18 grava as `NOT NULL` em `pg_constraint` (`contype = 'n'`); a asserção filtra `c`, `p`, `u` para valer em qualquer versão (a CI não é a 18).
- ⚠️ O Bun serializa um `string` passado a `::jsonb` como **string JSON** (a CHECK recusou o envelope válido); o auxiliar de teste usa `::text::jsonb`.
- Gates: `db:test` (`DRIZZLE_TEST_DATABASE_URL`) 189 pass / 0 fail; `db:generate` = `no_changes`; `db:check` ok; `schema-snapshot` verde (cadeia linear);
  API `typecheck` e `lint` exit 0; contratos da API 11215 pass / 1 skip / 0 fail (o skip é o mesmo desde o começo, não é de arquivo meu); worker `typecheck`, `lint`,
  `test` 2315 pass / 0 fail.
- Mutações (restauradas por `git checkout`, `git diff --quiet` = 0): (A) tirar `"token_hint" is not null` da CHECK → estático e banco vermelhos;
  (B) teto `1000000` → `10000000` → **só o banco** pegava (o `toContain` aceitava o prefixo): contrato estático endurecido com regex fechada em `)`
  (`b4fbbdbda`) e a mutação passou a derrubar também o estático. 🧠 A **revisão `opus` separada da T2.2 fica para o chamador pedir**.

### T3.1 — permissão e desfecho

- Vermelho: `authorization.contract` (lista inteira + teste novo), matriz de papéis, catálogo da API e do cron (3 + 2 + 2 falhas).
- `holiday-import.configure` no **fim** de `TRANSPORTADA_PERMISSIONS` e da lista do `company-admin`, só ele, concedível por grupo
  (`isGrantablePermission`), não é de serviço; separador e ajudante fora. `credential_unreadable` no fim de `failureOutcomes` de
  `holiday.provider.pull` na **API** e no **cron**, cada um com a lista do próprio contrato. A Fase 1 está em `origin/staging`
  (`git merge-base --is-ancestor 9de8356d0 origin/staging` exit 0). **Pendências do painel apagadas no mesmo commit**:
  `PENDING_API_PERMISSIONS` (arquivo `pending-api-permissions.fixture.ts` removido e seus usos em `frontend-contract.test.ts` e
  `permission-matrix.contract.ts`, inclusive o teste da lista) e `PENDING_API_FAILURE_OUTCOMES` (`shared/job-catalog.contract.ts`, voltou
  `toEqual(CATALOG)` sem `withoutPendingOutcomes`). O painel já tinha o nome, então não houve mudança de código no painel.
- Gates: API contratos verdes; cron `typecheck`/`lint`/`test` 101 pass / 0 fail; painel `typecheck`, `lint` (0 erros, 16 avisos antigos), `bun run test`
  7851 pass / 0 fail (eram 7853: saíram os 2 testes das listas) e `test:hooks` 1247 pass / 0 fail; `test/frontend-contract.test.ts` 15 pass / 0 fail.
- Mutações (todas restauradas): permissão também em `operator` → matriz e catálogo vermelhos; permissão no **meio** da lista da API → `frontend-contract`
  (igualdade **ordenada** do painel) vermelho; tirar `credential_unreadable` do cron → cron vermelho; tirar da API → contrato da API e `shared/job-catalog.contract` do painel vermelhos.

### T3.2 — selo da chave

`business-calendar/application/holiday-provider-token-secret.service.ts` + `domain/holiday-provider-settings.{constant,error}.ts`. AAD
`transportada:holiday-provider-token:v1:${settingsId}`; plaintext `{"token":"…"}` com `.strict()` e `^[\x21-\x7E]{16,512}$` na abertura **e** ao selar;
`decrypt` recebe o envelope como `unknown` e o parse Zod fica **dentro** do `try` (E6: envelope malformado vira o mesmo erro seguro, sem tocar o cofre);
bytes em claro e AAD zerados no `finally`; falha do cofre vira `HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE` (500, mensagem fixa, sem `cause`, sem chave nem id).
Contrato (10 testes): AAD canônico e plaintext exato, round-trip com cofre real, não abre com outro id nem com AAD de outra versão, com sufixo `:feriadosapi`, sem id
ou de outro módulo, nem com ciphertext adulterado; campo a mais, chave fora da regra (curta, longa, espaço, acento, controle), JSON inválido, número no lugar da string e
array; limites de 16 e 512; envelope malformado (5 formas) antes do cofre; chave inválida ao selar sem tocar o cofre e sem eco (`HOLIDAY_PROVIDER_TOKEN_INVALID`, 400);
envelope com campo a mais devolvido pelo cofre; mensagem do cofre com a chave e o id não vaza.
⚠️ **O AAD não leva o `provider`** (nem o pedido o previa: `…v1:${settingsId}`), então "não abre com outro `provider`" foi coberto como "não abre com AAD de outra forma"
(versão, sufixo, vazio, outro módulo); o id da linha é o único amarrador.
Mutações: AAD sem o id, `.strict()` removido do plaintext, `plaintext?.fill(0)` removido → 3 vermelhos (restauradas).

### T3.3 — rotas da instalação

- Código: `HolidayProviderSettingsPort`/`use-case` (gera o `settingsId` com `crypto.randomUUID()` **antes** de selar; atualização usa o id da linha; atualizar linha inexistente
  é `409` sem selar nem gravar; a porta nunca recebe o texto da chave), `DrizzleHolidayProviderSettingsRepository` (único importador da tabela global; `INSERT … ON CONFLICT
(provider) DO NOTHING` sem linha → descarta e `409`; atualização por `SELECT … FOR UPDATE` + `UPDATE … WHERE id AND version`; salvar igual não grava nem audita; `DELETE` zera os
  três campos, sobe a versão e audita, idempotente), rotas `GET` (`settings.manage`), `PUT` e `DELETE …/token` (`holiday-import.configure`, balde `postgres` `holiday-provider-settings`
  10/h, as duas escritas no mesmo balde, GET sem teto), corpo `.strict()` com mensagens fixas, lista branca na resposta. Auditoria: `appendBusinessCalendarAudit` ganhou `permission`
  opcional (padrão `settings.manage`), os alvos `holiday_provider_settings` e `company_holiday_import_settings` e as ações `holiday-provider-settings.saved`,
  `holiday-provider-settings.token-removed` e `holiday-import.enablement-changed`; snapshots só `{ monthlyRequestBudget, tokenConfigured, version }` e `metadata.changedFields`
  (ordem alfabética) + `ipAddress`. Composição em `main.ts` com o `envelopeProvider` que a API já monta.
- Contratos: `holiday-provider-settings-routes` (13 casos pelo **roteador de verdade**: chaves exatas, `no-store`, 16 corpos recusados com `400` sem a chave no corpo nem no log, `403`, `409`,
  `429` no 11º, balde compartilhado, tabela de políticas), `holiday-provider-settings-use-case`, `rate-limited-routes` (entrada nova + lista de arquivos com teto), `separator-role`
  (as rotas entram na enumeração), isolamento da tabela global (só o repositório a importa; presentation do calendário sem envelope nem `updatedByUserId`) e `SUPPORT_ONLY` do
  `tenant-safety`. Integração `holiday-provider-settings.integration.ts` (15 testes, 0 skip): envelope abre com o AAD da linha e não com outro id; **sentinela** (`FAKE-…-Q7zK`) e a dica
  procuradas em respostas, logs e **todas** as colunas de `audit_logs` (a dica só aparece nas respostas, que a devolvem de propósito); permissão/entidade/alvo/IP da auditoria; `409` de versão
  velha e de criação sem versão; criar de novo descarta o envelope; **duas criações simultâneas** (um `200`, um `409`, uma linha); salvar igual; orçamento sozinho / chave sozinha; rollback
  junto com a auditoria; `DELETE` e idempotência; `403` com só `settings.manage`; a empresa B lê a configuração sem ver quem a gravou; o 11º pedido é `429` com o **limitador real do Postgres**
  (inclusive com corpo inválido, porque ele conta antes do `parse`).
- Registro: `package.json` `test:integration` e `shard-weights.json` (21 s e 8 s medidos); fixture `holiday-provider-settings-http.fixture.ts` (roteador real, logger capturado) e
  `createTestRouter` ganhou `rateLimitWindows` opcional.
- Mutações (restauradas): lista branca com `...record` → vermelho; `.strict()` do corpo removido → vermelho; limitador do `PUT` removido → vermelho (tabela de rotas e `rate-limited-routes`);
  `PUT` com `settings.manage` no lugar da permissão dedicada → vermelho (`403` e tabela); `HolidayProviderTokenFormatError` com a chave na mensagem → vermelho; **dica na auditoria** → vermelho;
  sem a checagem de versão **e** sem `AND version` no `UPDATE` → vermelho. ⚠️ Cada uma das duas guardas de versão **sozinha** é equivalente (a outra segura: `FOR UPDATE` + `WHERE version`
  são redundantes de propósito), então a mutação só vermelha quando as duas saem.

### T3.4 — interruptor da empresa

`GET|PUT /company-settings/holiday-import` (`settings.manage`), `DrizzleHolidayImportEnablementRepository` (lock advisory por empresa; `INSERT (company_id, is_enabled) … ON CONFLICT
(company_id) DO UPDATE SET is_enabled` — **só** a flag), corpo `.strict()` `{ isEnabled: boolean }`. Auditoria só quando o valor **efetivo** muda, com `before`/`after` `{ isEnabled }`
(`before` = `true` quando não havia linha), `entity_id` = `companyId`, alvo `company_holiday_import_settings` e `permission` `settings.manage`. Decisão local: `PUT { isEnabled: true }` **sem linha**
não grava nem audita (o valor efetivo já é `true`) e responde `origin: 'default'`. Integração `holiday-import-enablement.integration.ts` (6 testes, 0 skip): cursor de uma linha existente intacto
ao desligar e religar; auditoria só nas mudanças; empresa B não altera a A; `companyId` no corpo `400`; só `holiday-import.configure` `403`; falha depois da auditoria desfaz a escrita.
Mutações (restauradas): `DO UPDATE SET` zerando o cursor; `find` sem o filtro da empresa; auditar sempre → 3 vermelhos.

### Gates finais das Fases 2 e 3 (cwd em cada app)

API `typecheck` e `lint` exit 0; contratos (`bun --env-file=../../.env.test run test`) **11258 pass / 1 skip / 0 fail**; `db:test` **189 pass / 0 fail**; integrações **uma por vez, 0 skip, 0 fail**: as duas novas
(15 e 6) e as de calendário, importação e aviso que a permissão e a auditoria podiam tocar — `business-calendar-{audit-on-change,state-and-settings,rules,rule-conflicts,rule-edit,rule-typed-dates,
rule-validation,tenant-safety,tenant-writes,load-rules,load-limits}`, `municipal-holiday-{interplay,generated}`, `holiday-import-{municipal,state,suppressions,status}`, `holiday-{origin,warning-reader}`,
`trip-detail-holiday-warnings`, `driver-{current-trip-holiday-warnings,holiday-independence,stop-holiday-context}`, `auth-me`, `rate-limiter`, `anonymous-rate-limit`, `contractor-mail-settings-repository`,
`local-identity-seed`, `location-retention-settings`, `migration-completeness` (32 arquivos); `integration-shard`/`test-registry` verdes. `db:generate` = `no_changes`, `db:check` ok. Worker `typecheck`/`lint`/`test` 2315 pass / 0 fail.
Cron `typecheck`/`lint`/`test` 101 pass / 0 fail. Painel `typecheck`/`lint`/`test` 7851 pass + `test:hooks` 1247 pass / 0 fail. `bun run format:check` na raiz exit 0 e `git status` vazio.

**Não feito (de propósito):** worker (Fase 4), telas (Fase 5), documentação viva (Fase 6), push, aplicar a migration em qualquer banco fora do Postgres descartável, Gate A, `make migration-test` via Docker
(equivalente rodado com `db:test`), e a revisão `opus` da T2.2.

## Fases 2 e 3 — 2ª rodada (revisão `opus`: ressalvas M1–M4 e lows)

Mesma branch `work/262-f23`, sem push, Postgres nativo descartável (18.4, porta 65452) recriado para a rodada; `git fetch origin` exit 0 e
`git rebase origin/staging` = "up to date" (staging não andou). A migration **não estava publicada**, então a mesma pasta
`20261009223052_holiday_provider_settings` foi editada (sem migration nova) e o `snapshot.json` foi regenerado com `db:generate`.

SHAs: contratos vermelhos `1ef18a32a` · código `ce0e73551` · docs `a72d99aac` (**SHA testado nos gates abaixo**; o commit de evidência que vem depois só toca
`evidence.md` e `tasks.md`).

- **M1 — orçamento NULL = padrão (decisão do coordenador).** `monthly_request_budget integer NULL`; CHECK `holiday_provider_settings_budget_check`
  (mesmo nome, 38 bytes) = `"monthly_request_budget" is null or … between 1 and 1000000`. `GET` devolve o valor **efetivo** (4500 quando NULL) com
  `budgetOrigin: 'default'`, e `'installation'` só quando há valor gravado. O primeiro `PUT {token}` **não grava** orçamento (fica NULL). **`null` é aceito
  no corpo `.strict()`** (`number | null`): `PUT {expectedVersion, monthlyRequestBudget: null}` volta ao padrão (audita `changedFields: ['monthlyRequestBudget']`,
  `before` 2500 e `after` null; repetir o `null` é no-op sem auditoria); **criar a linha só com `null` (sem `expectedVersion` e sem chave) é `400`**, porque não grava
  nada. Cópia do schema do worker anulável (paridade coluna a coluna verde). O worker resolve `coalesce(monthly_request_budget, 4500)` na Fase 4: registrado na T4.2 do
  `tasks.md`; spec D1/RF3/RF4, plan Fase 2 e ADR-0102 (D1 e §3) atualizados. Mutação (restaurada): gravar o padrão no primeiro `PUT` (`?? 4500`) → 2 integrações vermelhas
  (a leitura com origem `default` e "o primeiro PUT não grava orçamento").
- **M2.** O contrato estático não cobra mais "último da cadeia": cobra timestamp maior que `20261009160300` (última de staging) e que `20261009205256` (260); a ordem global
  fica com `static-migration.contract.ts` e o `schema-snapshot`.
- **M3.** `docs/SECURITY.md` (emenda da entrada da 252): a API recebe e sela a chave em staging; lista honesta de onde o texto em claro passa pela memória (corpo cru, string
  decodificada, objeto do `JSON.parse`, string aparada pelo Zod, `JSON.stringify` do plaintext, `Uint8Array` do `TextEncoder`, cópias do WebCrypto — `fill(0)` zera só um
  pedaço), dica de 4 caracteres visível a `settings.manage` de qualquer empresa, teto **por empresa + usuário e não global**, e o risco aceito da sobrescrita por outra empresa.
  Entradas mínimas em `apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md` (o texto completo continua na T6.1).
- **Lows.** (a) `HOLIDAY_PROVIDER_TOKEN_RULE_MESSAGE` e `HOLIDAY_PROVIDER_TOKEN_PATTERN` montados de `MIN`/`MAX` (a mensagem duplicada saiu do schema e do erro; as constantes
  `MIN_LENGTH`/`MAX_LENGTH` deixaram de ser mortas); (b) copyright na linha 1 do `migration.sql`; (c) `isNoStorePath` com os três caminhos novos + teste em `http.contract.test.ts`;
  (d) comentário de `api.constant.ts` corrigido (balde por empresa + usuário, não global); (e) teste de corrida de atualização: dois `PUT {expectedVersion:'1'}` ao mesmo
  tempo → `[200, 409]`, versão 2 e **duas** auditorias no total (a de criação e a única da atualização); (f) teste que prende "o administrador da empresa B sobrescreve a chave e a auditoria
  cai em B"; (g) comentário em `holiday-provider-token-secret.service.ts` dizendo que o `decrypt` da API é a fonte de paridade da T4.1.

### Gates (M4) — SHA `a72d99aac`, cwd em cada app

| Gate                                                     | Resultado                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| API `bun run typecheck`                                  | exit 0                                                                             |
| API `bun run lint`                                       | exit 0                                                                             |
| API contratos `bun --env-file=../../.env.test run test`  | **11261 pass / 1 skip / 0 fail** (o skip é o mesmo de antes, não é de arquivo meu) |
| API `bun --env-file=../../.env.test run db:test`         | **189 pass / 0 fail**                                                              |
| Integração `holiday-provider-settings` (sozinha, 0 skip) | **19 pass / 0 fail**                                                               |
| Integração `holiday-import-enablement` (sozinha, 0 skip) | **6 pass / 0 fail**                                                                |
| `bun run db:generate` / `db:check`                       | `no_changes` / "Everything's fine"                                                 |
| Worker `typecheck` / `lint` / `test`                     | exit 0 / exit 0 / 2315 pass, 0 fail                                                |
| `bun run format:check` na raiz                           | exit 0 (`prettier --check .`) e `git status` vazio depois do commit de evidência   |

**Ficou de fora (conforme pedido):** `DELETE` com If-Match, scrubber do Sentry, log de `ApiError` 5xx e divisão dos arquivos de teste grandes (viram tasks/fora de escopo).
