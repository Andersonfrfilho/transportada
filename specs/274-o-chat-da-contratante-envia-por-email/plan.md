# Plan — 274 O chat da contratante envia por e-mail

ADR: [**0111 — O chat da contratante envia por e-mail**](../../docs/adr/0111-o-chat-da-contratante-envia-por-email.md)
(proposta): composer por e-mail, corpo padrão no pacote, "lida" por pixel (revoga 183 D7), portal como vitrine.

Fatos que moldam o plano: [`evidence.md`](evidence.md) § Levantamento (arquivo:linha). Caminhos relativos a
`apps/<app>/src/` salvo indicação; pacotes em `~/Documents/personal/adatechnology-packages`.

## Decisões de desenho

- **D1 — Composer aberto, envio por e-mail.** `OccurrenceConversations` passa `status={canWrite ? 'open' : 'closed'}`
  (sai `canWritePortal`). O adaptador `occurrenceThreadApi.service.ts` envia a aba contratante por e-mail: canal
  `email`, status otimista `queued`, chave `email-message:<clientMessageId>`, upload dos anexos com `channel: 'email'`
  (os limites do e-mail valem no upload). `OccurrenceThread` continua **sem** a prop `channel` do SDK (o padrão do SDK
  confirma leitura, `confirmsRead`) — conferir na T0.1 que `read` aparece.
- **D2 — Uma mensagem, canal `email`; o portal é vitrine.** Nada de duas linhas. A listagem do portal não filtra canal
  (`drizzle-contractor-portal-conversation.repository.ts:287-310`): a mensagem já aparece lá. Com portal disponível, o
  caso de uso do chat dispara, depois do commit, o aviso sem corpo da ADR-0073 (`contractor-portal-message.use-case.ts:157-172`)
  para os usuários do portal cujo e-mail (normalizado, minúsculas) **não** está em `To`/`Cc`; nenhum restante → sem aviso.
  Recusado: gravar `email` + `portal` e agrupar na tela (duas escadas de status para o mesmo texto, agrupamento novo
  no SDK `conversations-ui`, dois registros a auditar).
- **D3 — Corpo padrão no pacote.** Em `notification-contracts` (puro, sem runtime além de `zod`, importável no front):
  `renderStandardEmail(input): { html, text, bytes, layoutVersion }` em `src/standardEmail.ts`. Entrada (todos texto;
  nenhum HTML):
  `identity: { displayName, logo: { kind: 'cid', contentId } | { kind: 'initials' } }`,
  `bodyText` (escapado, parágrafos por linha em branco, `<br>` na quebra simples),
  `attachments: readonly { name }[]` (lista "Anexos"),
  `signature: { name, role?: string }` (iniciais calculadas no pacote),
  `footer: { marks: readonly { label, imageUrl?: string }[], note?: string }` (URLs só `https:`/`http:`, senão só o rótulo),
  `replyHint?: string` (a faixa "Responda este e-mail", só quando o produto tem `Reply-To`),
  `labels?` (pt-BR por padrão: "Anexos"). Cores e fonte fixas da plataforma (as de `occurrence-mail-html.constant.ts:9-33`
  da 272 migram para o pacote), tabelas e estilos inline, 620 px. `layoutVersion` = `'standard-v1'`.
  Exportados também os fragmentos `renderStandardEmailLogo` e `renderStandardEmailFooterMarks`. `notification-module`
  re-exporta tudo. `htmlToPlainText` vai para o pacote (D4). Testes no pacote (`bun test`): tabela de casos de escape,
  estrutura (sem `<script`, `on*=`, `flex`, `grid`, `var(`), tamanho, URL não http(s) cai no rótulo, `text` sem tags.
  Sem golden file de layout.
- **D4 — O que migra e o que fica (sem duplicar regra).**
  - Migra: `htmlToPlainText` (`occurrence-mail-plain-text.policy.ts:44`) → pacote; o arquivo da API vira re-export e a
    tabela de casos da API continua passando (prova de paridade). O desenho do logo/iniciais e das marcas
    (`buildLogo` :55 e `buildFooterMarks` :93 de `occurrence-mail-system-html.policy.ts`) → fragmentos do pacote; os
    construtores da 272 passam a chamá-los com as entradas do produto (`cid` `company-logo`, `APP_BASE_URL`).
  - `escapeMailHtml` (`mail-template-render.policy.ts:85`) é idêntico ao `escapeTemplateHtml` do pacote: vira re-export.
  - Fica no produto: `applySubjectPrefix`, `buildSenderDisplayName` (e a cópia do worker), `buildSignerValues`/
    `resolveSignerJobTitle`, a segurança de HTML de modelo, o renderer de modelo, a tabela de itens e a faixa de
    resposta da 272 (a faixa do chat usa o slot `replyHint`).
- **D5 — Rota: variante "chat" do POST de mensagens.** `POST /trip-occurrences/:id/conversations/contractor/messages`
  com `{ channel: 'email', mode: 'chat', body, attachmentIds }` `.strict()` (a variante do diálogo continua sem `mode`).
  `body` 1..8000 depois do `trim`. O servidor resolve tudo o resto. Caso de uso novo
  `occurrence-conversation/application/send-occurrence-chat-mail.use-case.ts`, que reutiliza as peças do
  `send-occurrence-mail.use-case.ts` (prontidão `resolveMailSendReadiness` :401-406, entrega Resend/sandbox :187-218,
  `resolveMailCopy` :430, `recordMail` :491-511, `recordConversationMessage` :512-520, idempotência :378-398/:564-569),
  extraídas para `occurrence-mail-delivery.service.ts` **sem mudar comportamento** (teste de caracterização do diálogo
  antes). Destinatários: `resolveOccurrenceRecipients` (`occurrence-contractor-recipients.policy.ts:22-38`) e só os
  pré-marcados. Assinante: o operador (`buildSignerValues`, 272). "De": `buildSenderDisplayName`. `has_inline_logo`
  quando há logo (o worker já anexa o `cid:` — `send-contractor-mail-outbound-message.use-case.ts:270-300`).
  Mensagem de e-mail com `notification_template_key = null` e `standard_body_version = 'standard-v1'`.
- **D6 — Assunto.** O assunto do último e-mail de saída da linha da ocorrência (`contractor_mail_messages` da
  `contractor_mail_threads` da ocorrência), sem acrescentar "Re:". Sem e-mail anterior: `applySubjectPrefix` sobre
  `Ocorrência <nome do tipo> — NF <número>` (parada sem nota não chega aqui: o composer exige nota). Idempotente.
- **D7 — Linha do e-mail.** Hoje o worker só põe `In-Reply-To`/`References` com a última mensagem **de entrada**
  (`drizzle-contractor-mail-outbound-worker.repository.ts:158-176`) e não guarda o `Message-ID` de saída. Novo: o
  webhook grava `data.message_id` dos eventos `email.sent`/`email.delivered` em `contractor_mail_messages.rfc_message_id`
  da mensagem de saída (se vazio); o worker monta `References` com os `rfc_message_id` da linha (entrada e saída, ordem
  de criação, últimos 20) e `In-Reply-To` com o último. Mensagem anterior sem `Message-ID` ainda (webhook não chegou)
  fica de fora; o assunto igual mantém a linha no Gmail. T0.1 confere se o Resend aceita `Message-ID` próprio; se
  aceitar, a T0.2 decide se o worker gera o próprio (`<id>@<domínio do remetente>`) em vez de esperar o webhook.
  Vale para todo e-mail de saída da ocorrência (o diálogo também ganha a linha). Sandbox: sem cabeçalhos (como hoje).
- **D8 — Lida pelo pixel.** Escada do e-mail `['queued','sent','delivered','read']` nas três cópias: API
  `occurrence-conversation/domain/message-status.policy.ts:37-50`, worker `…/message-status.policy.ts:38-51`, painel
  `messageStatus.service.ts:20-25`; `failableUntil` continua `sent` (devolução depois de entregue é ignorada, como hoje;
  falha é terminal: `opened` depois de `bounced` → `stale`). `process-inbound-email-webhook.use-case.ts:25-35` ganha
  `email.opened → read`; `email.clicked` continua ignorado. Repetição de `opened` → `duplicate`.
- **D9 — Lida pelo portal.** `markRead` (`drizzle-contractor-portal-conversation.repository.ts:312-349`) passa a
  levar as mensagens de saída de canal `portal` **e** `email` (status não nulo, não falha) a `read`, cada uma pela
  própria regra de canal.
- **D10 — Erros do chat.** 409 `OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS` (nenhum pré-marcado); prontidão de hoje
  (`CONTRACTOR_MAIL_NOT_CONFIGURED`/`CONTRACTOR_MAIL_SENDING_NOT_VERIFIED` — T0.1 confere qual a rota devolve); 400
  corpo vazio/longo e anexos fora da regra; 409 chave reutilizada; 404 outra empresa. **Nunca** 409 de modelo. No
  painel: o composer marca a mensagem como falha (`failed`) e mostra o motivo; no sem-destinatário, ação "Enviar por
  e-mail" (abre o diálogo com o texto).
- **D11 — Idempotência.** Chave `email-message:<clientMessageId>`; impressão digital = `companyId`, `occurrenceId`,
  `mode: 'chat'`, `body` com `trim`, `attachmentIds` ordenados; operação própria `SEND_OCCURRENCE_CHAT_MAIL_OPERATION`.
  Destinatários resolvidos no servidor não entram (o replay devolve a resposta gravada).
- **D12 — Migration mínima (aditiva).** `ALTER TABLE occurrence_conversation_messages DROP CONSTRAINT
occurrence_conversation_messages_email_never_read_check`; `contractor_mail_messages.standard_body_version
varchar(32) null`. Rollback com guarda: aborta se houver mensagem `email` em `read` (não reescreve dado); senão recria
  a CHECK e derruba a coluna.
- **D13 — Versão do pacote.** API e worker estão em `notification-contracts` `0.1.0-rc.2` e `notification-module`
  `0.1.0-rc.3`, e o repositório de pacotes já saiu do modo `rc`. A T1.3 lista o diff entre as versões fixadas e a nova
  (`npm view`, changelog/commits) e a sobe nas **duas** apps juntas (lock coerente). Front não muda de versão nesta spec.

## Arquivos por app

- **Pacotes** (`adatechnology-packages`): `packages/backend/notification-contracts/src/standardEmail.ts` (+
  `htmlToPlainText.ts`, testes `*.test.ts`), `src/index.ts` (exports), `packages/backend/notification-module/src/index.ts`
  (re-export), `CLAUDE.md` dos dois pacotes (o que é o corpo padrão), changeset `minor`.
- **API:** `occurrence-conversation/presentation/occurrence-conversation.routes.ts` (variante `mode: 'chat'`),
  `application/send-occurrence-chat-mail.use-case.ts` (novo), `application/occurrence-mail-delivery.service.ts`
  (extraído), `domain/occurrence-chat-mail-subject.policy.ts` (D6), `domain/occurrence-conversation.error.ts`
  (`OccurrenceChatMailNoRecipientsError`), `domain/message-status.policy.ts` (D8),
  `domain/occurrence-mail-plain-text.policy.ts` e `domain/occurrence-mail-system-html.policy.ts` (D4),
  `contractor-mail/domain/mail-template-render.policy.ts` (re-export do escape),
  `contractor-mail/application/process-inbound-email-webhook.use-case.ts` (D7, D8),
  `occurrence-conversation/infrastructure/drizzle-occurrence-message-status.repository.ts` (gravar `rfc_message_id`),
  `infrastructure/drizzle-contractor-portal-conversation.repository.ts` (D9), aviso do portal (D2),
  `database/occurrence-conversation.schema.ts`, `database/contractor-mail.schema.ts`, migration nova, `main.ts` (fiação),
  OpenAPI da rota, `package.json` (versões + testes novos).
- **Worker:** `occurrence-conversation/domain/message-status.policy.ts` (D8),
  `contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.ts` (cadeia de referências D7),
  `contractor-mail/application/send-contractor-mail-outbound-message.use-case.ts` (cabeçalhos), `package.json`.
- **Painel:** `modules/occurrence-conversation/components/OccurrenceConversations.component.tsx` (D1),
  `shared/occurrenceThreadApi.service.ts` (D1, D10), `shared/occurrenceConversation.service.ts`
  (`createEmailMessageIdempotencyKey`, `sendContractorChatMail`), `shared/messageStatus.service.ts` (D8),
  `locales/occurrenceConversation.locale.json` (dica do "Lida", erros), testes.
- **Portal (`frontend-client`):** nada (a listagem já mostra o canal e o SDK mostra a mensagem).

## Contratos

- `POST …/conversations/contractor/messages` `{ channel: 'email', mode: 'chat', body, attachmentIds? }`, cabeçalho
  `Idempotency-Key` → 201 `{ message }` (mesma forma da mensagem de hoje, `channel: 'email'`, `status: 'queued'`).
  Erros: D10. Permissão `occurrences.resolve`; limite 30/300 s (o de hoje).
- Webhook: `email.opened` → `read`; `email.sent`/`email.delivered` também gravam `rfc_message_id` (se vazio).
- Listagem da conversa e do portal: forma inalterada; `status: 'read'` passa a aparecer em mensagens `email`.
- Pacote: `renderStandardEmail`, `renderStandardEmailLogo`, `renderStandardEmailFooterMarks`, `htmlToPlainText`,
  `STANDARD_EMAIL_LAYOUT_VERSION`, tipos `StandardEmailInput`/`StandardEmailRendered`.

## Dados, migration e rollback

D12. Sem backfill. Mensagens antigas de e-mail passam a poder subir para `read` (pixel futuro ou leitura no portal).
`make migration-test` (aplica, reverte, reaplica) e `db:generate` → `no_changes`.

## Segurança e tenant

- Slots do pacote só texto, escapados; URLs do rodapé só http(s); nenhum HTML do operador.
- Webhook: assinatura Svix por empresa de hoje; `email_id` resolvido dentro da empresa do `webhookId`.
- `markRead` do portal continua restrito à conversa da contratante do usuário do portal.
- Contrato BOLA na variante chat (outra empresa → 404) e de permissão (403).

## Idempotência e concorrência

D11. Status pela política monotônica com `FOR UPDATE` (já existe). `rfc_message_id` gravado só se nulo
(`… where rfc_message_id is null`), eventos repetidos não reescrevem.

## Observabilidade

Log estruturado sem PII: `occurrence_chat_mail_sent` (`messageId`, `attachments`, `recipients` contagem, `cc` contagem,
`transport`), `occurrence_chat_mail_no_recipients` (`occurrenceId`), `contractor_mail_status_applied` com
`incoming: 'read'` e `source: 'pixel'|'portal'`.

## Estratégia de testes (antes da implementação)

- Pacote: casos de escape e estrutura (D3), paridade do `htmlToPlainText` com a tabela da 272.
- API contrato: política de status (tabela: escada do e-mail com `read`, salto, falha terminal, duplicado); assunto do
  chat (D6); schema da rota (variante chat `.strict()`, 1..8000); caso de uso com dublês (sem modelo → envia; sem
  pré-marcado → 409; idempotência; aviso do portal só a quem não está em `To`/`Cc`); webhook `opened`.
- API integração (`test/integration/occurrence-chat-mail.integration.ts`, na lista do `package.json`, `--env-file`,
  zero skip): grava mensagem + e-mail + outbox numa transação; CHECK removida aceita `read`; `markRead` do portal leva
  `email` a `read`; BOLA 404.
- Worker: paridade da política de status; cadeia de `References` (entrada + saída, 20).
- Painel: composer aberto sem portal; envio chama a variante chat com a chave `email-message:`; otimista `queued`;
  erro sem destinatário mostra a ação "Enviar por e-mail"; selo "Lida" no e-mail com a dica.
- Verificação em staging: Mailpit (sandbox) e, com o rastreio ligado numa conta Resend de teste, o selo "Lida".

## Publicação

1. **Pacote:** PR no repositório de pacotes → `main` (o CI publica no npm) **com aprovação humana**; conferir
   `npm view @adatechnology/notification-contracts dist-tags`.
2. **Painel tolerante:** escada do e-mail com `read` e textos de erro novos (sem abrir o composer) → `staging` → `main`
   com aprovação.
3. **API + worker + migration** no mesmo PR e no mesmo run (o worker velho não conhece `read` no e-mail: `stale`
   inofensivo; mas a cadeia de referências e a política precisam sair juntas).
4. **Telas:** composer aberto, dica do selo → `staging`; verificação no Mailpit.
5. **Ligar a confirmação de leitura** (abaixo), primeiro numa conta de teste/staging, depois a da transportadora em
   produção — cada uma com aprovação humana.
6. Produção na mesma ordem, depois da 272 em `main`.

### Ligar a confirmação de leitura (roteiro, executado por quem administra o Resend e o DNS da transportadora)

1. Resend → Domains → domínio do remetente (`contractor_mail_settings.sender_address`) → Configuration: **Open
   tracking** ligado, **Click tracking** desligado, subdomínio de rastreio (ex. `links`; evitar nomes como `tracking`).
   Pela API: `PATCH https://api.resend.com/domains/:id` `{ "open_tracking": true, "click_tracking": false,
"tracking_subdomain": "links" }` com chave de acesso total (a chave gravada na aplicação pode ser só de envio).
2. DNS: criar o CNAME que o Resend mostrar (`links.<domínio>` → `links1.resend-dns.com` ou o valor indicado) e esperar
   a verificação. O subdomínio não pode ser removido depois, só trocado.
3. Resend → Webhooks → o webhook que aponta para `…/public/inbound-emails/<webhookId>`: acrescentar o evento
   `email.opened`.
4. Teste: mandar uma mensagem do chat a uma caixa própria, abrir com imagens liberadas, conferir "Lida".
5. Desligar = desmarcar Open tracking (o selo volta a parar em "Entregue" nas próximas mensagens).

## Riscos

- **Entregabilidade** (pixel em e-mail transacional; o rastreio vale para todo e-mail do domínio). Aceito pelo dono;
  medir devoluções antes/depois em produção (contagem).
- **"Lida" falsa ou ausente** (Apple MPP, bloqueio de imagem). Aceito; dica no selo.
- **Volume:** cada mensagem do chat é um e-mail. Limite da rota segura rajadas.
- **Salto de versão do pacote** (`rc` → estável) pode trazer mudança não relacionada: T1.3 lista o diff antes.
- **Regra global `email-templates.md`** não prevê o corpo padrão: ADR-0111 registra a exceção; o dono atualiza a regra.
- **Linha do e-mail** depende do webhook para o `Message-ID` de saída: mensagens em rajada podem sair sem a anterior
  em `References`; o assunto igual mitiga.
