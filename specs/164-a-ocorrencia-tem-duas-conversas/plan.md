# Plano técnico — 164

## Contexto e premissas

- Continua a 143: o trilho de e-mail (`contractor_mail_*`, token derivado, outbox, webhook Resend,
  worker com MIME bruto e DKIM) já existe e **não muda de forma**; esta spec liga a ocorrência a ele.
- O WhatsApp da empresa já existe (`whatsapp_channels`, token selado por empresa, webhook
  `/public/whatsapp/webhook` com HMAC e nonce, `meta-whatsapp-*`). Ele só aceita usuário interno
  verificado; esta spec abre uma porta estreita para contato de contratante com aceite (D6).
- Usuário já tem foto (`useCompanyUserPicture`, `CompanyUserPictureField`); motorista já tem
  telefone, e-mail e CNH na ficha; telefone de usuário já pode ser WhatsApp verificado (ADR-0063).
- Não existe `GET /trip-occurrences/:id`. As ocorrências vivem em `trip_stop_occurrences` e
  `trip_document_occurrences`, unidas na listagem por `trip-occurrence-feed.query.ts`.
- As versões do pacote exigidas pela ADR-0071 ainda não existem. A Fase 2 e a Fase 3 não dependem
  delas; da Fase 4 em diante, sim.

## Arquitetura e arquivos afetados

**Pacote (`adatechnology-packages`, fora deste repositório — ADR-0071):**

- `conversations-ui`: abas por participante, selo de canal, seletor de canal com estado da janela,
  respostas rápidas, anexos, selo de status.
- `meta-whatsapp-provider`: `sendMedia` (documento, imagem).
- `meta-whatsapp-module`: eventos de status repassados ao produto (se ainda não).
- `meta-whatsapp-contracts`: política pura da janela de 24h.

**API (`apps/api-transportada`):**

- `src/trips/` — `get-trip-occurrence.use-case.ts`, a query de detalhe ao lado de
  `trip-occurrence-feed.query.ts`, e os campos novos na listagem (RF2–RF4).
- `src/occurrence-conversation/` (módulo novo) — `domain/` (políticas: status RF14, atribuição RF9,
  decisão por botão D4, janela via pacote), `application/` (abrir conversa, enviar por canal, marcar
  lida pelo operador, respostas rápidas), `infrastructure/` (`drizzle-occurrence-conversation.repository.ts`,
  gateways para o trilho de e-mail da 143 e para o canal de WhatsApp), `presentation/` (rotas).
- `src/contractor-mail/` — contatos com os campos do RF5; os casos de uso de envio e resposta da 143
  T015 passam a ser chamados pelo gateway de e-mail do módulo novo.
- `src/whatsapp/` — o resolvedor de remetente do webhook ganha o ramo "contato de contratante com
  aceite" (D6) e encaminha para o módulo novo; status da Meta idem.

**Worker (`apps/worker-transportada`):**

- Envio por WhatsApp (texto, modelo, mídia) consumindo o outbox do módulo novo.
- Anexos que chegam: extração do MIME já gravado (e-mail) e download da mídia da Meta (WhatsApp),
  com `sha256`, para o bucket privado.
- Status: eventos do Resend e da Meta aplicados pela política RF14.

**Frontend (`apps/frontend-transportada`):**

- `modules/trip/` — rota `/ocorrencias/:id` (parse/build/navigate como `tripRoute.service.ts`),
  `TripOccurrenceDetail.page.tsx`, colunas novas em `TripOccurrenceTable.component.tsx` e no menu de
  colunas, linha clicável.
- `modules/occurrence-conversation/` — abas Contratante/Motorista montadas sobre
  `@adatechnology/conversations-ui` (ADR-0051: `styles.css` uma vez, `--cv-*` dos nossos tokens,
  `labels` dos locales), diálogo "Enviar à contratante" com prévia.
- `modules/delivery-clients/` — `ContractorContactsPanel` com os campos do RF5.
- Configurações — respostas rápidas (RF12).
- PWA do motorista — tela da conversa da ocorrência e resposta com foto (RF11).

## Contratos/API/eventos

| Método  | Rota                                                        | Permissão           |
| ------- | ----------------------------------------------------------- | ------------------- |
| GET     | `/trip-occurrences/:id`                                     | `trip.read`         |
| GET     | `/trip-occurrences/:id/conversations`                       | `trip.read`         |
| POST    | `/trip-occurrences/:id/conversations/:participant/messages` | `trip.manage`       |
| POST    | `/occurrence-conversations/:id/read`                        | `trip.read`         |
| GET     | `/occurrence-conversations/:id/mail-preview`                | `trip.manage`       |
| GET     | `/occurrence-conversations/unassigned`                      | `trip.manage`       |
| POST    | `/occurrence-conversations/unassigned/:messageId/assign`    | `trip.manage`       |
| GET/PUT | `/company-settings/quick-replies`                           | `settings.manage`   |
| GET     | `/me/trips/current/occurrences/:id/messages`                | motorista da viagem |
| POST    | `/me/trips/current/occurrences/:id/messages`                | motorista da viagem |

- `:participant` é `contractor` ou `driver`. O corpo do envio leva `channel`, `body`, `attachmentIds`
  e, no WhatsApp fora da janela, `templateKey`. Resposta de campo do motorista sem `fleet.read` omite
  as chaves (RF3).
- Eventos (outbox): `occurrence-conversation.message.send.requested` (canal no payload),
  `occurrence-conversation.status.received`, `occurrence-conversation.inbound.received`.
- Aviso ao motorista: `notification.v1` com `dedupeKey` = id da mensagem (RF11).
- Os envios por e-mail seguem com o evento da 143 (`message.send.requested`); o módulo novo só grava a
  mensagem de conversa que aponta para ela.

## Dados, migration e rollback

Migration **aditiva**, sem apagar coluna nem dado:

- `contractor_contacts` + `name`, `role_label`, `phone`, `types text[]` (CHECK no conjunto fechado),
  `occurrence_stages text[]`, `whatsapp_opt_in_at`, `whatsapp_opt_in_by_user_id`, `preferred_channel`.
  Preenchimento: `types` a partir de `receives_occurrences`/`can_decide`; `occurrence_stages` com os
  três grupos. Índice por `(company_id, phone)` para o webhook.
- `occurrence_conversations` — `id`, `company_id`, `occurrence_kind` (`stop` | `document`),
  `occurrence_id`, `participant` (`contractor` | `driver`), `contractor_id` / `driver_user_id`,
  `status`, timestamps. `unique(company_id, occurrence_kind, occurrence_id, participant)`. FK composta
  com `company_id`, como o resto do schema.
- `occurrence_conversation_messages` — `id`, `company_id`, `conversation_id`, `channel`,
  `direction`, `author_user_id` | `contractor_contact_id` | `driver_user_id` (CHECK: exatamente um
  conforme a direção), `body_text`, `status`, `status_times jsonb`, `mail_message_id` (FK para
  `contractor_mail_messages`), `provider_message_id` (id opaco da Meta, sem FK para o schema
  `meta_whatsapp`), `created_at`. `unique(company_id, channel, provider_message_id)` para o status
  idempotente.
- `occurrence_conversation_attachments` — objeto no bucket privado, `sha256`, `size_bytes`,
  `content_type`, `direction`, `message_id`.
- `occurrence_conversation_reads` — `(company_id, conversation_id, user_id, last_read_message_id)`.
- `occurrence_conversation_unassigned` — mensagem recebida sem conversa certa (RF9).
- `company_quick_replies` — `company_id`, `audience`, `text` (≤ 500), `position`, `active`.

Rollback: `rollback.sql` que dropa as tabelas novas e as colunas novas de `contractor_contacts`,
nessa ordem. Nenhum dado anterior à 164 se perde, porque nenhuma coluna existente muda de sentido.
`make migration-test` roda migration e rollback.

## Segurança e tenant

- `companyId` sempre do contexto autenticado; em webhook, do canal resolvido (`phone_number_id` →
  empresa) e nunca do corpo.
- Contatos com telefone são dados pessoais: aceite registrado com autor e data (D6); motorista só
  com `fleet.read` (RF3).
- Anexos por URL temporária; `content_type` conferido pelo conteúdo, não pela extensão.
- Nenhum log com telefone, e-mail, corpo, assunto ou nome de arquivo (contrato por texto de fonte).
- Webhook do WhatsApp: a porta nova aceita **só** número de contato com aceite da empresa do canal;
  todo o resto segue `unknown_phone`.

## Idempotência e concorrência

- Envio: `Idempotency-Key` do cliente → id da mensagem; o outbox é gravado na mesma transação.
- Status: único por `(canal, provider_message_id)`; a política só avança.
- Decisão da taxa por botão: mesma transação e `FOR UPDATE` da 143 T020; a segunda decisão vira
  `late`.
- Recebida duplicada da Meta: nonce do webhook já existente + único por `provider_message_id`.

## Observabilidade

- Contadores por canal: enviadas, entregues, lidas, falhas por motivo tipado, recebidas não
  atribuídas, janela fechada no envio.
- Logs estruturados só com ids e resultado. Falha de provedor com o código tipado (`window_closed`,
  `template_rejected`, `provider_unauthorized`, `attachment_too_large`).

## Estratégia de testes

- Políticas puras por tabela: status (RF14), atribuição (RF9), decisão por botão (D4), tipos de
  contato → flags derivadas (RF5).
- Contratos de rota com tenant e permissão (incluindo a ausência das chaves do motorista sem
  `fleet.read`) e o separador.
- Integração (`test/integration/*.integration.ts`, rodando com
  `bun --env-file=../../.env.test run test:integration`): listagem com os campos novos numa consulta;
  webhook de status até `read`; botão até `approved`.
- Frontend: contratos de serviço puro (rota, mapeamento de status para selo, limite de anexo) e
  evidência da `data-tables.md` § 6 para as colunas novas.
- Smoke Playwright: linha → detalhe; envio pela aba; viewport de celular.
- Todo teste novo entra na lista explícita do `package.json` da app.

## Riscos

- **Pacote atrasa:** a conversa fica sem tela. Mitigação: Fases 2 e 3 entregam valor sozinhas
  (detalhe, colunas, contato do motorista, contatos com tipos).
- **Aprovação de modelo pela Meta:** pode levar dias e ser recusada. Mitigação: submeter os modelos
  na Fase 0; o e-mail funciona sem eles.
- **Número de contato ligado a duas contratantes:** tratado pela fila de não atribuídas (RF9), nunca
  por palpite.
- **Contato sem confirmação de leitura no WhatsApp:** a tela para em "entregue" (D7); não é defeito.
