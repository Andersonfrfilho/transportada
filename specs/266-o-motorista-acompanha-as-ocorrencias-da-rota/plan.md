# Plano — 266 O motorista acompanha as ocorrências da rota

## Contexto e premissas

O levantamento contra `origin/staging` (2026-10-15) está em [`evidence.md`](evidence.md) § Levantamento. Os fatos que
moldam o plano:

- **API:** não há estado de "resolvida" fora da tratativa, e a tratativa só existe para algumas ocorrências. O CHECK
  terminal bloqueia reabrir. O motorista não tem rota que liste ocorrências, nem que sirva foto, assinatura ou anexo de
  ocorrência. `registeredOccurrences` só traz as que abriram retorno com a contratante (248). Nenhuma mudança de estado
  notifica alguém.
- **App do motorista:** não existe entidade de ocorrência no cliente. "Enviada", "na fila" e "recusada" vêm da fila
  offline e de `sentReportKeys`, só da sessão, e se perdem ao recarregar. `OPENABLE_SUBJECT_TYPES` exclui `occurrence`.
  Faltam os ícones `share`, `paperclip` e `arrow-left`. Não há `navigator.share`.
- **Painel:** o veredito é **não pronto**. Não há resolver com observação nem reabrir, e a tratativa aparece só para
  `source === 'document'`. Os guardas de resposta são estritos: um `case.status` ou um `kind` de linha do tempo
  desconhecido derruba a lista e a linha do tempo inteiras (`tripOccurrenceFeedClient.service.ts:148,372`,
  `tripOccurrenceTimeline.validation.ts:49`). **Por isso a Fase 1 vai a produção antes da API.**

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Camada         | Arquivo (novo ou alterado)                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema         | `src/database/trip.schema.ts`: tabela `trip_occurrence_resolution_events` + migration Drizzle                                                                                                                                                                    |
| Domínio        | `src/trips/domain/occurrence-resolution.policy.ts` (pura): estado do andamento a partir de (cancelada?, eventos)                                                                                                                                                 |
| Domínio        | `src/trips/domain/occurrence-resolution.error.ts`: `OccurrenceAlreadyResolvedError` (409), `OccurrenceNotResolvedError` (409), `OccurrenceCancelledError` (409); códigos em `shared/errors/codes.ts`                                                             |
| Infra          | `src/trips/infrastructure/drizzle-occurrence-resolution.repository.ts`: inserir evento, último evento por ocorrência (em lote)                                                                                                                                   |
| Infra          | `drizzle-occurrence-case.repository.ts` (`applyTransition`, :152-258): o insert do evento da tratativa devolve o id; transição terminal grava `resolved` (`system`) na mesma transação                                                                           |
| Aplicação      | `resolve-occurrence.use-case.ts` (escritório), `list-driver-trip-occurrences.use-case.ts`, `find-driver-trip-occurrence.use-case.ts`; a reabertura entra na resposta existente (`reply-my-subject-conversation.use-case.ts` e `driver-conversation.use-case.ts`) |
| Apresentação   | `occurrence-resolution.routes.ts` (escritório), `me-trip-occurrence.routes.ts` (motorista, prefixo `route-occurrences`)                                                                                                                                          |
| Linha do tempo | `occurrence-timeline.policy.ts`: fontes `resolution.resolved` e `resolution.reopened`                                                                                                                                                                            |
| Feed           | o item do feed ganha `resolution: { state, at, actorKind } \| null` e o filtro `resolutionState`                                                                                                                                                                 |
| Notificação    | `notification-catalog.constant.ts`: `trip.occurrence-resolved` (motorista) e `trip.occurrence-reopened` (escritório)                                                                                                                                             |

### Painel (`apps/frontend-transportada`)

- Fase 1 (tolerância): `tripOccurrenceFeedClient.service.ts`, com `case.status` desconhecido degradando para
  `unknown`; e `tripOccurrenceTimeline.validation.ts`, com `kind` desconhecido descartado com aviso em vez de reprovar a
  resposta.
- Fase 3: `OccurrenceResolutionPanel.component.tsx`, novo, para nota **e** parada no detalhe e na linha expandida da
  tabela; mutation `useResolveOccurrence.query.ts`; selo "Reaberta pelo motorista" e filtro no feed; descrição dos
  eventos novos em `describeOccurrenceTimelineEvent`; locales.

### App do motorista (`apps/frontend-driver`)

- `driverRoute.service.ts`: seções `occurrences` (`/ocorrencias`) e `occurrence` (`/ocorrencias/:kind/:id`) com
  `parse`/`build`/`navigate`, no molde da conversa.
- `shared/driverTripOccurrence.types.ts` + `driverTripOccurrenceResponse.validation.ts` + cliente e query
  `useDriverTripOccurrences.query.ts`. O retrato vai para um store novo do IndexedDB (`trip-occurrences`, **v5**).
- `shared/routeOccurrenceView.service.ts` (pura): junta o servidor com a fila local (`queued`/`rejected`) e calcula
  contagens, grupos e filtros.
- Componentes: `DriverOccurrenceAlertButton` no `DriverShellHeader`, `DriverOccurrenceBadgeIcon` (ícone com selos),
  fileira na `DriverStopCard` (atualiza o golden), páginas `DriverRouteOccurrences.page.tsx` e
  `DriverOccurrenceDetail.page.tsx`.
- `shared/driverFileShare.service.ts`: `navigator.canShare({ files })` → `navigator.share`; senão `saveDriverFile`.
- Conversa: a linha leva a `/conversas/occurrence/:id` quando a conversa existe. Ocorrência resolvida → composer
  travado, botão "Reabrir" e o primeiro envio com `reopen: true` (T4.8 confere se o `conversations-ui` deixa passar o
  flag no envio; se não deixar, a mudança vai **no pacote**, com changeset, nunca por cópia).
- Viagem finalizada: o detalhe responde 404 e o app mostra "Viagem encerrada".
- `notificationDestination.service.ts`: `trip.occurrence-resolved` → detalhe.
- Ícones `share`, `paperclip`, `arrow-left` em `components/ui/icon.tsx`.

## Contratos/API/eventos

### Escritório

`POST /trip-occurrences/:kind/:id/resolution` — `kind` ∈ `document | stop`; permissão `occurrences.resolve`.

```ts
// corpo
{ note: string /* 1..2000, obrigatória */ }
// 201
{ data: { occurrenceId, occurrenceKind, state: 'resolved', resolvedAt, note } }
// 404 TRIP_OCCURRENCE_NOT_FOUND (outra empresa também) · 409 OCCURRENCE_ALREADY_RESOLVED · 409 OCCURRENCE_CANCELLED
```

O feed (`GET /trip-occurrences`) passa a trazer `resolution` por item e aceita `resolutionStateIn=open,resolved,reopened`.
`reopened` é `open` com último evento `reopened`.

A linha do tempo ganha dois `kind`:

```ts
{ kind: 'resolution.resolved', at, actorKind: 'internal' | 'system', actorName?, note }
{ kind: 'resolution.reopened', at, actorKind: 'driver', actorName?, messageId }
```

### Motorista (`trip.read`; reabrir pede `trip.report`; só a viagem atual do token)

`GET /me/trips/current/route-occurrences`

```ts
{
  data: Array<{
    id: string
    kind: 'document' | 'stop'
    stopId: string
    stopSequence: number
    documentId: string | null
    documentNumber: string | null
    type: { id: string; name: string; iconName: string | null }
    recordedAt: string
    recordedByMe: boolean
    state: 'open' | 'resolved' | 'cancelled'
    resolution: { at: string; note: string; actorKind: 'internal' | 'system' } | null
    reopenedAt: string | null
    conversation: { exists: boolean } // o não lido continua vindo de conversationDigests
    documentCount: number
  }>
}
```

`GET /me/trips/current/route-occurrences/:kind/:id`: o item acima mais `note` (observação registrada), `photos[]`,
`signature`, `attachments[]` (anexos do chat com `messageId`, nome, tipo e tamanho) e `timeline[]`, com os eventos
`recorded`, `photo`, `cancelled` e `resolution.*`. **`case.transition` não entra** (informação comercial, ADR-0045 §6).
Os links assinados (5 min) vêm em `GET /me/trips/current/route-occurrences/:kind/:id/attachments/:objectId/url` sob
demanda; o retrato offline guarda só metadado. O prefixo é `route-occurrences` porque o roteador usa o primeiro match
dinâmico (`router.service.ts:708-727`) e `/me/trips/current/occurrences/:id/messages` já existe. Lista, detalhe e links
valem só com a viagem **não finalizada**; depois, 404.

Estado exibido: `cancelled_at` preenchido (só ocorrência de nota; a de parada não cancela) → `cancelled`; sem evento →
`open`; último `resolved` → `resolved`; último `reopened` → `open` com `reopenedAt`. A tratativa cancelada pela própria
ação `cancel` resolve a ocorrência como `system`, mas a ocorrência **não** fica cancelada.

`resolution.note` para `actorKind = 'system'` é uma **frase fixa** por status terminal da tratativa (`closed` →
"Encerrada pelo escritório", `returned_to_warehouse` → "Mercadoria devolvida ao armazém", `cancelled` → "Tratativa
cancelada pelo escritório"), nunca a nota interna. Para `internal` é a observação do operador.

Reabrir **não tem rota própria**. A resposta existente do motorista na conversa da ocorrência
(`POST /me/trips/current/occurrences/:id/messages`) ganha `reopen?: true` no corpo:

```ts
{ /* corpo atual da resposta */ reopen?: true }
// Dentro de replayOrRun.run, na mesma transação: trava a ocorrência (FOR NO KEY UPDATE) e lê o estado.
// cancelada → 409 OCCURRENCE_CANCELLED
// reopen e resolvida → insere `reopened` com conversation_message_id
// reopen e não resolvida → 409 OCCURRENCE_NOT_RESOLVED
// sem reopen → grava a mensagem como hoje, sem evento
```

`reopen` entra na impressão digital da idempotência. Criação da conversa (`findOrCreateDriverConversation`),
`Idempotency-Key` e regras de ajudante são herdadas. Vale nos dois use cases (`reply-my-subject-conversation` e
`driver-conversation`).

### Notificações

| Template                   | Para quem                                                                                                           | Payload (sem corpo de mensagem)                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `trip.occurrence-resolved` | a equipe inteira da viagem (motorista e ajudantes); **não** se a viagem já terminou                                 | `{ subjectType: 'occurrence', occurrenceKind, subjectId, typeName }` |
| `trip.occurrence-reopened` | quem gravou o último `resolved` (`actor_user_id`); se foi `system`, o `actor_user_id` do evento da tratativa ligado | `{ occurrenceKind, occurrenceId, tripId, typeName }`                 |

Sem `note` em nenhum payload. Se o destinatário já não tem `occurrences.resolve` na empresa, não há notificação (o filtro
do feed cobre) e fica um log `info` sem texto. A permissão `occurrences.resolve` já existe
(`authorization.policy.ts:115`): reusa, sem seed.

## Dados, migration e rollback

```sql
CREATE TABLE trip_occurrence_resolution_events (
  id uuid PRIMARY KEY,                       -- v7
  company_id uuid NOT NULL REFERENCES companies(id),
  document_occurrence_id uuid NULL,          -- FK (company_id, x) -> trip_document_occurrences (company_id, id) ON DELETE CASCADE
  stop_occurrence_id uuid NULL,              -- FK (company_id, x) -> trip_stop_occurrences (company_id, id) ON DELETE CASCADE
  kind varchar(16) NOT NULL CHECK (kind IN ('resolved','reopened')),
  actor_kind varchar(16) NOT NULL CHECK (actor_kind IN ('internal','driver','system')),
  actor_user_id uuid NULL,                   -- NULL só para system
  case_event_id uuid NULL,                   -- FK (company_id, id) -> trip_occurrence_case_events; só para system
  note text NULL,                            -- resolved: observação do operador ou frase fixa do status
  conversation_message_id uuid NULL,         -- obrigatório para reopened
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(document_occurrence_id, stop_occurrence_id) = 1),
  CHECK ((actor_kind = 'system') = (actor_user_id IS NULL)),
  CHECK ((actor_kind = 'system') = (case_event_id IS NOT NULL)),
  CHECK (kind <> 'resolved' OR note IS NOT NULL),
  CHECK (kind <> 'resolved' OR actor_kind <> 'internal' OR length(btrim(note)) > 0),
  CHECK (kind <> 'reopened' OR (actor_kind = 'driver' AND conversation_message_id IS NOT NULL))
);
CREATE INDEX ... ON trip_occurrence_resolution_events (company_id, document_occurrence_id, created_at DESC, id) WHERE document_occurrence_id IS NOT NULL;
CREATE INDEX ... ON trip_occurrence_resolution_events (company_id, stop_occurrence_id, created_at DESC, id) WHERE stop_occurrence_id IS NOT NULL;
CREATE UNIQUE INDEX ... ON trip_occurrence_resolution_events (company_id, case_event_id) WHERE case_event_id IS NOT NULL;
CREATE UNIQUE INDEX ... ON trip_occurrence_resolution_events (company_id, conversation_message_id) WHERE conversation_message_id IS NOT NULL;
```

A migration é **aditiva** (tabela nova). Rollback: `DROP TABLE`, sem perda de dado de outra feature. O backfill não é
feito: tratativa já encerrada antes do deploy aparece como "em aberto" para o motorista. A T2.4 mede quantas são em
staging e decide, com o dono, entre aceitar ou fazer um backfill `system` (task separada, aprovação humana).

A corrida entre reabrir, resolver e a resolução automática é tratada travando a **linha da ocorrência** com
`FOR NO KEY UPDATE` dentro da transação (mesmo molde do cancelamento da 167,
`drizzle-occurrence-correction.repository.ts:92-117`). Não há `FOR UPDATE` no último evento: com zero evento não haveria
o que travar. O estado, inclusive `cancelled_at`, é lido **depois** do lock. A ordem é sempre tratativa → ocorrência. A
T2.4 audita o caminho do cancelamento da 167 contra essa ordem.

**Resolução automática.** Em `applyTransition` (`drizzle-occurrence-case.repository.ts:152-258`), depois de inserir o
evento da tratativa (que devolve o id), se a transição é terminal (`closed`, `returned_to_warehouse`, `cancelled`;
`decided` **não** é terminal): trava a ocorrência; se já está resolvida, não faz nada; senão insere `resolved` com
`actor_kind = 'system'`, a frase fixa do status e `case_event_id`.

## Segurança e tenant

- Toda leitura do motorista resolve `tripId` pela viagem atual do token e filtra por `company_id`. O contrato negativo
  cobre outro motorista na mesma empresa e outra empresa (API1/BOLA).
- O link assinado de anexo confere que o objeto pertence a uma ocorrência da viagem atual antes de assinar.
- A nota de resolução é texto livre do escritório: escapada no app (React) e nunca em log.
- O corpo da mensagem de reabertura vai para a conversa (já tratada pela 183), não para o evento nem para a notificação.

## Idempotência e concorrência

- Reabrir é idempotente pela **mesma** `Idempotency-Key` da resposta existente (`replayOrRun`), com `reopen` na impressão
  digital. O índice único `(company_id, conversation_message_id)` fecha a duplicata.
- A fila offline do app reenvia com a mesma chave (molde da 263).
- Resolver duas vezes dá 409. O app do painel trata como "já resolvida" e atualiza o feed.

## Observabilidade

- Log `info` por evento (`occurrence.resolution.resolved` / `.reopened`) com `occurrenceId`, `occurrenceKind`,
  `actorKind`. Sem nota nem texto.
- O beacon do app (`driver_occurrence_share`, `driver_occurrence_reopen`) só registra contagem, nunca nome de arquivo.

## Estratégia de testes

| Camada        | Teste                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Política pura | `occurrence-resolution.policy.contract.ts`: sem evento → open; último resolved → resolved; reopened depois de resolved → open + `reopenedAt`; cancelada vence tudo                                                  |
| Rotas         | contrato das rotas novas e do `reopen` na resposta (corpo, 404 de outra empresa, motorista ou viagem finalizada, 409, idempotência); **nenhum par de rotas com o mesmo método casa o mesmo caminho**                |
| Integração    | `occurrence-resolution.integration.ts`: tratativa fechada grava `system`; corrida resolver × reabrir; reabrir cria a conversa; índice único                                                                         |
| Painel        | guardas tolerantes (Fase 1); painel de resolução; descrição dos eventos                                                                                                                                             |
| App           | `route-occurrence-view.contract.ts` (junção servidor + fila, contagem do alerta); renderização do cabeçalho com 0 e com N; golden da parada; destino da notificação; serviço de compartilhar (com e sem `canShare`) |
| Smoke         | Playwright do `frontend-driver`: lista, detalhe, reabrir (prints da spec)                                                                                                                                           |

Integração roda com `bun --env-file=../../.env.test run test:integration`. A migration roda com `make migration-test`.

## Riscos

| Risco                                                   | Mitigação                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| O painel antigo quebra com o `kind` novo                | Fase 1 publicada antes, com aceite 6 do spec                                      |
| O `conversations-ui` não deixa passar `reopen` no envio | T4.8 confere primeiro; a mudança vai no pacote com changeset                      |
| Tratativas antigas encerradas aparecem "em aberto"      | T2.4 mede; o backfill é decisão do dono                                           |
| `navigator.share` com arquivo falha no iOS antigo       | Cai em download (`saveDriverFile`)                                                |
| Lista longa em viagem de 30 paradas                     | Uma consulta em lote para o último evento por ocorrência; sem N+1 (auditoria §15) |
