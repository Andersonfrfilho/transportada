# Feature 262 — A chave da FeriadosAPI se configura no painel

> **Estado:** desenho do `architect` (`opus`, 2026-10-09), **validado contra o código na T0.1** (revisão `opus`; as emendas
> E1–E16 estão aplicadas no texto e registradas em `evidence.md` § T0.1). **ADR-0102 aceita (2026-10-09)** (emenda o ADR-0100 D9
> e D10). Migration **só staging**; produção exige aprovação própria. **A 252 já está em `main`** (PRs #155 `a158bd687`, #156
> `4d01307c4` e #159 `63b55be61`, de 2026-10-09: catálogo da API, migration `20261009040622` e a rotina
> `holiday-provider-pull/` do worker): o worker de produção **lê** `FERIADOS_API_TOKEN`, então o Gate A (D4) em produção é
> **obrigatório**. **Nenhum `[NEEDS CLARIFICATION]` desta spec bloqueia código**; as Q3 (plano e cota) e Q4 (termos de uso) da
> 252 continuam abertas e continuam bloqueando **ligar** a rotina — esta spec só muda **onde** a chave mora.
> **Número:** 262 e ADR 0102 conferidos em 2026-10-09 (`evidence.md` § "Numeração conferida" e § T0.1): 260 já colide entre duas
> branches (`260-a-nota-que-volta-ao-barracao…` em staging e `260-o-chat-chega-ao-app-do-motorista` em `work/spec-260`), 261 fica
> livre para a renumeração, ADR 0101 está tomado em `work/spec-260`; 262 e 0102 são únicos.

## Problema e resultado

A importação de feriados da 252 só liga com acesso ao Railway: a chave da FeriadosAPI é `FERIADOS_API_TOKEN` e o orçamento é
`FERIADOS_API_MONTHLY_REQUEST_BUDGET`, variáveis **só do worker** (`apps/worker-transportada/src/config/environment.schema.ts`
98–102, 272–288). Sem a chave a rotina nem é registrada (`holiday-provider-pull.registry.ts` 36–42) e, despausada, pousa em
`job_run_routine_missing` → `unexpected_error` (`run-job-cycle.ts` 102–113). O liga/desliga por empresa
(`company_holiday_import_settings.is_enabled`) existe e é respeitado pelas três etapas, mas **não tem rota nem tela**; o runbook
da 252 manda escrever no banco à mão.

Pedido do usuário (2026-10-09): **a chave, o orçamento mensal e o liga/desliga da importação se configuram no painel.** A tela
**não despausa** a rotina: `holiday.provider.pull` continua pausada de fábrica (ADR-0100 D13) e despausar segue em Operações.

**Resultado:**

1. O administrador da transportadora cola a chave da FeriadosAPI na aba Calendário, vê "Chave configurada (…1234)", troca e
   remove a chave, e define o orçamento mensal — sem Railway, sem redeploy.
2. A empresa liga e desliga a importação dela na mesma aba (o que já valia por SQL passa a valer pela tela, com auditoria).
3. O worker lê a chave e o orçamento **do banco a cada ciclo**; a rotina é registrada sempre e, sem chave, não faz requisição
   nenhuma e fecha dizendo isso (contador `token_missing`), em vez de `unexpected_error`.
4. As variáveis `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` deixam de existir.
5. O cartão de status diz "sem chave configurada", "a chave guardada não abre" e "orçamento do mês atingido".

## Decisões do usuário (2026-10-09; não reabrir)

- **Escopo:** chave + orçamento mensal + ligar/desligar a importação, no painel.
- **A tela não despausa a rotina.** Despausar `holiday.provider.pull` continua em Operações.

## Decisões por delegação (revogáveis; detalhadas no ADR-0102)

- **D1 — Tabela da instalação `holiday_provider_settings`, uma linha por fornecedor.** Sem `company_id` (a conta do
  fornecedor, a cota e o contador do mês são da instalação — ADR-0021, ADR-0100 §5). Colunas: `id uuid` (pk, entra no AAD),
  `provider text` único (`'feriadosapi'`), `token_envelope jsonb` (envelope A256GCM; **sem coluna `key_id`**: o envelope já
  carrega `keyId`, como `nfse_provider_credentials`, `digital_certificates` e `contractor_mail_settings`), `token_hint text` (os
  4 últimos caracteres, em claro), `token_updated_at`, `monthly_request_budget integer NULL` (1 a 1.000.000; **NULL = o padrão**, decisão M1 da revisão), `version bigint`
  (concorrência otimista, molde do `expectedVersion` da 143), `updated_by_user_id uuid` (sem FK, rastro), `created_at`,
  `updated_at`. CHECKs e nomes explícitos (ADR-0102 §3, o maior com 41 bytes). Sem linha = sem chave e orçamento padrão
  (4500, o padrão da 252, Q3 aberta). **M1:** linha com o orçamento NULL = o mesmo padrão — só o que o administrador DEFINIU
  fica gravado, o primeiro `PUT` com a chave **não** grava orçamento, e o worker resolve `coalesce(monthly_request_budget, 4500)`
  com a constante (Fase 4, T4.2). A CHECK diz `is null or between 1 and 1000000`.
  **Corrige o esperado:** o nome `holiday_provider_installation_settings` (38 bytes) estouraria 63 bytes no
  `…_monthly_request_budget_check`; `holiday_provider_settings` segue o prefixo das tabelas globais da 252.
- **D2 — Rotas.** Instalação: `GET /holiday-imports/provider-settings` (`settings.manage`), `PUT` (`holiday-import.configure`)
  e `DELETE /holiday-imports/provider-settings/token` (`holiday-import.configure`). Empresa: `GET|PUT
/company-settings/holiday-import` (`settings.manage`, molde `/company-settings/business-calendar` e
  `/company-settings/location-retention` da 239). O liga/desliga **não** entra no recurso da instalação: as permissões e o escopo
  são diferentes, e misturar faria um `PUT` com dois donos.
- **D3 — O worker lê a configuração a cada ciclo; a rotina é registrada sempre.** No começo da etapa de busca, uma leitura
  da linha (uma consulta) e a abertura do envelope com o chaveiro do worker. Sem chave: a busca não roda, contador
  `token_missing = 1`, **nenhuma requisição**; a descoberta e a aplicação (só banco) rodam como hoje — a demanda de cidades
  continua sendo contada e um "Restaurar" continua voltando do cache. Chave que não abre: a busca não roda, contador
  `token_unreadable = 1`, desfecho **`credential_unreadable`** (novo, nas quatro cópias do catálogo, painel primeiro; prioridade
  logo abaixo de `unexpected_error`). Desfecho com a chave ausente: o que o resto do ciclo der (`succeeded` se nada falhou).
  **Precedente do registro:** `trip.location.purge` (spec 239; `main.ts` 1302; `apps/worker-transportada/CLAUDE.md` 160–169) —
  registrada sempre, lê a configuração a cada ciclo e, sem configuração, fecha `succeeded`. `geocoding.refine` **não** é
  precedente de registro (ela é registrada **só** com a chave, `main.ts` 1242–1251); só confirma que "ausência de chave não é
  falha". O registro parcial é permitido pelo contrato do worker (`apps/worker-transportada/CLAUDE.md` 19–25). O ciclo usa a
  chave e o orçamento que leu no começo; troca no meio vale no ciclo seguinte. **Não existe desfecho `skipped`** no catálogo
  (`JOB_WRAPPER_OUTCOMES` = `succeeded`, `cancelled`, `abandoned`, `unexpected_error`) e esta spec não o cria.
  **Por que `token_unreadable` (contador) e `credential_unreadable` (desfecho), e não `credential_missing`:** a NFS-e tem a
  causa `credential_unreadable` mas grava o desfecho `credential_missing` (`nfse-status-pull-failure.policy.ts` 27), porque lá
  credencial ausente **é** falha. Aqui chave ausente **não** é falha (`succeeded` + `token_missing`) e o desfecho só nomeia o
  caso "há chave e ela não abre"; reaproveitar `credential_missing` apagaria essa diferença. `credential_unreadable` tem 21
  caracteres, dentro de `JOB_OUTCOME_MAX_LENGTH` (40).
- **D4 — As variáveis de ambiente saem, sem fallback** (molde 239 D3). Justificativa: (a) com fallback, "Remover chave" na tela
  não para a busca enquanto a variável existir — a tela mentiria; (b) duas fontes para o mesmo segredo; (c) a rotina nasce
  pausada e a Q4 está aberta, então é muito provável que nenhum ambiente tenha a variável preenchida; (d) o schema do worker
  não é `.strict()` e ignora a variável que sobrar. **Gate A** (passo do usuário, antes da **publicação da Fase 4 inteira**: a
  T4.2 já deixa de ler a variável, `holiday-provider-pull.registry.ts` 41–42 e 60–65): conferir **só o nome** da variável em
  staging **e produção** (o worker de produção já tem a 252 e lê a variável); se `FERIADOS_API_TOKEN` existir, o usuário cola a
  mesma chave na tela **antes** do deploy do worker. **A saída do Gate A nunca pode conter um valor.** ⚠️ Listar as variáveis do
  worker pelo `railway variables` comum, mesmo "filtrando o nome", **imprime a linha com o valor** da chave e a queima
  (`security.md` §4): **esse formato não é instrução desta spec**. Use um que liste só nomes, por exemplo
  `railway variables --service worker --environment <env> --json | jq -r 'keys[] | select(startswith("FERIADOS_API"))'`
  (a flag `--json` **não foi confirmada** na versão instalada: o usuário confere `railway variables --help` antes, e na dúvida
  usa a aba Variables do Railway, que mascara o valor). A remoção das duas entradas de `.railway/railway.ts` (que apaga a
  variável no `apply`: "omitir é apagar", `docs/spec/railway.md` 93) vem **depois** do Gate A.
- **D5 — O worker já tem o chaveiro** (corrige o esperado: não há passo de infraestrutura). `parseWorkerCryptographicConfiguration`
  é obrigatório no boot (`main.ts` 527) e `.railway/railway.ts` 166–167 já dá `ENCRYPTION_ACTIVE_KEY_ID`/`ENCRYPTION_KEYRING_JSON`
  ao worker — é com ele que o worker abre a credencial da NFS-e, do certificado e do Resend (`createSecretEnvelopeProvider(
cryptography.envelopeKeyRing)`, `main.ts` 588, 998, 1039, …). API e worker usam o **mesmo** chaveiro (o convite selado pela API
  é aberto pelo worker). AAD `transportada:holiday-provider-token:v1:${settingsId}`, cópia por valor nos dois lados com contrato
  de paridade (molde `test/contractor-mail/credential-secret-parity.contract.ts` do worker). **Plaintext fixado:** UTF-8 de JSON
  `{"token":"…"}`, validado com `.strict()` e a mesma regex (`^[\x21-\x7E]{16,512}$`) na abertura, na API e no worker; o contrato de
  paridade cobre o AAD **e** o formato do plaintext.
- **D6 — Permissão dedicada `holiday-import.configure`, só no papel `company-admin`.** Mitigação do risco "qualquer usuário com
  `settings.manage` de qualquer empresa edita a configuração da instalação": a chave e o orçamento são da **instalação**;
  `settings.manage` concedido por grupo (por exemplo, para alguém cadastrar feriado) não leva a chave de carona (raciocínio do
  `cargo.measure`, `authorization.policy.ts` 95–100). Concedível por grupo (o `company-admin` já controla os grupos); ler segue
  `settings.manage`. Auditoria na empresa do ator e `updated_by_user_id` na linha. **Sem confirmação por senha:** o produto não tem
  reautenticação (step-up); fica fora. A escolha não muda produto (o `company-admin` é o mesmo dono que hoje teria o Railway),
  por isso não é `[NEEDS CLARIFICATION]`.
- **D7 — Painel:** bloco "Chave da FeriadosAPI" na aba Calendário (`BusinessCalendarPanel.component.tsx`, acima de
  `HolidayImportStatus`), com o liga/desligar da empresa no mesmo bloco. Detalhe em RF8–RF10.
- **D8 — O cartão de status ganha três manchetes**, por prioridade: desligada na empresa → **sem chave** → **chave ilegível**
  (`lastRun.outcome = 'credential_unreadable'`) → os três desfechos de fornecedor da 252 → **orçamento do mês atingido**
  (`monthlyRequests >= monthlyRequestBudget`) → falha por par → aguardando → em dia. "Aguardando" passa a mandar despausar em
  Operações só quando há chave. O `status` **não** expõe o orçamento (`holiday-import.schema.ts` da API só tem
  `monthlyRequests`, linhas 104 e 123): o painel lê o orçamento por `monthlyRequestBudget` do `GET` do RF3. `>=` casa com o
  worker, que só reivindica uma requisição com `requests < budget` (`holiday-fetch.query.ts` 70).
- **D9 — A API não testa a chave no fornecedor.** O worker é o único que fala com `feriadosapi.com` (`docs/SECURITY.md`, entrada
  da 252, "O worker é a única app que fala com ele"). A chave errada aparece no ciclo seguinte como `provider_unauthorized` (a
  manchete que a 252 já tem).
- **D10 — Ordem de publicação:** (1) painel tolerante — catálogo com `credential_unreadable` **e** a permissão
  `holiday-import.configure` conhecida pela guarda de `/auth/me`; (2) migration + API + catálogo da API e do cron; (3) Gate A;
  (4) worker (catálogo + leitura do banco + saída das variáveis); (5) telas, depois dos prints aprovados. **(1) é obrigatório
  antes de (2) por causa da **permissão**:** `isAuthMeResponse` recusa permissão desconhecida
  (`frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts`, `isLiteralArray` em 122–130 e uso em 164, hoje;
  120–128 e 162 antes da Fase 1; idem em `origin/main`) — a API com a permissão nova antes do painel tiraria o painel de
  **todo** `company-admin` (`IDENTITY_AUTH_ME_INVALID`). O **desfecho** novo **não** quebra o painel
  (`holidayImportGuards.validation.ts` 62 aceita qualquer string em `outcome`; `isJobOutcome` só é chamado em
  `nfeWorkspaceClient.service.ts` 551, para a distribuição de NF-e); o catálogo vai primeiro por convenção da 252 e porque é a
  direção do contrato de paridade do painel, que lê o fonte da API (por isso a Fase 1 tem a lista de pendentes autofechante).
  O app do motorista não valida `permissions`. Em produção, mesma ordem em PRs separados (o `deploy-frontend` tem
  `needs: deploy-api`); **a 252 já está em `main`** (#155, #156, #159), então a 262 entra em produção em PRs próprios, com o
  Gate A feito antes do PR do worker.
- **D11 — Rollback:** `rollback.sql` apaga a tabela sem recusar (nenhum dado de negócio; a chave se reemite no fornecedor) e
  roda **depois** de reverter o worker (o worker da 262 sem a tabela fecha a busca em `unexpected_error`, sem derrubar nada).

## Requisitos funcionais

- **RF1 — Modelo de dados** (migration aditiva única, `rollback.sql`, `snapshot.json`, só staging; ADR-0102 §3): a tabela de
  D1 com os cinco CHECK/único nomeados; schema Drizzle na API e cópia só com as colunas no worker
  (`src/database/holiday-provider-settings.schema.ts`), com contrato de paridade coluna a coluna.
- **RF2 — Selo da chave na API:** serviço `holiday-provider-token-secret.service.ts` (molde
  `contractor-mail/application/contractor-mail-credential-secret.service.ts`): `encrypt`/`decrypt` com o AAD de D5, plaintext em
  `Uint8Array` zerado no `finally`, envelope validado por Zod `.strict()`, falha do cofre vira erro tipado sem mensagem do
  provedor. **O caso de uso gera o `settingsId` (`crypto.randomUUID()`) ANTES de selar** e o insere explicitamente, nunca pelo
  `defaultRandom()` da coluna, porque o AAD precisa do id antes de a linha existir (molde `contractor-mail.port.ts` 109–114).
  Plaintext fixado em D5 (`{"token":"…"}`, `.strict()`, mesma regex na API e no worker). Na **abertura**, qualquer erro — inclusive
  o do Zod do envelope, que no molde do worker fica **fora** do `try` (`contractor-mail-credential-secret.service.ts` 85) — vira
  `token_unreadable`: o parse do envelope entra no `try` da cópia do worker (T4.1).
- **RF3 — `GET /holiday-imports/provider-settings`** (`settings.manage`): `{ data: { tokenConfigured: boolean, tokenHint: string
| null, tokenUpdatedAt: string | null, monthlyRequestBudget: number, budgetOrigin: 'default' | 'installation', version:
string | null, updatedAt: string | null } }`, `cache-control: no-store`, lista branca de campos (nunca espalhar o registro).
  Sem linha: `tokenConfigured: false`, `budgetOrigin: 'default'`, `monthlyRequestBudget: 4500`, `version: null`. Nunca o
  envelope, nunca o token, nunca quem alterou. **M1:** `monthlyRequestBudget` é o valor **efetivo** (4500 quando a coluna é
  NULL) e `budgetOrigin` é `'installation'` só quando há valor gravado.
- **RF4 — `PUT /holiday-imports/provider-settings`** (`holiday-import.configure`, limitador `{ store: 'postgres', scope:
'holiday-provider-settings', maxRequests: 10, windowSeconds: 3600 }`): corpo `.strict()` `{ token?, monthlyRequestBudget?,
expectedVersion? }`, pelo menos um de `token`/`monthlyRequestBudget`. `token`: aparado, 16 a 512 caracteres ASCII visíveis
  (`^[\x21-\x7E]{16,512}$`, o mesmo alfabeto que o worker exige hoje). `monthlyRequestBudget`: inteiro 1 a 1.000.000 **ou `null`** (volta ao padrão; aceito no corpo `.strict()`; criar a linha só com
  `null` é `400`).
  `expectedVersion` ausente = intenção de criar (`INSERT … ON CONFLICT (provider) DO NOTHING`); presente = `UPDATE … WHERE
version = $expected`; perdeu a corrida → `409 HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT` (se o `INSERT … ON CONFLICT DO NOTHING` não
  inserir nada, o envelope recém-selado é **descartado** e a resposta é o `409`). Token omitido mantém o envelope
  (molde do `apiKey` opcional da 143); orçamento omitido mantém o gravado (ao criar, o primeiro `PUT` **não grava** orçamento: fica NULL = padrão; `null` explícito grava NULL). Responde a mesma visão do
  RF3. Auditoria `holiday-provider-settings.saved` na mesma transação, `entity_type = 'holiday_provider_settings'`,
  `entity_id` = id da linha, `permission = 'holiday-import.configure'`, `before`/`after` só com `{ tokenConfigured,
monthlyRequestBudget, version }` e `metadata.changedFields` (`token` e/ou `monthlyRequestBudget`); **nunca** token, dica ou
  envelope. Salvar a mesma configuração (mesmo orçamento e sem token) não grava nem audita. **O helper de auditoria precisa
  mudar** (E12): `appendBusinessCalendarAudit` fixa `permission = 'settings.manage'`
  (`business-calendar-audit.support.ts` 36, constante `business-calendar-audit.constant.ts` 7) e tem alvo fechado
  (`BUSINESS_CALENDAR_AUDIT_TARGET`, linhas 9–16): o RF4 exige um parâmetro `permission` **opcional** (padrão
  `settings.manage`, para não mudar as escritas existentes), os alvos `holiday_provider_settings` e
  `company_holiday_import_settings` e as ações novas em `BUSINESS_CALENDAR_AUDIT_ACTION`. O IP vai em `metadata.ipAddress`
  (`business-calendar-audit.support.ts` 35; `security.md` §10).
- **RF5 — `DELETE /holiday-imports/provider-settings/token`** (`holiday-import.configure`, mesmo limitador): zera envelope, dica
  e data juntos, sobe a versão, audita `holiday-provider-settings.token-removed`; sem chave é 204 sem auditoria (idempotente).
  O orçamento fica.
- **RF6 — `GET|PUT /company-settings/holiday-import`** (`settings.manage`): `GET` → `{ data: { isEnabled, origin: 'default' |
'company' } }` (sem linha = `true`, `default`); `PUT` corpo `.strict()` `{ isEnabled: boolean }`, upsert que grava **só**
  `is_enabled` (`INSERT (company_id, is_enabled) … ON CONFLICT (company_id) DO UPDATE SET is_enabled = excluded.is_enabled`,
  nunca as colunas do cursor), `companyId` do contexto, auditoria `holiday-import.enablement-changed` (`before`/`after`
  `{ isEnabled }`) só quando muda, com `entity_type = target_type = 'company_holiday_import_settings'` e **`entity_id` =
  `companyId`** (a PK da tabela é `company_id` e `audit_logs.entity_id` é `uuid not null`, `fiscal-operation.schema.ts` 55);
  `permission = 'settings.manage'` (o padrão do helper, RF4). Desligar **não apaga** nenhum feriado já importado (D7 da 252): a
  tela diz isso.
- **RF7 — Permissão `holiday-import.configure`** em `TRANSPORTADA_PERMISSIONS` e no papel `company-admin` da API; conhecida pelo
  painel (`COMPANY_PERMISSIONS` de `useAuthMe.query.ts`, `permissionGroups.constant.ts`, locales do módulo `identity`) **antes**
  da API (D10). Nenhum outro papel a recebe; o separador e o ajudante não alcançam as rotas de escrita (enumerado em
  `test/separator-role.contract.test.ts`). **Posição e contratos (E1):** a permissão entra **no fim** de
  `COMPANY_PERMISSIONS` (depois de `occurrences.decide`) e, na T3.1, **no fim** de `TRANSPORTADA_PERMISSIONS`
  (`authorization.policy.ts` 116, depois de `occurrences.decide`) e da lista do `company-admin`, porque o contrato
  `frontend-contract.test.ts` compara as duas listas com igualdade **ordenada**. O painel a conhece antes da API pela lista
  autofechante `PENDING_API_PERMISSIONS` (já publicada na Fase 1): o painel sem os pendentes iguala a API, cada pendente tem de
  estar **ausente da API** e **presente no painel**, e a T3.1 apaga a lista no mesmo commit em que a API a concede. O locale
  `identity` precisa de `label` **e** `where` (molde `identity.locale.json` 445–448; `permission-matrix.contract.ts` 94–95).
- **RF8 — Worker:** a rotina `holiday.provider.pull` é registrada **sempre** (o retorno vazio de
  `buildHolidayProviderPullRegistry` sai); a leitura da configuração mora num leitor próprio
  (`infrastructure/drizzle-holiday-provider-settings.reader.ts`) e numa cópia do selo
  (`application/holiday-provider-token-secret.service.ts`); a busca recebe chave e orçamento **por ciclo** (o cliente HTTP é
  montado no ciclo, não no boot); `token_missing`/`token_unreadable` como em D3; `credential_unreadable` em `resolveOutcome`.
  Nenhuma mensagem, contador, desfecho ou log carrega a chave, a dica ou o envelope (CA9 da 252 estendido).
- **RF9 — Catálogo:** `credential_unreadable` nos `failureOutcomes` de `holiday.provider.pull` nas quatro cópias
  (`apps/{api,worker,cron}-transportada/src/shared/job-catalog.constant.ts`, `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts`),
  **painel primeiro**, paridade verde nas quatro. Sem migration (o `outcome` não tem CHECK de vocabulário). **Contratos (E2):** o
  contrato do painel (`test/shared/job-catalog.contract.ts`) lê o fonte da API; a Fase 1 já o deixou autofechante
  (`PENDING_API_FAILURE_OUTCOMES = {'holiday.provider.pull': ['credential_unreadable']}`, palavra no **fim** de
  `failureOutcomes`) e a T3.1 apaga os pendentes e restaura a igualdade estrita. Worker, cron e API **não** leem o fonte uns dos
  outros: cada um repete a lista no próprio contrato `test/job-catalog/catalog.contract.ts` (entrada `holiday.provider.pull`:
  worker 148, cron 149, API 157) e cada um a atualiza na task que muda a própria cópia (API e cron na T3.1, worker na T4.1).
  **A T4.1 vem antes da T4.2, obrigatoriamente:** `isJobOutcome` (`run-job-cycle.ts` 176) transforma desfecho fora do catálogo do
  worker em `unexpected_error`.
- **RF10 — Saída das variáveis** (D4): `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` saem do schema do worker,
  de `HolidayProviderPullEnvironment`/`WorkerEnvironment`, do `.env.example` e — **depois do Gate A** — de `.railway/railway.ts`.
  `FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET` (4500) e `FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET` (1.000.000) ficam como
  constantes, com cópia por valor na API e contrato de paridade. **Onde (E11):** na API as constantes do orçamento ficam em
  `apps/api-transportada/src/shared/holiday-provider.constant.ts` (já importado por `database/holiday-provider.schema.ts` 31 e
  `database/schema-check.constant.ts` 16; o schema não importa de domínio, `apps/api-transportada/CLAUDE.md` 65), **não** em
  `business-calendar/domain`; a paridade estende `apps/worker-transportada/test/holiday-provider-pull/parity.contract.ts`.
- **RF11 — Painel, bloco "Chave da FeriadosAPI"** (aba Calendário, acima do cartão de status):
  - estado: "Chave configurada (…1234) em 09/10/2026" ou "Nenhuma chave configurada"; orçamento "N consultas por mês" com
    "padrão" quando `budgetOrigin = 'default'`; uso do mês "N de M consultas usadas" (o `monthlyRequests` do status);
  - formulário (só com `holiday-import.configure`): campo de chave `type="password"`, `autoComplete="off"`,
    `spellCheck={false}`, **nunca preenchido de volta** (vazio sempre; o rótulo diz "Nova chave" quando já há uma), orçamento
    numérico, "Salvar", "Remover chave" com confirmação; sem a permissão o bloco é só leitura, com o texto de quem pode alterar;
  - liga/desliga da importação da empresa (com `settings.manage`): `Checkbox` do design system (`@/components/ui/checkbox`) com
    rótulo explícito, como em `SaturdayBlock.component.tsx` 5 (não existe `button role="switch"` no painel; primitivo cru ao lado
    do design system é defeito, `apps/frontend-transportada/CLAUDE.md` 54–57), e texto "Desligar não apaga os feriados já
    importados; para tirar um, use Desligar na lista"; estado carregando com `@/components/ui/skeleton`;
  - texto fixo: "Salvar a chave não liga a busca: a rotina `holiday.provider.pull` nasce pausada e é despausada em Operações.";
  - estados: carregando, erro de leitura, erro de gravação com a mensagem do código (`400` campo a campo, `409` versão — "outra
    pessoa alterou; recarregue", `429` — "muitas tentativas; tente de novo em N min", `403`), sucesso (aviso discreto, campo de
    chave limpo);
  - acessibilidade: rótulo visível em todo campo, `aria-describedby` para a dica e o erro, o liga/desliga é o `Checkbox` do
    design system com rótulo associado, foco devolvido ao campo com erro, alvo ≥ 44 px em 375 px; locale pt-BR e en; tokens do
    design do painel, dois temas;
  - posição e permissões (E9): o bloco entra **antes** de `HolidayImportStatus` (linha 45 de
    `BusinessCalendarPanel.component.tsx`); o painel só recebe `canManage` (`CompanySettings.page.tsx` 256, vindo de
    `canManageSettings`), então ganha uma **prop nova** para `holiday-import.configure`. A aba só aparece com `settings.manage`:
    escrever pela tela exige as **duas** permissões (quem tem só `holiday-import.configure` por grupo não chega ao bloco).
- **RF12 — Cartão de status** (`holidayImportStatus.service.ts` `resolveHeadline`): as manchetes de D8; "sem chave" lê
  `tokenConfigured` do `GET` do RF3 (o `status` não muda de forma: a guarda dele é de chaves exatas); "chave ilegível" lê
  `lastRun.outcome`; "orçamento atingido" compara `monthlyRequests` (do `status`) com `monthlyRequestBudget` (do `GET` do RF3),
  com `>=` (casa com o worker, `holiday-fetch.query.ts` 70). Locale pt-BR/en. **A T5.3 reescreve os textos que mandam olhar
  "sem token" em Operações** (`businessCalendar.locale.json` 281, 289 e 290, e o `.en`): com a chave no banco, "sem token" deixa
  de ser causa a conferir lá.
- **RF13 — Última tarefa:** revisão de design e usabilidade com print (web.md §15), documentação viva, `docs/SECURITY.md`,
  revisão final `opus`.

## Requisitos não funcionais

- **Segredo:** a chave nunca aparece em resposta, log, auditoria, mensagem de erro (inclusive a de validação do `400`), métrica
  ou repositório; o envelope nunca sai por rota; o `400` do token diz o campo e a regra, nunca o valor (contrato com uma chave
  sentinela procurada em resposta, log e `audit_logs`).
- **Exceção declarada ao §4/§5 do `security.md`** (ADR-0102 §1): credencial de terceiro configurada em tempo de execução, selada
  com o chaveiro de aplicação (segredo-raiz só em env), como NFS-e, certificado e Resend.
- **Isolamento:** a tabela global entra na exceção declarada do `companyId` (como o cache da 252): só o repositório dela a
  importa (contrato `holiday-import-global-isolation` estendido) e ela aparece no `SUPPORT_ONLY` do `tenant-safety` do módulo.
  Nenhuma rota devolve quem alterou nem de que empresa.
- **Sem custo novo no worker:** +1 consulta por ciclo (a linha única) e uma abertura de envelope; nada por par.
- **Concorrência:** escrita da instalação por `version`; escrita da empresa por upsert de coluna única; o ciclo usa o que leu no
  começo.
- **LGPD:** nenhum dado pessoal novo; `updated_by_user_id` é identificador opaco, nunca exposto por rota.
- **Compatível:** o `status` da 252 não muda de forma; as rotas são novas; o painel tolera a permissão e o desfecho novos antes
  da API (D10).

## Casos extremos e falhas

- Sem linha: chave ausente, orçamento 4500, busca não roda (`token_missing`), descoberta e aplicação rodam.
- Linha com orçamento e sem chave (a chave foi removida): igual, com o orçamento gravado.
- Chave salva com a rotina pausada: nada sai até despausar em Operações (a tela diz).
- Chave errada: o ciclo seguinte fecha `provider_unauthorized` (manchete da 252).
- Chave com espaço no fim (colada): aparada antes de validar; com espaço no meio, acento ou controle → `400`.
- Chave com menos de 16 ou mais de 512 caracteres → `400` (sem eco).
- Dois administradores salvam ao mesmo tempo: o segundo leva `409` e recarrega.
- Chave removida no meio de um ciclo: o ciclo termina com a chave que leu (≤ 100 requisições, ~2 min); a próxima não sai. Para
  parar na hora: cancelar a execução em Operações.
- Orçamento reduzido abaixo do já usado no mês: a busca para no ciclo seguinte (`budget_exhausted`), o cartão diz "orçamento
  atingido"; aumentar solta no ciclo seguinte (comportamento da 252).
- Chave antiga removida do chaveiro sem salvar a chave de novo: `credential_unreadable`; salvar de novo sela com a chave ativa.
- Envelope copiado de outra instalação/ambiente: não abre (chaveiro diferente, AAD com o id da linha) → `credential_unreadable`.
- Empresa desligada: as três etapas a pulam (já é assim); os importados ficam; religar retoma do cursor.
- A empresa B olha a tela depois de a empresa A trocar a chave: vê "configurada (…dica) em <data>", nunca quem.
- Variável `FERIADOS_API_TOKEN` esquecida no Railway depois do deploy: ignorada (schema não `.strict()`); o Gate A e a saída do
  `railway.ts` a removem.
- Banco sem a tabela (rollback fora de ordem): a etapa de busca falha, o ciclo fecha `unexpected_error`, nada sai.

## Critérios de aceite

- **CA1** A migration sobe e desce (`make migration-test`); `db:generate` = `no_changes`; os cinco nomes existem e cabem em 63
  bytes; CHECK recusa dica sem envelope, envelope sem dica, dica com 3 ou 5 caracteres, orçamento 0 e 1.000.001, segundo
  `provider`.
- **CA2** `GET` sem linha devolve o padrão; com chave devolve `tokenConfigured: true` e a dica, e **nunca** o envelope nem o
  token (contrato de chaves exatas da resposta).
- **CA3** `PUT` com campo desconhecido, `companyId`, token curto/longo/não-ASCII ou orçamento fora da faixa → `400` sem o valor
  no corpo; sem `holiday-import.configure` → `403` (um `settings.manage` por grupo inclusive); `409` com versão velha; o 11º
  pedido na hora → `429`.
- **CA4** Uma chave sentinela salva pelo `PUT` não aparece em nenhuma resposta, linha de log, `audit_logs` (todas as colunas) nem
  mensagem de erro; o envelope gravado abre com o AAD da linha e **não** abre com o AAD de outro id.
- **CA5** `DELETE …/token` zera os três campos juntos e audita; repetir é 204 sem auditoria nova.
- **CA6** `PUT /company-settings/holiday-import` grava só `is_enabled` (o cursor de uma linha existente não muda), audita só
  quando muda, recusa `companyId` no corpo, e a empresa B não altera a A.
- **CA7** Worker: sem linha → 0 requisições, contador `token_missing = 1`, descoberta e aplicação rodaram, desfecho
  `succeeded`; com chave válida → a busca usa a chave e o orçamento **do banco** (fornecedor falso confere o `Authorization`);
  envelope que não abre → 0 requisições, `token_unreadable = 1`, `credential_unreadable`; trocar a chave entre dois ciclos →
  o segundo usa a nova. Mutação: voltar a ler da variável derruba.
- **CA8** A rotina está no registro com e sem chave; `job_run_routine_missing` não acontece mais para ela.
- **CA9** `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` não existem mais no schema, no tipo, no `.env.example` nem
  no `railway.ts` (depois do Gate A); o contrato de ambiente é ajustado sem afrouxar o `toEqual`; o contrato de privacidade
  (`token-privacy.contract.ts`) roda com a chave vinda do banco.
- **CA10** `credential_unreadable` nas quatro cópias do catálogo, paridade verde; o painel publicado antes da API.
- **CA11** `/auth/me` com `holiday-import.configure` é aceito pelo painel (contrato da guarda); a API só ganha a permissão
  depois.
- **CA12** Painel: estados do RF11, campo de chave nunca preenchido de volta (contrato de DOM: `value` vazio depois de salvar e
  ao abrir com chave configurada), manchetes do RF12 por prioridade; prints 375/768/1280, claro e escuro, aprovados pelo
  usuário.

## Fora do escopo

- Despausar a rotina pela tela (decisão do usuário).
- Testar a chave no fornecedor na hora de salvar (D9).
- Mais de um fornecedor de feriados (a coluna `provider` deixa a porta aberta, a CHECK aceita um só).
- Reencriptação automática na rotação do chaveiro (salvar a chave de novo resela).
- Confirmação por senha (step-up) — o produto não tem o mecanismo.
- Rótulo da rotina no painel de Operações (lacuna conhecida da 252 T2.3).
- As Q3/Q4 da 252 (plano e termos) — continuam passos do usuário.
- Produção (aprovação própria; a 252 já está em `main`, e o Gate A em produção é pré-condição do PR do worker).

## Riscos

- **Qualquer `company-admin` de qualquer empresa da instalação troca a chave da instalação** — mitigado por D6, auditoria e
  `updated_by_user_id`; aceito pelo ADR-0021 (um dono por instalação).
- **Login quebrado por ordem errada** (D10): API com a permissão antes do painel → `IDENTITY_AUTH_ME_INVALID` para todo
  `company-admin`. Contrato e publicação em PR separado.
- **Gate A pulado:** a busca para em silêncio onde a chave estava só na variável. Em **produção** o risco é real e
  imediato: o worker de produção já roda a 252 e lê `FERIADOS_API_TOKEN`.
- **Gate A que vaza a chave:** o comando que lista variáveis do Railway imprime o valor se não for filtrado por nome (D4); a
  saída do Gate A **nunca** pode conter um valor, e uma chave que apareceu em terminal é chave queimada (`security.md` §4).
- **Formato real da chave** (lacuna da 252 T3.1): o mínimo de 16 pode recusar uma chave legítima; a recusa é clara e o ajuste é
  uma constante.
- **Rollback da 252** (`rollback.sql` recusa empresa com a importação desligada): o interruptor da tela torna essa condição
  alcançável pelo usuário — o runbook da 252 já manda religar antes.
- **Chave em memória** durante o ciclo (string JS não zerável): mesmo risco aceito na NFS-e e no Resend. **E na API durante o
  `PUT`:** a chave chega em claro no corpo da requisição e fica na memória do processo da API (o `Uint8Array` do selo é zerado,
  o corpo e a string do Zod não) até a resposta; nunca em log, auditoria, mensagem de erro ou métrica (CA4). É a mudança de
  postura que `docs/SECURITY.md` (entrada da 252: "API … nunca leem o token") precisa registrar: a API passa a **receber e
  selar** a chave, e o worker continua sendo a única app que a **usa** contra o fornecedor.
