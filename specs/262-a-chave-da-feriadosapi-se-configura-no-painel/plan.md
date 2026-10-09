# Plano — 262

> Desenho do `architect` (`opus`, 2026-10-09). Decisão completa no **ADR-0102** (proposta; aceitar na T0.1). Fatos
> conferidos em `origin/staging` `c1a0fed8f` (2026-10-09); a T0.2 reconfere arquivo e linha antes do código.

## Contexto (o que já existe)

- **A chave e o orçamento hoje (252 T3.5):** `apps/worker-transportada/src/config/environment.schema.ts` 98–102
  (`FERIADOS_API_MONTHLY_REQUEST_BUDGET: optionalPositiveInteger()`, `FERIADOS_API_TOKEN: optionalToken()`), 272–288
  (`toHolidayProviderPull`: sem token, `{}`), 440–444 (`optionalToken`, `^[\x21-\x7E]+$`), 447–462 (orçamento 1 a
  `FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET`); tipo em `shared/worker.types.ts` 82. Constantes em
  `holiday-provider-pull/domain/holiday-provider-pull.constant.ts` (padrão 4500, teto 1.000.000).
- **Registro condicional:** `holiday-provider-pull/infrastructure/holiday-provider-pull.registry.ts` 36–41 (`settings ===
undefined` → `{}`), chamado em `main.ts` 1473; a busca recebe `budget` e um cliente com `token` **no boot**
  (`createFetchHolidayProviderUseCase({ budget, client: createFeriadosApiClient({ token }) })`, registry 58–70).
- **Rotina ausente:** `job-run/application/run-job-cycle.ts` 102–113 (`job_run_routine_missing` → `unexpected_error`).
- **Desfecho:** `holiday-provider-pull/application/holiday-provider-pull-summary.ts` (`buildCounters`, `resolveOutcome`: falha
  nossa → `unexpected_error`; depois `provider_unauthorized` > `malformed_response` > `provider_unreachable`; senão
  `succeeded`). Vocabulário do invólucro: `JOB_WRAPPER_OUTCOMES` = `succeeded|cancelled|abandoned|unexpected_error`
  (`shared/job-catalog.constant.ts` 30–35 do worker); `holiday.provider.pull` com `failureOutcomes` de três palavras
  (worker 297–306, API 293, cron 298, painel 284). O `outcome` não tem CHECK de vocabulário (comentário do `JOB_CATALOG`).
- **Liga/desliga por empresa:** `company_holiday_import_settings.is_enabled` (`api-transportada/src/database/holiday-import.schema.ts`;
  cópia no worker `src/database/holiday-import.schema.ts` 23–29), respeitado por `holiday-discovery.query.ts` 39,
  `holiday-fetch.query.ts` 33, `holiday-apply.query.ts` 16 (`coalesce(s.is_enabled, true)`). O upsert do cursor grava só o
  cursor (`drizzle-holiday-discovery.store.ts` 88–107). O status já devolve `isEnabled` (`business-calendar/presentation/holiday-import.schema.ts` 100, 116).
- **Chaveiro no worker (corrige o pedido):** `config/cryptographic-configuration.schema.ts` 34–35 exige
  `ENCRYPTION_ACTIVE_KEY_ID`/`ENCRYPTION_KEYRING_JSON` no boot (`main.ts` 527); `.railway/railway.ts` 166–167 os dá ao worker;
  o worker já abre envelopes da NFS-e (`nfse-issuance/application/nfse-credential-secret.service.ts`, cópia por valor da API
  com o mesmo AAD), do certificado e do Resend (`contractor-mail/application/contractor-mail-credential-secret.service.ts`),
  com contrato de paridade (`test/contractor-mail/credential-secret-parity.contract.ts`).
- **Molde da credencial no banco (API):** `contractor-mail/application/contractor-mail-credential-secret.service.ts` (AAD por
  linha, plaintext zerado, envelope Zod `.strict()`); `database/contractor-mail.schema.ts` 47–89 (`secret_envelope jsonb`,
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
- **Permissões:** `identity/domain/authorization.policy.ts` (`settings.manage` só no `company-admin`, 122–138; o raciocínio da
  permissão dedicada `cargo.measure`, 95–100). O painel **recusa** `/auth/me` com permissão desconhecida:
  `frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts` (`isLiteralArray` 120–128, uso em 162) → `IDENTITY_AUTH_ME_INVALID`.
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
- **Última migration em staging:** `20261009160300_nfe_addresses_participant_index` (a da 262 nasce depois da última na hora
  de gerar; regerar o `snapshot.json` no rebase se outra entrar antes).

## Desenho

### Fase 1 — O painel aprende antes (sem tela)

Duas mudanças pequenas no painel, publicadas **antes** de qualquer mudança de backend:

1. `credential_unreadable` no `failureOutcomes` de `holiday.provider.pull` em `modules/shared/jobCatalog.constant.ts` (o painel
   é a primeira das quatro cópias, regra da 252) — sem texto ainda; o texto vem com a manchete (Fase 5).
2. `holiday-import.configure` em `COMPANY_PERMISSIONS` (`useAuthMe.query.ts`), em `PERMISSION_GROUPS`
   (`identity/shared/permissionGroups.constant.ts`, grupo de Configurações) e nos locales do módulo `identity` (pt/en), com o
   contrato `permission-matrix` ajustado. Com isso a API pode passar a mandar a permissão sem quebrar `/auth/me`.

### Fase 2 — Dado

Migration `<timestamp>_holiday_provider_settings` (`migration.sql`, `rollback.sql`, `snapshot.json`): a tabela de ADR-0102 §3,
nomes explícitos. Sem comando em tabela publicada, sem CHECK de `job`, sem linha semeada (sem linha = padrão). `rollback.sql`:
`DROP TABLE` + journal com `ROW_COUNT` (molde da `20261009160300`), sem recusa (D11). Schema Drizzle em
`api-transportada/src/database/holiday-provider-settings.schema.ts` (exportado por `database.schema.ts`) e cópia só com colunas
em `worker-transportada/src/database/holiday-provider-settings.schema.ts`, com a paridade em
`test/holiday-provider-pull/schema-parity.contract.ts`.

### Fase 3 — API

Módulo `business-calendar` (onde a importação já mora):

- `application/holiday-provider-token-secret.service.ts` — selo (RF2), AAD `transportada:holiday-provider-token:v1:${settingsId}`.
- `application/holiday-provider-settings.port.ts` + `holiday-provider-settings.use-case.ts` — `read`, `save` (versão, só grava o
  que mudou, audita), `removeToken`.
- `infrastructure/drizzle-holiday-provider-settings.repository.ts` — único arquivo que importa a tabela global (contrato de
  isolamento estendido; `SUPPORT_ONLY` do `tenant-safety`).
- `presentation/holiday-provider-settings.routes.ts` + `holiday-provider-settings.schema.ts` — `GET`/`PUT`/`DELETE …/token`,
  `.strict()`, lista branca, `no-store`, limitador `postgres` escopo `holiday-provider-settings` (10 por hora por usuário, as duas
  escritas no mesmo balde).
- `application/holiday-import-enablement.use-case.ts` + repositório + `presentation/holiday-import-enablement.routes.ts` —
  `GET|PUT /company-settings/holiday-import` (`settings.manage`).
- Constantes `HOLIDAY_PROVIDER_DEFAULT_MONTHLY_REQUEST_BUDGET` (4500) e `HOLIDAY_PROVIDER_MAX_MONTHLY_REQUEST_BUDGET` (1.000.000)
  em `business-calendar/domain/…constant.ts`, cópia por valor das do worker, com paridade.
- Permissão `holiday-import.configure` (`authorization.policy.ts`, só `company-admin`), depois do painel (Fase 1).
- Catálogo: `credential_unreadable` na cópia da API e do cron.
- Composição em `main.ts`: o `envelopeProvider` que a API já monta para a NFS-e/Resend.

### Fase 4 — Worker

- `database/holiday-provider-settings.schema.ts` (Fase 2) e `application/holiday-provider-token-secret.service.ts` (cópia por
  valor do selo da API, só `decrypt`, paridade do AAD).
- `infrastructure/drizzle-holiday-provider-settings.reader.ts` — `readProviderAccess(): { kind: 'ready', token, budget } |
{ kind: 'token_missing', budget } | { kind: 'token_unreadable' }` (uma consulta; abre o envelope; erro de abertura vira
  `token_unreadable` sem mensagem; erro de banco propaga → falha da etapa).
- `fetch-holiday-provider.use-case.ts`: `execute` passa a receber `{ token, budget }` do ciclo (ou um `clientFor(token)`); o
  cliente HTTP é montado por ciclo. `holiday-provider-pull.routine.ts`: a etapa de busca primeiro lê o acesso; `token_missing`
  e `token_unreadable` entram no `CycleState` e em `buildCounters`; `resolveOutcome` ganha `credential_unreadable` logo depois
  de `unexpected_error`.
- `holiday-provider-pull.registry.ts`: sem o `return {}`; recebe o `envelopeProvider` do `main.ts` (o mesmo
  `createSecretEnvelopeProvider(cryptography.envelopeKeyRing)`).
- Saída das variáveis (RF10) — **Gate A antes do deploy**.
- Catálogo: `credential_unreadable` na cópia do worker.

### Fase 5 — Painel

- Cliente e guardas (`holidayProviderSettingsClient.service.ts`, `holidayProviderSettingsGuards.validation.ts` com chaves exatas,
  query/mutation no padrão `useHolidayImport.*`), e para `/company-settings/holiday-import`.
- Componente `HolidayProviderSettings.component.tsx` (bloco do RF11) + `HolidayImportToggle.component.tsx`, inseridos em
  `BusinessCalendarPanel.component.tsx` antes de `HolidayImportStatus`; permissão lida de `/auth/me`.
- Manchetes do RF12 em `holidayImportStatus.service.ts` (a visão do status recebe também a configuração da instalação) e
  `holidayImport.constant.ts`; locale `businessCalendar.locale.json`/`.en.locale.json`.
- Prints 375/768/1280 × claro/escuro: sem chave, com chave, sem permissão, erro 400, 409, 429, importação desligada, manchetes
  "sem chave", "chave ilegível", "orçamento atingido".

## Riscos e mitigação

| Risco                                                      | Mitigação                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| API com a permissão antes do painel derruba `/auth/me`     | Fase 1 publicada antes; contrato da guarda; PR de produção separado                                       |
| Token em log/resposta/auditoria/erro                       | Lista branca, mensagens fixas, sentinela procurada em tudo (CA4), contrato de privacidade do worker (CA9) |
| Qualquer `company-admin` de qualquer empresa troca a chave | `holiday-import.configure`, auditoria, `updated_by_user_id`; aceito pelo ADR-0021                         |
| Gate A pulado → busca para em silêncio                     | Gate na T4.3, registrado em `evidence.md` antes do deploy do worker                                       |
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
3. **Gate A** (passo do usuário, só o nome da variável, staging e produção) → T4.3.
4. Fase 4 (worker).
5. Fase 5 (telas), depois dos prints aprovados.
6. O usuário cola a chave na tela de staging (Q3/Q4 da 252 continuam valendo), despausa em Operações e acompanha o 1º ciclo
   (roteiro da 252, `evidence.md` § "Roteiro do 1º ciclo real").
7. Produção: **depois** dos três PRs da 252; PR-a painel tolerante → PR-b migration + API + worker + cron (aprovação própria) →
   PR-c telas. Se a 252 ainda não estiver em produção, a 262 entra **junto** com o PR2 dela (o worker de produção nunca chega a
   ler variável de ambiente).

## Documentação viva

`docs/spec/domain-model.md` (tabela da instalação), `docs/ai-context/api-transportada.md`, `docs/ai-context/worker-transportada.md`,
`docs/ai-context/frontend-transportada.md`, `apps/api-transportada/CLAUDE.md` e `apps/worker-transportada/CLAUDE.md` (o parágrafo
"Os feriados vêm da FeriadosAPI … só registrada com `FERIADOS_API_TOKEN`" muda), `docs/SECURITY.md` (entrada nova da 262 e a
emenda na da 252), ADR-0100 (emenda), `.env.example`, `.railway/railway.ts`, `specs/252-…/tasks.md` § "Passos do usuário".
