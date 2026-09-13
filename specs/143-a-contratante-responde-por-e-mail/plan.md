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

## O que a documentação do Postmark responde (T001, 2026-09-13)

- **Autenticação do remetente:** vem em `Headers[]` como `X-Spam-Tests`, com as marcas do
  SpamAssassin (`DKIM_SIGNED`, `DKIM_VALID`, `DKIM_VALID_AU`, `SPF_PASS`…). O portão usa **só**
  `DKIM_VALID_AU`; os motivos estão na ADR-0063 §3.
- **Webhook:** não há assinatura HMAC. O Postmark aceita Basic Auth na URL
  (`https://usuário:senha@host/…`) e publica os IPs de origem em
  `postmarkapp.com/support/article/800-ips-for-firewalls#webhooks`.
- **Retentativa:** qualquer resposta diferente de 200 é repetida por cerca de 10 horas (1 min,
  5 min, 3× 10 min, 15 min, 30 min, 1 h, 2 h, 6 h). **Um `403` interrompe as retentativas.**
- **Recebimento:** MX do subdomínio apontando para `inbound.postmarkapp.com`, com prioridade 10.
  O `InboundDomain` e o `InboundHookUrl` se gravam pelo `PUT /server`, com o token do **servidor**.
- **Endereço com `+`:** o payload traz `MailboxHash`, o trecho depois do `+`, que é o nosso token.
- **Domínio de envio:** a verificação de DKIM e Return-Path (`/domains/…/verifyDkim`) exige o
  token da **conta**. Por isso não é automatizada (ADR-0063 §7).

## Arquitetura e arquivos afetados

**API: configuração, dentro do módulo `contractor-mail/`**

- `application/contractor-mail-credential-secret.service.ts`: sela e abre o token, com o AAD
  `transportada:contractor-mail-credential:v1:${companyId}:${settingsId}`. Tem **cópia por valor**
  no worker, como a da Nota RP.
- `infrastructure/postmark-server.gateway.ts`: `GET /server` e `PUT /server`, com `fetch` injetado,
  timeout de 5 s e erros tipados (`provider_unauthorized`, `provider_unreachable`).
- `infrastructure/mx-lookup.gateway.ts`: `resolveMx` do `node:dns`, com timeout.
- `application/contractor-mail-settings.use-case.ts`: salvar, aplicar o webhook, verificar e pedir o
  e-mail de teste.
- Rotas, todas `settings.manage` com escopo `company`:
  - `GET /contractor-mail-settings` e `PUT /contractor-mail-settings`;
  - `POST /contractor-mail-settings/webhook` (aplicar no Postmark);
  - `GET /contractor-mail-settings/checks`;
  - `POST /contractor-mail-settings/test-email`.

**Frontend: o painel "E-mail com contratantes"**

- O painel entra em `SETTINGS_PANEL_PLACEMENT` (`companySettingsTabs.service.ts`), na tela onde as
  contratantes são cadastradas, para ficar perto do efeito. O módulo exato se confirma na T011.
- Formulário com o token digitável que nunca volta preenchido, remetente e subdomínio.
- Lista de verificação com um item por check do RF12. O registro MX e a URL do webhook (sem a senha)
  saem com `CopyButton`.
- Botões "Aplicar no Postmark", "Enviar e-mail de teste" e "Verificar de novo".

**Os módulos do fluxo**

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
- `presentation/public-inbound-email.routes.ts`: `POST /public/inbound-emails/:webhookId`, com
  `defineAnonymousRoute`, Basic Auth contra o hash daquela empresa e allowlist de IP.
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
- Resposta do webhook: **200** quando autenticado, inclusive para token de conversa desconhecido,
  que não é erro de entrega. **401** para credencial errada ou id sem configuração: o Postmark
  retenta por horas, e isso dá tempo de consertar um erro de configuração. **Nunca `403`**, que
  interromperia as retentativas e perderia a resposta.

## Dados, migration e rollback

Migration aditiva `20260913120000_contractor_mail`:

- `contractor_mail_settings` (`id`, `company_id` único, `server_token_envelope` jsonb,
  `sender_address`, `sender_name`, `reply_domain`, `webhook_id` uuid único, `webhook_secret_sha256`
  bytea nulo até o primeiro "aplicar", `webhook_applied_at`, `status`, `version`, datas).

- `contractor_contacts` (`id` uuid, `company_id`, `contractor_id`, `email` em citext,
  `receives_occurrences`, `can_decide`, `status` varchar com CHECK, datas). Único em
  `(company_id, contractor_id, email)`. FK composta com `company_id`, como em
  `contractor_portal_bindings`.
- `contractor_mail_threads` (`id`, `company_id`, `contractor_id`, `subject_type` varchar CHECK in
  `('stop_occurrence','document_occurrence','delivery_charge','setup_test')`, `subject_id`, `reply_token_hash`
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
  - Basic Auth por empresa: o `webhookId` da URL acha a configuração, e a senha é comparada por
    `timingSafeEqual` sobre digests SHA-256 contra `webhook_secret_sha256`.
  - Allowlist dos IPs do Postmark, lida do **primeiro salto confiável** do `X-Forwarded-For` do
    Railway.
  - Empresa sem configuração ou sem webhook aplicado responde 401 (fail-closed por empresa).
- **O tenant sai do token, conferido contra o webhook.** O hash do token acha a conversa, e a
  conversa dá o `company_id`, que **precisa** ser o mesmo da configuração que o `webhookId` achou.
  Divergência é descarte com contador, nunca gravação. O endereço `To` não serve para escolher
  empresa.
- **O token do Postmark nunca sai da API nem do worker:** ele não volta na resposta, não entra em
  log e é aberto só no gateway, uma vez por operação, como na Nota RP. As chamadas vão para um host
  fixo (`api.postmarkapp.com`), então não há SSRF por configuração.
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
- Integração no worker com payloads **reais** do Postmark, capturados pelo e-mail de teste da
  página (T012) e anonimizados em `test/fixtures/postmark-inbound.fixture.ts`.
- Gateway do servidor do Postmark e consulta de MX com fakes: token recusado, timeout, MX ausente e
  MX apontando para outro lugar.
- E2E do fluxo P2 com o Postmark trocado por um fake HTTP no `docker-compose` (um container de
  mock, §4 do code-standart).

## Riscos

- **O provedor de e-mail da contratante não assinar com DKIM alinhado.** As respostas dela não
  decidem, e o operador decide citando a mensagem. A página mostra isso no teste, e a conversa
  mostra o motivo do rebaixamento.
- **Entregabilidade:** o domínio de envio precisa de SPF, DKIM e DMARC configurados no DNS, senão o
  e-mail cai em spam na contratante e ninguém responde. É configuração no painel, fora do código.
- **O cliente de e-mail da contratante reescrever a primeira linha** (Outlook com "Enviado do meu
  iPhone" antes do texto, por exemplo). O `StrippedTextReply` do Postmark mitiga isso, e a política
  procura a primeira linha **não vazia**.
