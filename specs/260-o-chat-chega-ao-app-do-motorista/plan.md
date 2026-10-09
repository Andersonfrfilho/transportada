# Plano técnico — 260

## Contexto e premissas

- A API da conversa do motorista existe (spec 183 T601/T604/T702): lista, mensagens, leitura, upload.
  Só a tela do `/me` está no PWA do painel. O SDK (`adatechnology-packages`) já tem o canal `app`, o assunto
  genérico (`conversation-module`) e o `conversations-ui`; **falta a visão do participante em celular**, e
  ela nasce lá (ADR-0072; decisão do dono, 2026-10-09), não copiada para o app.
- Publicação em etapas (ADR-0081 §9): **app tolerante → API → telas**. O app novo lê os campos de assunto
  como opcionais até a API publicar; a API publica com a rota antiga intacta.
- `occurrence_conversations` hoje: `occurrence_kind` (`stop`/`document`) + `occurrence_id` NOT NULL,
  participante `contractor`/`driver`. Conversa de nota e de viagem **não têm ocorrência**.

## Arquitetura e arquivos afetados

**Fase 1 — a visão do participante no SDK** — repo `~/Documents/personal/adatechnology-packages`
(PR próprio, changeset, tag `rc`; **nenhuma tela de conversa nasce em `frontend-driver`**, skill `adatechnology-ui` §3):

- `packages/frontend/conversations-ui/src/participant/` (export novo `@adatechnology/conversations-ui/participant`,
  para o `frontend-driver` não puxar o workspace de operador no bundle do PWA):
  `ParticipantConversations.tsx` (a tela composta: lista + conversa, recebe só `api`, `labels`,
  `subjectGroups`, `theme`), `ParticipantInbox.tsx` (seções por assunto, "Espera sua resposta", filtros,
  selo), `ParticipantThread.tsx` (cartão do assunto via slot `renderSubjectCard`, bolhas, `StatusTicks`,
  `aria-live`), `useParticipantInbox.ts`, `participantGrouping.ts` (**puro**: agrupa por `subjectType`,
  ordena, `awaitingParticipant`), `participant.constant.ts`, `participantLabels.ts` + testes.
  Reusa `MessageBubble`, `MessageComposer`, `AudioRecorderButton`, `StatusTicks`, respostas rápidas.
  Estilo por `.cv-*` + `className`, **sem Tailwind**; alvo de toque ≥ 44 px; layout de uma coluna.
- Capacidade por ausência de prop: sem `onRecordAudio` não há microfone; sem `renderSubjectCard` o
  cartão não desenha; sem `onOpenSubject` não há botão "falar com o escritório".
- `ConversationsApi` (já existe) ganha, se faltar, os métodos que a visão pede — **no pacote**:
  `fetchParticipantInbox`, `markRead(subject)`, `openConversation(subject)`. Tipos em `conversation-contracts`
  (`ParticipantConversationSummary { subjectType, subjectId, subjectLabel, lastMessageAt,
lastMessagePreview?, unreadCount, awaitingParticipant, status }`) — **nunca redeclarados no produto**.
- Alinhar versão: `frontend-transportada` e `frontend-client` estão em `conversations-ui@0.3.1`, o pacote
  em `0.4.2`; sobem os **três** consumidores juntos (skill: versão diferente reintroduz divergência).

**Fase 1b — a fiação no app do motorista** — `apps/frontend-driver` (~100–150 linhas, sinal de alarme acima disso):

- `src/modules/conversation/pages/DriverConversations.page.tsx`: monta `<ParticipantConversations>`;
  `shared/driverConversationsApi.service.ts` (o `ConversationsApi` sobre `/me/...`, token pelo
  `getKeycloakAuthProvider` como o `notificationClient`), `shared/driverSubjectGroups.constant.ts`
  (`occurrence`/`document`/`trip` + ícone + ordem), `locales/conversation.locale.json` + `.en`.
- Offline (D5) **fica no app**, porque a fila é do app: `conversationOutbox.service.ts` liga a fila
  existente e entrega ao pacote o estado `queued` pela prop de envio.
- `src/modules/shared/driverRoute.service.ts`: `DriverRouteSection` ganha `'conversations'` e a rota
  `/conversas[/:subjectType/:subjectId]`; `main.tsx` monta a página; a aba ganha o selo; o item do sino
  `trip.conversation-message` navega à conversa.

**Fase 2 — assunto na conversa (API + migration)** — `apps/api-transportada`:

- `database/occurrence-conversation.schema.ts`: colunas **aditivas** `subject_kind` (`occurrence` |
  `document` | `trip`, default `occurrence`), `subject_id` (uuid, nulo para ocorrência = usa
  `occurrence_id`), `trip_id` (uuid); `occurrence_id` passa a nullable com `check`: assunto `occurrence`
  exige `occurrence_id`; `document` exige `subject_id` = `nfe_document_id`; `trip` exige `trip_id`.
  Unicidade: `(company_id, subject_kind, coalesce(subject_id, occurrence_id, trip_id), participant)`.
- `occurrence-conversation/` (módulo mantém o nome; renomear é custo sem ganho): `driver-conversation.*`
  generalizam `findMyOccurrence` → `findMySubject`; rotas `/me/trips/current/conversations` (lista com
  `subjectType`, `subjectId`, `subjectLabel`, `tripId`, `awaitingDriver`), `/me/trips/current/conversations/:subjectType/:subjectId/messages|read|uploads`.
  Rotas antigas `.../occurrences/:id/...` **continuam** (o painel antigo e o app em cache as usam).
- `notification`: `trip.conversation-message` carrega `subjectType`/`subjectLabel` (sem corpo).

**Fase 3 — o escritório abre e vê** — `apps/frontend-transportada`: botão "Falar com o motorista" na nota
(detalhe da viagem) e na viagem; a conversa do assunto na aba do motorista, mesma `ConversationThread`.

## Contratos/API/eventos

```text
GET  /v1/me/trips/current/conversations
  → { data: [{ subjectType, subjectId, subjectLabel, tripId, lastMessageAt, lastMessagePreview?,
               unreadCount, awaitingDriver, status: 'open'|'closed' }] }
GET  /v1/me/trips/current/conversations/:subjectType/:subjectId/messages   (trip.read)
POST /v1/me/trips/current/conversations/:subjectType/:subjectId/messages    (trip.report, Idempotency-Key)
POST /v1/me/trips/current/conversations/:subjectType/:subjectId/messages/read
POST /v1/me/trips/current/conversations/:subjectType/:subjectId/uploads
POST /v1/me/trips/current/conversations/open                                (assunto document|trip, só motorista na tripulação)
Erros: 404 CONVERSATION_NOT_FOUND (assunto alheio) · 409 CONVERSATION_CLOSED · 403 DRIVER_NOT_REGISTERED · 429.
Envelope { data } / { error:{code,message} } como o resto da API; OpenAPI gerado das rotas (Scalar).
```

`awaitingDriver` = última mensagem da conversa é `outbound` (operação) e posterior à última do motorista.
`subjectLabel` é montado no servidor ("NF 4521 · Casa Verde", "Avaria · parada 3", "Viagem 09/10") — o
app não compõe texto de domínio.

## Dados, migration e rollback

Migration **aditiva**: três colunas + checks + índice único novo; backfill `subject_kind='occurrence'`,
`trip_id` preenchido pela viagem da ocorrência. `rollback.sql` derruba checks/índice/colunas **só se**
não houver linha com `subject_kind <> 'occurrence'` (senão aborta e pede decisão). Sem ENUM nativo
(VARCHAR + `inList`). Roda em `make migration-test`.

## Segurança e tenant

- `companyId` do contexto; ficha do motorista pela tripulação da viagem (BOLA): conversa de nota/viagem de
  outra viagem → `404`, nunca `403` (não confirma existência).
- Corpo de mensagem fora de log/evento/Sentry; anexo por URL assinada de vida curta (já é a 183).
- Rate limit próprio para `open` (criar conversa) e herdado dos baldes de envio/upload da 183.
- A conversa **não decide** (183 D4): teste de mutação garante que nenhum caminho de mensagem escreve em
  tratativa/taxa/acerto.

## Idempotência e concorrência

`Idempotency-Key` por mensagem (já existente); `open` é idempotente por (assunto, participante) — devolve
a conversa existente. Dois dispositivos do mesmo motorista: leitura marcada por assunto é idempotente.
Fila offline reenvia com a **mesma** chave; o servidor devolve a resposta salva.

## Observabilidade

Log estruturado por conversa (`conversationId`, `subjectType`, `traceId`; sem texto). Beacon
`driver_conversation_opened`/`driver_conversation_send_failed` no `clientDiagnostics` do app, para medir
o uso e a falha de envio em campo antes de remover a tela antiga.

## Estratégia de testes

Contrato antes da implementação. App: `conversationSubject.service` (agrupamento, ordem, `awaitingDriver`),
rascunho por conversa, fila offline sem duplicar, acessibilidade da lista (role/label). API: contrato das
rotas novas (negativos de BOLA/tenant/encerrada), integração da migration e do `open`. **Lista de testes
explícita no `package.json` de cada app** (teste novo não roda se não entrar lá). Smoke Playwright do
`frontend-driver`: abrir pelo sino, responder, responder offline. Integração da API roda **o comando
`run test:integration` com `--env-file`** (CLAUDE.md raiz) — contrato verde não prova a integração.

## Riscos

- **Alinhar versões do pacote** (0.3.1 → 0.4.2) pode mudar o painel e o portal: subir os três juntos, com
  smoke dos dois antes de publicar; publicação do pacote = `main` → CI → `publish.yml`, só com revisão `opus`.
- **A visão do participante virar um segundo workspace inchado**: limite de ~150 linhas por página de
  produto e export separado (`/participant`) para não pesar o bundle do PWA do motorista.
- **Conversa de nota vira bagunça** (muita conversa por viagem): a lista agrupa e recolhe encerradas; o
  escritório é guiado a reabrir a existente (`open` idempotente).
- **Migration em tabela quente**: aditiva, sem reescrita; o check novo é `NOT VALID` + `VALIDATE`.
- **App antigo em cache** chamando rota velha: as rotas `.../occurrences/:id/...` ficam até a Fase 10 da 189.
