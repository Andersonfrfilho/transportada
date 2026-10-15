# Evidência — 266 O motorista acompanha as ocorrências da rota

## Decisões do dono (chat, 2026-10-15)

- Prévia aprovada: "certo aprovado pode fazer".
- Escopo: "App-motorista + API + e o painel verifique se o painel está pronto também".
- Reabrir: "ele pode reabrir e responder e tudo registrado em evento".
- Documentos: anexos do chat + fotos do motorista.

## Levantamento contra `origin/staging` (d6459e4cd, 2026-10-15)

Feito por três buscas paralelas, só de leitura. A T0.1 confere as linhas antes de qualquer código.

### API

- A tratativa (`trip_occurrence_cases`, `trip.schema.ts:3550`) só abre com política de reentrega `allowed`/`blocked`
  (`occurrence-case.policy.ts:20`). A ocorrência de parada (`trip_stop_occurrences`, :1625) nunca abre tratativa.
- Estados: `recorded`, `under_review`, `returned_to_warehouse`, `awaiting_contractor`, `decided`, `closed`,
  `cancelled`. O terminal é protegido por `trip_occurrence_case_events_terminal_check` (:3720). Não existe
  `resolved` nem reabertura.
- "Recusada" não é estado do servidor: é a rejeição do registro na fila offline do app (246).
- Rota do motorista `GET /me/trips/current` (`me-trip.routes.ts:346`): `registeredOccurrences` só traz as que abriram
  retorno com a contratante (248); a parada não traz ocorrência.
- Foto e assinatura do motorista são servidas só ao escritório (`GET /trip-occurrences/:id/attachments`).
  `signature_object_id` é gravado e nunca lido.
- Conversa da ocorrência (183): uma por (ocorrência, participante), sempre "aberta", sem relação com a tratativa.
  O motorista não cria conversa de ocorrência (263 D4).
- Notificações: só inbox e e-mail. Nada notifica mudança de estado da tratativa
  (`occurrence-case.use-case.ts:88`).

### App do motorista

- Não existe entidade de ocorrência no cliente. `DriverRegisteredOccurrence` = `{ id, contractorReply }`
  (`driverTrip.types.ts:54`).
- "Enviada" vem de `sentReportKeys` da sessão; as chaves ficam em estado da página e se perdem ao recarregar.
- `OPENABLE_SUBJECT_TYPES = ['document','trip']` (`driverConversation.constant.ts:20`).
- O cabeçalho (`DriverShellHeader.component.tsx:40-78`) tem fila, sino e avatar. O alerta entra entre a fila e o sino.
- Faltam os ícones `share`, `paperclip` e `arrow-left`. Não há `navigator.share`; existe `saveDriverFile`.
- CSP: `frame-src 'none'`, `object-src 'none'`.

### Painel — veredito: não pronto

- A tratativa aparece só para `source === 'document'` (`TripOccurrenceDetail.page.tsx:436`,
  `TripOccurrenceTable.component.tsx:207`).
- Não há resolver com observação, reabrir ou selo de reaberta. "Fechar" não pede nota e é terminal.
- **Guardas estritos:** status desconhecido reprova `isFeedItem` e `readPage` lança `RESPONSE_INVALID` para a lista
  inteira (`tripOccurrenceFeedClient.service.ts:148,372`). Um `kind` desconhecido derruba a linha do tempo
  (`tripOccurrenceTimeline.validation.ts:49`). Daí a Fase 1 antes da API.

## T0.1 — Conferência do levantamento

Conferido no worktree `spec-266` (base `origin/staging` d6459e4cd, 2026-10-15). Caminhos do painel em
`apps/frontend-transportada/src/modules/trip/`, da API em `apps/api-transportada/src/`, do app em
`apps/frontend-driver/src/`.

| Afirmação                                                              | Status | Referência correta / nota                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guarda `case.status` em `tripOccurrenceFeedClient.service.ts:~148`     | ✅     | `shared/tripOccurrenceFeedClient.service.ts:148` (`TRIP_OCCURRENCE_CASE_STATUSES.includes`)                                                                                              |
| `readPage` lança `RESPONSE_INVALID` (~:372)                            | ✅     | `:372` (`every(isFeedItem)`); outros `RESPONSE_INVALID` em :326, :355, :370                                                                                                              |
| `tripOccurrenceTimeline.validation.ts:~49` rejeita `kind` desconhecido | ✅     | `default: return false` em `:49`; `isOccurrenceTimeline` exige `events.every(isEvent)`                                                                                                   |
| `TripOccurrenceDetail.page.tsx:436` limita a `source === 'document'`   | ✅     | `pages/TripOccurrenceDetail.page.tsx:437` (off by 1)                                                                                                                                     |
| `TripOccurrenceTable.component.tsx:207` idem                           | ✅     | `components/TripOccurrenceTable.component.tsx:207`                                                                                                                                       |
| `trip_occurrence_cases` em `trip.schema.ts:~3550`                      | ✅     | `src/database/trip.schema.ts:3551`                                                                                                                                                       |
| CHECK terminal (~:3720)                                                | ⚠️     | `:3721`. Atenção: o CHECK barra evento com `from_status` em `closed`, `returned_to_warehouse`, `cancelled`. `decided` **não** é terminal no CHECK                                        |
| `trip_stop_occurrences` (~:1625)                                       | ✅     | `:1626`                                                                                                                                                                                  |
| `occurrence-case.policy.ts:20`                                         | ✅     | `resolveOccurrenceCaseOpening` em `src/trips/domain/occurrence-case.policy.ts:20`                                                                                                        |
| `occurrence-case.use-case.ts:88`                                       | ✅     | `createOccurrenceCaseUseCase` em `src/trips/application/occurrence-case.use-case.ts:88`; o arquivo não importa nem chama notificação                                                     |
| `me-trip.routes.ts:346`                                                | ✅     | `src/trips/presentation/me-trip.routes.ts:346` (rota GET da viagem atual); `registeredOccurrences` é montado em `application/attach-driver-document-contractor-replies.service.ts:55-58` |
| Motorista só vê anexo via `GET /trip-occurrences/:id/attachments`      | ✅     | `trip.routes.ts:457` (`TRIP_OCCURRENCE_FEED_ATTACHMENTS_PATH`, `TRIP_READ_POLICY`, rota do escritório); nenhuma rota `/me/**` serve foto ou anexo de ocorrência                          |
| `signature_object_id` nunca lido                                       | ✅     | Só escrito (`trip.schema.ts:1662`, `:2452`; `register-driver-occurrence.use-case.ts:46,93`) e indexado; nenhuma leitura em rota ou serviço                                               |
| `driverTrip.types.ts:54` `DriverRegisteredOccurrence`                  | ✅     | `modules/driver-trip/shared/driverTrip.types.ts:54`                                                                                                                                      |
| `OPENABLE_SUBJECT_TYPES` (`driverConversation.constant.ts:20`)         | ✅     | `modules/conversation/shared/driverConversation.constant.ts:20` = `['document','trip']`                                                                                                  |
| `DriverShellHeader.component.tsx:40-78`                                | ✅     | fila (botão `upload`), `NotificationBell`, avatar, nessa ordem                                                                                                                           |
| `icon.tsx` sem `share`/`paperclip`/`arrow-left`                        | ✅     | `components/ui/icon.tsx`: zero ocorrências                                                                                                                                               |
| Sem `navigator.share`                                                  | ✅     | nenhuma ocorrência de `share`/`canShare` em `src/`                                                                                                                                       |
| `saveDriverFile` existe                                                | ✅     | `modules/driver-trip/shared/driverFileSave.service.ts:9`                                                                                                                                 |
| CSP `frame-src 'none'`                                                 | ✅     | `modules/shared/contentSecurityPolicy.service.ts:89`                                                                                                                                     |

### Fatos novos para as próximas tasks

- **Pasta de migrations da API:** `apps/api-transportada/drizzle/` (`drizzle.config.ts`: `out: './drizzle'`; sem subpasta `meta`).
  Última migration: `20261015120000_occurrence_type_default_icons`. A nova usa prefixo posterior, no formato
  `AAAAMMDDHHMMSS_nome` (ex.: `2026101512xxxx_trip_occurrence_resolution_events`) e deve ser reconferida contra
  `origin/staging` antes de gerar.
- **IndexedDB do app do motorista:** `DATABASE_VERSION = 4` em `modules/driver-trip/shared/indexedDbQueue.service.ts:43`
  (banco `transportada.driver-trip`). O plano pede v5 para o store `trip-occurrences`: confere.
- **FK de `companies`:** a tabela é `companies` (`src/database/identity.schema.ts:106`, `id uuid`). Outros schemas
  usam `.references(() => companies.id, ...)`; o `REFERENCES companies(id)` do plano está certo.

## Tasks

_(cada task registra aqui comando, saída resumida e commit)_
