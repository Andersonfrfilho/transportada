# 034 — Notificações no produto

## Problema

O produto não fala com quem o usa. Quando um lote de CT-e falha na SEFAZ, quando uma NFS-e é
rejeitada pela prefeitura, quando uma fatura vence — nada acontece do lado do usuário. Ele descobre
abrindo a tela certa no dia certo. Não há sino, não há caixa de entrada, não há histórico do que o
sistema tentou avisar, e não há como alguém dizer "isso me avisa por WhatsApp, aquilo por e-mail".

O que existe é entrega **transacional**: o código do convite e, quando a spec 033 sair, o da
recuperação de senha. Cada um com trilha própria, de mão única, sem nada para ler depois. É a peça
certa para segredo de uso único e a peça errada para aviso de operação.

## Objetivo

1. Sino com contagem de não-lidas, atualizando sozinho.
2. Caixa de entrada com histórico do que o produto avisou.
3. Tela de preferências: por assunto e por canal, decidida pelo usuário.
4. Editor de mensagem por empresa, com prévia.
5. Os avisos que já têm dono hoje — falha de lote, rejeição de NFS-e, fatura vencendo — passam a
   sair por uma chamada só.

## Decisões

Detalhamento e alternativas rejeitadas em **ADR-0031**.

**Adotar os cinco pacotes, não uma fatia.** `notification-contracts` e `email-provider` já estão no
worker; entram `notification-module` (API + worker), `notification-client` e `notification-ui`.

**A UI do pacote entra sem fork, em rota própria.** `NotificationsWorkspace`,
`NotificationSettingsWorkspace` e `NotificationBell` como estão, com o `NotificationTheme` preenchido
pelos tokens de `src/styles/index.css`. Os contratos de design system continuam varrendo `src/**` sem
exceção — o `lucide-react` é do pacote, não do nosso código.

**O módulo não toca o `public`:** `pgSchema('notification')`, migrations e journal próprios,
rodadas no mesmo passo manual de `db:migrate`, com rollback ao lado.

**Fila é RabbitMQ pela porta.** Trilha `${QUEUE_PREFIX}.notification.v1.{main,retry,dead}`. O
`bullmq` do pacote não é usado — não há Redis nesta stack.

**`recipientResolver` é adaptador nosso** sobre `identity_user_profiles`, filtrando por `companyId`
do contexto autenticado. O pacote não conhece nossas tabelas.

**Um remetente só:** o driver de e-mail é o `email-provider` já configurado com `EMAIL_FROM` e
`SMTP_URL`.

**Convite e recuperação de senha não migram.** Segredo de uso único não vai para caixa de entrada com
histórico legível.

**`IDLE_TIMEOUT_SECONDS` sobe de 10 para 60.** O heartbeat do SSE é 25s; com 10s a conexão do sino
morre antes do primeiro batimento, sem erro. O `REQUEST_TIMEOUT_SECONDS` continua 10.

## Comportamento

### Envio

Uma chamada, e o módulo decide o resto:

```ts
await notification.useCases.sendNotification.execute({
  companyId,
  recipientUserId,
  category: 'cte-batch',
  templateKey: 'cte-batch.failed',
  payload: { batchNumber },
  dedupeKey: `cte-batch:${batchId}:failed`,
})
```

Ele lê a preferência do usuário, respeita horário de silêncio, verifica supressão, monta uma entrega
por canal e enfileira. **`dedupeKey` é obrigatória em todo disparo** — sem ela, retry vira spam.

### Rotas

Montadas por `createModuleFetchRouter` sob `/v1`, com o `authResolver` da aplicação: inbox
(`GET /notifications`, `unread-count`, `stream` SSE, marcar lida, apagar), devices, preferências,
templates e o webhook de recibo. O webhook **só é publicado se houver `webhookSecret`**; assinatura
sobre o `rawBody`, com janela de timestamp e nonce.

### Assuntos e canais deste produto

`channels` e `categories` são do produto, não do pacote. Primeira leva de assuntos: `cte-batch`
(falha de emissão), `nfse` (rejeição da prefeitura), `billing` (fatura vencendo), `identity`
(mudança de acesso). Canais: `inbox` e `email` — WhatsApp e push ficam para quando houver provedor
configurado, e é capacidade por ausência, não flag.

### Classificação de retry

O driver devolve `sent` / `retriable` / `permanent` / `invalid-target`; o módulo reenfileira com
backoff, para, ou **desativa o device / suprime o e-mail**. Sem essa distinção, quem troca de celular
deixa um token retentado para sempre.

### Privacidade

Telefone e e-mail nunca vão para log — `maskTarget` para exibir, `hashTarget` (HMAC) para a chave de
supressão. A lista de supressão existe para não enviar, nunca como cadastro de contatos.

## Fora de escopo

- Migrar convite e recuperação de senha para o módulo.
- Push (exige provedor e registro de aparelho) e WhatsApp (exige template aprovado na Meta).
- Notificação para quem não é usuário do sistema — cliente final não recebe nada aqui.
- Digest por e-mail (resumo diário).

## Critérios de aceite

1. `runNotificationMigrations` cria o schema `notification` sem tocar em nenhuma tabela do `public`;
   rollback ao lado devolve o banco ao estado anterior. `make migration-test` verde.
2. Nenhuma migration do módulo roda no startup da API.
3. `sendNotification` com a mesma `dedupeKey` duas vezes produz **uma** entrega.
4. A preferência do usuário é respeitada: canal desligado não recebe.
5. Isolamento: usuário de uma empresa não lê notificação de outra — contrato negativo, como todo
   `tenant-safety.contract.ts`.
6. O `recipientResolver` recusa destinatário fora da empresa do contexto.
7. `invalid-target` do driver de e-mail suprime o endereço; a supressão impede o envio seguinte.
8. O webhook não sobe sem `webhookSecret`; com segredo, assinatura inválida é rejeitada e replay do
   mesmo nonce também.
9. O SSE sobrevive a mais de um heartbeat — teste que segura a conexão além de 25s e vê a contagem
   mudar. Com `idleTimeout` em 10 esse teste falha; é ele que guarda a decisão 8 do ADR.
10. As três telas montam e leem dados reais em staging: sino, inbox e configurações.
11. Os contratos de design system (`icon`, `select`, `checkbox`, `skeleton`) continuam verdes — a
    adoção não abre exceção em `src/**`.
12. Nenhum log de nenhum nível contém e-mail ou telefone de destinatário.
13. `make check` verde nas quatro apps.
