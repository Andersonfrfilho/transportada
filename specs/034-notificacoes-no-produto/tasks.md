# 034 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.

## Fase A — banco e boot

> 🤖 Modelo: `sonnet` (T001 e T002 são 🧠 — schema de terceiro no nosso banco)

- [x] **T001** 🧠 Instalar `@adatechnology/notification-module` e `@adatechnology/module-http` na API
      e no worker, **pinados** em `0.1.0-rc.2` (na prática `notification-module@0.1.0-rc.3` e
      `module-http@0.1.0-rc.1` — ver `evidence.md`). Rodar `runNotificationMigrations` no passo manual de
      `db:migrate` (nunca no startup), com rollback ao lado. Contrato em
      `test/notification/migration.contract.ts`: o schema `notification` existe, nenhuma tabela do
      `public` mudou, e o rollback devolve o estado anterior. Verificação: `make migration-test`.
- [ ] **T002** 🧠 Composition root: `createNotificationModule` com `recipientResolver` sobre
      `identity_user_profiles` (filtra por `companyId` do contexto), driver de e-mail reusando
      `EMAIL_FROM`/`SMTP_URL`, e `suppressionHmacKey` novo no schema de env — **falha no boot** se
      ausente. Contrato negativo em `test/notification/recipient-resolver.contract.ts`: destinatário
      de outra empresa é recusado.

## Fase B — HTTP

> 🤖 Modelo: `sonnet`

- [ ] **T003** Subir `IDLE_TIMEOUT_SECONDS` de 10 para 60 em `shared/api.constant.ts`, mantendo
      `REQUEST_TIMEOUT_SECONDS` em 10. Contrato em `test/server/sse-timeout.contract.ts`: conexão
      viva além de 25s (o heartbeat do módulo) — é este teste que guarda a decisão, porque a falha
      real é silenciosa.
- [ ] **T004** Montar `createNotificationRoutes` via `createModuleFetchRouter` sob `/v1` com o
      `authResolver` da aplicação. Contrato em `test/notification/http.contract.ts`: as rotas de
      inbox, preferências e templates respondem; isolamento entre empresas; sem `webhookSecret` a
      rota de webhook **não existe** (404, não 401).
- [ ] **T005** Webhook de recibo: assinatura sobre `rawBody`, janela de timestamp, nonce contra
      replay. Contrato: assinatura inválida rejeitada, replay do mesmo nonce rejeitado.

## Fase C — fila

> 🤖 Modelo: `sonnet`

- [ ] **T006** Adaptador de `QueuePort` sobre `@adatechnology/rabbitmq-provider`, trilha
      `${QUEUE_PREFIX}.notification.v1.{main,retry,dead}`. O `bullmq` do pacote não é usado.
      Contrato do nome das filas junto dos demais.
- [ ] **T007** `createNotificationWorker` e `createNotificationSchedules` no runtime do worker e no
      cron (agendadas, expiradas, purge de retenção). Contrato: `dedupeKey` repetida produz uma
      entrega só; `invalid-target` suprime o endereço e o envio seguinte não sai.

## Fase D — disparos do produto

> 🤖 Modelo: `sonnet`

- [ ] **T008** Catálogo de assuntos (`cte-batch`, `nfse`, `billing`, `identity`) e canais (`inbox`,
      `email`) em `*.constant.ts`, com os templates iniciais. Contrato do vocabulário.
- [ ] **T009** Ligar os três disparos que já têm dono: falha de emissão de lote, rejeição de NFS-e e
      fatura vencendo. Toda chamada com `dedupeKey` derivada do agregado. Contrato por disparo.

## Fase E — frontend

> 🤖 Modelo: `sonnet`

- [ ] **T010** Instalar `notification-ui` e `notification-client` pinados; `NotificationProvider`
      com o `NotificationTheme` preenchido pelos tokens de `src/styles/index.css`. Contrato em
      `test/design-system/notification-theme.contract.ts`: nenhum token literal, e os contratos de
      `icon`/`select`/`checkbox`/`skeleton` continuam verdes sem exceção nova.
- [ ] **T011** `NotificationBell` no cabeçalho e rota `/notificacoes` com `NotificationsWorkspace`,
      na navegação manual de `src/main.tsx`. Textos acentuados em `*.locale.json`.
- [ ] **T012** Rota de configurações com `NotificationSettingsWorkspace`, recebendo `channels` e
      `categories` do catálogo do T008.

## Fase F — fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T013** `make check` nas quatro apps, `make migration-test`, `make worker-integration`;
      varredura de log confirmando ausência de e-mail e telefone de destinatário; as três telas
      lidas em staging com dado real. Evidência em `evidence.md`.
