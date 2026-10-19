# Evidence — 274 O chat da contratante envia por e-mail

## Decisões do dono (2026-10-19)

1. **Composer sempre aberto** (há nota, contratante e permissão) e envia por **e-mail**; a mensagem aparece na conversa
   como chat, com as confirmações de envio, entrega e **leitura**.
2. **"Lida" por pixel de abertura.** A ADR-0111 revoga a 183 D7. O dono aceita os contras da D7 (impreciso; cliente que
   bloqueia imagem nunca marca; outros marcam sozinhos; rastreia a contratante) e o da entregabilidade (Resend
   recomenda não rastrear transacional; o rastreio é do domínio inteiro). Webhook `email.opened → read`; escada do
   e-mail ganha `read`; ligar o rastreio no Resend.
3. ~~Cada mensagem sai no modelo HTML completo da 272.~~ **Substituída no mesmo dia:** a mensagem do chat **não** usa o
   modelo do tipo nem o HTML da 272. Leva o texto e os anexos num **corpo de e-mail padrão** com a identidade da
   plataforma (cores, logo/identidade da transportadora, assinatura do operador, rodapé de marcas TransportAdA/Ada), que
   mora no SDK de notificação (`@adatechnology/notification-module`, e `notification-contracts` se fizer sentido) como
   "corpo de e-mail padrão para envio sem utilização direta de modelos". Consequências: (a) o chat não exige modelo do
   tipo (sem 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`); o modelo continua no automático e no diálogo; (b) fase no
   repositório de pacotes (tabelas, estilos inline, cores fixas, 620 px, slots: identidade, corpo, anexos, assinatura,
   rodapé; render e `text/plain` no pacote; versão nova consumida pela API); (c) reaproveitar da 272 sem duplicar
   regra; (d) assunto = o da linha, com o prefixo da 272.
4. **Portal aberto:** a mensagem vai por e-mail **e** portal juntos (canal por mensagem, 183 D2). Desenho escolhido:
   uma mensagem `email`, portal como vitrine (plan D2).

## Assunções (padrão adotado; vetável pelo dono)

- **A1** Destinatários = os pré-marcados que a prévia já resolve (escolhidos no tipo, senão os da etapa) + a cópia da
  267/271, como no diálogo. Nenhum pré-marcado → 409 e o composer aponta o "Enviar por e-mail".
- **A2** Assunto = o do último e-mail de saída da ocorrência, sem "Re:"; sem e-mail anterior, `Ocorrência <tipo> — NF
<número>` com o prefixo da 272.
- **A3** O diálogo "Enviar por e-mail" continua (contatos, prévia, anexos, modelo); reenvio de falha segue por ele.
- **A4** Sandbox para em "Enviada" (sem webhook; pixel não dispara).
- **A5** Anexos e áudio do composer seguem as regras da rota de e-mail (áudio é aceito:
  `conversation-attachment.policy.ts:24-38`).
- **A6** Idempotência pela `clientMessageId` do composer com prefixo `email-message:`; status otimista `queued`.
- **A7** Erros do composer: sem destinatário (409), Resend não pronto e sem sandbox (erro de prontidão de hoje), corpo
  ou anexo inválido (400). Modelo ausente e área de mensagem ausente **não se aplicam** (decisão 3 substituída).
- **A8** O aviso sem corpo do portal (ADR-0073) vai só a usuários do portal fora de `To`/`Cc`.
- **A9** Leitura no portal marca também as mensagens de e-mail como lidas.
- **A10** `click_tracking` fica desligado.
- **A11** O corpo padrão fica em `notification-contracts` (puro, importável pelo front para uma prévia futura) e o
  `notification-module` re-exporta; a API importa do módulo.

## Perguntas ao dono (não bloqueiam)

- **Q1** Atualizar a regra global `email-templates.md` (repositório `ia`) com a exceção do envio sem modelo?
- **Q2** Quem liga o rastreio no Resend e cria o CNAME no DNS da transportadora (staging e produção)? Staging tem conta
  Resend real para testar o "Lida", ou só o Mailpit?
- **Q3** Subir `notification-*` de `0.1.0-rc.*` para a versão estável nova traz o que mais saiu no pacote desde então
  (T1.3 lista); aceitar no mesmo PR ou separar?

## Levantamento (`origin/staging` 2483d6e6f, 2026-10-19)

Caminhos relativos a `apps/<app>/src/` salvo indicação. A conferir na T0.1.

### O que cada spec decidiu × o que o código faz

- **183** (`specs/183-a-ocorrencia-tem-duas-conversas/`)
  - D2 (`spec.md:75-80`): "Numa mesma conversa, uma mensagem sai por e-mail e a seguinte por WhatsApp. Cada mensagem
    guarda o canal por onde passou e mostra o selo dele." Código: `occurrence_conversation_messages.channel` por linha.
  - D7 (`spec.md:131-137`): "no e-mail não existe 'lida' — o selo para em 'entregue'". Código: escada do e-mail
    `['queued','sent','delivered']` (API `occurrence-conversation/domain/message-status.policy.ts:37-50`; worker
    `…/message-status.policy.ts:38-51`; painel `frontend-transportada/…/shared/messageStatus.service.ts:20-25`); CHECK
    `occurrence_conversation_messages_email_never_read_check` (`database/occurrence-conversation.schema.ts:346-350`;
    migration `drizzle/20260924201712_occurrence_conversations/migration.sql:42-45`); webhook ignora aberto/clicado
    "de propósito … (D7)" (`contractor-mail/application/process-inbound-email-webhook.use-case.ts:25-35`, `:128`).
  - D9 (`spec.md:147-170`): "a contratante vê **toda** a conversa dela, por qualquer canal". Código: a listagem do portal
    não filtra canal (`drizzle-contractor-portal-conversation.repository.ts:287-310`); o portal (`frontend-client`)
    mapeia sem o canal (`portalParticipantApi.service.ts:54-64`).
  - RF14 (`spec.md:321-327`): e-mail `queued → sent → delivered`/`bounced`/`failed`; portal `delivered → read`.
  - T407 [x] diálogo "Enviar à contratante" com prévia (`tasks.md:91`): `SendToContractorDialog.component.tsx`.
  - T654 [x] canal portal + aviso sem corpo (`tasks.md:144`): `contractor-portal-message.use-case.ts:5-6,157-172`;
    portal nasce `delivered` (`drizzle-contractor-portal-message.repository.ts:139-150`).
- **ADR-0073** §Consequências (`:75-77`): aviso de mensagem nova no portal **sem o corpo**. `markRead` do portal só leva
  canal `portal` a `read` (`drizzle-contractor-portal-conversation.repository.ts:312-349`).
- **263 T5.2-C** (`b7d214a1c`; `evidence.md:547-575`): thread do SDK com composer só-portal. Código:
  `OccurrenceConversations.component.tsx:258` `canWrite = canSend && hasDocument && contractorId !== null`, `:259`
  `canWritePortal = canWrite && portalAvailable`, `:344` `status={canWritePortal ? 'open' : 'closed'}`, `:237`
  `thread.closed.noPortal` (texto em `locales/occurrenceConversation.locale.json:328`); botão "Enviar por e-mail"
  `:332-341`, diálogo `:355-364`, falha reabre o diálogo `:300-309`. Adaptador `occurrenceThreadApi.service.ts:170`
  `channel = participant === 'driver' ? 'app' : 'portal'`, `:186-192` sempre `sendContractorPortalMessage`, chave
  `portal-message:` (`occurrenceConversation.service.ts:169-171`), `:202` otimista `delivered`, anexos `:178-184`.
  `THREAD_CHANNELS.contractor = ['email','portal']` em `OccurrenceThread.component.tsx:14-17`.
- **248**: reenvio do pedido isento de modelo; encaminhamento a terceiro sem `In-Reply-To`. Não muda.
- **267**: cópia efetiva, teto 50, operador só remove. Código: `resolveMailCopy` (`send-occurrence-mail.use-case.ts:430`).
- **268**: sandbox global (`CONTRACTOR_MAIL_SANDBOX_SMTP` + `EMAIL_FROM`, `config/environment.schema.ts:294-301,382-397`;
  worker `:75,195-206`), só quando o Resend da empresa não está pronto; `markMessageSent` vale e fica em `sent`
  (`docs/ai-context/worker-transportada.md:864-870`).
- **269/271** (ADR-0106 §3, ADR-0108): sem modelo, sem e-mail; 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`
  (`occurrence-conversation.error.ts:36-44`; `send-occurrence-mail.use-case.ts:225-244`); automático pula
  (`send-automatic-occurrence-mail.use-case.ts:71,129`). Destinatários pré-marcados
  (`occurrence-contractor-recipients.policy.ts:22-38`).
- **272** (ADR-0110): área `<!-- mensagem -->` (`occurrence-contractor-mail.constant.ts:92-95`); compor
  `occurrence-mail-html-compose.policy.ts:95`; prefixo `occurrence-mail-subject.policy.ts:25`; "De"
  `occurrence-mail-sender-name.policy.ts:25` (worker `contractor-mail/domain/sender-display-name.policy.ts:17`);
  assinante `occurrence-mail-signer.policy.ts:11,35,55`; HTML do sistema `occurrence-mail-system-html.policy.ts:33,55,93,109`
  (cores `occurrence-mail-html.constant.ts:9-33`); `htmlToPlainText` `occurrence-mail-plain-text.policy.ts:44`; escape
  `contractor-mail/domain/mail-template-render.policy.ts:85`; logo inline no worker
  (`send-contractor-mail-outbound-message.use-case.ts:270-300`).

### Rota, envio e status hoje

- `POST /trip-occurrences/:id/conversations/:participant/messages` (`occurrence-conversation.routes.ts:197-286`,
  `occurrences.resolve`, 30/300 s): `channel` decide (`:83,236`); e-mail `mailMessageSchema` `:86-95` (`contactIds`
  ≥1 ≤ teto, `subject`/`body` `.max`, vazio recusado por `assertMailContent`, `send-occurrence-mail.use-case.ts:105-116`);
  portal `:111-118`. `Idempotency-Key` exigida em **todos** os canais (`:235`).
- `send-occurrence-mail.use-case.ts`: impressão digital `:378-389`; chave reutilizada `:390-398`; prontidão
  `:401-406` (Resend `:195-218` ou sandbox `:187-193`); grava e-mail + outbox `:491-511`; mensagem da conversa
  `queued` `:512-520`. O worker envia (`send-contractor-mail-outbound-message.use-case.ts:165-190`, `idempotencyKey:
messageId`) e marca `sent` (`drizzle-contractor-mail-outbound-worker.repository.ts:179-205`).
- Linha do e-mail: só a última mensagem **de entrada** dá `In-Reply-To`/`References`
  (`drizzle-contractor-mail-outbound-worker.repository.ts:158-176`; uso `send-contractor-mail-outbound-message.use-case.ts:146-156`).
  Saída não grava `rfc_message_id` (coluna existe: `database/contractor-mail.schema.ts:514`). Uma linha por objeto
  (`contractor_mail_threads_company_subject_unique`, `:318`).
- Prévia `POST …/contractor/mail-preview` (`routes.ts:316-342`; `preview-occurrence-mail.use-case.ts:59-77,234-266`).
- Webhook: Svix por empresa (`webhook_id` em `contractor_mail_settings`), mensagem por `data.email_id` →
  `drizzle-occurrence-message-status.repository.ts:37-74` (`FOR UPDATE`, `applyMessageStatus`).
- Política de status: salto para degrau maior aceito; atrasado só preenche horário; falha terminal
  (`message-status.policy.ts:68-104` da API).
- Status: texto + CHECKs, não enum (`occurrence-conversation.schema.ts:70-78,258,260,346-355`).
- Anexos (`conversation-attachment.policy.ts:24-56`): áudio mp4/mpeg/ogg/webm aceito no e-mail; 10 MB/arquivo, 25 MB,
  5 por mensagem.
- SDK: `@adatechnology/conversations-ui` 0.10.0; `confirmsRead` por thread (`channelCapabilityFor`), padrão WHATSAPP
  confirma leitura; `OccurrenceThread` não passa `channel`.
- Resend: por empresa em `contractor_mail_settings` (`contractor-mail.schema.ts:61-72`); chamadas por `fetch`
  (`resend-account.gateway.ts` só `GET /domains`). Nenhum código de rastreio (`open_tracking` etc.: zero ocorrências).

### Pacote de notificação

- `~/Documents/personal/adatechnology-packages` (pnpm, changesets, publica no npm pelo CI ao entrar em `main`,
  `.github/workflows/publish.yml`; saiu do modo `rc`, commit `7a82896`). `notification-contracts` local 0.1.0,
  `notification-module` 0.1.2. A TMS fixa `0.1.0-rc.2`/`0.1.0-rc.3` (API `package.json:45-46`, worker `:33-34`).
- Não existe layout padrão no pacote; `renderTemplate` escapa o corpo inteiro (`templateRender.ts:103-121`);
  `escapeTemplateHtml` `:30` é igual ao `escapeMailHtml` da API. `notification-contracts` só depende de `zod` e é
  importado pelo front.
- Regra `~/.claude/rules/rules/email-templates.md`: proíbe layout em código **no produto** "para e-mail que o módulo
  pode carregar"; não trata envio sem modelo. A ADR-0111 registra a exceção.

### Resend (context7, `/websites/resend`)

- Rastreio é do domínio: `PATCH /domains/:id` `open_tracking`/`click_tracking`/`tracking_subdomain`; desligado por padrão;
  só ativo com subdomínio de rastreio verificado (CNAME); o subdomínio não pode ser removido depois.
- Pixel 1×1 só na parte HTML. Aberturas imprecisas (bloqueio de imagem, pré-abertura por privacidade/antivírus,
  Gmail cortado acima de 102 KB). O Resend sugere rastrear só broadcasts.
- `email.opened` traz `data.email_id` e `data.message_id`. Linha: `In-Reply-To` + `References` com os `message_id`
  anteriores separados por espaço.

## Execução

_(vazio — preencher a partir da T0.1)_
