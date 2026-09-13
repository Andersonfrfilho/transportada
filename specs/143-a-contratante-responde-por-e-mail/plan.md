# Plano técnico

## Contexto e premissas

- **A decisão mora na taxa, não na ocorrência.** `trip_stop_occurrences` e
  `trip_document_occurrences` não têm estado, de propósito (ADR-0045 §6, comentário em
  `trip.schema.ts:957`). `delivery_charges` tem a máquina de estados, com `submit → approve/reject`
  em `delivery-charge-state.policy.ts:44`. O e-mail com valor acontece no `submit`.
- **Hoje a taxa e a ocorrência se ligam só pela nota** (`suggest-delivery-charges.use-case.ts`, sem
  FK). Por isso a conversa aponta para **um** objeto, `subject_type` + `subject_id`, e não tenta
  juntar os dois.
- **O `notification-module` só entrega a usuário com membership**
  (`identity-recipient.resolver.ts:32`), e a contratante não tem conta. O e-mail para ela é **trilho
  próprio** no worker. Os avisos para motorista e despachante continuam no `notification.v1`.
- **Hoje o "e-mail ao embarcador" é texto devolvido ao operador**
  (`register-trip-occurrence.use-case.ts:187`). O P1 reaproveita esse texto como corpo do envio, sem
  um terceiro formato de template.

## Arquitetura e arquivos afetados

**API: módulo novo `contractor-mail/`**

- `domain/reply-token.policy.ts`: gera o token e o hash e monta o endereço `r+<token>@<domínio>`.
- `domain/inbound-reply.policy.ts`: a política pura do RF5. É o coração da spec e **não tem I/O**.
- `domain/auto-reply.policy.ts`: o RF8.
- `application/send-occurrence-mail.use-case.ts`: cria a conversa se não existir e enfileira a
  mensagem de saída.
- `application/submit-charge-by-mail.use-case.ts`: `submit` da taxa e envio na **mesma transação** (o
  outbox garante que ou os dois acontecem, ou nenhum).
- `application/reply-to-thread.use-case.ts`: resposta do operador.
- `presentation/contractor-mail.routes.ts`: `GET /mail-threads?subjectType=&subjectId=`,
  `POST /mail-threads/:id/messages`, `POST /trip-stop-occurrences/:id/mail`,
  `POST /delivery-charges/:id/mail-submission`.
- `presentation/public-inbound-email.routes.ts`: `POST /public/inbound-emails`, com
  `defineAnonymousRoute`, Basic Auth e allowlist de IP.
- `infrastructure/drizzle-contractor-mail.repository.ts`.
- `delivery-clients/`: CRUD de `contractor_contacts`, dentro das rotas de `/contractors/:id`.

**Worker: dois trilhos novos, cada um com main, retry e dead**

- `contractor-mail-outbound.v1`: consome `contractor_mail_outbox` e envia pela API HTTP do Postmark
  (`POST /email`, cabeçalho `X-Postmark-Server-Token`). O `fetch` é injetado.
- `contractor-mail-inbound.v1`: baixa o bruto do bucket, roda a política e, se o resultado for
  `approve` ou `reject`, aplica a transição e grava o evento. Depois enfileira os avisos do RF9.
- Cópia por valor no worker: `contractor-mail.schema.ts` e as tabelas de `delivery_charges` que ele
  escreve (a migration continua sendo da API).

**Frontend**

- `delivery-clients`: a lista de contatos no formulário da contratante, com o `MultiSelect`/tabela do
  design system.
- `trip`: o painel "Conversa com a contratante" na ocorrência, com o botão "Enviar à contratante".
- A tela de taxas ganha a ação "Enviar para aprovação por e-mail" e a conversa da taxa.
- A mensagem que decidiu aparece com a marca "decidiu" e o motivo de rebaixamento traduzido
  (`contractorMail.downgradeReason.*`).

## Contratos/API/eventos

- Payload de saída na fila: `{ messageId }`. Só referência; o corpo fica no banco.
- Payload de entrada na fila: `{ inboundEmailId, bucket, objectKey }`.
- O webhook aceita o JSON do Postmark Inbound e só lê: `MessageID`, `Headers[]`, `From`,
  `OriginalRecipient`, `StrippedTextReply`, `TextBody` e `Attachments[]` (nome, tipo e tamanho; o
  conteúdo vai para o bucket). Todo o resto é ignorado. O Zod é `passthrough` só para o bruto que vai
  ao bucket, e `strict` no que é lido.
- Resposta do webhook: **sempre 200** quando autenticado. Um 4xx faz o Postmark reenviar, e token
  desconhecido não é erro de entrega. 401 sem credencial.

## Dados, migration e rollback

Migration aditiva `20260913120000_contractor_mail`:

- `contractor_contacts` (`id` uuid, `company_id`, `contractor_id`, `email` em citext,
  `receives_occurrences`, `can_decide`, `status` varchar com CHECK, datas). Único em
  `(company_id, contractor_id, email)`. FK composta com `company_id`, como em
  `contractor_portal_bindings`.
- `contractor_mail_threads` (`id`, `company_id`, `contractor_id`, `subject_type` varchar CHECK in
  `('stop_occurrence','document_occurrence','delivery_charge')`, `subject_id`, `reply_token_hash`
  bytea único, `status` `open|closed`, `created_at`). Único em `(company_id, subject_type,
subject_id)`: uma conversa por objeto.
- `contractor_mail_messages`, append-only: `id`, `company_id`, `thread_id`, `direction`
  (`inbound|outbound`), `actor_user_id` (nulo quando inbound), `from_address`, `body_text`,
  `raw_object_id` → `stored_objects`, `raw_sha256`, `provider_message_id`, `rfc_message_id`,
  `in_reply_to`, `interpretation`, `downgrade_reason`, `delivery_status`
  (`queued|sent|failed`, só outbound), `created_at`. Único em `(company_id, rfc_message_id)`.
- `contractor_mail_outbox` e `contractor_inbound_email_outbox`, no molde de
  `aggregate_attachment_outbox` (sem ator, com payload de referência).
- `delivery_charge_events.decided_by_message_id` (nulo) e o CHECK de autoria refeito.
- `company_occurrence_types.emails_contractor` boolean, padrão `false` (P4).
- Seed dos contatos a partir de `contractors.report_email <> ''`.

Rollback: `rollback.sql` derruba as tabelas novas e a coluna e restaura o CHECK antigo. Ele é
seguro **só antes** de existir decisão por e-mail; depois dela, a coluna carrega autoria. Isso fica
escrito no arquivo.

## Segurança e tenant

- **O webhook é a terceira superfície anônima.** As guardas:
  - Basic Auth de `INBOUND_EMAIL_WEBHOOK_USER` e `_PASSWORD`, comparada com `timingSafeEqual` sobre
    digests.
  - Allowlist dos IPs do Postmark, lida do **primeiro salto confiável** do `X-Forwarded-For` do
    Railway.
  - Sem as variáveis, a rota **não é registrada** (fail-closed).
- **O tenant sai do token, nunca do payload.** O hash do token acha a conversa, e a conversa dá o
  `company_id`. O endereço `To` não serve para escolher empresa.
- **O remetente é conferido contra a lista da contratante daquela conversa.** Um contato de outra
  contratante da mesma empresa não decide.
- O `From` só vale junto com a autenticação: sem DKIM/SPF aprovado, o `From` é texto e nada decide.
- **Limite de corpo:** o Postmark manda anexo em base64 dentro do JSON. A rota ganha limite próprio
  de **12 MiB** em `request-handler.service.ts`; as outras seguem em 1 MiB. O `maxRequestBodySize`
  do `Bun.serve` sobe para 12 MiB, e o limite por rota passa a ser o que protege o resto. É decisão
  🧠 (T004) e vira achado em `docs/SECURITY.md`.
- O rate limit continua inexistente. A Basic Auth e a allowlist fazem o papel dele nesta rota, e o
  spam no endereço de resposta morre na busca do hash, sem gravar corpo.
- Retenção: o corpo e o bruto não expiram (são comprovante de decisão financeira), e isso fica
  datado no `docs/SECURITY.md`.

## Idempotência e concorrência

- **Entrada:** `(company_id, rfc_message_id)` único, então o reenvio do Postmark converge.
- **Decisão:** o worker aplica a transição com `SELECT … FOR UPDATE` na taxa. Se ela não estiver
  mais `submitted`, a mensagem vira `late`. O lote e o portal usam a mesma política e competem pela
  mesma linha.
- **Saída:** a mensagem é criada com `delivery_status = queued` antes do outbox. O consumidor manda
  ao Postmark o `messageId` como chave (o cabeçalho `X-PM-Metadata`) e só marca `sent` com a
  resposta dele. Um retry depois de um envio bem-sucedido cujo ack se perdeu é o risco residual de
  e-mail duplicado; ele é aceito porque a contratante receber o mesmo e-mail duas vezes não decide
  nada.

## Observabilidade

Eventos de log:

- `contractor_mail_sent` / `_failed`
- `inbound_email_received`
- `inbound_email_token_unknown` (só contador)
- `inbound_reply_interpreted` (com `interpretation` e `downgradeReason`)
- `delivery_charge_decided_by_mail`

Nenhum deles leva endereço, assunto ou corpo.

## Estratégia de testes

- Unitários da política (RF5, RF8), dirigidos por tabela: caixa, acento, linha vazia antes da
  palavra, `APROVADO` no meio do texto (não decide), `RECUSADO:` sem motivo, assinatura do celular
  depois da palavra.
- Contrato de tenant nas três tabelas novas (`test/contractor-mail-schema/tenant-safety.contract.ts`).
- Contrato por texto de fonte: sem PII nos logs e webhook fail-closed.
- Integração no worker com payloads **reais** do Postmark, capturados no T001 e anonimizados em
  `test/fixtures/postmark-inbound.fixture.ts`.
- E2E do fluxo P2 com o Postmark trocado por um fake HTTP no `docker-compose` (um container de
  mock, §4 do code-standart).

## Riscos

- **O Postmark não expor o resultado de DKIM/SPF.** O P2 fica desligado; o spike T001 decide antes
  de qualquer código.
- **Entregabilidade:** o domínio de envio precisa de SPF, DKIM e DMARC configurados no DNS, senão o
  e-mail cai em spam na contratante e ninguém responde. É configuração no painel, fora do código.
- **O cliente de e-mail da contratante reescrever a primeira linha** (Outlook com "Enviado do meu
  iPhone" antes do texto, por exemplo). O `StrippedTextReply` do Postmark mitiga isso, e a política
  procura a primeira linha **não vazia**.
