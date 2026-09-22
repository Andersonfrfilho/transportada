# Plano

## O que já existe

- **Relatório:** `GET /address-report`, com `settings.manage`
  (`apps/api-transportada/src/addresses/presentation/address-report.routes.ts`). Cada linha
  (`AddressReportRow`) traz `addressKey` (`cityCode|postalCode|number`), o emitente
  (`contractorName`/`contractorTaxId`) e os campos `note*`. Não traz o id da nota nem o do
  participante.
- **Endereço da nota:** `nfe_addresses` (`street, number, complement, district, city_code, city,
state, postal_code`), ligada por `participant_id` → `nfe_participants` → `nfe_documents`.
- **Contratante e contatos:** `contractors` tem unique `(company_id, tax_id)`. `contractor_contacts`
  guarda `email`, `status` e `receives_occurrences`. O CRUD dos contatos ainda está pendente (143
  T013).
- **Envio:**
  - Na API, `contractor_mail_messages` e `contractor_mail_outbox` (`message.send.requested`) são
    gravados na mesma transação.
  - O worker faz o relay para a fila `contractor-mail-outbound.v1` e envia pelo Resend, com corpo em
    texto puro montado por uma função TS.
  - ⚠️ Hoje só `toAddresses[0]` recebe.
  - O único envio implementado é o `setup_test`.

## Modelo de dados

Uma tabela nova, `address_correction_requests`, aditiva:

| coluna                                         | tipo              | nota                                                     |
| ---------------------------------------------- | ----------------- | -------------------------------------------------------- |
| `id`                                           | uuid v7           | PK                                                       |
| `company_id`                                   | uuid              | FK composta com a contratante                            |
| `contractor_id`                                | uuid              | resolvido pelo CNPJ do emitente                          |
| `address_key`                                  | varchar           | chave do relatório                                       |
| `reported_*`                                   | varchar           | endereço **como veio**, copiado do banco, não do cliente |
| `proposed_*`                                   | varchar           | endereço informado pelo operador                         |
| `reason_match_level`, `reason_distance_metres` | varchar / numeric | motivo da suspeita                                       |
| `status`                                       | varchar           | `draft` · `sent` (sem ENUM nativo)                       |
| `thread_id`                                    | uuid null         | conversa do envio                                        |
| `actor_user_id`, `created_at`, `sent_at`       |                   | trilha de auditoria                                      |

Unique parcial `(company_id, address_key) where status = 'draft'`: um rascunho por endereço, e
salvar de novo atualiza esse rascunho. O CHECK de `contractor_mail_threads.subject_type` ganha
`address_correction`. A migration só amplia o CHECK, nunca o restringe.

## Rotas

- `PUT /address-correction-requests/:addressKey`: grava ou atualiza o rascunho. O "como veio" e o
  motivo são lidos pelo servidor a partir do relatório. Resposta `200 { data }`.
- `GET /address-correction-requests`: estado por endereço, para a aba.
- `POST /address-correction-requests/mail`: body `{ contractorTaxId, contactIds[], requestIds? }` (sem `requestIds` é o envio completo; com um
  id é o unitário; ids de outra contratante ou já enviados são recusados) e header
  `Idempotency-Key`. Envia os rascunhos daquela contratante (a forma depende da P2), grava a mensagem
  e o outbox na mesma transação e marca os pedidos como `sent`.
- Erros com código estável em `shared/errors/codes.ts`: `ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND`,
  `ADDRESS_CORRECTION_NO_ACTIVE_CONTACT`, `ADDRESS_CORRECTION_NOTHING_TO_SEND`, e `400` com
  `details[]` por campo.

## Frontend

- Em `AddressReportPanel.component.tsx`, cada endereço ganha "Informar endereço correto", que abre um
  formulário com os campos da nota: máscara de CEP, `Select` de UF, município com o código IBGE e
  erro ancorado no campo (`web.md` §11).
- Cada contratante ganha "Enviar pedido de correção", com a lista de contatos marcáveis e a prévia
  do texto.
- Invalidação por `invalidateMutationEffect`, e chaves de texto novas em
  `nfeWorkspace.locale.json`, acentuadas.

## E-mail

- `address-correction-mail.template.ts` (API): a função pura `buildAddressCorrectionMail(params)`
  devolve `{ subject, html, text }`, com escape de HTML em todo valor interpolado. O desenho segue
  `email-template.html`.
- A mensagem guarda `html` ao lado do `text`. O gateway do Resend no worker passa a enviar os dois,
  e hoje ele só manda `text:`.
- **Decisão da T302** (parecer do architect em 2026-09-15, aprovado com ajustes):
  - **Um e-mail só**, com todos os contatos marcados no `to`, e não um envio por contato. O
    `Reply-To` sai da conversa, então a resposta de qualquer contato cai nela; `provider_email_id` e
    `Idempotency-Key` continuam um por mensagem. Os contatos se veem, o que é aceitável: são da
    mesma contratante. Serve também à 143 T015.
  - **Limite:** 50 destinatários por e-mail, conferido na documentação do Resend (`POST /emails`,
    `to` com no máximo 50). Vira a constante `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`, cobrada no Zod
    da API (`contactIds.max(50)`) e de novo no gateway, que recusa sem chamar a rede.
  - **HTML gravado pela API**, na coluna nova `contractor_mail_messages.body_html text NULL`
    (migration aditiva), com CHECK de `direction = 'outbound'` e teto de 512 KiB. Nunca montado no
    worker: o registro append-only guarda o que foi de fato enviado, e o modelo não se duplica
    entre apps. A cópia do schema no worker ganha a coluna.
  - **Retrocompatível:** a fila continua levando só `{ messageId }`. Uma mensagem antiga, sem
    `body_html`, sai só em texto, e o `setup_test` não muda.
  - **Endereços:** só os `email` de contatos ativos, buscados por id **e** `companyId`, sem
    repetição, recusando `\r`, `\n`, `,`, `<` e `>`.
- O relatório (`drizzle-address-report.repository.ts`) passa a trazer `recipientName`, o
  `legal_name` do participante destinatário da nota mais recente da chave, pela mesma escolha que
  já faz para o emitente.

## Fase 4 — modelos, liberação e limitador

**Modelos.** Tabela nova `contractor_mail_templates`, aditiva:

| coluna                                                 | tipo    | nota                                                                                            |
| ------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| `id`                                                   | uuid    | PK                                                                                              |
| `company_id`                                           | uuid    | tenant                                                                                          |
| `mail_type`                                            | varchar | CHECK contra o catálogo (`address_correction`)                                                  |
| `name`                                                 | varchar | único por `(company_id, mail_type, lower(name))` entre os ativos                                |
| `subject`, `intro`, `item_text`, `closing`             | text    | com teto de tamanho; `item_text` se repete por endereço e é o único que aceita variável de item |
| `is_default`                                           | boolean | unique parcial `(company_id, mail_type) where is_default and status = 'active'`                 |
| `status`                                               | varchar | `active` · `archived`                                                                           |
| `version`, `created_at`, `updated_at`, `actor_user_id` |         | concorrência otimista, como em `contractor_mail_settings`                                       |

`contractor_mail_messages` ganha `template_id uuid null`, com FK composta com `company_id`, para
registrar qual modelo foi usado. Rotas, todas com `settings.manage`:

- `GET /contractor-mail-templates?mailType=`
- `POST /contractor-mail-templates`
- `PATCH /contractor-mail-templates/:id`, com `If-Match`/`version`
- `POST /contractor-mail-templates/:id/default`
- `POST /contractor-mail-templates/preview`, que renderiza com dados de exemplo

`buildAddressCorrectionMail` passa a receber `{ subject, intro, closing }` do modelo, com as
variáveis substituídas por uma função pura de renderização: lista fechada por tipo, escape
aplicado. O texto aprovado vira o modelo que a página oferece como ponto de partida ("Criar a partir
do padrão"). Ninguém cria modelo em migration ou seed (ADR-0021).

**Liberação.** A função pura `resolveMailSendReadiness({ settings, checks, template })` devolve
`ready` ou um motivo. A lista de verificação da página já confere a chave e o domínio, e passa a
gravar o resultado em `contractor_mail_settings.sending_verified_at` (coluna nova, aditiva), que é
zerado quando a chave ou o remetente mudam. O envio consulta essa coluna e o modelo, e não consulta
mais `status`. Códigos:

- `CONTRACTOR_MAIL_SENDING_NOT_VERIFIED`
- `CONTRACTOR_MAIL_TEMPLATE_MISSING`
- `CONTRACTOR_MAIL_NOT_CONFIGURED`, que já existe, para quando não há configuração nenhuma

A confirmação de envio (T305) ganha o seletor de modelo e a prévia com o modelo escolhido. O body do
`POST /mail` ganha `templateId?`; sem ele, vale o padrão.

**Limitador.**

- **A API já tinha limitador em memória por processo** (`http/rate-limiter.service.ts`, aplicado pelo
  `router.service.ts` depois de `authorize`). A T406 estende esse caminho, não cria outro: o
  `rateLimit` da rota autenticada vira união discriminada — `{ store: 'memory', maxRequests,
windowMs }` (o que já existia) ou `{ store: 'postgres', scope, maxRequests, windowSeconds }`. A rota
  anônima segue só em memória, por IP.
- A porta `RateLimitWindowStorePort` (`http/rate-limit-window.port.ts`, `consume` assíncrono) é
  injetada em `createRouter` como `rateLimitWindows`; rota `postgres` sem ela derruba o boot.
  Implementação `DrizzleRateLimiterRepository` (`http/drizzle-rate-limiter.repository.ts`) sobre a
  tabela `rate_limit_windows (scope, subject_key, window_start, hits)`, PK composta + índice em
  `window_start`: **um** upsert em autocommit, fora da transação do caso de uso, com `window_start`
  calculado pelo relógio do banco (`floor(epoch(now()) / w) * w`) e `Retry-After =
ceil(window_start + w − now())`, mínimo 1.
- Aplicado no mesmo ponto de hoje: depois de `authorize`, antes de `parse`/idempotência — corpo
  inválido (400) e replay idempotente também contam.
- **Fail-closed**: erro do limitador propaga sem `try/catch` e vira 500 pelo Router.
- A chave é o `scope` + `companyId:userId` e nunca guarda PII. Escopo único `contractor-mail` para
  `POST /address-correction-requests/mail` e `POST /contractor-mail-settings/test-email`.
- A limpeza das janelas vencidas é a rotina `rate-limit.window.purge` do **worker** (piso de 1 h),
  semeada em `job_schedules` pela mesma migration aditiva da tabela — não o cron, que só publica a
  batida. Apaga janela que começou há mais de 48 h (janela máxima de 24 h + 24 h de folga).
- A resposta é `429` com `Retry-After` e o código **`TOO_MANY_REQUESTS`**, o mesmo que o limitador
  em memória já devolvia — não um `RATE_LIMIT_EXCEEDED` novo.
- Os tetos vêm de `RATE_LIMIT_CONTRACTOR_MAIL_MAX` e `RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS` no
  schema de env, com padrão de 20 por hora.
- Isso fecha, para as rotas de e-mail, o achado "sem limitador" do `docs/SECURITY.md`. As outras
  rotas públicas continuam listadas lá como pendentes.

## Riscos

- **Envio para vários destinatários:** sem isso, só um contato recebe. É a T302, e também é
  necessário para a 143 T015.
- **Contratante sem cadastro de CNPJ:** o envio é recusado. A tela precisa dizer onde cadastrar.
- **Endereço com CEP genérico (`-000`):** CEP de cidade de CEP único já está certo (084 T14). A tela
  não deve sugerir trocá-lo.
