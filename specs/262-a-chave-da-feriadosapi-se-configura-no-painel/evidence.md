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
