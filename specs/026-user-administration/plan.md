# Plano — Feature 026

## O que já existe (levantado antes de planejar)

| Peça                       | Onde                                                                                    | Estado                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissão `users.manage`   | `identity/domain/authorization.policy.ts:8`, concedida em `:42`                         | Declarada, concedida a `company-admin`, **sem rota que a consuma**                                                                                |
| Permissão de plataforma    | `authorization.policy.ts:7`, `:38`, `:117-119`, `:136`                                  | `companies.manage` reservada e blindada contra papel de empresa; `PlatformAuthorizationPolicy` existe sem uso — e **continua sem uso** (ADR-0021) |
| Modelo de identidade       | `database/identity.schema.ts`                                                           | `identity_users` → `external_identities` (único por issuer+subject) → `user_company_memberships` (único user+company) → `membership_roles`        |
| Papéis                     | `identity.schema.ts:29-37`                                                              | `company-admin`, `finance`, `fiscal`, `operator`, `viewer`, `driver` — fechado                                                                    |
| Resolução de tenant        | `identity/application/tenant-context.service.ts`                                        | Sem membership ativo → 403; é o motivo de o ator de plataforma não caber hoje                                                                     |
| Semeador de identidade     | `database/local-identity-seed.service.ts:21`                                            | `ALLOWED_ENVIRONMENTS = new Set(['local','test'])` — inútil em staging/production                                                                 |
| Rotas de configuração      | `companies/presentation/company-settings.routes.ts:58,72,85`                            | `GET`, `GET` lookup e `PATCH`, todas sobre a empresa do token; **sem `POST`**                                                                     |
| Página de configuração     | `frontend/src/modules/company-settings/`                                                | Perfil, logo, certificado, faturamento, CT-e, MDF-e — falta a seção de usuários                                                                   |
| Allowlist do frontend      | `modules/identity/queries/useAuthMe.query.ts:20`                                        | `users.manage` já aceita; não precisa de mudança para a permissão passar                                                                          |
| Admin de Keycloak (NestJS) | `packages/backend/nestjs-keycloak-admin` `0.1.23-rc.0`                                  | Contrato certo; NestJS + password grant (`keycloak-admin.client.ts:82-85`) → inspiração, não consumo                                              |
| Validação de token         | `keycloak-jwt` `0.1.1` (consumido), `auth-keycloak` `0.0.1`                             | Só verificam; não administram                                                                                                                     |
| Trio de notificação        | `notification-contracts` / `notification-module` / `email-provider`, todos `0.1.0-rc.0` | Canal `email`/`sms`/`whatsapp` já modelado, portas de driver prontas                                                                              |
| WhatsApp                   | `meta-whatsapp-provider` `0.2.0-rc.3`                                                   | Driver disponível                                                                                                                                 |
| Envio nas apps             | —                                                                                       | **Nada.** Varredura por SMTP, `nodemailer`, Mailpit e `notification` em `apps/*/src` volta vazia                                                  |

## Dependências novas

| Dependência                                                   | Onde          | Risco                                                                                                                   |
| ------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@adatechnology/keycloak-admin` (a criar)                     | api           | Pacote novo; precisa nascer, ser testado e publicado antes de a API consumir                                            |
| `@adatechnology/notification-contracts`                       | api + worker  | `0.1.0-rc.0`: **confirmar que está publicado** antes de declarar a dependência                                          |
| `@adatechnology/email-provider` (+ driver do canal escolhido) | worker        | Peer deps (`nodemailer`/`resend`/`@aws-sdk/client-sesv2`) entram junto                                                  |
| `@adatechnology/notification-module`                          | api ou worker | Traz **schema e migrations próprias** — conflito potencial com a cadeia de `apps/api-transportada/drizzle/`; ver riscos |

## Ordem e por quê

0. **Fase 0 — provisionamento.** O arranque está decidido (ADR-0021: um deploy por transportadora, a
   empresa é o ambiente). A fase entrega o comando idempotente que garante a empresa única e o
   primeiro `company-admin`. A implementação (T000b) depende das rotas, porque o primeiro admin nasce
   desabilitado e é ativado pelo mesmo fluxo de código da feature — não por senha escrita à mão.
1. **Fase A — pacote.** Nasce fora do monorepo, com teste próprio, e é publicado. Tudo depois depende
   dele; deixá-lo para o meio obrigaria a API a nascer com adaptador improvisado.
2. **Fase B — domínio e persistência do convite.** Migration, agregado e regras (código de uso único,
   validade, último `company-admin`) antes de qualquer HTTP.
3. **Fase C — rotas.** Convite, reenvio, ativação, enable/disable, troca de perfis, listagem. Aqui
   `users.manage` deixa de ser permissão morta. Tenant safety em toda query nova.
4. **Fase D — entrega do código.** Trio de notificação no worker, canal escolhido por empresa. Vem
   depois das rotas porque o convite já funciona com o código visível só ao servidor; o canal é o
   transporte, não a regra.
5. **Fase E — painel.** Seção "Usuários e perfis" em `company-settings`, consumindo o contrato pronto.
6. **Fase F — documentação e evidência.** `CLAUDE.md`, `docs/spec/railway.md` (o passo manual de
   criar usuário deixa de existir) e `evidence.md`.

## Decisão da T012 — `notification-module` fica de fora

Publicação confirmada em 12/08/2026: `notification-contracts`, `notification-module` e
`email-provider` estão todos em `0.1.0-rc.2` (a tabela acima cita `rc.0`, do levantamento inicial).
O risco levantado no planejamento — colisão de migrations — **não se confirma**: o módulo cria as
tabelas dele em `pgSchema('notification')`, com journal próprio, e nunca toca o `public`.

Ainda assim a decisão é **consumir só `notification-contracts` + `email-provider`**, sem o módulo,
e guardar o estado do convite no schema da própria aplicação (onde ele já está, desde a T005).

O motivo não é conflito, é escopo. O que o módulo entrega além do envio — inbox, SSE, preferência
por usuário, horário de silêncio, agendamento, deduplicação, retry classificado e supressão — ou
não se aplica ou já existe aqui:

| Recurso do módulo          | Por que não paga o schema novo                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Preferência e silêncio     | Código de ativação é transacional: não tem opt-out nem espera o horário do usuário                   |
| Deduplicação (`dedupeKey`) | O trilho do worker já é idempotente por `processed_messages`                                         |
| Retry classificado         | Cada trilho já tem `main`/`retry`/`dead` com backoff por política                                    |
| Supressão de bounce        | Alimentada por webhook (`parseResendWebhook`/`parseSesNotification`); com SMTP não há webhook nenhum |
| Inbox e SSE                | Não há inbox no produto                                                                              |

Some também um caminho de migration fora de `apps/api-transportada/drizzle/` — `runNotificationMigrations`
precisaria de dono, e o startup aqui não roda migration por regra. `make migration-test` continua
julgando uma cadeia só.

A decisão é reversível e barata de reverter: o módulo consome as mesmas portas de
`notification-contracts` que o driver de e-mail já implementa. Quando entrar inbox, push ou
WhatsApp — aí sim com preferência e supressão de verdade — ele entra por cima do que a fase D
deixar pronto, sem reescrever o driver.

## Riscos e como são contidos

| Risco                                                                   | Contenção                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password grant vazar para o pacote novo por hábito do irmão NestJS      | Teste do pacote asserta que o corpo do token pedido é `grant_type=client_credentials` e que nenhum campo `password` é enviado                                                             |
| Segredo do service account em log ou erro                               | `KeycloakAdminError` carrega só código e status; teste asserta que o segredo não aparece em `message` nem no serializado                                                                  |
| `notification-module` trazer migrations que colidam com a cadeia da API | Avaliar consumir só `notification-contracts` + provider (stateless) e guardar o estado do convite no schema da própria aplicação; decidir na fase D com o `make migration-test` como juiz |
| Pacotes `0.1.0-rc.0` não publicados                                     | Tarefa explícita de confirmar publicação antes de declarar dependência; sem isso a fase D não começa                                                                                      |
| Código de ativação virar oráculo (revelar se o usuário existe)          | Resposta uniforme para expirado, usado e inexistente; asserção no contrato                                                                                                                |
| Empresa ficar sem administrador                                         | Regra de domínio com erro próprio, coberta por teste antes da implementação                                                                                                               |
| Admin da empresa A alcançar usuário da empresa B                        | Contrato de tenant safety em `test/*-schema/`, obrigatório em toda task que mexe em query                                                                                                 |
| Convite bloquear a resposta HTTP esperando o envio                      | O envio é assíncrono; a rota devolve depois de persistir, e o teste asserta que nenhuma chamada de canal acontece no caminho síncrono                                                     |

## Verificação

- **Pacote:** suíte própria no repositório de packages + publicação.
- **API:** `bun run --cwd apps/api-transportada test` + `bun run lint` + `bun run typecheck` na raiz;
  `make migration-test` na task de migration.
- **Worker:** `bun run --cwd apps/worker-transportada test` + `make worker-integration`.
- **Frontend:** `bun run --cwd apps/frontend-transportada test` + `lint` + `typecheck` + `build`.
- **Gate final:** `make check`, e o fluxo ponta a ponta rodado em staging.

## Modelo

Fase 0 é decisão humana. Fase A é 🧠 (`opus`/`fable`): contrato de pacote novo e superfície de
segurança. Fase B é 🧠 na task de migration e de regra de domínio. Fases C, D, E e F: `sonnet`, com
a task de rota de ativação marcada 🧠 por ser fronteira não autenticada.
