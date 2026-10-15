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

| Camada         | Arquivo (novo ou alterado)                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema         | `src/database/trip.schema.ts`: tabela `trip_occurrence_resolution_events` + migration Drizzle                                                                                                        |
| Domínio        | `src/trips/domain/occurrence-resolution.policy.ts` (pura): estado do andamento a partir de (cancelada?, eventos)                                                                                     |
| Domínio        | `src/trips/domain/occurrence-resolution.error.ts`: `OccurrenceAlreadyResolvedError` (409), `OccurrenceNotResolvedError` (409), `OccurrenceCancelledError` (409); códigos em `shared/errors/codes.ts` |
| Infra          | `src/trips/infrastructure/drizzle-occurrence-resolution.repository.ts`: inserir evento, último evento por ocorrência (em lote)                                                                       |
| Infra          | `drizzle-occurrence-case.repository.ts`: transição para estado terminal grava `resolved` (`system`) na mesma transação                                                                               |
| Aplicação      | `resolve-occurrence.use-case.ts` (escritório), `reopen-occurrence.use-case.ts` (motorista, evento + mensagem), `list-driver-trip-occurrences.use-case.ts`, `find-driver-trip-occurrence.use-case.ts` |
| Apresentação   | `occurrence-resolution.routes.ts` (escritório), `me-trip-occurrence.routes.ts` (motorista)                                                                                                           |
| Linha do tempo | `occurrence-timeline.policy.ts`: fontes `resolution.resolved` e `resolution.reopened`                                                                                                                |
| Feed           | o item do feed ganha `resolution: { state, at, actorKind } \| null` e o filtro `resolutionState`                                                                                                     |
| Notificação    | `notification-catalog.constant.ts`: `trip.occurrence-resolved` (motorista) e `trip.occurrence-reopened` (escritório)                                                                                 |

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
- Conversa: a linha leva a `/conversas/occurrence/:id` quando a conversa existe. Ocorrência resolvida → composer de
  reabertura (T4.8 confere se o `conversations-ui` aceita interceptar o envio; se não aceitar, a mudança vai **no
  pacote**, com changeset, nunca por cópia).
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

`GET /me/trips/current/occurrences`

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

`GET /me/trips/current/occurrences/:kind/:id`: o item acima mais `note` (observação registrada), `photos[]`,
`signature`, `attachments[]` (anexos do chat com `messageId`, nome, tipo e tamanho) e `timeline[]`, com os eventos
`recorded`, `photo`, `cancelled`, `resolution.*` e `case.transition` traduzido para frase do motorista. Os links
assinados (5 min) vêm em `GET .../attachments/:objectId/url` sob demanda; o retrato offline guarda só metadado.

`POST /me/trips/current/occurrences/:kind/:id/reopening`

```ts
{ clientMessageId: string /* uuid */; text: string /* 1..4000 */; attachmentIds?: string[] }
// 201 { data: { state: 'open', reopenedAt, conversationId, messageId } }
// 200 quando o clientMessageId já foi processado (idempotência; mesma resposta)
// 409 OCCURRENCE_NOT_RESOLVED · 409 OCCURRENCE_CANCELLED · 404 fora da viagem atual
```

### Notificações

| Template                   | Para quem                                                                                 | Payload (sem corpo de mensagem)                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `trip.occurrence-resolved` | motorista da viagem (e ajudante, se houver)                                               | `{ subjectType: 'occurrence', occurrenceKind, subjectId, typeName }` |
| `trip.occurrence-reopened` | quem gravou o último `resolved`; se foi `system`, o ator interno que encerrou a tratativa | `{ occurrenceKind, occurrenceId, tripId, typeName }`                 |

## Dados, migration e rollback

```sql
CREATE TABLE trip_occurrence_resolution_events (
  id uuid PRIMARY KEY,                       -- v7
  company_id uuid NOT NULL REFERENCES companies(id),
  occurrence_kind varchar(16) NOT NULL CHECK (occurrence_kind IN ('document','stop')),
  occurrence_id uuid NOT NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('resolved','reopened')),
  actor_kind varchar(16) NOT NULL CHECK (actor_kind IN ('internal','driver','system')),
  actor_user_id uuid NULL,                   -- NULL só para system
  note text NULL,
  conversation_message_id uuid NULL,         -- obrigatório para reopened
  client_message_id uuid NULL,               -- idempotência da reabertura
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_kind = 'system') = (actor_user_id IS NULL)),
  CHECK (kind <> 'resolved' OR note IS NOT NULL),
  CHECK (kind <> 'reopened' OR (actor_kind = 'driver' AND conversation_message_id IS NOT NULL))
);
CREATE INDEX ... ON trip_occurrence_resolution_events (company_id, occurrence_kind, occurrence_id, created_at DESC);
CREATE UNIQUE INDEX ... ON trip_occurrence_resolution_events (company_id, client_message_id) WHERE client_message_id IS NOT NULL;
```

A migration é **aditiva** (tabela nova). Rollback: `DROP TABLE`, sem perda de dado de outra feature. O backfill não é
feito: tratativa já encerrada antes do deploy aparece como "em aberto" para o motorista. A T2.4 mede quantas são em
staging e decide, com o dono, entre aceitar ou fazer um backfill `system` (task separada, aprovação humana).

A corrida entre duas reaberturas, ou entre resolver e reabrir, é tratada com `SELECT ... FOR UPDATE` no último evento
da ocorrência dentro da transação. O estado é validado depois do lock.

## Segurança e tenant

- Toda leitura do motorista resolve `tripId` pela viagem atual do token e filtra por `company_id`. O contrato negativo
  cobre outro motorista na mesma empresa e outra empresa (API1/BOLA).
- O link assinado de anexo confere que o objeto pertence a uma ocorrência da viagem atual antes de assinar.
- A nota de resolução é texto livre do escritório: escapada no app (React) e nunca em log.
- O corpo da mensagem de reabertura vai para a conversa (já tratada pela 183), não para o evento nem para a notificação.

## Idempotência e concorrência

- Reabrir é idempotente por `client_message_id`, com índice único. A segunda chamada devolve a mesma resposta com 200.
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
| Rotas         | contrato das três rotas novas (corpo, 404 de outra empresa ou motorista, 409, idempotência)                                                                                                                         |
| Integração    | `occurrence-resolution.integration.ts`: tratativa fechada grava `system`; corrida resolver × reabrir; reabrir cria a conversa; índice único                                                                         |
| Painel        | guardas tolerantes (Fase 1); painel de resolução; descrição dos eventos                                                                                                                                             |
| App           | `route-occurrence-view.contract.ts` (junção servidor + fila, contagem do alerta); renderização do cabeçalho com 0 e com N; golden da parada; destino da notificação; serviço de compartilhar (com e sem `canShare`) |
| Smoke         | Playwright do `frontend-driver`: lista, detalhe, reabrir (prints da spec)                                                                                                                                           |

Integração roda com `bun --env-file=../../.env.test run test:integration`. A migration roda com `make migration-test`.

## Riscos

| Risco                                              | Mitigação                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| O painel antigo quebra com o `kind` novo           | Fase 1 publicada antes, com aceite 6 do spec                                      |
| O `conversations-ui` não deixa interceptar o envio | T4.8 confere primeiro; a mudança vai no pacote com changeset                      |
| Tratativas antigas encerradas aparecem "em aberto" | T2.4 mede; o backfill é decisão do dono                                           |
| `navigator.share` com arquivo falha no iOS antigo  | Cai em download (`saveDriverFile`)                                                |
| Lista longa em viagem de 30 paradas                | Uma consulta em lote para o último evento por ocorrência; sem N+1 (auditoria §15) |
