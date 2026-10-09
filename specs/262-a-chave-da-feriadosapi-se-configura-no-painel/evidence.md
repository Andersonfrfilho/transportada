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
