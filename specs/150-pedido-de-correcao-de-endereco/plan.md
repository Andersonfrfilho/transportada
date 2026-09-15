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

## Riscos

- **Envio para vários destinatários:** sem isso, só um contato recebe. É a T302, e também é
  necessário para a 143 T015.
- **Contratante sem cadastro de CNPJ:** o envio é recusado. A tela precisa dizer onde cadastrar.
- **Endereço com CEP genérico (`-000`):** CEP de cidade de CEP único já está certo (084 T14). A tela
  não deve sugerir trocá-lo.
