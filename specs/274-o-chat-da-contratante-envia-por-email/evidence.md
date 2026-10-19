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
5. **Ajustado em 2026-10-19 (dono) — modelo padrão configurável no SDK (substitui o "corpo padrão" em layout fixo,
   plan D3/D4).** O envio sem modelo usa um **modelo padrão** (`notification.standard-email`, `email`, `pt-BR`) do
   módulo de notificação, editável na tela de Notificações; conteúdo padrão, resolução e renderização ficam no SDK e a
   API só monta os valores e chama. Precisão no mesmo dia: "o modelo da identidade, footer e o assinante devem ficar no
   modelo padrão de envio do sistema, cadastrado a partir do SDK" — identidade, rodapé e assinante são marcação do
   modelo, e o SDK **cadastra** a linha (`standardEmail.ensureTemplate`, idempotente, nunca sobrescreve; chamado pela API
   no pré-deploy para toda empresa); o conteúdo embutido só como rede de segurança.
6. **Ajustado em 2026-10-19 (dono), pelo fato da T0.1 (itens 4-5) — D7.** A linha do e-mail usa o `message_id` que o
   Resend devolve no `email.sent` (gravado em `rfc_message_id` pelo webhook), não um `Message-ID` escolhido por nós; o
   envio de teste de `Message-ID` próprio vira condição opcional (follow-up), não base do desenho.

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
- **A11** ~~O corpo padrão fica em `notification-contracts` e o `notification-module` re-exporta.~~ _Ajustado em
  2026-10-19 (dono):_ o renderizador puro e o conteúdo padrão ficam em `notification-contracts` (a prévia da
  `notification-ui` usa o mesmo código); cadastro, resolução e `render` com banco ficam no `notification-module`; a API
  chama o módulo.
- **A12** _(2026-10-19)_ Mecanismo de cadastro: semente idempotente do SDK no pré-deploy (não boot, não migration do
  pacote, não script manual) — plan D3. Padrão novo do SDK não reescreve linha cadastrada; chega pelo "Restaurar
  padrão".

## Perguntas ao dono (não bloqueiam)

- **Q1** Atualizar a regra global `email-templates.md` (repositório `ia`) com a exceção do envio sem modelo?
- **Q2** Quem liga o rastreio no Resend e cria o CNAME no DNS da transportadora (staging e produção)? Staging tem conta
  Resend real para testar o "Lida", ou só o Mailpit?
- **Q3** Subir `notification-*` de `0.1.0-rc.*` para a versão estável nova traz o que mais saiu no pacote desde então
  (T1.6 lista); aceitar no mesmo PR ou separar?
- **Q4** _(2026-10-19)_ Atualizar sozinha a linha do modelo padrão que a empresa nunca editou quando o SDK trouxer
  padrão novo (exige marcar a origem da versão)? Hoje: não; follow-up.

## Levantamento (`origin/staging` 2483d6e6f, 2026-10-19)

Caminhos relativos a `apps/<app>/src/` salvo indicação. Conferido na T0.1 (§ abaixo).

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

- `~/Documents/personal/adatechnology-packages` (pnpm, changesets; pacotes em `packages/backend/notification-contracts` e `packages/backend/notification-module`, publica no npm pelo CI ao entrar em `main`,
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

## T0.1 — Levantamento conferido (2026-10-19)

`origin/staging` seguia em 2483d6e6f (sem novidade; sem rebase). Tudo abaixo lido no código real; nada medido em staging.

### Corrigido no § Levantamento

- Pacotes ficam em `packages/backend/notification-contracts` e `…/notification-module` (a linha dizia só "pacote").
- Chave Resend: o código **exige `full_access`** (`api-transportada/src/contractor-mail/infrastructure/resend-account.gateway.ts:19`; spec 143 `plan.md:58`), logo **não é só de envio** — a mesma chave pode `PATCH /domains/:id`. Isso é fato novo para o Q2 (quem liga o rastreio: a API pode ligar, não só o painel Resend).
- O webhook de e-mail **não lê `data.message_id`** hoje (zero ocorrências em `process-inbound-email-webhook.use-case.ts`); só `data.email_id`.
- Status do e-mail: o comentário `:25-35` e o mapa `OCCURRENCE_MAIL_STATUS_BY_EVENT_TYPE` (`:12-18`) batem com o levantamento.

### Respostas da T0.1

1. **Erro de prontidão sem Resend e sem sandbox:** `send-occurrence-mail.use-case.ts:401-406` chama `resolveMailSendReadiness` e, se não pronto e sem sandbox, `createMailSendReadinessError` (`contractor-mail/domain/contractor-mail.error.ts:114-118`): `409 CONTRACTOR_MAIL_NOT_CONFIGURED` (sem configuração; `:81`) ou `409 CONTRACTOR_MAIL_SENDING_NOT_VERIFIED` (remetente não verificado; `:95`). `template_missing` não ocorre ali (a prontidão é chamada só com `settings`).
2. **`read` no tema sem a prop `channel`:** sim. `conversations-ui` 0.10.0 usa `channelCapabilityFor(props.channel ?? "app")` (`dist/participant/index.js:2750`, `:3305`) e `OccurrenceThread.component.tsx:66` passa só `channels` (plural). Em `conversation-contracts` 0.6.0 (`dist/index.js:51-137`) `email` tem `confirmsRead: false`, `app` `true`. Sem `channel`, a bolha cai no padrão `app` e mostra `read`; **se alguém passar `channel="email"` o SDK rebaixa `read` para `delivered`** (`participant/index.js:2659`). O contrato da T2.1 deve fixar isso.
3. **`contractor_mail_threads` por ocorrência:** uma linha por objeto (`subject_type`, `subject_id`; unique `contractor_mail_threads_company_subject_unique`, `database/contractor-mail.schema.ts:288-321`). O **assunto** mora em `contractor_mail_messages.subject` (`:482`, `text not null`, por mensagem; o worker o lê em `drizzle-contractor-mail-outbound-worker.repository.ts:127`). O último assunto de saída = a mensagem `direction='outbound'` mais recente da thread da ocorrência; a thread não guarda assunto. `rfc_message_id` (`:514`), `provider_email_id` (`:513`) e `in_reply_to` existem na mensagem.
4. **`data.message_id` em `email.sent`/`email.delivered`:** `email.sent` traz `message_id` ("RFC Message-ID header value for the email"; https://resend.com/docs/webhooks/emails/sent); o payload de `email.opened` idem. Dado o contrato comum dos eventos, `delivered` o traz igual, mas só `sent` e `opened` foram vistos escritos na doc. O código atual **não lê** o campo (ver acima): a D7 precisa ler de `email.sent`.
5. **Resend preserva um `Message-ID` customizado?** **Não documentado; não verificado.** Fonte: https://resend.com/docs/dashboard/emails/custom-headers só exemplifica `X-Entity-Ref-ID` e `List-Unsubscribe` e diz que o Resend já inclui "todos os cabeçalhos necessários"; os exemplos de thread (https://resend.com/docs/dashboard/receiving/reply-to-emails) usam `In-Reply-To`/`References` com o `message_id` **que o Resend devolve** no webhook, nunca um id escolhido por nós. O gateway do worker repassa `headers` cru (`resend-mail.gateway.ts:135`, schema `:47`), então enviar `Message-ID` próprio é tecnicamente possível, mas o provedor pode sobrescrevê-lo. Sem conta de teste, **não foi feito envio de teste**. Conclusão: a D7 deve usar o `message_id` devolvido por `email.sent` (gravar em `rfc_message_id`), não um id gerado por nós; um envio de teste fica como condição da T3.4. Hoje o worker só monta `In-Reply-To`/`References` da última mensagem **de entrada** (`send-contractor-mail-outbound-message.use-case.ts:146-156`).
6. **Open tracking do Resend** (https://resend.com/docs/dashboard/domains/tracking): **por domínio**, não por envio; desligado por padrão; liga no painel (aba Configuration) ou `PATCH /domains/:id {"open_tracking": true, "click_tracking": false, "tracking_subdomain": "links"}` (também no `POST /domains`); exige o subdomínio de rastreio verificado por CNAME. Webhook `email.opened`: `{ type, created_at, data: { broadcast_id?, created_at, email_id, message_id, from, to[], subject, template_id?, tags? } }` (https://resend.com/docs/webhooks/emails/opened). Casa por `data.email_id` como os outros eventos. A doc avisa que a taxa de abertura não é exata e recomenda rastrear só broadcasts (já aceito pelo dono, decisão 2).
7. **Repositório de pacotes:** pnpm + turbo; `.changeset/config.json` (`access: public`, `baseBranch: main`); `publish.yml` dispara em `workflow_run` do CI na `main` (e `workflow_dispatch`), ambiente `production`, só se o CI passou. Versão atual publicada: `notification-contracts` **0.1.0** (`latest`; `rc` = 0.1.0-rc.6), `notification-module` **0.1.2** (`latest`; `rc` = 0.1.0-rc.12). A TMS fixa `0.1.0-rc.2` / `0.1.0-rc.3` (API `package.json:45-46`, worker `:33-34`). `rc.2` do contracts saiu em 2026-08-06; `rc.3` do module em 2026-08-13.
8. **Diff desde a versão usada** (só `git log` dos dois pacotes após essas datas, sem os "version packages"):
   - contracts: `446f73d` anexo de e-mail por referência, como variável declarada; `9aef637` aceita http em loopback no anexo; `7a82896` sai do modo `rc` (0.1.0).
   - module: `99a5327` compatibilidade com drizzle 1.x; `3b40d4e` migrations que host nenhum conseguia aplicar; `635eae5` painel de templates com variáveis, preview duplo e roteamento por empresa; `c69c36d` despacho passa o anexo ao driver de e-mail; `be211f3` a delivery registra o que foi anexado; `5a24d98` migrations convergentes (0.1.1/0.1.2).
   - Nota: as duas migrations do module mudam o que o host aplica; a T3.1 deve rodar `db:test` da API e o `notification-migration` além dos gates.
9. **Portal lista mensagens de todos os canais (D2):** sim. `drizzle-contractor-portal-conversation.repository.ts:287-310` (`listMessages`) filtra só por `companyId` + `conversationId`, seleciona `channel` e `bodyText`; `contractor-portal-conversation.use-case.ts:107-118` devolve `body` e `channel`, com `mine` só para `channel === 'portal'` do próprio usuário e `side` por direção (e-mail de saída = `carrier`, `mine: false`). O `frontend-client` descarta o canal (`modules/occurrences/shared/portalParticipantApi.service.ts:54-64`) e declara `channels: ['portal']` (`:32`): a mensagem de e-mail aparece como bolha da transportadora, sem selo de canal e sem ticks (`mine: false`). Para a vitrine da D2 basta o `body` da mensagem `email` ser o texto do chat, sem tag HTML.

### Fato que derruba ou tensiona decisão

- Nenhum derruba D1–D13. **Tensiona a D7** (linha do e-mail): depende de o `Message-ID` ser o devolvido pelo Resend, não um escolhido por nós (item 5). **Q2** ganha o fato do `full_access` (item da correção). **Q3/T3.1:** 6 mudanças do module incluem migrations (item 8).

### T0.2 — ADR-0111 validada com o `architect` (2026-10-19)

**Veredito: APROVADO COM AJUSTES.** ADR-0111 → `**Status:** aceita`. Os trechos alterados levam "Ajustado na T0.2" na
ADR, no `plan.md` e no `tasks.md`. Nenhum código tocado.

Ajustes obrigatórios (12):

1. Placeholder em atributo é HTML inseguro: `marcaProdutoUrl`/`marcaPlataformaUrl` saem; entra `marcasRodape` (HTML do
   sistema, só `http(s)`), obrigatória; nenhuma variável em atributo/`style`; `buildFooterMarks` delega a
   `renderEmailMarksHtml` (plan D3/D4, ADR §3).
2. O worker antigo rebaixa `read` para `sent` (`message-status.policy.ts:89-100`): T4.1 vai para a Fase 2 "painel e worker
   tolerantes"; plan § Publicação passo 2 inclui o worker; sai a frase do "worker velho" do passo 3.
3. Semente: passo novo `seedStandardEmailTemplates` (`PreDeploySteps`/`PreDeployReport`, campo `standardEmailTemplates`),
   todas as empresas, em série, depois de `provision`; sem gancho no provisionamento (plan D3, T3.9, ADR §3).
4. Contrato: 202 `{ data: { conversationId, conversationMessageId, mailMessageId, recipientCount, threadId } }`; o `parse`
   desvia por `raw.mode === 'chat'` antes do `mailMessageSchema` (plan § Contratos, D5).
5. Concorrência: 23505 no `ensureTemplate` = já existe; teste com duas chamadas concorrentes (D3, T3.9, testes).
6. D7: `UPDATE ... SET rfc_message_id = normalize(data.message_id) WHERE company_id AND provider_email_id AND
rfc_message_id IS NULL` em qualquer evento com `message_id`; schema do corpo ganha `message_id` opcional; normalizar
   com `<…>` na gravação e na montagem.
7. 248: o assunto vem do último e-mail de saída que **não** é encaminhamento (D6); a cadeia exclui encaminhamentos, que
   seguem sem `In-Reply-To`/`References` (D7).
8. HTML inseguro: três cópias (API e painel delegam a `findUnsafeEmailHtml`, o painel ganha dependência direta de
   `notification-contracts`; a do worker fica). T1.4: `assessStandardEmailTemplate` e campo assunto escondido; T1.1 sem
   "a `notification-ui` passa a importá-la".
9. Restaurar padrão: `POST /notification-templates/:id/restore-default` no `managementRoutes`, portão `settings.manage`;
   400/409; `notification-client.restoreDefault`; D13/T2.1 sobem também `notification-client` (hoje `0.1.0-rc.3`).
10. D2/T3.7: a audiência traz o e-mail (minúsculas) de cada usuário do portal; portal indisponível no chat = sem aviso.
11. T3.3: a listagem de modelos escolhíveis filtra as chaves do sistema (`notification-template.query.ts:63-75`).
12. § Publicação item 1: sem caminho para staging antes do merge em `main` dos pacotes; `publish.yml` de branch proibido;
    `pnpm pack`/tarball local nas Fases 2–5, nunca commitado; `package.json` só fixa a versão depois da T1.6; tag `next`
    só com aprovação humana explícita.

Opcionais adotados: D9 registra o aceito (leitura no portal com e-mail `queued` → `read`; falha posterior do worker fica
`stale`); D5 renderiza depois de replay, prontidão e destinatários; `.html` embutido por `loader: { '.html': 'text' }` no
tsup e `with { type: 'text' }` no bun test (ou `.ts` gerado com teste de igualdade); T2.1 em `sonnet` e T1.6 lista o diff
da `notification-ui` e confere a tela no navegador antes da T2.2; Q3 resolvida (mesmo PR, task e commit isolados, T3.1);
T3.8 reordenada para depois da T3.9.

## Onde parou

T0.2 concluída (ADR-0111 aceita). **Próxima: T1.1** (`notification-contracts`, regras genéricas de e-mail HTML), no
repositório de pacotes, branch `work/spec-274-standard-email`.

## Execução

_(T0.1 e T0.2 acima; as demais tasks registram aqui.)_
