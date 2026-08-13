# 033 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.

## Fase A — banco

> 🤖 Modelo: `sonnet` (T001 é 🧠 — tabela nova em identidade)

- [x] **T001** 🧠 Migration aditiva: tabela `password_reset_requests` (`id` uuid, `company_id`,
      `user_id`, `code_hash` text, `sealed_code` jsonb, `attempt_count` integer, `expires_at`,
      `consumed_at`, `delivered_at`, `created_at`, `updated_at`). Unique global em `code_hash`,
      unique `(company_id, id)`, FK composta `(user_id, company_id)` →
      `user_company_memberships` com `on delete restrict`, CHECK do formato do hash
      (`^[0-9a-f]{64}$`) e de `attempt_count >= 0`, índice parcial de pedido vivo
      `(company_id, user_id) where consumed_at is null`. Schema em
      `src/database/password-reset.schema.ts` + agregação em `database.schema.ts`. Rollback ao lado.
      Contrato em `test/identity-schema/password-reset.contract.ts` e tabela nova coberta por
      `test/identity-schema/tenant-safety.contract.ts`. Verificação: `make migration-test`.

## Fase B — domínio

> 🤖 Modelo: `sonnet`

- [x] **T002** Contrato em `test/identity-domain/password-reset.contract.ts`: TTL de 15 min, teto de
      5 tentativas, recusa indistinguível (não achou · expirado · consumido · tentativas esgotadas),
      aceite marca consumo, e a decisão aceita **não** carrega instrução de habilitar conta.
- [x] **T003** Implementar `identity/domain/password-reset.policy.ts` e as constantes
      (`PASSWORD_RESET_TTL_MINUTES`, `PASSWORD_RESET_MAX_ATTEMPTS`). Sem I/O. O código em claro e o
      hash reusam `generateInvitationCode`/`hashInvitationCode`.

## Fase C — API

> 🤖 Modelo: `sonnet`

- [x] **T004** Contrato de rota em `test/password-reset/http.contract.ts`: `POST /password-resets`
      responde 204 idêntico para login inexistente, desabilitado, sem membership e válido; duas
      memberships ativas geram dois pedidos e duas linhas de outbox; pedido novo invalida o pendente
      anterior; corpo inválido é 400.
- [x] **T005** Contrato de `POST /password-resets/confirm`: código certo troca a senha e marca
      `consumed_at` sem chamar `setEnabled`; segunda vez com o mesmo código é recusada; expirado,
      errado e consumido dão respostas idênticas; a sexta tentativa é recusada mesmo com o código
      certo.
- [x] **T006** Implementar `request-password-reset.use-case.ts`,
      `confirm-password-reset.use-case.ts`, `drizzle-password-reset.repository.ts`, schemas Zod e as
      duas rotas anônimas; registrar no composition root. ⚠️ **Não há rate limiter nesta API** —
      nada existe para registrar; a lacuna está anotada no `evidence.md`. Trilha de auditoria com
      `requestId` — nunca `username`, contato ou código.

## Fase D — entrega

> 🤖 Modelo: `sonnet`

- [x] **T007** Trilha `password-reset-delivery.v1` (main/retry/dead) na topologia do worker +
      envelope Zod versionado. Contrato do nome das filas junto dos demais.
- [x] **T008** Consumidor: abre o envelope com AAD
      `transportada:password-reset:v1:${companyId}:${requestId}`, lê o canal em
      `company_fiscal_profiles.activation_channel` (empresa sem perfil → `email`), entrega pelo
      driver da ativação e grava `delivered_at`. Cópia do schema no worker, como manda o CLAUDE.md.
      Contrato de paridade do AAD entre API e worker.

## Fase E — frontend

> 🤖 Modelo: `sonnet`

- [x] **T009** Link "Esqueci minha senha" — ⚠️ a tela de login é do **Keycloak**, não nossa: o link
      nasce do tema (T011). Tela em dois passos reusando a forma da
      ativação: esqueleto de carregamento, campos pelos tokens, textos acentuados em
      `*.locale.json`, cliente HTTP do módulo `identity`.

## Fase F — fechamento

> 🤖 Modelo: `sonnet`

- [x] **T010** `make check` + `make migration-test` + `make worker-integration` verdes; varredura de
      log confirmando que `username`, contato e código não aparecem em nenhum nível; evidência em
      `evidence.md`.

## Fase G — tema do Keycloak

> 🤖 Modelo: `sonnet`

- [x] **T011** Tema de login do Keycloak com a identidade do app (tokens de cor, tipografia e campo
      equivalentes aos do frontend), publicado no contrato do realm, com `resetPasswordAllowed`
      seguindo desligado e o link "Esqueci minha senha" apontando para a nossa tela.
