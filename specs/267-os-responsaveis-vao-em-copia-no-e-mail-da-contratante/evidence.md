# Evidência — 267 Os responsáveis vão em cópia no e-mail da contratante

## Decisões do dono (chat, 2026-10-15)

Pedido: "quando for enviado o e-mail ao contratante devemos marcar os responsáveis por ocorrências na empresa; essa
config pode ser feita em alguma página" — "vamos add nosso atendente responsável, ou no plural mais de um, como cópia".

1. **Spec própria (267)**, independente da 266.
2. **Lista da empresa + lista opcional por contratante**, que **substitui** a da empresa quando preenchida (atendente fixo
   por cliente).
3. **No formulário a cópia vem preenchida**; o operador pode **tirar** pessoas naquele envio, nunca adicionar endereço
   digitado.
4. **A cópia vai** no e-mail de ocorrência (manual e automático, inclusive o reenvio do pedido de resposta da 248) e no
   e-mail de correção de endereço. **Não vai** no encaminhamento da 248 a terceiro.

## Perguntas ao dono

Nenhuma bloqueia a Fase 0 nem a Fase 1. A spec assume a resposta entre parênteses; o autopilot para antes da task
indicada se o dono não tiver confirmado.

1. **Lista da contratante vazia herda a da empresa.** Não há como dizer "esta contratante não leva ninguém em cópia" (o
   operador tira os chips a cada envio). (Assumido: herda. Antes da T1.4.)
2. **A resposta do responsável só ao endereço da conversa** (sem a contratante no `To`/`Cc`) entra como mensagem interna
   com o selo "só para a equipe — a contratante não recebeu". (Assumido: entra assim. Antes da T3.2.)
3. **Envio automático acima de 50 destinatários:** corta a cópia até caber e registra `warn`, em vez de falhar o envio
   à contratante. (Assumido: corta. Antes da T2.3; a T0.2 pode mudar.)
4. **Elegibilidade:** responsável é quem tem `occurrences.resolve`, inclusive na correção de endereço (que é
   `settings.manage`). (Assumido: `occurrences.resolve` nas duas. Antes da T1.3.)

## Levantamento contra `origin/staging` (d6459e4cd, 2026-10-15)

Feito por duas buscas paralelas, só de leitura (o `git fetch` falhou por chave SSH; a base é a do worktree). A T0.1
confere as linhas antes de qualquer código. Caminhos: `api` = `apps/api-transportada/src`, `worker` =
`apps/worker-transportada/src`, `fe` = `apps/frontend-transportada/src/modules`.

### Saída

| Afirmação                                     | Status | Referência / nota                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `To` montado de `contactIds` escolhidos       | ✅     | `api/occurrence-conversation/application/send-occurrence-mail.use-case.ts`: `executeSend` :139, contatos :202, `To` :204-211, `toAddresses` :267                                                                                                                                                                                                                                 |
| Contatos validados com `receives_occurrences` | ✅     | `drizzle-occurrence-mail.repository.ts:434-452` (`findOccurrenceContacts`: empresa, contratante, ativo, `receivesOccurrences`)                                                                                                                                                                                                                                                   |
| `recordMail` grava `toAddresses` e outbox     | ✅     | `:530`; mensagem :544, `toAddresses` :555, outbox :560                                                                                                                                                                                                                                                                                                                           |
| Automático usa o mesmo caminho                | ✅     | `send-automatic-occurrence-mail.use-case.ts:87-97` → `sendMail.send({ contactIds, automatic: true, actorUserId: null })`                                                                                                                                                                                                                                                         |
| Reenvio da 248 reusa o `To` original          | ⚠️     | Reenvia `context.contactIds` (contatos ativos donos de endereço do `To` original) via `sendMail.send` (~:61-65); casamento em `drizzle-contractor-reply-resend.repository.ts:175-207`                                                                                                                                                                                            |
| Encaminhamento a terceiro                     | ✅     | `forward-contractor-reply-by-email.use-case.ts:274` (`toAddress`, digitado :92 ou do destinatário da nota :147); sem token, sem `Reply-To`                                                                                                                                                                                                                                       |
| Correção de endereço                          | ⚠️     | `api/address-correction/application/send-address-correction-mail.use-case.ts:141-195`, `findActiveContactsByIds` (`drizzle-address-correction-mail.repository.ts:142-149`): só status ativo, **sem** filtro `receives_occurrences`                                                                                                                                               |
| Worker envia `from`, `replyTo`, `to`          | ✅     | `worker/contractor-mail/application/send-contractor-mail-outbound-message.use-case.ts:136-146`; `In-Reply-To`/`References` em `headers` :122                                                                                                                                                                                                                                     |
| Gateway sem `cc`/`bcc`                        | ⚠️     | `worker/contractor-mail/infrastructure/resend-mail.gateway.ts`: `SendResendEmailInput` **:67-79**; `cc` só na entrada :45; `isValidRecipientList` :240 (chamado :112)                                                                                                                                                                                                            |
| Limite 50                                     | ✅     | `CONTRACTOR_MAIL_MAX_RECIPIENTS` em `worker/.../contractor-mail.constant.ts:10` e `api/contractor-mail/domain/contractor-mail.constant.ts:10`; paridade em `apps/worker-transportada/test/contractor-mail/max-recipients-parity.contract.ts`. **Terceira cópia**: literal local `MAX_RECIPIENTS = 50` em `occurrence-conversation.routes.ts:77` (fora da paridade; a T2.2 troca) |
| Schema                                        | ⚠️     | `api/database/contractor-mail.schema.ts`: `contractor_mail_settings` :47; `contractor_contacts` `pgTable` **:133** (doc :99-132), FK composta para `contractors (company_id, id)`; `to_addresses` :475, CHECK :587                                                                                                                                                               |
| Rota `.strict()` e contrato `cc` → 400        | ✅     | `occurrence-conversation.routes.ts:83-91`; `test/occurrence-conversation/conversation-routes.contract.ts:226-231`                                                                                                                                                                                                                                                                |

### Entrada

| Afirmação                 | Status | Referência / nota                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token lido de `To` + `Cc` | ✅     | `worker/.../recipient-reply-token.policy.ts:24`                                                                                                                                                                                                                                                                                                                        |
| Remetente desconhecido    | ⚠️     | O worker **não** rejeita: `record-contractor-mail-inbound-message.use-case.ts:181` grava qualquer `From`. A identificação é na leitura: `api/occurrence-conversation/domain/contractor-sender.policy.ts:58-100` (`identifyContractorSender`), chamada em `occurrence-conversation.query.ts:72-83`; sem contato ou sem DKIM alinhado → `kind: 'unknown'` + `suggestion` |

### Configuração, permissões e painel

| Afirmação                        | Status | Referência / nota                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissões                       | ✅     | `api/identity/domain/authorization.policy.ts`: `settings.manage` :35, `occurrences.resolve` :115                                                                                                                                                                                                                                                                                                                       |
| Resolvedor de endereço           | ✅     | `api/notification/infrastructure/identity-recipient.resolver.ts` (cópia no worker): `identity_user_profiles.contactAddress/contactChannel/name` via `user_company_memberships`, por empresa; banco, não Keycloak                                                                                                                                                                                                       |
| Vínculo                          | ✅     | `user_company_memberships` (`identity.schema.ts:116`), único `(user_id, company_id)`, status `active`/`disabled`, FK `restrict`                                                                                                                                                                                                                                                                                        |
| Abas de configurações            | ⚠️     | `fe/company-settings/shared/companySettingsTabs.service.ts`: `SETTINGS_PANELS` **:3-30**, `SETTINGS_PANEL_PLACEMENT` **:88**, `COMPANY_SETTINGS_TAB_IDS` :274-285; ramo `quickReplies` em `pages/CompanySettings.page.tsx:256`                                                                                                                                                                                         |
| Rotas de quick replies           | ✅     | `api/occurrence-conversation/presentation/quick-replies.routes.ts:25-26` (`settings.manage` / `occurrences.resolve`)                                                                                                                                                                                                                                                                                                   |
| Tela dos contatos da contratante | —      | `fe/delivery-clients/components/ContractorContactsPanel.component.tsx` em `pages/DeliveryClientWorkspace.page.tsx:125`; API `api/contractor-mail/presentation/contractor-contacts.routes.ts` (`/contractors/:id/contacts`, `settings.manage` :30)                                                                                                                                                                      |
| Formulário de envio              | —      | `fe/occurrence-conversation/components/SendToContractorDialog.component.tsx` → `previewContractorMail` (`occurrenceConversationClient.service.ts:461`) → `POST /trip-occurrences/:id/conversations/contractor/mail-preview` (`routes.ts:58`); `recipients` de `listOccurrenceRecipients` (`drizzle-occurrence-mail.repository.ts:96-118`); pré-seleção `initialRecipientIds` (`occurrenceConversation.service.ts:110`) |
| Trilha de auditoria              | —      | `audit_logs` (`api/database/fiscal-operation.schema.ts:37`, `actor_user_id NOT NULL`), já escrita por `drizzle-contractor-mail.repository.ts:500,520` e pelos repositórios de configuração                                                                                                                                                                                                                             |
| Lista de usuários para o painel  | ⚠️     | `GET /company-users` (`user-administration.routes.ts:141-144`) exige `users.manage` e devolve e-mail **mascarado** (`company-user.policy.ts:24-34`), com papéis e não permissões. Daí a rota própria de candidatos                                                                                                                                                                                                     |
| Última migration                 | —      | `apps/api-transportada/drizzle/20261015120000_occurrence_type_default_icons`                                                                                                                                                                                                                                                                                                                                           |

### Specs do mesmo assunto

| Spec      | Achado                                                                                                                                                                                                                                                                            | `tasks.md`                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 034       | `recipientResolver` sobre `identity_user_profiles`, recusa usuário de fora da empresa (spec.md:41, :114); sem e-mail em log (:95, :123)                                                                                                                                           | 1 aberta (T013)                                                            |
| 143       | Contatos e token (RF1 :76, RF2 :80-90); `sender_not_listed` grava sem efeito (:144-145); outbox `{messageId}` (plan.md:130-161). `plan.md:49` omite `cc` **no e-mail recebido**, não no envio                                                                                     | caixas abertas parecem defasadas (183 e 248 citam o código como existente) |
| 150       | Destinatários por envio, pelo menos um, gravados na mensagem (RF5/RF5a :38-43); `settings.manage` (RF7 :51); limite 50 no Zod e no gateway (plan.md:79-81)                                                                                                                        | fechada                                                                    |
| 183       | Uma conversa por (ocorrência, participante) só `contractor`/`driver` (D1 :68, RF6 :283); formulário P4 (:198-203)                                                                                                                                                                 | 8 abertas (WhatsApp, transcrição)                                          |
| 211       | Porta `ConversationEmailTransportPort`, "byte a byte" (RF14 :223-224, plan.md:119); participante genérico (plan.md:103)                                                                                                                                                           | 21 abertas; **não publicada** (T401)                                       |
| 248       | `spec.md:75` "endereço livre não existe" descrevia o código **antes** da 248, que criou o endereço livre só para o encaminhamento (RF11 :316-319, RF12 :320-329, D10 :470, D12 :472). D9 (:469): alarme a quem despachou. Limites 10/3600 s (endereço livre) e 30/300 s (reenvio) | 14 abertas                                                                 |
| 195       | Ações sob `occurrences.resolve`; nada vai à contratante                                                                                                                                                                                                                           | 26 abertas, não começada                                                   |
| 219 / 222 | Nada sobre e-mail                                                                                                                                                                                                                                                                 | fechadas                                                                   |

Nenhuma spec discutiu `Cc`. As emendas desta spec: 143 (`cc` na entrada), 183 (remetente `internal`), 248 (`spec.md:75`
continua valendo para a cópia) — registradas nas T3.1, T3.2 e T5.2.

## T0.1 — Conferência do levantamento

_(pendente)_

## T0.2 — Revisão de arquitetura

_(pendente)_

## Tasks

_(cada task registra aqui comando, saída resumida e commit)_
