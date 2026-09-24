# Plano técnico — 183

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
- O SDK chega pronto com o que a ADR-0072 lista (spec D3). Antes de usar, a Fase 1 confere o
  contrato da versão instalada nos `.d.ts` e para se faltar alguma coisa; a Fase 2 e a Fase 3 não
  dependem do pacote.

## Arquitetura e arquivos afetados

**Pacote (`adatechnology-packages`, entregue pronto — ADR-0072; aqui só se consome):**

- `conversations-ui`: abas por participante, selo de canal, seletor de canal com estado da janela,
  respostas rápidas, anexos, player e gravador de áudio, transcrição exibida, selo de status.
- `meta-whatsapp-provider`: envio de mídia (documento, imagem, áudio).
- `meta-whatsapp-module`: eventos de status repassados ao produto.
- `meta-whatsapp-contracts`: política pura da janela de 24h.

**API (`apps/api-transportada`):**

- `src/trips/` — `get-trip-occurrence.use-case.ts`, a query de detalhe ao lado de
  `trip-occurrence-feed.query.ts`, e os campos novos na listagem (RF2–RF4).
- `src/occurrence-conversation/` (módulo novo) — `domain/` (políticas: status RF14, atribuição RF9,
  "a conversa não decide" D4, janela), `application/` (abrir conversa, enviar por canal, marcar
  lida pelo operador, respostas rápidas), `infrastructure/` (`drizzle-occurrence-conversation.repository.ts`,
  gateways para o trilho de e-mail da 143 e para o canal de WhatsApp), `presentation/` (rotas).
- `src/contractor-mail/` — contatos com os campos do RF5; os casos de uso de envio e resposta da 143
  T015 passam a ser chamados pelo gateway de e-mail do módulo novo.
- `src/whatsapp/` — o resolvedor de remetente do webhook ganha o ramo "contato de contratante com
  aceite" (D6) e encaminha para o módulo novo; status da Meta idem. Mensagem de motorista só é
  desviada dos fluxos de comando (`whatsapp-commands/`) quando responde a uma mensagem da conversa
  (RF9, ramo do motorista).
- Linha do tempo (RF19): uma query que une eventos da ocorrência e das duas conversas, com o ator.

**Worker (`apps/worker-transportada`):**

- Envio por WhatsApp (texto, modelo, mídia) consumindo o outbox do módulo novo.
- Anexos que chegam: extração do MIME já gravado (e-mail) e download da mídia da Meta (WhatsApp),
  com `sha256`, para o bucket privado.
- Status: eventos do Resend e da Meta aplicados pela política RF14.
- Expiração da janela (RF20): job agendado por conversa para "fim da janela − antecedência", com
  chave idempotente (conversa + início da janela); reagendado quando uma mensagem recebida reabre a
  janela.
- Áudio recebido: gravado como anexo; depois, transcrito pela porta `speech-to-text.port.ts`
  (RF18) — provedor em ADR própria, desligável por empresa, falha sem derrubar a mensagem.

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

**Portal (`apps/frontend-client`, ADR-0073):**

- `modules/occurrences/` — a tela "Ocorrências" **que já existe** (spec 164) ganha a conversa sobre as
  peças do `conversations-ui`, ao lado do `DecisionForm` da 164 (que continua sendo a decisão), com
  anexo por seletor de arquivo e player de áudio. Tokens de balão copiados por valor do painel, como
  os outros; estilo pelo `classNames` das peças, sem Tailwind.
- Sem gravação de áudio e sem câmera: a `Permissions-Policy` não muda.

## Contratos/API/eventos

| Método  | Rota                                                          | Permissão           |
| ------- | ------------------------------------------------------------- | ------------------- |
| GET     | `/trip-occurrences/:id`                                       | `fleet.read`        |
| GET     | `/trip-occurrences/:id/conversations`                         | `fleet.read`        |
| POST    | `/trip-occurrences/:id/conversations/:participant/messages`   | `trip.manage`       |
| POST    | `/occurrence-conversations/:id/read`                          | `fleet.read`        |
| GET     | `/occurrence-conversations/:id/mail-preview`                  | `trip.manage`       |
| GET     | `/occurrence-conversations/unassigned`                        | `trip.manage`       |
| POST    | `/occurrence-conversations/unassigned/:messageId/assign`      | `trip.manage`       |
| GET/PUT | `/company-settings/quick-replies`                             | `settings.manage`   |
| GET     | `/client/me/occurrences` (existente, 164) + `conversationRef` | recorte do portal   |
| GET     | `/client/me/occurrence-conversations/:ref`                    | recorte do portal   |
| POST    | `/client/me/occurrence-conversations/:ref/messages`           | recorte do portal   |
| POST    | `/client/me/occurrence-conversations/:ref/read`               | recorte do portal   |
| GET     | `/me/trips/current/occurrences/:id/messages`                  | motorista da viagem |
| POST    | `/me/trips/current/occurrences/:id/messages`                  | motorista da viagem |

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
  `public_ref` (aleatório, único, só para o portal — RF21), `status`, timestamps. `unique(company_id, occurrence_kind, occurrence_id, participant)`. FK composta
  com `company_id`, como o resto do schema.
- `occurrence_conversation_messages` — `id`, `company_id`, `conversation_id`, `channel`
  (`email` | `whatsapp` | `app` | `portal`), `direction`, `author_user_id` | `contractor_contact_id` |
  `driver_user_id` (CHECK: exatamente um conforme a direção; mensagem da contratante pelo portal usa
  `author_user_id` com a conta do portal), `body_text`, `status`, `status_times jsonb`, `mail_message_id` (FK para
  `contractor_mail_messages`), `provider_message_id` (id opaco da Meta, sem FK para o schema
  `meta_whatsapp`), `created_at`. `unique(company_id, channel, provider_message_id)` para o status
  idempotente.
- `occurrence_conversation_attachments` — objeto no bucket privado, `sha256`, `size_bytes`,
  `content_type`, `duration_ms` (áudio), `direction`, `message_id`.
- `occurrence_conversation_reads` — `(company_id, conversation_id, user_id, last_read_message_id)`.
- `contractor_mail_messages` + `from_display_name` (nome do cabeçalho `From`, gravado pelo worker ao
  ler o MIME) — é o que o RF16 mostra para remetente fora dos contatos. Nenhum log leva esse campo.
- `occurrence_conversation_unassigned` — mensagem recebida sem conversa certa (RF9).
- `company_quick_replies` — `company_id`, `audience`, `text` (≤ 500), `position`, `active`.
- `occurrence_conversation_settings` (por empresa) — `whatsapp_expiry_notice_minutes` (padrão 30),
  `notify_driver_on_expiry` (padrão `true`), `notify_contractor_on_expiry` (padrão `false`).
- `occurrence_conversations` + `default_channel` e `window_expiry_notice_sent_for` (início da janela
  cujo aviso já saiu).

Rollback: `rollback.sql` que dropa as tabelas novas e as colunas novas de `contractor_contacts` e
de `contractor_mail_messages`, nessa ordem. Nenhum dado anterior à 183 se perde, porque nenhuma coluna existente muda de sentido.
`make migration-test` roda migration e rollback.

A transcrição (T706) tem migration própria, depois da ADR do provedor: texto, provedor, idioma e
horário ligados ao anexo, e o interruptor por empresa. Ela fica fora desta migration de propósito,
para não criar coluna de uma decisão que ainda não existe.

## Segurança e tenant

- `companyId` sempre do contexto autenticado; em webhook, do canal resolvido (`phone_number_id` →
  empresa) e nunca do corpo.
- Contatos com telefone são dados pessoais: aceite registrado com autor e data (D6); motorista só
  com `fleet.read` (RF3).
- Anexos por URL temporária; `content_type` conferido pelo conteúdo, não pela extensão.
- Nenhum log com telefone, e-mail, corpo, assunto ou nome de arquivo (contrato por texto de fonte).
- Webhook do WhatsApp: a porta nova aceita **só** número de contato com aceite da empresa do canal;
  todo o resto segue `unknown_phone`.
- Portal: o serializador das rotas `/client/**` é outro, sem nenhum campo do motorista nem do
  funcionário, e o aviso por e-mail ao usuário do portal não leva o corpo da mensagem (RF21).

## Idempotência e concorrência

- Envio: `Idempotency-Key` do cliente → id da mensagem; o outbox é gravado na mesma transação.
- Status: único por `(canal, provider_message_id)`; a política só avança.
- Nenhuma escrita desta spec toca a tratativa, a taxa ou o acerto (D4); a concorrência da decisão é
  a da spec 164.
- Recebida duplicada da Meta: nonce do webhook já existente + único por `provider_message_id`.

## Observabilidade

- Contadores por canal: enviadas, entregues, lidas, falhas por motivo tipado, recebidas não
  atribuídas, janela fechada no envio.
- Logs estruturados só com ids e resultado. Falha de provedor com o código tipado (`window_closed`,
  `template_rejected`, `provider_unauthorized`, `attachment_too_large`).

## Estratégia de testes

- Políticas puras por tabela: status (RF14), atribuição (RF9), tipos de contato → flags derivadas
  (RF5), identificação do remetente (RF16), expiração (RF20).
- "A conversa não decide" (D4): mensagem de cada canal não muda a tratativa.
- Contratos de rota com tenant e permissão (`fleet.read` no detalhe; motorista e agregado sem acesso)
  e o separador.
- Integração (`test/integration/*.integration.ts`, rodando com
  `bun --env-file=../../.env.test run test:integration`): listagem com os campos novos numa consulta;
  webhook de status até `read`; botão até `approved`.
- Frontend: contratos de serviço puro (rota, mapeamento de status para selo, limite de anexo) e
  evidência da `data-tables.md` § 6 para as colunas novas.
- Smoke Playwright: linha → detalhe; envio pela aba; viewport de celular.
- Todo teste novo entra na lista explícita do `package.json` da app.

## Riscos

- **A versão do pacote não traz algo que a ADR-0072 lista:** a T101 para e pergunta, em vez de
  contornar no produto (ADR-0051). Fases 2 e 3 entregam valor sozinhas enquanto isso.
- **Fluxos de comando do motorista (spec 144):** uma regra de desvio errada tiraria mensagens dos
  fluxos. Mitigação: só desvia com `context.id` de mensagem da conversa, com teste por ramo.
- **Formato do áudio gravado no navegador:** pode não ser aceito pelo WhatsApp; a conversão no worker
  e a lista de formatos se confirmam na T705.
- **Aprovação de modelo pela Meta:** pode levar dias e ser recusada. Mitigação: submeter os modelos
  na Fase 0; o e-mail funciona sem eles.
- **Número de contato ligado a duas contratantes:** tratado pela fila de não atribuídas (RF9), nunca
  por palpite.
- **Contato sem confirmação de leitura no WhatsApp:** a tela para em "entregue" (D7); não é defeito.
