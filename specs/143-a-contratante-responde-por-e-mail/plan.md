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

## O que já está no DNS e na documentação (2026-09-13)

**DNS de `fernandes-transportadora.com.br`, na Cloudflare:**

- O MX raiz e o SPF raiz são do **Zoho** e **não se tocam**.
- O Resend **já envia** por este domínio: `resend._domainkey` (DKIM) e o subdomínio `send.` (SPF e
  MX do Amazon SES, região `sa-east-1`) estão publicados.
- O DMARC é `p=none`.
- `resposta.` ainda não tem MX; ele é o único registro novo.

**Resend, pela documentação:**

- O recebimento funciona em qualquer endereço de um domínio com recebimento ligado. O valor do MX
  aparece no painel, e o domínio deve ser um subdomínio quando a raiz já tem MX.
- O webhook `email.received` traz **só metadados** (`email_id`, `from`, `to`, `subject`,
  `message_id`, anexos sem conteúdo). O conteúdo vem da API de e-mails recebidos, que devolve
  `headers`, `text`, `html` e `raw.download_url` (URL assinada do MIME original, com expiração).
- O webhook é assinado por Svix: cabeçalhos `svix-id`, `svix-timestamp` e `svix-signature`,
  HMAC-SHA256 sobre o corpo cru.
- O envio aceita `reply_to`, `headers` customizados e o cabeçalho `Idempotency-Key` (24 h).
- Não há resultado de SPF ou DKIM documentado no e-mail recebido. **Por isso o DKIM é verificado por
  nós**, sobre o MIME bruto (ADR-0063 §3).

**Resend, confirmado na documentação oficial para a T007 (2026-09-13):**

- **Recuperar um e-mail recebido é `GET /emails/receiving/{id}`**, não `/emails/{id}` — fonte:
  https://resend.com/docs/api-reference/emails/retrieve-received-email. Os campos que o trilho de
  entrada usa: `from` (string), `to` (array de strings), `subject`, `text` (nulo quando o e-mail não
  tem texto puro), `headers` (objeto), `message_id` e `raw.download_url` +
  `raw.expires_at` (a URL assinada do MIME original e sua expiração). O corpo real traz mais campos
  (`html`, `bcc`, `cc`, `attachments`…) que o schema Zod do gateway não declara, de propósito — só o
  que o trilho de entrada consome.
- **O host de `raw.download_url` é a CloudFront**, descrito pela documentação como uma "Signed
  CloudFront URL to download the raw email file" — sem fixar o subdomínio exato. A allowlist contra
  SSRF (`resend-download-allowlist.constant.ts`, worker) aceita o sufixo genérico `.cloudfront.net`
  e fica isolada numa constante comentada `// confirmar com payload real na T012`, porque é o
  primeiro lugar a ajustar se o payload real da T012 mostrar um host diferente.
- **O escopo mínimo da chave é `full_access`, não `sending_access`.** A documentação de criação de
  chave (https://resend.com/docs/api-reference/api-keys/create-api-key) diz que `sending_access`
  "só pode enviar e-mails" — listar domínios (`GET /domains`, usado por
  `resend-account.gateway.ts` para conferir o domínio do remetente) e ler e-mails recebidos ficam
  fora disso. Uma chave de envio usada nesses dois gateways responde 401/403 como se fosse errada, o
  que é o comportamento certo para o RF12: ela **é** insuficiente para a configuração completa.
- **O domínio verificado sai de `GET /domains`** (lista, com paginação por `data[]`; fonte:
  https://resend.com/docs/api-reference/domains/list-domains), cada entrada com `name` e `status`.
  A documentação mostra o valor `not_started` no exemplo e não enumera a lista fechada de estados
  nas páginas consultadas — por isso `resend-account.gateway.ts` só assume o significado de
  `status === 'verified'` (documentado como o estado de sucesso em
  https://resend.com/docs/api-reference/domains/get-domain) e trata qualquer outro valor como "não
  verificado ainda", sem tentar enumerar os intermediários.
- **`POST /emails`** aceita `reply_to` (string ou array), `headers` (objeto) e o cabeçalho de
  requisição `Idempotency-Key` (até 256 caracteres, expira em 24 h) — fonte:
  https://resend.com/docs/api-reference/emails/send-email. Confirma o que o `plan.md` já registrava.

## Arquitetura e arquivos afetados

**API: configuração, no módulo novo `contractor-mail/`**

- `application/contractor-mail-credential-secret.service.ts`: sela e abre `{ apiKey,
webhookSigningSecret }`, com o AAD
  `transportada:contractor-mail-credential:v1:${companyId}:${settingsId}`. Tem **cópia por valor** no
  worker, como a da Nota RP.
- `infrastructure/resend-account.gateway.ts`: confere a chave e o estado do domínio do remetente,
  com `fetch` injetado, timeout de 5 s e erros tipados (`provider_unauthorized`,
  `provider_unreachable`).
- `infrastructure/mx-lookup.gateway.ts`: `resolveMx` do `node:dns`, com timeout.
- `domain/svix-signature.policy.ts`: a conferência da assinatura, pura. HMAC-SHA256 com o segredo
  decodificado do `whsec_…`, comparação por `timingSafeEqual` contra cada `v1,` do cabeçalho, e
  janela de 5 minutos. **Sem a biblioteca `svix`**: são quinze linhas de `node:crypto`, e a
  dependência não se paga.
- `application/contractor-mail-settings.use-case.ts`: salvar, verificar e pedir o e-mail de teste.
- Rotas, todas `settings.manage` com escopo `company`:
  - `GET /contractor-mail-settings` e `PUT /contractor-mail-settings`;
  - `GET /contractor-mail-settings/checks`;
  - `POST /contractor-mail-settings/test-email`.

**Frontend: o painel "E-mail com contratantes"**

- O painel entra em `SETTINGS_PANEL_PLACEMENT` (`companySettingsTabs.service.ts`), na tela onde as
  contratantes são cadastradas, para ficar perto do efeito. O módulo exato se confirma na T011.
- Formulário com a chave e o segredo digitáveis, que nunca voltam preenchidos, mais remetente, nome
  do remetente e subdomínio de resposta.
- A URL do webhook, com `CopyButton`, e a instrução: criar no painel do Resend um webhook com o
  evento `email.received` apontando para ela, e colar o segredo que o Resend gerar.
- A lista de verificação, com um item por check do RF12, e os botões "Enviar e-mail de teste" e
  "Verificar de novo".

**API: o fluxo, no mesmo módulo**

- `domain/reply-token.policy.ts`: gera o token e o hash e monta `<token>@<subdomínio>`.
- `domain/inbound-reply.policy.ts`: a política pura do RF5. É o coração da spec e **não tem I/O**.
- `domain/auto-reply.policy.ts`: o RF8.
- `application/send-occurrence-mail.use-case.ts`: cria a conversa se não existir e enfileira a
  mensagem de saída.
- `application/submit-charge-by-mail.use-case.ts`: `submit` da taxa e envio na **mesma transação** (o
  outbox garante que ou os dois acontecem, ou nenhum).
- `application/reply-to-thread.use-case.ts`: resposta do operador.
- `presentation/contractor-mail.routes.ts`: `GET /mail-threads?subjectType=&subjectId=`,
  `POST /mail-threads/:id/messages`, `POST /trip-stop-occurrences/:id/mail` e
  `POST /delivery-charges/:id/mail-submission`.
- `presentation/public-inbound-email.routes.ts`: `POST /public/inbound-emails/:webhookId`, com
  `defineAnonymousRoute` e a assinatura Svix conferida contra o segredo daquela empresa.
- `infrastructure/drizzle-contractor-mail.repository.ts`.
- `delivery-clients/`: CRUD de `contractor_contacts`, dentro das rotas de `/contractors/:id`.

**Worker: dois trilhos novos, cada um com main, retry e dead**

- `contractor-mail-outbound.v1`: consome `contractor_mail_outbox` e envia por `POST /emails` do
  Resend, com `reply_to`, `headers` (`In-Reply-To`, `References`) e `Idempotency-Key` igual ao id da
  nossa mensagem. O `fetch` é injetado.
- `contractor-mail-inbound.v1`, em quatro passos:
  1. busca o e-mail recebido pelo `email_id`;
  2. baixa o MIME bruto pela `download_url` e grava no bucket com `sha256`;
  3. verifica o DKIM com a `mailauth` (`d=` alinhado ao domínio do `From`, com alinhamento relaxado
     pelo domínio organizacional);
  4. roda a política e, se o resultado for `approve` ou `reject`, aplica a transição, grava o evento
     e enfileira os avisos do RF9.
- Cópia por valor no worker: `contractor-mail.schema.ts` e as tabelas de `delivery_charges` que ele
  escreve (a migration continua sendo da API).

**Frontend: as telas do fluxo**

- `delivery-clients`: a lista de contatos no formulário da contratante.
- `trip`: o painel "Conversa com a contratante" na ocorrência, com o botão "Enviar à contratante".
- A tela de taxas ganha a ação "Enviar para aprovação por e-mail" e a conversa da taxa.
- A mensagem que decidiu aparece com a marca "decidiu" e o motivo de rebaixamento traduzido
  (`contractorMail.downgradeReason.*`).

## Contratos/API/eventos

- Payload de saída na fila: `{ messageId }`. Só referência; o corpo fica no banco.
- Payload de entrada na fila: `{ companyId, providerEmailId }`. O worker busca o resto no Resend.
- O webhook lê do corpo só `type` (precisa ser `email.received`) e `data.email_id`. Todo o resto é
  ignorado: os metadados que interessam vêm da API, com a chave, e não do corpo anônimo.
- Resposta do webhook:
  - **204** para evento aceito, repetido ou de tipo que não interessa;
  - **401** para assinatura inválida, timestamp fora da janela, id sem configuração ou `svix-id`
    já usado com outro corpo.

  O Svix retenta qualquer resposta que não seja 2xx, o que dá tempo de consertar configuração.

## Dados, migration e rollback

Migration aditiva `20260913120000_contractor_mail`:

- `contractor_mail_settings`: `id`, `company_id` único, `secret_envelope` jsonb (a chave de API e o
  segredo do webhook), `sender_address`, `sender_name`, `reply_domain`, `webhook_id` uuid único,
  `last_webhook_at`, `status`, `version`, datas.
- `contractor_contacts`: `id` uuid, `company_id`, `contractor_id`, `email` em citext,
  `receives_occurrences`, `can_decide`, `status` varchar com CHECK, datas. Único em
  `(company_id, contractor_id, email)`. FK composta com `company_id`, como em
  `contractor_portal_bindings`.
- `contractor_mail_threads`: `id`, `company_id`, `contractor_id` (nulo em `setup_test`),
  `subject_type` varchar com CHECK em
  `('stop_occurrence','document_occurrence','delivery_charge','setup_test')`, `subject_id`,
  `reply_token_hash` bytea único, `status` (`open` ou `closed`) e `created_at`. Único em
  `(company_id, subject_type, subject_id)`: uma conversa por objeto.
- `contractor_mail_messages`, append-only: `id`, `company_id`, `thread_id`, `direction`
  (`inbound` ou `outbound`), `actor_user_id` (nulo quando inbound), `from_address`, `body_text`,
  `raw_object_id` → `stored_objects`, `raw_sha256`, `provider_email_id`, `rfc_message_id`,
  `in_reply_to`, `dkim_result` (`aligned`, `not_aligned`, `unverifiable` ou `absent`),
  `interpretation`, `downgrade_reason`, `delivery_status` (`queued`, `sent` ou `failed`, só
  outbound) e `created_at`. Único em `(company_id, provider_email_id)`.
- `contractor_mail_outbox` e `contractor_inbound_email_outbox`, no molde de
  `aggregate_attachment_outbox` (sem ator, com payload de referência).
- `delivery_charge_events.decided_by_message_id` (nulo) e o CHECK de autoria refeito.
- `company_occurrence_types.emails_contractor` boolean, padrão `false` (P4).
- Seed dos contatos a partir de `contractors.report_email <> ''`.

Rollback: `rollback.sql` derruba as tabelas novas e a coluna e restaura o CHECK antigo. Ele é
seguro **só antes** de existir decisão por e-mail; depois dela, a coluna carrega autoria. Isso fica
escrito no arquivo.

## Segurança e tenant

- **O webhook é a terceira superfície anônima, e a primeira assinada.** O `webhookId` da URL acha a
  configuração; a assinatura Svix é conferida contra o segredo daquela empresa. Empresa sem
  configuração responde 401 (fail-closed por empresa).
- **Replay:** fora da janela de 5 minutos é recusado, e o mesmo `email_id` converge no único da
  tabela. Nada é gravado duas vezes.
- **O tenant sai do token, conferido contra o webhook.** O hash do token acha a conversa, e a
  conversa dá o `company_id`, que **precisa** ser o mesmo da configuração que o `webhookId` achou.
  Divergência é descarte com contador, nunca gravação.
- **O corpo anônimo não é fonte de nada:** o remetente, o destinatário e o conteúdo vêm da API do
  Resend com a chave, e a verificação de DKIM é feita sobre o MIME bruto que o Resend guardou. Um
  webhook forjado com assinatura válida (o que já exige o segredo) só faria o worker buscar um
  `email_id` que não existe.
- **Os segredos nunca saem da API nem do worker:** não voltam na resposta, não entram em log e são
  abertos só no gateway, uma vez por operação, como na Nota RP. As chamadas vão para um host fixo
  (`api.resend.com`), e a `download_url` só é seguida se o host dela for do Resend. Isso evita SSRF
  por um e-mail forjado.
- **O remetente é conferido contra a lista da contratante daquela conversa.** Um contato de outra
  contratante da mesma empresa não decide.
- O rate limit continua inexistente. A assinatura faz o papel dele nesta rota: sem o segredo, nada
  passa da conferência.
- Retenção: o corpo e o bruto não expiram (são comprovante de decisão financeira), e isso fica
  datado no `docs/SECURITY.md`.

## Idempotência e concorrência

- **Entrada:** `(company_id, provider_email_id)` único, então o reenvio do Svix converge.
- **Decisão:** o worker aplica a transição com `SELECT … FOR UPDATE` na taxa. Se ela não estiver
  mais `submitted`, a mensagem vira `late`. O lote e o portal usam a mesma política e competem pela
  mesma linha.
- **Saída:** a mensagem é criada com `delivery_status = queued` antes do outbox, e o envio leva
  `Idempotency-Key` igual ao id dela. O retry depois de um ack perdido **não duplica** o e-mail,
  dentro das 24 h da chave.

## Observabilidade

Eventos de log:

- `contractor_mail_sent` / `_failed`
- `inbound_email_webhook_accepted` / `_rejected` (com o motivo tipado)
- `inbound_email_token_unknown` (só contador)
- `inbound_email_dkim_verified` (com `dkimResult`)
- `inbound_reply_interpreted` (com `interpretation` e `downgradeReason`)
- `delivery_charge_decided_by_mail`

Nenhum deles leva endereço, assunto, corpo ou segredo.

## Estratégia de testes

- Unitários da política (RF5, RF8), dirigidos por tabela: caixa, acento, linha vazia antes da
  palavra, `APROVADO` no meio do texto (não decide), `RECUSADO:` sem motivo, assinatura do celular
  depois da palavra.
- Unitários da assinatura Svix: assinatura válida, inválida, múltiplas assinaturas no cabeçalho,
  timestamp fora da janela e segredo sem o prefixo `whsec_`.
- DKIM com mensagens **sintéticas** assinadas por uma chave de teste e resolvedor de DNS injetado:
  alinhada, desalinhada (`d=` de outro domínio), corpo adulterado e sem assinatura. Um e-mail real
  anonimizado **não serve de fixture**: anonimizar quebra a assinatura.
- Contrato de tenant nas quatro tabelas novas (`test/contractor-mail-schema/tenant-safety.contract.ts`).
- Contrato por texto de fonte: sem PII nem segredo nos logs, e o webhook fail-closed.
- Gateways do Resend e do MX com fakes: chave recusada, timeout, domínio não verificado, MX ausente e
  `download_url` de host estranho.
- E2E do fluxo P2 com o Resend trocado por um fake HTTP no `docker-compose` (um container de mock,
  §4 do code-standart).

## Riscos

- **A `mailauth` não rodar no Bun.** O spike T004 decide antes de ela entrar, e a execução para se
  falhar.
- **O provedor de e-mail da contratante não assinar com DKIM alinhado.** As respostas dela não
  decidem, e o operador decide citando a mensagem. A página mostra isso no teste, e a conversa
  mostra o motivo do rebaixamento.
- **A chave do Resend lê a caixa inteira da conta.** Ela fica selada; achado em `docs/SECURITY.md`.
- **O cliente de e-mail da contratante reescrever a primeira linha** (Outlook com "Enviado do meu
  iPhone" antes do texto, por exemplo). A política procura a primeira linha **não vazia** do texto
  sem citação.
