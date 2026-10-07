# Plano técnico

## Dependências

- **Spec 247** vai antes: torna `emails_contractor`, `email_subject` e `email_body` editáveis na aba
  Tipos, impede que o aviso interno zere o e-mail à contratante
  (`save-occurrence-type.use-case.ts:147`) e cria `{{numeroNotaSemSerie}}` e o valor formatado.
- **Pacote fiscal** (`adatechnology-packages`, `@adatechnology/fiscal-provider`): `NfeXmlParty`
  ganha `email?` lido de `<dest><email>`. Versão nova publicada antes da Fase 3.
- **Não depende** da 183 T002/T503 (modelos da Meta): decisão do usuário (Q4), sem modelo.
- 241 e 246 em `origin/staging` (conferido em 2026-10-06).

## Contexto e premissas (conferidas em `origin/staging` `221b58400`, 2026-10-06)

Specs lidas e conferidas contra o código: 062, 143, 144, 150, 156, 164, 182, 183, 189, 204, 208, 209,
211, 219, 241, 245, 246 e 247. A 189 (app própria do motorista) **não** levou a conversa da ocorrência
para `apps/frontend-driver` (nenhuma menção em `specs/189-*/`), por isso a D14.

| Spec      | Decisão que vale aqui                                                                          | Onde                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 143       | e-mail Resend nos dois sentidos; token por conversa; MIME bruto antes de interpretar           | `contractor-mail/domain/reply-token.policy.ts:31-52`; worker `record-contractor-mail-inbound-message.use-case.ts:83-137`                        |
| 150 / 219 | contratante da nota = emitente casado em `contractors`; destinatários de `contractor_contacts` | `drizzle-occurrence-mail.repository.ts:73-83`, `:272-298`, `:410-428`                                                                           |
| 183       | duas conversas; anexos; a conversa não decide (D4)                                             | `occurrence-conversation.schema.ts`; `conversation-attachment.policy.ts`; `test/occurrence-conversation/conversation-never-decides.contract.ts` |
| 144       | telefone verificado; registro de ocorrência pelo menu do WhatsApp                              | `user_whatsapp_phones`; `register-driver-flow-actions.ts:393-532`                                                                               |
| ADR-0048  | cliente de entrega sem contato                                                                 | `docs/adr/0048-o-cliente-de-entrega-existe-sem-virar-crm.md:38-42`                                                                              |
| 164 / 241 | `unset` não abre tratativa; prorrogação `items_mode = off`                                     | `occurrence-case.policy.ts:23`; `occurrence-type-catalog.constant.ts:52`                                                                        |

### Chat próprio — o que já suporta (API)

- `occurrence_conversations` (`occurrence-conversation.schema.ts:67-152`): uma por ocorrência e
  participante (`contractor` | `driver`, `:36`, unique `:97-102`), `driver_user_id`, `public_ref`
  (portal), `window_expiry_notice_sent_for` (`:91`). **Sem** `last_inbound_at`.
- `occurrence_conversation_messages` (`:154-287`): `channel` `email|whatsapp|app|portal` (`:44`),
  `direction`, `automatic`, autor por CHECK (`:251-256`), `status` só na outbound.
- `occurrence_conversation_attachments` (`:289-342`) → `stored_object_id`.
- Operador → motorista pelo `app` com anexos (`occurrence-conversation.routes.ts:94-100`, `:261-271`;
  `driver-conversation.use-case.ts:69-161`), documento até 25 MB no canal `app`
  (`conversation-attachment.policy.ts:43`), 5 por mensagem (`:50`), aviso no sino depois do commit
  (`:146-157`; `driver-conversation-notifier.gateway.ts:33-49`, só INBOX, sem corpo).
- Upload **copia** para chave nova (`conversation-attachment.service.ts:208-234`); encaminhamento
  **referencia** o mesmo objeto (`drizzle-contractor-portal-message.repository.ts:111-137`).
- Encaminhamento existente: só motorista → contratante (`contractor-portal-message.use-case.ts:142-153`).
- Rotas do motorista: `/me/trips/current/occurrences/:id/messages`, `/uploads`,
  `/me/trips/current/occurrence-conversations` (`me-occurrence-conversation.routes.ts:28-33`).
- Portal: a contratante escreve com anexo (`client-occurrence-conversation.routes.ts:107-175`,
  `deliveries.track`, limites postgres `:37-57`), gravado como `portal`/`inbound`
  (`drizzle-contractor-portal-conversation.repository.ts:244-262`). **Nenhum aviso ao operador**
  (`contractor-portal-conversation.use-case.ts:163-170`).

### Chat próprio — o que falta

- **App do motorista sem conversa.** Só o PWA antigo do painel tem a tela
  (`frontend-transportada/src/modules/driver-trip/pages/DriverOccurrenceConversations.page.tsx`,
  aberta por estado em `DriverTripWorkspace.page.tsx:66-70`, `:203-209`; anexo por `<a download>` com
  URL de 5 min, `ConversationAttachments.component.tsx:38`, `:57-58`; não lidas
  `countDriverUnread`). O motorista redirecionado ao app próprio (`main.tsx:451-490`) não a vê. A
  página de avisos do app (`frontend-driver/src/modules/notification/pages/DriverNotifications.page.tsx:35`)
  não abre conversa. O service worker não guarda API (`frontend-driver/src/sw.ts:11-18`).
- Contratante → motorista: nenhum caminho.

### WhatsApp — a janela de 24 h no código

- A última mensagem recebida é guardada **pelo pacote**, por número: `meta_whatsapp.sessions.last_inbound_at`
  (`meta-whatsapp-module` 0.8.0, `dist/migrations/20260725195853_freezing_switch/migration.sql:29`),
  atualizada por `touchInbound` (`dist/index.js:405-411`, chamado em `:986-988`). O produto **não lê**
  essa coluna.
- O pacote confere a janela no envio: `SendMessageUseCase.assertWithinWindow` (`dist/index.js:1029-1033`,
  24 h), usado por `sendText`/`sendMedia`. O produto **não usa** esse caso de uso para a conversa.
- O provider 0.4.0 tem `sendMedia` (mime fora de imagem/áudio/vídeo vira `document`,
  `meta-whatsapp-provider@0.4.0/dist/index.js:242-247`; tipos `index.d.ts:198-213`) e transforma
  131047/131026/131000 em `WhatsAppWindowExpiredError` (`:152-156`, `:186-198`). `uploadMedia` é
  privado, chamado por `sendMedia`.
- A política do produto `decideWhatsAppWindowExpiry` (`OC/domain/whatsapp-window-expiry.policy.ts:57`)
  **não é chamada** em lugar nenhum (T605 da 183 aberta).
- O gateway do produto só tem `sendText`/`sendTemplate` (`meta-whatsapp-sending.gateway.ts:35-51`).
- **Registro pelo WhatsApp existe** (`register-driver-flow-actions.ts:393-532`, tipos do momento
  `document`, `:597-599`; tipo com foto/assinatura/produtos obrigatórios responde "Registre pelo
  aplicativo", `driver-occurrence-refusal.service.ts:4-7`, `:27-61`). Ele **não** liga a ocorrência a
  uma conversa; só atualiza `last_inbound_at` do número — que é o que abre a janela.
- Gatilho de mensagem recebida: `createOccurrenceConversationWhatsAppHook`
  (`whatsapp-conversation-inbound.service.ts:63-129`), antes do despachante de comandos
  (`main.ts:1688-1695`), com limite por empresa e telefone (`:78-82`). Hoje não entrega pendências.

### E-mail do cliente da nota

- **Não existe no produto.** `NfeXmlParty` do pacote fiscal 0.3.2 tem `taxId`, `name`, `tradeName`,
  `stateRegistration` e `address`, **sem** `email`
  (`node_modules/.bun/@adatechnology+fiscal-provider@0.3.2/.../dist/types.d.ts:816-822`; o
  `recipient?: NfeXmlParty` está em `:876`). `nfe.schema.ts` não tem coluna de e-mail.
  `delivery_clients` não guarda contato (`delivery-client.schema.ts:47-91`; ADR-0048 §2). Só a
  contratante tem e-mail (`contractor_contacts`; `contractors.report_email`, `:115`).
- O XML original é preservado no bucket (constituição §5), então o `<dest><email>` está lá para
  notas antigas.

### E-mail de saída e limites

- Saída com anexo: a API liga anexos à mensagem `email` (`send-occurrence-mail.use-case.ts:241-263`),
  10 MB por arquivo e 25 MB por e-mail (`conversation-attachment.policy.ts:44`, `:56`); o worker lê o
  objeto, confere tamanho e `sha256` e manda em base64 ao Resend
  (`send-contractor-mail-outbound-message.use-case.ts:114-123`, `:157-180`).
- Destinatário livre: **não existe** (`contactIds` 1–50, `occurrence-conversation.routes.ts:76`, `:88`).
- Validação de endereço existente: `/[\r\n,<>]/u` no envio (`send-occurrence-mail.use-case.ts:44`,
  `:170`); `z.string().trim().max(254).email()` no cadastro de contato
  (`contractor-contacts.routes.ts:33`, `:63`, `:72`); CHECK 254 no banco
  (`contractor-mail.schema.ts:204`, `:210`).
- Máscara de e-mail: `maskEmailAddress` existe, privada (`identity/domain/company-user.policy.ts:177`).

### Notificação interna e permissão

- Canais do produto: INBOX e EMAIL (`notification-catalog.constant.ts:26-29`).
- Aviso interno da ocorrência vai a quem despachou a viagem (`occurrence-notifier.gateway.ts:32-83`),
  `dedupeKey` `${templateKey}:${tripId}:${documentId}:${occurrenceType}` (`:64`). O dedupe do módulo é
  **permanente** (índice único `(company_id, dedupe_key)`, `notification-module@0.1.0-rc.3`,
  migration `:101`): para repetir, a chave muda por alerta.
- `occurrences.resolve`: company-admin, finance, operator (`authorization.policy.ts:110`, `:157`,
  `:170`, `:231`); `fleet.read` não inclui finance. Rate limit postgres por `companyId:userId` e escopo
  (`rate-limiter.service.ts:18-26`; exemplo `occurrence-conversation.routes.ts:49-54`).

## Modelo de dados (🧠 — validar com `architect` antes)

**`company_occurrence_types`** (aditivo; colunas e CHECKs em `spec.md` § "Tudo é configuração do tipo").

**`company_occurrence_type_contractor_overrides`:** `contractor_reply_mode`,
`contractor_reply_wait_hours`, `forward_to_note_recipient` — nulos, sem default.

**`nfe_documents`:** `recipient_email text NULL`, CHECK `length <= 254 and ~ padrão de e-mail` (o mesmo
de `fleet.schema.ts:124-125`). Preenchido no import pelo worker; backfill sob autorização.

**`occurrence_contractor_replies`** (uma por ocorrência, padrão de tenant):

```sql
id, company_id, occurrence_id (FK composta), conversation_id (FK composta, conversa da contratante)
config jsonb NOT NULL            -- cópia validada da configuração efetiva (D8), com versão
status varchar(24) NOT NULL      -- awaiting_contractor | overdue | reply_received | awaiting_operator
                                 -- | needs_operator | delivered | handled | cancelled
reason varchar(40) NULL          -- no_accepted_attachment | multiple_attachments
deadline_at timestamptz NULL
alert_count smallint NOT NULL DEFAULT 0, last_alert_at timestamptz NULL
reply_message_id, reply_attachment_id (FKs compostas, nulas)
handled_by_user_id uuid NULL, handled_note text NULL   -- CHECK: status = 'handled' ⇔ ambos preenchidos
created_at, updated_at
UNIQUE (company_id, occurrence_id)
INDEX parcial (company_id, deadline_at) WHERE status IN ('awaiting_contractor','overdue')
```

`config` em `jsonb` em vez de dez colunas copiadas: é **instantâneo imutável**, lido inteiro por uma
política; validado por schema Zod na escrita e na leitura. Alternativa descartada: colunas espelhadas
(o rollback e cada campo novo do tipo pagariam em dobro).

**`occurrence_contractor_reply_deliveries`** (uma por alvo e tentativa):

```sql
id, company_id, reply_id (FK composta)
target varchar(32) NOT NULL      -- driver_app_chat | driver_whatsapp | note_recipient_email | informed_email
trigger varchar(16) NOT NULL     -- automatic | operator
status varchar(24) NOT NULL      -- queued | sent | pending_window | skipped | failed
reason varchar(40) NULL          -- driver_without_account | driver_unreachable | whatsapp_window_closed
                                 -- | note_without_recipient_email | attachment_too_large_for_email | send_failed
address text NULL                -- só nos alvos de e-mail; CHECK ≤ 254; nunca em log
attachment_id uuid NOT NULL      -- FK composta → occurrence_conversation_attachments
driver_message_id, mail_message_id uuid NULL
actor_user_id uuid NULL          -- CHECK: trigger = 'operator' ⇔ preenchido
idempotency_key varchar(120) NOT NULL, UNIQUE (company_id, idempotency_key)
created_at, sent_at
```

**`occurrence_contractor_reply_events`** (append-only): `reply_id`, `delivery_id` nulo, `from_status`,
`to_status`, `reason`, `actor_kind` (`system` | `user`), `actor_user_id` (nulo ⇔ `system`),
`created_at`. Nenhum `UPDATE`/`DELETE` no código (contrato de parede).

`rollback.sql`: derruba as três tabelas, as colunas novas do tipo, da exceção e `recipient_email`;
registra o que se perde (histórico dos retornos, e-mails de destinatário importados). Não toca nada
da 183/241/246/247.

## Fluxo

```text
registro (app ou WhatsApp) ─► commit ─► hook 183 ─► pedido na fila do worker
                                         └─ mesma transação do envio: retorno awaiting_contractor (config copiada)
varredor RF2 ─► reenvia pedido perdido (mesma idempotência)

resposta por e-mail ─► worker grava inbound + anexos ─► decideContractorReply (worker)
resposta pelo portal ─► API grava portal/inbound + anexos ─► decideContractorReply (API)
   ├─ 1 anexo aceito + forward_automatic ─► deliverContractorReplyToDriver (+ cliente da nota se automatic)
   ├─ forward_after_approval ─► awaiting_operator
   └─ 0 / N ─► needs_operator (um alerta)

cron occurrence.contractor-reply.alert ─► awaiting_contractor vencido → overdue → alerta a cada intervalo
                                       ─► entrega pending_window com wait_for_driver → alerta igual
WhatsApp recebido do motorista ─► hook 183 ─► entrega pending_window daquele motorista ─► sendMedia
```

Onde mora cada peça:

- API `src/occurrence-conversation/domain/contractor-reply.policy.ts` — `decideContractorReply`,
  transições permitidas, `decideAlert` (puras). **Espelho** no worker com a mesma tabela de casos
  (nenhuma app importa outra), como a 183 já faz com `conversation-attachment.policy.ts`.
- `.../application/open-contractor-reply.use-case.ts` — dentro da transação do envio automático, lê a
  configuração **efetiva** (tipo + exceção de contratante, `resolveWithOverrides`).
- `.../application/deliver-contractor-reply.use-case.ts` (API e worker) — alvos, idempotência,
  referência ao `stored_object`.
- `.../application/forward-contractor-reply-by-email.use-case.ts` (API) — cliente da nota e e-mail
  informado; valida, limita, grava a entrega e o outbox.
- Worker `contractor-mail` — tipo de mensagem de saída **sem thread** (sem token, sem `In-Reply-To`),
  reaproveitando montagem de anexo e Resend.
- WhatsApp — `deliverContractorReplyToDriver` usa o `SendMessageUseCase` do `meta-whatsapp-module`
  (resolvido em `whatsapp/application/meta-whatsapp-module.resolver.ts`), com `sendMedia`; o
  `WhatsAppWindowExpiredError` vira `pending_window`/`fallback`.
- Hook `whatsapp-conversation-inbound.service.ts` — antes de atribuir, entrega pendências do motorista
  (`FOR UPDATE SKIP LOCKED`); nunca consome a mensagem.
- Cron: `occurrence.automatic-mail.sweep`, `occurrence.contractor-reply.alert`,
  `nfe.recipient-email.backfill` (este só sob ordem).
- Notificação: template `trip.occurrence-contractor-reply-overdue` (INBOX + EMAIL) e
  `trip.occurrence-contractor-reply-needs-operator`, destinatário = quem despachou (D9), chave com o
  número do alerta.
- Rotas novas (`occurrences.resolve`, escopos de limite próprios):
  `POST /trip-occurrences/:id/contractor-reply/deliveries` (`{ target, attachmentId, address? }`,
  `Idempotency-Key`), `POST /trip-occurrences/:id/contractor-reply/resend-request`,
  `POST /trip-occurrences/:id/contractor-reply/handled` (`{ note }`); o retorno vem no detalhe da
  ocorrência.
- Painel: bloco "Retorno da contratante" na aba Tipos; selo e filtro "Atrasadas" na lista; painel do
  retorno no detalhe (estado, alarme, ações, envios, linha do tempo).
- App do motorista: módulo de conversa da ocorrência (lista, leitura, resposta, anexo), aviso do sino
  abrindo a conversa, "Pedido enviado à contratante" na ocorrência.

## Ordem de publicação (ADR-0081 §9)

1. Painel e app do motorista tolerantes: validações aceitam os campos do tipo e o objeto
   `contractorReply` como opcionais.
2. Pacote fiscal com `recipient.email`; banco, worker, API e cron (migration com `rollback.sql`);
   nada muda para tipo com os defaults.
3. Telas que escrevem (aba Tipos, painel do retorno) e a conversa no app do motorista.

## Riscos

- **Rate limit do webhook de e-mail é por processo** (`public-inbound-email.routes.ts:23`, `:74`) — não
  muda aqui; registrado.
- **Contratante que responde em e-mail novo** (sem responder): o token não casa, o worker descarta.
  O usuário disse que ela responde ao e-mail (Q1); se acontecer, spec à parte ("não atribuídas").
- **Duas referências ao mesmo objeto** (contratante e motorista): o expurgo da conversa conta as
  referências antes de apagar (T3.6).
- **E-mail de terceiro guardado** em `nfe_documents.recipient_email` e nas entregas: dado pessoal
  sob a retenção da nota e da conversa; registrado em `docs/SECURITY.md`.

## Protótipo (`preview.html`) — medição de 2026-10-06

Três telas: o bloco "Retorno da contratante" da aba Tipos, o painel do retorno na ocorrência (com os
estados alternáveis) e a conversa no app do motorista. Os seletores são o bloco `[data-select]`
**copiado** do `preview.html` da 247, que reproduz o `Select` da aplicação. Servido por
`python3 -m http.server` e medido com `iframe` de largura exata, em seis cenários por largura (tipo;
tipo com seletor aberto; ocorrência atrasada, com janela fechada e com falha; app do motorista):

| Largura | Estouro horizontal | Elemento fora | Alvo < 44 px               | Texto cortado | Contraste mínimo |
| ------- | ------------------ | ------------- | -------------------------- | ------------- | ---------------- |
| 320     | 0                  | 0             | 0 (3 com o seletor aberto) | 0             | 4,88:1           |
| 375     | 0                  | 0             | 0 (3 com o seletor aberto) | 0             | 4,88:1           |
| 768     | 0                  | 0             | 0 (3 com o seletor aberto) | 0             | 4,88:1           |
| 1280    | 0                  | 0             | 0 (3 com o seletor aberto) | 0             | 4,88:1           |

As três opções abertas medem 35 px de altura: é a altura da opção do `Select` real copiado, não do
protótipo. Fica como achado para a T7.1 conferir na tela real: no toque, a opção deveria ter 44 px. A
validação do e-mail informado foi exercitada: vazio, `a@b.com,c@d.com` e `x@y.com\r\nBcc: …` são
recusados, e um endereço válido aparece mascarado. Nenhum erro de script.
