# Plano técnico

## Dependências

- **Spec 247** vai antes: ela torna `emails_contractor`, `email_subject` e `email_body` editáveis na
  aba Tipos, impede que o aviso interno zere o e-mail à contratante
  (`save-occurrence-type.use-case.ts:147`) e cria `{{numeroNotaSemSerie}}` e o valor formatado. Sem
  ela o roteiro do SAC não se digita pela tela.
- **Spec 183 T002/T503** (modelos da Meta) bloqueia **só** a fase de WhatsApp (Fase 6). O resto entrega
  pelo app do motorista.
- 241 e 246 em `origin/staging` (conferido em 2026-10-06, `687473e1f`).

## Contexto e premissas (conferidas em `origin/staging` `687473e1f`, 2026-10-06)

Specs lidas e conferidas contra o código: 062, 143, 144, 150, 156, 164, 182, 183, 204, 208, 209, 211,
219, 241, 245, 246 e 247. O que vale aqui e não se reabre:

| Spec      | Decisão                                                                                                                                                        | Onde                                                                                                                                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 143       | e-mail Resend nos dois sentidos; token de resposta HMAC por conversa, só o hash no banco; MIME bruto no bucket antes de interpretar                            | `contractor-mail/domain/reply-token.policy.ts:31-52`; `worker-transportada/src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.ts:83-137`                                                                                                               |
| 150 / 219 | contratante da nota = emitente casado em `contractors` pelo CNPJ; destinatários de `contractor_contacts`                                                       | `drizzle-occurrence-mail.repository.ts:73-83`, `:272-298`                                                                                                                                                                                                                           |
| 183       | duas conversas; aviso automático; anexos de e-mail recebidos guardados (T702c1); a conversa não decide (D4); janela de 24 h e modelos (D5, bloqueados em T002) | `send-automatic-occurrence-mail.use-case.ts:82-89`; `worker-transportada/src/occurrence-conversation/application/inbound-mail-attachments.service.ts`; `conversation-attachment.policy.ts:24-50`, `:121-154`; `test/occurrence-conversation/conversation-never-decides.contract.ts` |
| 208       | segunda via do boleto é só tipo de catálogo; nenhuma origem de boleto                                                                                          | `occurrence-type-catalog.constant.ts:49`                                                                                                                                                                                                                                            |
| 241       | prorrogação no catálogo com `items_mode = off`; `off ⇒ unset`                                                                                                  | `occurrence-type-catalog.constant.ts:52`; `trip.schema.ts:2773`                                                                                                                                                                                                                     |
| 164       | `unset` não abre tratativa                                                                                                                                     | `occurrence-case.policy.ts:23`                                                                                                                                                                                                                                                      |
| 211       | núcleo de conversa em pacote, parado na T401 (publicação); fases de consumo não começaram                                                                      | — esta spec usa o módulo atual e não espera a 211                                                                                                                                                                                                                                   |

Fatos do trilho, ponta a ponta:

1. **Disparo do pedido:** `automatic-occurrence-mail.hook.ts:48-86`, chamado depois do commit em
   `main.ts` (`:900`, `:1085`, `:3576`, `:3845`), em memória; falha só loga
   (`occurrence_automatic_mail_failed`). Condições em `send-automatic-occurrence-mail.use-case.ts:82-89`
   (nota, etapa ≠ `stop`, contratante resolvida, `emails_contractor`, assunto não vazio). Grava thread,
   mensagem, outbox e `occurrence_conversation_messages` (`automatic=true`) na mesma transação
   (`drizzle-occurrence-mail.repository.ts:506-544`; `send-occurrence-mail.use-case.ts:216-240`).
   Idempotência `occurrence-auto-mail:<occurrenceId>` (`:65`, `:99`).
2. **Resposta:** `POST /public/inbound-emails/:webhookId` (`public-inbound-email.routes.ts:41-75`),
   Svix, rate limit 120/5 min **por processo, em memória** (`:23`, `:74`;
   `rate-limiter.service.ts:69-115`). `email.received` → `contractor_inbound_email_outbox` com `ON
CONFLICT DO NOTHING (company_id, provider_email_id)`.
3. **Worker:** acha a thread pelo hash do token em `(companyId, hash)`, grava o MIME bruto em
   `tenants/<companyId>/contractor-mail/<providerEmailId>/raw.eml` (≤ 25 MB), verifica DKIM, grava a
   mensagem `inbound` (`interpretation` nulo, `drizzle-contractor-mail-inbound-worker.repository.ts:206`)
   e liga à conversa da ocorrência (`drizzle-occurrence-conversation-mail.repository.ts:34-89`).
4. **Anexos:** `postal-mime`, partes `inline` fora, tipo pelos bytes (PDF, JPEG/PNG/WEBP,
   XLSX/XLS/CSV, áudio), ≤ 10 MB, ≤ 5; `stored_objects` (`purpose =
'occurrence_conversation_attachment'`) + `occurrence_conversation_attachments`
   (`occurrence-conversation.schema.ts:289-302`); chave `occurrence-conversations/<token>`.
5. **Conversa do motorista:** rota `POST /trip-occurrences/:id/conversations/:participant/messages`
   aceita `driver` só com `channel='app'`; WhatsApp responde `OccurrenceConversationChannelUnavailableError`
   ("espera os modelos da Meta (T503)", `occurrence-conversation.routes.ts:231-266`). App:
   `driver-conversation.use-case.ts` com anexos e aviso na caixa (`driver-conversation-notifier.gateway.ts`).
6. **WhatsApp:** gateway da API só `sendText`/`sendTemplate` (`meta-whatsapp-sending.gateway.ts:35-51`).
   O pacote `@adatechnology/meta-whatsapp-provider` tem `sendMedia` (documento) e `uploadMedia` no
   fonte local 0.3.1 (`adatechnology-packages/.../WhatsAppMessageProvider.ts:56-155`); a API declara
   0.4.0 (`apps/api-transportada/package.json:43`) — **conferir na T0.1**. Política de janela existe e
   ninguém a chama (`whatsapp-window-expiry.policy.ts`).
7. **Encaminhamento entre conversas:** só motorista → contratante, no portal
   (`contractor-portal-message.use-case.ts:61-75`, `:142-144`). O sentido contrário não existe.
8. **Cron:** catálogo em `apps/cron-transportada/src/shared/job-catalog.constant.ts`; nenhum job de
   prazo de resposta.
9. **Auditoria:** `audit_logs.actor_user_id NOT NULL` (`fiscal-operation.schema.ts:37-63`).
10. **Tratativa:** estados de `trip_occurrence_cases` (`trip.schema.ts:175-183`) — inclusive
    `awaiting_contractor` — não são usados aqui (D2).

## Modelo de dados (🧠 — validar com `architect` antes)

**`company_occurrence_types`** (aditivo):

```sql
contractor_reply_mode            varchar(32) NOT NULL DEFAULT 'off'
contractor_reply_attachment_kind varchar(16) NOT NULL DEFAULT 'pdf'
driver_reply_template            text        NOT NULL DEFAULT ''   -- char_length <= 1000
contractor_reply_wait_hours      smallint    NULL                  -- 1..168
contractor_reply_reminder        varchar(24) NOT NULL DEFAULT 'off'
-- CHECK ..._reply_needs_mail:     contractor_reply_mode = 'off' OR emails_contractor
-- CHECK ..._reply_needs_text:     contractor_reply_mode = 'off' OR btrim(driver_reply_template) <> ''
-- CHECK ..._reminder_needs_wait:  contractor_reply_reminder = 'off' OR contractor_reply_wait_hours IS NOT NULL
```

**`company_occurrence_type_contractor_overrides`:** `contractor_reply_mode`,
`contractor_reply_wait_hours` — nulos, sem default.

**`occurrence_contractor_replies`** (nova, padrão de tenant):

```sql
id                    uuid PK
company_id            uuid NOT NULL → companies
occurrence_id         uuid NOT NULL  -- FK composta (company_id, occurrence_id) → trip_document_occurrences
conversation_id       uuid NOT NULL  -- conversa da contratante; FK composta
mode                  varchar(32) NOT NULL  -- cópia do efetivo no registro (D8); CHECK ≠ 'off'
attachment_kind       varchar(16) NOT NULL
status                varchar(24) NOT NULL  -- CHECK: awaiting_contractor | reply_received | awaiting_operator
                                            --        | needs_operator | forwarding | sent_to_driver
                                            --        | failed | expired | cancelled
reason                varchar(40) NULL      -- CHECK: no_accepted_attachment | multiple_attachments
                                            --        | driver_without_account | driver_unreachable
                                            --        | whatsapp_window_closed | whatsapp_template_missing | send_failed
deadline_at           timestamptz NULL
reminded_at           timestamptz NULL
reply_message_id      uuid NULL   -- FK composta → occurrence_conversation_messages
reply_attachment_id   uuid NULL   -- FK composta → occurrence_conversation_attachments
driver_message_id     uuid NULL   -- FK composta → occurrence_conversation_messages
approved_by_user_id   uuid NULL   -- FK membership
created_at, updated_at
UNIQUE (company_id, occurrence_id)
INDEX parcial (company_id, deadline_at) WHERE status = 'awaiting_contractor' AND deadline_at IS NOT NULL
```

**`occurrence_contractor_reply_events`** (append-only): `id`, `company_id`, `reply_id` (FK composta),
`from_status`, `to_status`, `reason`, `actor_kind` (`system` | `user`, CHECK), `actor_user_id` (nulo
⇔ `system`, CHECK), `message_id`, `attachment_id`, `created_at`. Nenhum `UPDATE`/`DELETE` no código
(contrato de parede).

`rollback.sql`: derruba as duas tabelas e as colunas novas; registra que se perde o histórico dos
retornos. Não toca nada da 183/241/246/247.

## Fluxo

```text
motorista registra ──► commit ──► hook (183) ──► e-mail na fila do worker
                         │                         └─ mesma transação do envio: cria retorno (awaiting_contractor)
                         └─ varredor (RF2) reenvia se o hook se perdeu (mesma idempotência)

contratante responde ──► webhook Svix ──► outbox ──► worker grava inbound + anexos (183)
                                                   └─ publica occurrence.contractor-reply.received (outbox)
consumidor ──► decideContractorReply (pura) ──► transição + evento
          ├─ forward_automatic + 1 anexo ──► forwardContractorReplyToDriver ──► sent_to_driver | failed
          ├─ forward_after_approval ──► awaiting_operator ──(operador)──► forward…
          └─ 0 / N anexos ──► needs_operator (motivo)

cron occurrence.contractor-reply.remind ──► awaiting_contractor vencido ──► expired + lembrete (uma vez)
```

Onde mora cada peça:

- `apps/api-transportada/src/occurrence-conversation/domain/contractor-reply.policy.ts` —
  `decideContractorReply` e as transições permitidas (pura).
- `.../application/forward-contractor-reply-to-driver.use-case.ts` — envio ao motorista, canal pela
  decisão de Q4; reaproveita `driver-conversation.use-case.ts` passando o `stored_object` existente.
- `.../application/open-contractor-reply.use-case.ts` — chamado dentro da transação do envio
  automático (`send-occurrence-mail.use-case.ts`), lê o modo **efetivo** (tipo + exceção de
  contratante, `resolveWithOverrides`).
- Worker: depois de `recordOccurrenceConversationMailReply`
  (`drizzle-contractor-mail-inbound-worker.repository.ts:219-229`), publica o evento no outbox; o
  consumidor roda **no worker**, sem chamar a API. Como nenhuma app importa outra, a política pura e o
  envio ao motorista existem nas duas apps — no worker para o automático, na API para o toque do
  operador — com **contrato espelho** (mesma tabela de casos nos dois), como a 183 já faz com
  `conversation-attachment.policy.ts`. O envio pelo app é escrita de banco + aviso na caixa, que o
  worker já faz pelo outbox de notificação.
- Cron: `occurrence.contractor-reply.remind` e `occurrence.automatic-mail.sweep` no catálogo.
- Rotas novas (API): `POST /trip-occurrences/:id/contractor-reply/forward` (`occurrences.resolve`,
  corpo `{ attachmentId }`) e `GET` do retorno dentro do detalhe da ocorrência.
- Painel: selo na lista e no detalhe; bloco "Retorno da contratante" na aba Tipos; botão "Enviar ao
  motorista" e "Tentar de novo" na conversa da contratante.
- App do motorista: estado "Pedido enviado à contratante" e o anexo na conversa; botão
  "Compartilhar" (Web Share API) se Q6 = (b).

## WhatsApp (Fase 6, atrás da 183 T002)

- Gateway: `sendDocument` sobre `uploadMedia` + `sendMedia` do pacote (upload pelo servidor; nenhuma
  URL do bucket vai à Meta). Se a versão instalada não tiver, a mudança é no pacote
  (`adatechnology-packages`), não aqui.
- Antes de enviar: telefone verificado (`user_whatsapp_phones.verified_at`), janela pela política
  existente (`decideWhatsAppWindowExpiry`); fora da janela, o modelo aprovado de Q5; sem modelo,
  `whatsapp_template_missing` e cai para o app se Q4 = (a)/(c).
- Status da Meta (`whatsapp-conversation-status.service.ts`) atualiza a mensagem; `failed` da Meta
  vira `failed` / `send_failed` no retorno.

## Ordem de publicação (ADR-0081 §9)

1. Painel e app tolerantes: validações aceitam os campos do tipo e o retorno como opcionais.
2. Banco, worker, API e cron (migration com `rollback.sql`); nada muda para tipo com modo `off` (o
   default).
3. Telas que escrevem (aba Tipos, botões) e o app do motorista.
4. WhatsApp, quando a 183 T002 fechar.

## Decisões por delegação

Ver `spec.md` § "Decididas por delegação" (D1–D9).

## Riscos

- **Rate limit do webhook é por processo** (em memória): com réplicas, o teto efetivo multiplica. Não
  é desta spec mudar; registrado para a auditoria (security.md §3).
- **Contratante que responde com o PDF em outra conversa** (e-mail novo, sem responder): o token não
  casa e o worker descarta (`token_unknown`). O operador vê nada. Mitigação: Q1 pede o fato; se
  acontecer, é spec à parte ("não atribuídas").
- **Mesmo PDF serve o motorista e a contratante**: referência ao mesmo objeto (D4) — o expurgo da
  conversa precisa contar as duas referências antes de apagar (conferir na T3.x).
