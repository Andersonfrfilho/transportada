# Plano — 262

> Desenho do `architect` (`opus`, 2026-10-09). Decisão completa no **ADR-0102** (**aceita em 2026-10-09**, T0.1). Fatos
> conferidos em `origin/staging` `c1a0fed8f` (2026-10-09) e **reconferidos na T0.2** em `origin/staging` `a5868f369` (com a
> Fase 1): a tabela "citado → real" e as emendas E1–E16 estão em `evidence.md` § T0.1/T0.2. **A 252 já está em `main`**
> (#155 `a158bd687`, #156 `4d01307c4`, #159 `63b55be61`). Linhas citadas abaixo já estão corrigidas.

## Contexto (o que já existe)

- **A chave e o orçamento hoje (252 T3.5):** `apps/worker-transportada/src/config/environment.schema.ts` 98–102
  (`FERIADOS_API_MONTHLY_REQUEST_BUDGET: optionalPositiveInteger()`, `FERIADOS_API_TOKEN: optionalToken()`), 272–288
  (`toHolidayProviderPull`: sem token, `{}`), 440–444 (`optionalToken`, `^[\x21-\x7E]+$`), 447–462 (orçamento 1 a
  `FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET`); tipo em `shared/worker.types.ts` 82. Constantes em
  `holiday-provider-pull/domain/holiday-provider-pull.constant.ts` (padrão 4500, teto 1.000.000).
- **Registro condicional:** `holiday-provider-pull/infrastructure/holiday-provider-pull.registry.ts` 36–42 (`settings ===
undefined` → `return {}` na linha 42), chamado em `main.ts` 1473; a busca recebe `budget` e um cliente com `token` **no boot**
  (`createFetchHolidayProviderUseCase({ budget, client: createFeriadosApiClient({ token }) })`, montagem em 59–71; lê
  `settings.monthlyRequestBudget` em 60 e `settings.token` em 65).
- **Rotina ausente:** `job-run/application/run-job-cycle.ts` 102–113 (`job_run_routine_missing` → `unexpected_error`).
- **Desfecho:** `holiday-provider-pull/application/holiday-provider-pull-summary.ts` (`buildCounters`, `resolveOutcome`: falha
  nossa → `unexpected_error`; depois `provider_unauthorized` > `malformed_response` > `provider_unreachable`; senão
  `succeeded`). Vocabulário do invólucro: `JOB_WRAPPER_OUTCOMES` = `succeeded|cancelled|abandoned|unexpected_error`
  (`shared/job-catalog.constant.ts` 30–35 do worker); `holiday.provider.pull` com `failureOutcomes` de três palavras
  (worker 297–306, linha do `job:` na API 293, no cron 298 e no painel 289, já com a palavra nova na Fase 1). O `outcome` não tem CHECK de vocabulário (comentário do `JOB_CATALOG`).
- **Liga/desliga por empresa:** `company_holiday_import_settings.is_enabled` (`api-transportada/src/database/holiday-import.schema.ts`;
  cópia no worker `src/database/holiday-import.schema.ts` 23–29), respeitado por `holiday-discovery.query.ts` 39,
  `holiday-fetch.query.ts` 33, `holiday-apply.query.ts` 16 (`coalesce(s.is_enabled, true)`). O upsert do cursor grava só o
  cursor (`drizzle-holiday-discovery.store.ts` 88–107). O status já devolve `isEnabled` (`business-calendar/presentation/holiday-import.schema.ts` 100, 116).
- **Constantes do orçamento na API:** `apps/api-transportada/src/shared/holiday-provider.constant.ts` (importado por
  `database/holiday-provider.schema.ts` 31 e `database/schema-check.constant.ts` 16).
- **Chaveiro no worker (corrige o pedido):** `config/cryptographic-configuration.schema.ts` 34–35 exige
  `ENCRYPTION_ACTIVE_KEY_ID`/`ENCRYPTION_KEYRING_JSON` no boot (`main.ts` 527); `.railway/railway.ts` 166–167 os dá ao worker;
  o worker já abre envelopes da NFS-e (`nfse-issuance/application/nfse-credential-secret.service.ts`, cópia por valor da API
  com o mesmo AAD), do certificado e do Resend (`contractor-mail/application/contractor-mail-credential-secret.service.ts`),
  com contrato de paridade (`test/contractor-mail/credential-secret-parity.contract.ts`).
- **Molde da credencial no banco (API):** `contractor-mail/application/contractor-mail-credential-secret.service.ts` (AAD por
  linha, plaintext zerado, envelope Zod `.strict()`); `database/contractor-mail.schema.ts` 47–95 (`secret_envelope jsonb`,
  `version`); rota `contractor-mail/presentation/contractor-mail-settings.routes.ts` (`GET`/`PUT`, segredo opcional no `PUT`
  mantém o selado — `contractor-mail-settings.schema.ts` 22–33 —, lista branca na resposta 132–149, `cache-control: no-store`
  22, limitador `postgres` 122–126); concorrência por `expectedVersion` (`contractor-mail-settings.use-case.ts` 187–200).
- **Molde da configuração da empresa:** `business-calendar/presentation/business-calendar-settings.routes.ts`
  (`/company-settings/business-calendar`, `GET`/`PUT`, `origin: default|company`) e a 239 (`/company-settings/location-retention`,
  a variável de ambiente saiu quando a configuração virou tela — `specs/239-o-expurgo-se-liga-na-tela/spec.md` D3 140–163).
- **Rotas da importação (252):** `business-calendar/presentation/holiday-import.routes.ts` (todas `settings.manage` via
  `BUSINESS_CALENDAR_MANAGE_POLICY`, `business-calendar-policy.constant.ts`); caminhos em `shared/api.constant.ts` 130–137.
- **Auditoria:** `audit_logs` (`database/fiscal-operation.schema.ts` 37–90): `company_id` e `actor_user_id` **obrigatórios**
  (FK de membership) — a trilha de uma escrita da instalação fica na empresa do ator.
- **Permissões:** `identity/domain/authorization.policy.ts` (`TRANSPORTADA_PERMISSIONS` termina em `occurrences.decide`, 116;
  `settings.manage` definida em 35 e concedida só ao `company-admin` em 138; o raciocínio da permissão dedicada `cargo.measure`,
  95–100). O painel **recusa** `/auth/me` com permissão desconhecida:
  `frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts` (`isLiteralArray` 122–130, uso em 164; 120–128 e 162
  antes da Fase 1) → `IDENTITY_AUTH_ME_INVALID`. Dois contratos do painel leem o código da API e exigem a forma autofechante da
  Fase 1: `test/frontend-contract.test.ts` ("keeps the allowlist in sync…", igualdade **ordenada**) e
  `test/identity/permission-matrix.contract.ts` ("não inventa permissão que a API não concede"); no catálogo,
  `test/shared/job-catalog.contract.ts` lê o fonte da API.
  Paridade: `api-transportada/test/authorization.contract.test.ts`, `test/user-administration-application/role-permissions.contract.ts`,
  `frontend-transportada/test/identity/permission-matrix.contract.ts`.
- **Limitador:** `http/router.service.ts` 76–81 (`rateLimit` por rota, `postgres` por empresa+usuário), contrato
  `test/rate-limited-routes.contract.test.ts` (`CLAUDE.md` da API: rota com limite aparece lá).
- **Erro de validação:** `http/request-parsing.service.ts` 58–71 devolve só `{ field, message }` do Zod — mensagem fixa não ecoa
  o valor; o contrato prova.
- **Isolamento das tabelas globais:** `test/business-calendar-schema/holiday-import-global-isolation.contract.ts` (as três do
  cache) e `test/business-calendar-schema/tenant-safety.contract.ts` 15 (`SUPPORT_ONLY`).
- **Painel:** `company-settings/components/BusinessCalendarPanel.component.tsx` 41–48 (as seções da aba Calendário;
  `HolidayImportStatus` em 45), `company-settings/shared/holidayImportStatus.service.ts` 44–53 (`resolveHeadline`),
  `holidayImport.constant.ts` (`HOLIDAY_RUN_FAILURE_HEADLINE` 41), `holidayImportGuards.validation.ts` (chaves **exatas** do
  status; `lastRun` 33, 62), molde de campo de segredo `nfse-invoice/components/NfseCredentialPanel.component.tsx` 196–200
  (`autoComplete="off"`, `type="password"`).
- **Railway:** `.railway/railway.ts` 168–171 (as duas variáveis da 252 no worker, `preserve()`); "omitir é apagar"
  (`docs/spec/railway.md` 93); rotação do chaveiro = chave nova sem remover a antiga (`docs/spec/railway.md` 287–290).
- **Última migration em staging:** `20261009160300_nfe_addresses_participant_index`. ⚠️ `work/spec-260` (a do chat, fora de
  staging) tem três mais novas: `20261009170338_conversation_subject`, `20261009171836_conversation_protocol` e
  `20261009205256_quick_reply_driver_audience`. O timestamp da 262 tem de ser **maior que `20261009205256`**: gere na hora
  (`bun run db:generate`) e regenere o `snapshot.json` se a 260 entrar antes na staging.
- **Auditoria da escrita (E12):** `business-calendar/infrastructure/business-calendar-audit.support.ts` fixa
  `permission = BUSINESS_CALENDAR_AUDIT_PERMISSION` (`'settings.manage'`, linha 36; constante em
  `business-calendar/domain/business-calendar-audit.constant.ts` 7) e o alvo é fechado (`BUSINESS_CALENDAR_AUDIT_TARGET`, 9–16);
  o IP vai em `metadata.ipAddress` (35). A 262 precisa de parâmetro `permission` opcional, dois alvos novos e ações novas.

## Desenho

### Fase 1 — O painel aprende antes (sem tela)

Duas mudanças pequenas no painel, publicadas **antes** de qualquer mudança de backend:

1. `credential_unreadable` no `failureOutcomes` de `holiday.provider.pull` em `modules/shared/jobCatalog.constant.ts` (o painel
   é a primeira das quatro cópias, regra da 252) — sem texto ainda; o texto vem com a manchete (Fase 5).
2. `holiday-import.configure` **no fim** de `COMPANY_PERMISSIONS` (`useAuthMe.query.ts`, depois de `occurrences.decide`), em
   `PERMISSION_GROUPS` (`identity/shared/permissionGroups.constant.ts`, grupo de Configurações) e nos locales do módulo
   `identity` (pt/en, `label` **e** `where`), com o contrato `permission-matrix` ajustado. Com isso a API pode passar a mandar a
   permissão sem quebrar `/auth/me`.

**Forma autofechante (já publicada em staging, `evidence.md` § Fase 1; E1/E2):** os dois contratos do painel que leem o código
da API (`frontend-contract.test.ts` e `permission-matrix.contract.ts`, e `job-catalog.contract.ts` no catálogo) ganharam as
listas `PENDING_API_PERMISSIONS` (`test/identity/pending-api-permissions.fixture.ts`) e `PENDING_API_FAILURE_OUTCOMES`: o
painel sem os pendentes iguala a API, cada pendente está **ausente da API** e **presente no painel**. A T3.1 apaga as listas no
mesmo commit em que a API concede a permissão e o desfecho, e a igualdade estrita volta.

### Fase 2 — Dado

Migration `<timestamp>_holiday_provider_settings` (`migration.sql`, `rollback.sql`, `snapshot.json`): a tabela de ADR-0102 §3,
nomes explícitos. Sem comando em tabela publicada, sem CHECK de `job`, sem linha semeada (sem linha = padrão). `rollback.sql`:
`DROP TABLE` + journal com `ROW_COUNT` (molde da `20261009160300`), sem recusa (D11). **Timestamp maior que
`20261009205256`** (as migrations da 260 em `work/spec-260`; gerar na hora, E15). Schema Drizzle em
`api-transportada/src/database/holiday-provider-settings.schema.ts` (exportado por `database.schema.ts`) e cópia só com colunas
em `worker-transportada/src/database/holiday-provider-settings.schema.ts`, com a paridade em
`test/holiday-provider-pull/schema-parity.contract.ts`.

### Fase 3 — API

Módulo `business-calendar` (onde a importação já mora):

- `application/holiday-provider-token-secret.service.ts` — selo (RF2), AAD `transportada:holiday-provider-token:v1:${settingsId}`,
  plaintext `{"token":"…"}` `.strict()` com a mesma regex nos dois lados.
- `application/holiday-provider-settings.port.ts` + `holiday-provider-settings.use-case.ts` — `read`, `save` (versão, só grava o
  que mudou, audita; gera o `settingsId` com `crypto.randomUUID()` **antes** de selar e o insere explicitamente; se o `INSERT …
ON CONFLICT DO NOTHING` não inserir nada, descarta o envelope e responde `409`), `removeToken`.
- `infrastructure/business-calendar-audit.support.ts`: parâmetro `permission` opcional (padrão `settings.manage`), alvos
  `holiday_provider_settings` e `company_holiday_import_settings`, ações novas em `BUSINESS_CALENDAR_AUDIT_ACTION`; no
  interruptor da empresa `entity_id` é o `companyId`.
- `infrastructure/drizzle-holiday-provider-settings.repository.ts` — único arquivo que importa a tabela global (contrato de
  isolamento estendido; `SUPPORT_ONLY` do `tenant-safety`).
- `presentation/holiday-provider-settings.routes.ts` + `holiday-provider-settings.schema.ts` — `GET`/`PUT`/`DELETE …/token`,
  `.strict()`, lista branca, `no-store`, limitador `postgres` escopo `holiday-provider-settings` (10 por hora por usuário, as duas
  escritas no mesmo balde).
- `application/holiday-import-enablement.use-case.ts` + repositório + `presentation/holiday-import-enablement.routes.ts` —
  `GET|PUT /company-settings/holiday-import` (`settings.manage`).
- Constantes `HOLIDAY_PROVIDER_DEFAULT_MONTHLY_REQUEST_BUDGET` (4500) e `HOLIDAY_PROVIDER_MAX_MONTHLY_REQUEST_BUDGET` (1.000.000)
  em `apps/api-transportada/src/shared/holiday-provider.constant.ts` (**não** em `business-calendar/domain`: o schema do banco
  importa desse arquivo e não importa de domínio), cópia por valor das do worker, com paridade estendida em
  `worker test/holiday-provider-pull/parity.contract.ts`.
- Permissão `holiday-import.configure` (`authorization.policy.ts`, só `company-admin`), **no fim** de `TRANSPORTADA_PERMISSIONS`
  e da lista do papel, depois do painel (Fase 1); a T3.1 apaga as listas de pendentes do painel.
- Catálogo: `credential_unreadable` na cópia da API e do cron, **cada uma com a lista do próprio contrato**
  (`test/job-catalog/catalog.contract.ts`); a do worker é da T4.1.
- Composição em `main.ts`: o `envelopeProvider` que a API já monta para a NFS-e/Resend.

### Fase 4 — Worker

- `database/holiday-provider-settings.schema.ts` (Fase 2) e `application/holiday-provider-token-secret.service.ts` (cópia por
  valor do selo da API, só `decrypt`, paridade do AAD **e** do formato do plaintext; o parse Zod do envelope entra **dentro** do
  `try`, para que envelope malformado vire `token_unreadable`).
- `infrastructure/drizzle-holiday-provider-settings.reader.ts` — `readProviderAccess(): { kind: 'ready', token, budget } |
{ kind: 'token_missing', budget } | { kind: 'token_unreadable' }` (uma consulta; abre o envelope; erro de abertura vira
  `token_unreadable` sem mensagem; erro de banco propaga → falha da etapa).
- `fetch-holiday-provider.use-case.ts`: `execute` passa a receber `{ token, budget }` do ciclo (ou um `clientFor(token)`); o
  cliente HTTP é montado por ciclo. `holiday-provider-pull.routine.ts`: a etapa de busca primeiro lê o acesso; `token_missing`
  e `token_unreadable` entram no `CycleState` e em `buildCounters`; `resolveOutcome` ganha `credential_unreadable` logo depois
  de `unexpected_error`.
- `holiday-provider-pull.registry.ts`: sem o `return {}` (linha 42); recebe o `envelopeProvider` do `main.ts` (o mesmo
  `createSecretEnvelopeProvider(cryptography.envelopeKeyRing)`). Precedente do registro: `trip.location.purge`.
- Saída das variáveis (RF10).
- Catálogo: `credential_unreadable` na cópia do worker (T4.1).
- **Ordem interna e publicação (E2/E5):** a T4.1 (catálogo do worker) vem **antes** da T4.2, porque `isJobOutcome`
  (`run-job-cycle.ts` 176) transforma desfecho fora do catálogo do worker em `unexpected_error`. A T4.2 já deixa de ler
  `FERIADOS_API_TOKEN` (o registro não usa mais `config.holidayProviderPull`, `registry` 41–42 e 60–65), então o **Gate A vem antes
  da publicação da Fase 4 inteira**, não só da T4.3: T4.1–T4.3 ficam commitadas localmente e vão num push só, depois do Gate A.

### Fase 5 — Painel

- Cliente e guardas (`holidayProviderSettingsClient.service.ts`, `holidayProviderSettingsGuards.validation.ts` com chaves exatas,
  query/mutation no padrão `useHolidayImport.*`), e para `/company-settings/holiday-import`.
- Componente `HolidayProviderSettings.component.tsx` (bloco do RF11) + `HolidayImportToggle.component.tsx`, inseridos em
  `BusinessCalendarPanel.component.tsx` antes de `HolidayImportStatus` (linha 45); o liga/desliga é o `Checkbox` do design
  system com rótulo (como `SaturdayBlock.component.tsx` 5; não existe `button role="switch"`), o carregando é
  `@/components/ui/skeleton`. O painel só recebe `canManage` (`CompanySettings.page.tsx` 256): prop nova para
  `holiday-import.configure`, lida de `/auth/me`; escrever exige as duas permissões (a aba só aparece com `settings.manage`).
- Manchetes do RF12 em `holidayImportStatus.service.ts` (a visão do status recebe também a configuração da instalação) e
  `holidayImport.constant.ts`; locale `businessCalendar.locale.json`/`.en.locale.json`. O orçamento vem de
  `monthlyRequestBudget` do `GET` do RF3 (o `status` só tem `monthlyRequests`); `>=` casa com o worker. Os textos que mandam
  olhar "sem token" em Operações (`businessCalendar.locale.json` 281, 289, 290 e o `.en`) são reescritos.
- Prints 375/768/1280 × claro/escuro: sem chave, com chave, sem permissão, erro 400, 409, 429, importação desligada, manchetes
  "sem chave", "chave ilegível", "orçamento atingido".

## Riscos e mitigação

| Risco                                                      | Mitigação                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| API com a permissão antes do painel derruba `/auth/me`     | Fase 1 publicada antes; contrato da guarda; PR de produção separado                                       |
| Token em log/resposta/auditoria/erro                       | Lista branca, mensagens fixas, sentinela procurada em tudo (CA4), contrato de privacidade do worker (CA9) |
| Qualquer `company-admin` de qualquer empresa troca a chave | `holiday-import.configure`, auditoria, `updated_by_user_id`; aceito pelo ADR-0021                         |
| Gate A pulado → busca para em silêncio                     | Gate antes da publicação da Fase 4, registrado em `evidence.md` (staging **e produção**), só nomes        |
| Gate A imprime o valor da chave (queima o segredo)         | Comando que lista só nomes (`--json` + `jq` sobre `keys`) ou aba Variables; a saída nunca contém valor    |
| Chave antiga removida do chaveiro                          | `credential_unreadable` visível; consulta de conferência abaixo antes de remover chave do chaveiro        |
| Rollback fora de ordem                                     | Reverter o worker antes do `rollback.sql`; o worker sem a tabela só falha a etapa                         |
| Corrida entre administradores                              | `version` + `409`                                                                                         |
| Upsert do interruptor apagar o cursor                      | `DO UPDATE SET is_enabled` só; contrato (CA6)                                                             |
| Nome de constraint > 63 bytes                              | Nomes explícitos e contados (ADR-0102 §3); contrato estático                                              |

**Conferência antes de remover uma chave do chaveiro** (só leitura, sem valor):
`select provider, token_envelope->>'keyId' from holiday_provider_settings where token_envelope is not null` — se o `keyId` for o
que vai sair, salvar a chave da FeriadosAPI de novo pela tela antes (o mesmo vale para `nfse_provider_credentials`,
`digital_certificates` e `contractor_mail_settings`).

## Ordem de publicação

1. Fase 1 (painel tolerante: catálogo + permissão) em staging; Deploy verde.
2. Fase 2 + Fase 3 (migration, API com permissão, rotas e catálogo da API) e o catálogo do cron.
3. **Gate A** (passo do usuário, só o nome da variável, a saída nunca com valor, staging e produção) → só então a Fase 4 é
   publicada (T4.1–T4.3 commitadas localmente e publicadas num push só, porque a T4.2 já deixa de ler a variável).
4. Fase 4 (worker).
5. Fase 5 (telas), depois dos prints aprovados.
6. O usuário cola a chave na tela de staging (Q3/Q4 da 252 continuam valendo), despausa em Operações e acompanha o 1º ciclo
   (roteiro da 252, `evidence.md` § "Roteiro do 1º ciclo real").
7. Produção: a 252 **já está em `main`** (#155 `a158bd687`, #156 `4d01307c4`, #159 `63b55be61`, 2026-10-09), então o worker de
   produção **lê** `FERIADOS_API_TOKEN` e o Gate A em produção é obrigatório: PR-a painel tolerante → PR-b migration + API +
   cron (aprovação própria) → **Gate A em produção** → PR-c worker → PR-d telas. Cada PR sobre `origin/main` por `cherry-pick`.

## Documentação viva

`docs/spec/domain-model.md` (tabela da instalação), `docs/ai-context/api-transportada.md`, `docs/ai-context/worker-transportada.md`,
`docs/ai-context/frontend-transportada.md`, **`docs/ai-context/cron-transportada.md` (~linha 145: cita `FERIADOS_API_TOKEN` e diz
que o cron "nunca lê o token"; E13)**, `apps/api-transportada/CLAUDE.md` e `apps/worker-transportada/CLAUDE.md` (o parágrafo
"Os feriados vêm da FeriadosAPI … só registrada com `FERIADOS_API_TOKEN`" muda), `docs/SECURITY.md` (entrada nova da 262 e a
emenda na da 252, **inclusive as linhas ~67–68 da entrada da 252: a frase "API … nunca leem o token" deixa de ser verdade, a API
passa a receber e selar a chave; E13**), ADR-0100 (emenda), `.env.example`, `.railway/railway.ts`, `specs/252-…/tasks.md` §
"Passos do usuário".
