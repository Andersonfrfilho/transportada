# ADR 0031 — Adoção do trio de notificação, com a UI do pacote em rota própria

- Status: aceito
- Data: 2026-08-12
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

O produto não tem canal para falar com o usuário. O que existe hoje é **transacional e de mão
única**: o código de convite e, quando a spec 033 sair, o de recuperação de senha — cada um com
trilha própria, sem histórico, sem preferência e sem nada que o usuário possa ler depois. Não há
sino, não há caixa de entrada, e não há como avisar que um lote de CT-e falhou, que uma NFS-e foi
rejeitada ou que uma fatura venceu.

Cinco pacotes publicados cobrem exatamente isso, e dois deles já estão no worker:

| Pacote                   | Papel                                                                  | Instalado |
| ------------------------ | ---------------------------------------------------------------------- | --------- |
| `notification-contracts` | tipos, schemas Zod, portas                                             | ✅        |
| `email-provider`         | drivers SMTP/Resend/SES                                                | ✅        |
| `notification-module`    | schema, migrations, repositórios, use cases, rotas, worker, cron       | ❌        |
| `notification-client`    | cliente HTTP tipado + SSE                                              | ❌        |
| `notification-ui`        | React: `NotificationsWorkspace`, `NotificationSettingsWorkspace`, sino | ❌        |

O `notification-ui` traz `lucide-react` e tema próprio. O CLAUDE.md é explícito: _"UI paralela ao
design system exige ADR"_. Este documento é esse ADR.

## Decisão

1. **Adotar os cinco pacotes, não uma fatia.** Instalar só a UI e reimplementar o backend seria
   manter, aqui, um segundo módulo de notificação; instalar só o backend e desenhar a tela no nosso
   design system devolveria as 221 linhas de página que o pacote existe para eliminar. O trio foi
   desenhado junto e é adotado junto.
2. **A UI do pacote vive em rota própria, e o design system continua mandando no resto.** As telas
   compostas (`NotificationsWorkspace`, `NotificationSettingsWorkspace`) e o `NotificationBell`
   entram como estão, sem fork. Em troca, três limites: o `NotificationTheme` é preenchido com os
   tokens de `src/styles/index.css`, para a tela não parecer de outro produto; os contratos de design
   system (`icon.contract.ts`, `select.contract.ts`, `checkbox.contract.ts`) continuam varrendo
   `src/**` e **não** ganham exceção — o `lucide-react` é do pacote, não do nosso código; e nenhum
   componente do `notification-ui` é usado fora das rotas de notificação.
3. **O módulo não toca o `public`.** Ele tem `pgSchema('notification')`, migrations e journal
   próprios. Consequência que o projeto exige explicitar: o startup **não** roda migrations aqui
   tampouco — `runNotificationMigrations` entra no mesmo passo manual de `db:migrate`, com rollback
   ao lado, como toda migration do repo.
4. **A fila é RabbitMQ, pela porta.** A `QueuePort` é injetada e o módulo nunca abre conexão de
   broker. O adaptador é escrito sobre `@adatechnology/rabbitmq-provider`, com a trilha
   `${QUEUE_PREFIX}.notification.v1.{main,retry,dead}`. O `bullmq` que o pacote traz não é usado:
   não há Redis nesta stack e não vai haver por causa disto.
5. **O `recipientResolver` é nosso.** O módulo não conhece `identity_users` — quem resolve destinatário
   e endereço é um adaptador sobre `identity_user_profiles`, e ele filtra por `companyId` do contexto
   autenticado. É o mesmo desenho do gateway fiscal: o pacote não vê nossa tabela.
6. **Um remetente só.** O driver de e-mail do módulo é o `email-provider` já configurado
   (`EMAIL_FROM` + `SMTP_URL`). Não se cria segunda configuração de SMTP.
7. **Convite e recuperação de senha continuam onde estão.** As trilhas `invitation-delivery.v1` e
   `password-reset-delivery.v1` não migram para o módulo. Elas entregam **segredo de uso único**, com
   envelope selado e AAD por empresa; jogá-las numa caixa de entrada que guarda histórico legível é
   exatamente o que não se quer. O módulo é para aviso de produto — o que o usuário lê depois.
8. **O `idleTimeout` do `Bun.serve` sobe para 60s.** Hoje é 10s (`IDLE_TIMEOUT_SECONDS`) e o
   heartbeat do SSE do módulo é 25s: a conexão do sino morreria antes do primeiro batimento, sem
   erro, mostrando contagem velha. O `REQUEST_TIMEOUT_SECONDS` continua 10 — são coisas diferentes, e
   confundi-las é como o SSE quebra silenciosamente.
9. **O webhook de recibo só sobe com segredo.** `webhookSecret` ausente, a rota não é publicada —
   fail-closed, como manda `security.md` §3. A assinatura é conferida sobre o `rawBody`, com janela
   de timestamp e nonce.

## Alternativas rejeitadas

**Desenhar a tela no nosso design system e usar só o backend.** É a opção que respeitaria a regra do
frontend sem ADR nenhum. Custa a tela de inbox, a de preferências, o sino, o SSE e o editor de
template com preview — tudo já escrito, testado e mantido no repo de packages. Reescrever isso para
não importar `lucide-react` é pagar caro por consistência visual que o `NotificationTheme` já entrega.

**Adotar só a UI, com backend próprio.** Duplicaria schema, deduplicação, horário de silêncio,
supressão, classificação de retry e webhook de recibo — a parte difícil, e a que tem consequência
quando erra (token de push morto retentado para sempre, cliente recebendo o mesmo aviso duas vezes).

**Manter tudo transacional e não ter notificação.** É o estado atual. Funciona enquanto o produto só
precisa entregar código de acesso; não sobrevive ao primeiro "por que ninguém me avisou que o lote
falhou?".

## Consequências

- Um schema novo no banco (`notification`), com journal próprio e passo de migration separado.
- Uma trilha nova de fila e um consumidor novo no worker.
- Três dependências de frontend (`notification-ui`, `notification-client`, e `lucide-react` por
  transitividade), e uma rota nova na navegação manual de `src/main.tsx`.
- O `idleTimeout` da API muda para todo mundo, não só para o SSE — 60s é folga para o heartbeat, e
  não afrouxa o `REQUEST_TIMEOUT_SECONDS`.
- Os pacotes estão em `0.1.0-rc.2`. Release candidate em produção é risco assumido aqui: a
  alternativa é manter o produto sem notificação até um `1.0` que depende de nós mesmos publicarmos.
  Versão **pinada**, sem faixa de semver.
