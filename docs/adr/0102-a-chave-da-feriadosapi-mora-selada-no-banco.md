# ADR 0102 — A chave da FeriadosAPI mora selada no banco e se configura no painel

- **Status:** aceita (2026-10-09, desenho do `architect` validado contra o código na T0.1 da spec 262; as correções da
  validação estão no texto abaixo e em `specs/262-…/evidence.md` § T0.1, emendas E1–E16). Vale para staging; produção exige
  aprovação humana própria. **A 252 já está em `main`** (PRs #155 `a158bd687`, #156 `4d01307c4` e #159 `63b55be61`, de
  2026-10-09): o worker de produção lê `FERIADOS_API_TOKEN`, então o Gate A (D4) em produção é obrigatório.
- **Data:** 2026-10-09
- **Nasce da spec 262**
- **Emenda:** ADR-0100 D9 (o orçamento mensal deixa de ser `FERIADOS_API_MONTHLY_REQUEST_BUDGET`) e D10 ("o token mora
  só no worker", registro condicional da rotina). D13 (pausa de fábrica) **continua**.
- **Citações:** ADR-0004 (envelope A256GCM + AAD), ADR-0021 (uma instalação por transportadora),
  `0063-a-resposta-por-e-mail-decide-a-taxa.md` §7 ("a configuração é uma página do produto, não variável de ambiente"),
  ADR-0100, specs 143, 239 (D3: a variável de ambiente some quando a configuração vira tela), 252.

## Contexto

A 252 (ADR-0100 D10) pôs a chave da FeriadosAPI em `FERIADOS_API_TOKEN` e o orçamento em
`FERIADOS_API_MONTHLY_REQUEST_BUDGET`, as duas **só no worker** (`apps/worker-transportada/src/config/environment.schema.ts`
98–102 e 272–288). Sem token a rotina nem é registrada (`holiday-provider-pull.registry.ts` 36–42); despausada sem token, a
janela pousa em `job_run_routine_missing` e fecha `unexpected_error` (`job-run/application/run-job-cycle.ts` 102–113). Ligar a
importação exige alguém com acesso ao Railway — a transportadora não consegue fazer sozinha, e o produto é instalado um por
transportadora (ADR-0021), com o administrador dela como dono do ambiente.

`company_holiday_import_settings.is_enabled` existe por empresa desde a migration da 252 e as três etapas da rotina já o
respeitam (`holiday-discovery.query.ts` 39, `holiday-fetch.query.ts` 33, `holiday-apply.query.ts` 16, todas com
`coalesce(s.is_enabled, true)`), mas **não há rota nem tela** para mudá-lo (evidência da 252 § T4.1, "Decisões e lacunas"); o
runbook de emergência manda fazer `insert … on conflict` à mão no banco.

O usuário decidiu em 2026-10-09: **a chave, o orçamento mensal e o liga/desliga da importação se configuram no painel.** A tela
**não despausa** a rotina: `holiday.provider.pull` continua pausada de fábrica e despausar segue sendo ato em Operações.

## Decisão

### 1. Exceção à regra "segredo só em variável de ambiente" — e por que é a mesma que já existe

`~/.claude/rules/rules/security.md` §4 diz que segredo só existe como variável de ambiente validada no boot, e §5 que campo
sensível em repouso vai cifrado com chave de aplicação separada da do banco. A chave da FeriadosAPI passa a ser **credencial de
terceiro configurada em tempo de execução pelo dono do ambiente**, a mesma categoria que o produto já guarda no banco:

| Credencial                     | Onde mora                                              | Decisão                |
| ------------------------------ | ------------------------------------------------------ | ---------------------- |
| Token da Nota RP (NFS-e)       | `nfse_provider_credentials.secret_envelope` (jsonb)    | ADR-0004               |
| Certificado A1 e senha         | `digital_certificates.secret_envelope`                 | ADR-0004               |
| Chave do Resend + segredo Svix | `contractor_mail_settings.secret_envelope`             | ADR-0063 (resposta) §7 |
| **Chave da FeriadosAPI**       | **`holiday_provider_settings.token_envelope` (jsonb)** | **esta**               |

O que a regra protege continua valendo: o **segredo-raiz** (`ENCRYPTION_KEYRING_JSON`/`ENCRYPTION_ACTIVE_KEY_ID`) segue só em
variável de ambiente validada no boot, fora do banco (§4); a credencial em repouso é envelope A256GCM com AAD (§5), a chave de
aplicação é separada da do banco, e o backup do banco leva só o envelope (o chaveiro não está nele, e o backup tem chave
própria, `BACKUP_ENCRYPTION_KEY`). A exceção é **de lugar**, não de proteção.

### 2. Decisões (D1–D11, revogáveis pelo usuário; detalhe e justificativa em `specs/262-…/spec.md`)

- **D1 — Uma linha por fornecedor na instalação: `holiday_provider_settings`.** Sem `company_id`, como o cache e o contador do
  mês (`holiday_provider_*`, ADR-0100 D1): a conta do fornecedor e a cota são da instalação. `provider` (`'feriadosapi'`,
  único) é a chave natural; `token_envelope jsonb` (envelope selado, **sem coluna `key_id` à parte** — o envelope já carrega
  `keyId`, como nos três precedentes), `token_hint` (os 4 últimos caracteres, em claro, só para a tela), `token_updated_at`,
  `monthly_request_budget` (1 a 1.000.000), `version` (concorrência otimista), `updated_by_user_id` (sem FK, rastro).
- **D2 — API.** `GET /holiday-imports/provider-settings` (`settings.manage`; nunca devolve o token: `tokenConfigured`,
  `tokenHint`, `tokenUpdatedAt`, `monthlyRequestBudget`, `budgetOrigin`, `version`, `updatedAt`), `PUT` do mesmo caminho
  (corpo `.strict()` `{ token?, monthlyRequestBudget?, expectedVersion? }`) e `DELETE …/provider-settings/token`, os dois com
  `holiday-import.configure` e limitador `postgres`; `GET|PUT /company-settings/holiday-import` (`{ isEnabled }`,
  `settings.manage`). Auditoria na mesma transação, **sem** token nem dica.
- **D3 — O worker lê a configuração a cada ciclo e a rotina é registrada sempre.** Sem chave, a etapa de busca não roda
  (contador `token_missing`) e o ciclo fecha pelo resto (`succeeded` quando nada mais falhou): **nenhuma requisição sai**, e a
  descoberta e a aplicação (só banco) continuam. Chave que não abre (chave do chaveiro removida, AAD trocado, envelope
  corrompido): a busca não roda (contador `token_unreadable`) e o ciclo fecha **`credential_unreadable`**, desfecho novo nas
  quatro cópias do catálogo (painel primeiro). **Precedente do registro:** `trip.location.purge` (spec 239; `main.ts` 1302;
  `apps/worker-transportada/CLAUDE.md` 160–169) — registrada sempre, lê a configuração a cada ciclo e, sem configuração, fecha
  `succeeded`; o registro parcial é permitido pelo contrato do worker (`CLAUDE.md` do worker 19–25). `geocoding.refine` **não** é
  precedente de registro (é registrada só com a chave, `main.ts` 1242–1251); só confirma que ausência de chave não é falha.
  Os nomes ficam distintos de propósito: a NFS-e usa a causa `credential_unreadable` mas grava o desfecho `credential_missing`
  (`nfse-status-pull-failure.policy.ts` 27) porque lá credencial ausente é falha; aqui chave ausente não é falha, e o desfecho só
  nomeia "há chave e ela não abre".
- **D4 — `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` saem, sem fallback** (molde da 239 D3). Dois lugares para
  a mesma chave fariam o "Remover chave" da tela mentir enquanto a variável existir. **Gate A** antes da **publicação da Fase 4
  inteira** (a T4.2 já deixa de ler a variável): conferir **só o nome** da variável no worker de staging **e de produção** (o
  worker de produção já tem a 252 e lê a variável); se existir, a chave é colada na tela antes do deploy do worker. **A saída do
  Gate A nunca pode conter um valor.** Listar as variáveis do worker pelo `railway variables` comum, mesmo "filtrando o nome",
  imprime a linha com o valor e queima o segredo (`security.md` §4): usa-se um comando que imprima só nomes (por exemplo
  `railway variables --service worker --environment <env> --json | jq -r 'keys[] | select(startswith("FERIADOS_API"))'`, com a
  flag `--json` a conferir na versão instalada antes) ou a aba Variables do Railway, que mascara o valor.
- **D5 — O worker já tem o chaveiro.** `parseWorkerCryptographicConfiguration` é obrigatório no boot (`main.ts` 527;
  `config/cryptographic-configuration.schema.ts` 34–35) e `.railway/railway.ts` 166–167 já dá `ENCRYPTION_*` ao worker (ele abre
  as credenciais da NFS-e, do certificado e do Resend). **Nenhum passo de infraestrutura novo.** O AAD
  `transportada:holiday-provider-token:v1:${settingsId}` é cópia por valor nas duas apps, com contrato de paridade. O
  `settingsId` é gerado pelo caso de uso (`crypto.randomUUID()`) **antes** de selar e inserido explicitamente (o AAD precisa do
  id antes de a linha existir); se o `INSERT … ON CONFLICT DO NOTHING` não inserir nada, o envelope é descartado e a API
  responde `409`. O plaintext é UTF-8 de JSON `{"token":"…"}`, validado com `.strict()` e a mesma regex na abertura, na API e no
  worker; a paridade cobre o AAD **e** o formato. Qualquer erro na abertura, inclusive o do Zod do envelope, vira
  `token_unreadable`.
- **D6 — Permissão dedicada `holiday-import.configure`, só no papel `company-admin`.** Escrever a chave e o orçamento é ato
  sobre a **instalação**; `settings.manage` dado por grupo (para editar feriado, por exemplo) não leva a chave de carona
  (raciocínio do `cargo.measure`). Ler continua `settings.manage`.
- **D7 — Painel:** bloco "Chave da FeriadosAPI" na aba Calendário, acima do cartão de status; campo de senha nunca preenchido
  de volta; texto fixo de que salvar a chave **não** liga a rotina.
- **D8 — O cartão de status passa a dizer "sem chave", "chave ilegível" e "orçamento do mês atingido".**
- **D9 — A API não testa a chave no fornecedor.** O worker continua sendo a única app que fala com `feriadosapi.com`
  (`docs/SECURITY.md`, entrada da 252); a chave errada aparece no ciclo seguinte como `provider_unauthorized`.
- **D10 — Ordem de publicação:** painel tolerante (catálogo com `credential_unreadable` **e** a permissão nova) → migration +
  API + cópias de backend do catálogo → Gate A → worker → telas. **O painel tolerante vai primeiro por obrigação, e a obrigação é
  da permissão:** a guarda de `/auth/me` recusa permissão desconhecida (`useAuthMe.query.ts`, `isLiteralArray` 122–130 e uso em
  164; 120–128 e 162 antes da Fase 1; idem em `origin/main`) e todo `company-admin` perderia o painel. O **desfecho** novo não
  quebra o painel (`holidayImportGuards.validation.ts` 62 aceita qualquer string em `outcome`; `isJobOutcome` só é chamado em
  `nfeWorkspaceClient.service.ts` 551, para a distribuição de NF-e); o catálogo também vai primeiro por convenção da 252 e pela
  direção do contrato de paridade, que lê o fonte da API (a Fase 1 usa listas de pendentes autofechantes). O app do motorista não
  valida `permissions`.
- **D11 — Rollback:** `rollback.sql` apaga a tabela (nenhum dado de negócio: a chave se reemite no fornecedor) e só roda **depois**
  de reverter o worker.

### 3. Modelo de dados (migration aditiva, com `rollback.sql`, só staging)

Sem ENUM nativo, todo nome explícito e contado (o maior tem 41 bytes):

- `holiday_provider_settings` (25) — `id uuid pk default gen_random_uuid()`, `provider text not null default 'feriadosapi'`,
  `token_envelope jsonb null`, `token_hint text null`, `token_updated_at timestamptz null`, `monthly_request_budget integer not
null`, `version bigint not null default 1`, `updated_by_user_id uuid not null`, `created_at`, `updated_at`.
- `holiday_provider_settings_provider_unique` (41), `…_provider_check` (40, `provider in ('feriadosapi')`),
  `…_budget_check` (38, `between 1 and 1000000`), `…_version_check` (39, `> 0`), `…_token_check` (37: os três campos da chave
  nulos juntos, ou envelope `jsonb_typeof = 'object'`, dica com exatamente 4 caracteres ASCII visíveis e data preenchidos
  juntos).

Sem mudança em tabela publicada: `company_holiday_import_settings` já tem `is_enabled` (o upsert da tela grava só ele e o do
cursor da descoberta grava só o cursor, `drizzle-holiday-discovery.store.ts` 88–107). Sem CHECK nova de `job`: o `outcome` de
`job_executions` não tem CHECK de vocabulário (`job-catalog.constant.ts` do worker, comentário do `JOB_CATALOG`).

## Consequências

- A transportadora liga a importação sem acesso ao Railway: chave e orçamento no painel; despausar continua em Operações.
- O orçamento passa a ser conhecido pela API — o cartão volta a poder dizer "orçamento do mês atingido" (a manchete de cota da
  252 saiu porque a API não conhecia o orçamento).
- A rotina deixa de pousar em `job_run_routine_missing`: sem chave ela fecha `succeeded` com `token_missing`, o que é a verdade.
- Uma tabela global nova (sem `company_id`): entra na exceção declarada do `companyId` com o cache da 252 e nunca sai crua.
- Uma permissão nova e um desfecho novo — os dois exigem o painel primeiro.

## Riscos

- **Qualquer `company-admin` de qualquer empresa da instalação troca a chave da instalação.** Não existe ator de plataforma
  (ADR-0021). Mitigação: permissão dedicada (D6), auditoria na empresa do ator, `updated_by_user_id` na linha. A empresa B não vê
  quem trocou (a tela mostra só a data): mostrar o nome vazaria pessoa de outra empresa. Aceito: a instalação tem um único dono.
- **Chave em claro em memória durante o ciclo** (string JS, não zerável). A mesma do envelope da NFS-e e do Resend; nunca em log,
  contador, desfecho ou erro (contrato da 252 CA9 estendido à leitura do banco).
- **A chave também fica em claro na memória da API durante o `PUT`.** Ela chega no corpo da requisição e vive no processo da API
  (o `Uint8Array` do selo é zerado; o corpo e a string do Zod não) até a resposta; nunca em log, auditoria, mensagem de erro ou
  métrica. Muda uma afirmação da 252: a frase "API, cron, painel e app do motorista nunca … leem o token" (`docs/SECURITY.md`,
  entrada da 252) deixa de ser verdade — a API passa a **receber e selar** a chave; o worker segue sendo a única app que a
  **usa** contra o fornecedor. Registrado em `docs/SECURITY.md` na T6.1.
- **Rotação do chaveiro:** a chave antiga precisa ficar no chaveiro até a chave da FeriadosAPI ser salva de novo; senão o ciclo
  fecha `credential_unreadable` (visível no cartão e em Operações). Consulta de conferência em `plan.md`.
- **Formato real da chave desconhecido** (lacuna da 252 T3.1): o mínimo de 16 caracteres pode recusar uma chave real mais curta;
  a recusa é clara e o ajuste é uma constante com contrato.
- **Gate A pulado:** chave na variável e não no banco = a busca para em silêncio depois do deploy do worker. Por isso o gate é
  passo obrigatório antes da publicação da Fase 4 inteira, **em produção também** (a 252 já está em `main`).
- **Gate A que vaza a chave:** o `railway variables` comum imprime o valor; o gate usa só comando que liste nomes ou a aba
  Variables, e a saída nunca pode conter um valor. Chave que apareceu em terminal é chave queimada.

## Alternativas descartadas

| Alternativa                                    | Por que não                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Manter a variável como fallback por uma versão | "Remover chave" na tela não removeria; duas fontes da verdade (239 D3). O Gate A cobre a migração         |
| Chave por empresa                              | A conta e a cota são da instalação; o contador do mês já é global (ADR-0100 §5)                           |
| Coluna `key_id` separada                       | Duplicaria o `keyId` do envelope e poderia divergir; os três precedentes não têm                          |
| `settings.manage` para escrever a chave        | Grupo com `settings.manage` levaria a chave da instalação de carona                                       |
| Confirmação por senha (step-up) ao salvar      | O produto não tem mecanismo de reautenticação (Keycloak sem `max_age`/`acr` no fluxo); seria spec própria |
| Testar a chave na API ao salvar                | A API passaria a falar com `feriadosapi.com`; o worker é o único destino de saída declarado               |
| A tela despausar a rotina                      | Decisão do usuário (2026-10-09): despausar segue em Operações                                             |
| Fechar `succeeded` também com a chave ilegível | Esconderia um defeito de operação (chaveiro) que só se resolve com ação humana                            |
| `unexpected_error` para a chave ilegível       | O catálogo diz que `unexpected_error` em produção é lacuna de vocabulário: nomear o caso                  |
