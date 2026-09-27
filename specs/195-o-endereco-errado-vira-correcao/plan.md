# Plano — Feature 195

Leitura obrigatória antes de qualquer task:

- `spec.md` desta pasta e a ADR-0080;
- a ADR-0057 (`0057-o-endereco-errado-e-ocorrencia-e-ela-conserta-o-cadastro.md`, **não** a outra 0057,
  que trata do comprovante);
- a ADR-0081 com `specs/196-todo-evento-carrega-onde-aconteceu/` (pré-requisito);
- a ADR-0082 com `specs/197-a-parada-e-do-cliente/` (convivência);
- `apps/api-transportada/CLAUDE.md`, `apps/frontend-driver/CLAUDE.md` e
  `apps/frontend-transportada/CLAUDE.md`.

## Pré-requisito e convivência (T0.1)

| item                                                                                                              | como conferir em `origin/staging`                            | se faltar                                         |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| 196 T1.2: `trip_stop_occurrences` com `latitude`, `longitude`, `accuracy_meters`, `captured_at`, `location_state` | `trip.schema.ts` + migration aplicada                        | **parar e perguntar**                             |
| 196 T2.2: `trip_stop_occurrences` na lista do `trip.location.purge`                                               | `worker/src/trip-location-purge/*`                           | **parar e perguntar**                             |
| 196 T3.x: `POST .../stops/:stopId/occurrences` aceita `location` e grava `captured`/`unavailable`                 | `me-trip.schema.ts`, contrato da 196                         | **parar e perguntar**                             |
| 196 T3.4: inventário do D9                                                                                        | `test/trip-http/driver-location-stamp-inventory.contract.ts` | acrescentar as rotas de upload quando ele existir |
| 197: `trip_stops.recipient_key`                                                                                   | `trip.schema.ts`                                             | seguir; `recipientCount` sai do `dest` das notas  |

A T5.2 da 196 **não** é pré-requisito: `applyReportLocation` já completa qualquer item que tenha o
campo `location` (`offlineQueue.service.ts:209-219`), e o item `stopAddressReport` nasce com ele.

## O que já existe e é reaproveitado (conferido no código em 2026-09-25)

| peça                                                                                 | onde                                                                                                                                                       | uso aqui                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `trip_stop_occurrences` (kind, description, distância, anexo, canal, carimbo da 196) | `api/src/database/trip.schema.ts:1150-1270`                                                                                                                | a ocorrência `wrong_address` e o ponto dela                 |
| rota da ocorrência de parada                                                         | `me-trip.routes.ts:571-619`; schema `.strict()` em `me-trip.schema.ts:42-53`; fiação `main.ts:3078` e `:3134` (`attachmentObjectId: null`)                 | ganha `attachmentObjectId` para `wrong_address`             |
| parada da viagem do motorista                                                        | `drizzle-driver-field-report.repository.ts:163-192` (`findStopForDriver`, `FIELD_REPORTABLE_TRIP_STATUSES`)                                                | janela de 24 h depois da conclusão, só para `wrong_address` |
| idempotência de campo (`trip_field_reports`)                                         | `trip.schema.ts`                                                                                                                                           | a mesma chave, com a `operation` da ocorrência de parada    |
| upload assinado de foto (escopo viagem + motorista)                                  | `create-occurrence-upload.use-case.ts`, `confirm-occurrence-upload.use-case.ts`                                                                            | rota irmã por parada                                        |
| upsert da coordenada + trilha                                                        | `drizzle-geocoded-address-correction.repository.ts:20-100` (`applyCorrection`: transação própria, origem fixa `operator`, sem `returning` do id da trilha) | extraído (ver "Regras de domínio")                          |
| logradouro canônico                                                                  | `addresses/domain/client-address-key.ts` (`buildClientStreetKey`)                                                                                          | contar logradouros distintos na chave                       |
| `NO_NUMBER_KEY`                                                                      | `trips/domain/stop-address-key.ts`                                                                                                                         | chave `S/N` é ambígua                                       |
| coordenada viva da parada                                                            | `geocoded_addresses` por `address_key` (`trip-stop-coordinates.support.ts`)                                                                                | fotografia do pino e alvo da correção                       |
| permissão e limitador da tratativa                                                   | `occurrence-case.routes.ts:33` (`occurrences.resolve`) e `:46-51` (Postgres, 300 s, 120)                                                                   | a decisão usa o mesmo molde                                 |
| feed de ocorrências                                                                  | `trip-occurrence-feed.query.ts`, `GET /trip-occurrences`                                                                                                   | estado da sugestão + filtro, sem coordenada                 |
| linha do tempo (`stop.occurrence`)                                                   | `trip-timeline-stop.query.ts`                                                                                                                              | estado da sugestão no item                                  |
| aviso por tipo de parada                                                             | `stop-occurrence-notification.policy.ts`, `notification-catalog.constant.ts`, cópia no worker `notification.constant.ts`                                   | template novo                                               |
| `audit_logs` com snapshots                                                           | `fiscal-operation.schema.ts:37`, uso em `drizzle-contractor-mail.repository.ts:486`                                                                        | trilha da decisão                                           |
| leitura pontual de posição + completar pela chave                                    | `driverLocation.service.ts`, `offlineQueue.service.ts:209-219`                                                                                             | ponto do relato                                             |
| fila offline com foto                                                                | `documentOccurrence` (179 T301), `driverTripClient.service.ts:send`, `sumReportPhotoBytes`, `ATTACHMENT_QUEUE_LIMIT`                                       | item `stopAddressReport`                                    |
| status "na fila / enviado"                                                           | `notDelivered.service.ts:resolveNotDeliveredStatus`; `sentReportKeys` é só da sessão (`useDriverTrip.hook.ts:143-144`)                                     | "enviada" passa a vir de `addressReportedAt`                |
| pedido à contratante                                                                 | `api/src/address-correction/*` (150); o rascunho só acha chave presente no relatório (`save-address-correction-draft.use-case.ts:76`)                      | P3: o relatório ganha o sinal `driver_report`               |

## Contratos que quebram em outras apps (M4)

`wrong_address` em `TRIP_STOP_OCCURRENCE_KINDS` e o quinto template de parada reprovam seis contratos
fora da API. Eles são atualizados **na mesma task** que muda o catálogo (T1.2), e o aceite dela inclui
os testes das duas apps de front:

| contrato                                                                     | o que muda                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/frontend-driver/test/driver-trip/catalog-parity.contract.ts:41-45`     | a cópia `DRIVER_OCCURRENCE_KINDS` ganha `wrong_address`        |
| `apps/frontend-driver/test/driver-trip/kind-overlap.contract.ts:43-49`       | a lista da parada inclui `wrong_address`; o "Deu problema" não |
| `apps/frontend-driver/test/driver-trip/occurrence-preview.contract.ts:60-67` | cinco templates, e não quatro                                  |
| `apps/frontend-transportada/test/driver-trip/catalog-parity.contract.ts`     | idem, na cópia do módulo legado                                |
| `apps/frontend-transportada/test/driver-trip/kind-overlap.contract.ts`       | idem                                                           |
| `apps/frontend-transportada/test/driver-trip/occurrence-preview.contract.ts` | idem                                                           |

E as listas de tipos ficam coerentes (spec RF22):

- `DRIVER_PROBLEM_KINDS` no app novo, sem `wrong_address`;
- `DRIVER_PROBLEM_KINDS` no módulo legado do painel (`driver-trip/shared/driverTrip.types.ts:132`, usada
  em `DriverStopCard.component.tsx:600`), sem `wrong_address`;
- `OFFICE_STOP_OCCURRENCE_KINDS` no módulo `trip` do painel, para os chips do
  `TripStopOccurrenceDialog.component.tsx:107` ("em nome de"), sem `wrong_address`. O diálogo ganha a
  entrada separada "Endereço incorreto — marcar no mapa", que abre o fluxo do pino (RF26) e não passa
  pelos chips;
- `STOP_OCCURRENCE_KINDS` (`trip.types.ts:871`) continua sendo a cópia de paridade, usada para rótulo.

## Modelo de dados (Fase 1, 🧠)

Uma migration, `drizzle/<timestamp>_stop_location_suggestions/`, com `migration.sql`, `rollback.sql`,
`snapshot.json` e a asserção `test/database-migration/stop-location-suggestion-rollback.assertion.ts`
(molde: `driver-allowance-rollback.assertion.ts`):

1. **`trip_stop_occurrences_kind_check`** recriado com `wrong_address`. Isso só alarga o conjunto. O
   rollback faz `RAISE EXCEPTION` se existir linha `wrong_address`; ele não apaga dado.
2. **`geocoded_address_corrections`** ganha `unique (company_id, id)`, aditivo, alvo da FK composta.
3. **`trip_stop_location_suggestions`**, uma linha por ocorrência `wrong_address` (1:1), **sem
   coordenada de pessoa**. Os textos são `text` com CHECK de tamanho ou de lista, sem ENUM nativo:

| coluna                                         | tipo                            | nota                                                                                                                                 |
| ---------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                           | uuid pk                         |                                                                                                                                      |
| `company_id`                                   | uuid not null                   | FK `companies`                                                                                                                       |
| `occurrence_id`                                | uuid not null                   | FK `(company_id, occurrence_id)` → `trip_stop_occurrences(company_id, id)` `on delete cascade`; `unique (company_id, occurrence_id)` |
| `stop_id`                                      | uuid not null                   | FK `(company_id, stop_id)` → `trip_stops(company_id, id)`. A parada de origem, e por ela o destinatário (`recipient_key` da 197)     |
| `origin`                                       | text not null                   | CHECK `in ('driver_stamp','office_pin')`                                                                                             |
| `address_key`                                  | text not null                   | CHECK `length between 1 and 255`; a chave da parada no relato (`cidade\|CEP\|número`)                                                |
| `proposed_latitude`, `proposed_longitude`      | numeric(10,7) null              | o pino arrastado. CHECK: preenchidas ⇔ `origin = 'office_pin'`; faixas -90..90 / -180..180                                           |
| `pin_latitude`, `pin_longitude`                | numeric(10,7) null              | **fotografia** de `geocoded_addresses` no relato (coordenada do endereço); as duas nulas ou as duas preenchidas                      |
| `pin_precision`, `pin_source`                  | text null                       | CHECK nos valores de `GEOCODING_PRECISIONS`/`GEOCODING_SOURCES`                                                                      |
| `status`                                       | text not null default `pending` | CHECK `in ('pending','applied','dismissed')`                                                                                         |
| `decided_by_user_id`, `decided_at`             | uuid / timestamptz null         | FK `(decided_by_user_id, company_id)` → membership; CHECK: `pending` ⇔ as duas nulas                                                 |
| `last_reopened_by_user_id`, `last_reopened_at` | uuid / timestamptz null         | FK para membership; as duas nulas ou as duas preenchidas. O histórico completo de reaberturas está em `audit_logs`                   |
| `geocoded_address_correction_id`               | uuid null                       | FK `(company_id, id)` → `geocoded_address_corrections`; CHECK: `applied` ⇔ preenchida                                                |
| `photo_purged_at`                              | timestamptz null                | quando o expurgo da foto rodou (RNF1)                                                                                                |
| `created_at`, `updated_at`                     | timestamptz not null            |                                                                                                                                      |

Quem registrou é o `actor_user_id` da ocorrência, e não se duplica aqui. O CHECK de `status = 'applied'`
⇒ `geocoded_address_correction_id` preenchido impede reabrir aplicada no banco também: reabrir exige
`decided_*` nulos, e a aplicada não pode perder a trilha.

Índices: `(company_id, status, created_at)` para o painel; `(company_id, address_key) where status =
'pending'` para "outras pendentes"; e, para o expurgo da foto, `(coalesce(decided_at, created_at))
where photo_purged_at is null`.

A observação fica em `trip_stop_occurrences.description`, a foto em `attachment_object_id`, a distância
em `reported_distance_meters` e o ponto do motorista nas colunas do carimbo (196). Nenhuma dessas
colunas é duplicada. O pino do escritório fica em `proposed_*`, porque não é carimbo: a ADR-0081 §3
proíbe ponto nas colunas do carimbo fora do canal `driver_app`.

**Por que tabela lateral:** o ciclo de decisão (estado, quem, quando, reabertura, trilha) só existe
para `wrong_address`, e o schema documenta que a ocorrência de parada _"não pede decisão"_.

**Por que fora do expurgo de posição:** a tabela não tem ponto de pessoa. A fotografia do pino é
coordenada de endereço, e o `proposed_*` é um ponto posto por um humano no mapa. O CA7 vigia por nome
de coluna.

## Regras de domínio

- `stop-location-suggestion.policy.ts` (função pura):
  - `STOP_LOCATION_SUGGESTION_MAX_ACCURACY_METERS = 100`, só para `driver_stamp`;
  - `resolveKeyAmbiguity({ addressKey, streetKeys })` → `null | 'no_number' | 'multiple_streets'`
    (`no_number` quando o número da chave é `NO_NUMBER_KEY`; `multiple_streets` com mais de um
    `buildClientStreetKey` distinto e não vazio);
  - `resolveProposedPoint({ origin, stamp, proposed })` → o ponto e a precisão (do carimbo para
    `driver_stamp`; `proposed_*` sem precisão para `office_pin`);
  - `decideSuggestion({ current, requested, origin, locationState, accuracyMeters, ambiguity })` →
    `apply | dismiss | reopen | noop | conflict | without-point | too-imprecise | ambiguous-key`,
    seguindo a tabela de transições da RF14. Para `applied`, a precedência é `without-point` →
    `too-imprecise` (só `driver_stamp`) → `ambiguous-key`;
  - `computeReportedDistanceMeters({ point, pin })` → inteiro ou `null` (haversine, a mesma fórmula de
    `driverStopDistance.service.ts`, sem importar a app);
  - `isWithinLateReportWindow({ tripStatus, completedAt, now })`, com `WRONG_ADDRESS_LATE_REPORT_HOURS =
24`;
  - `isSelfApplied({ registeredBy, appliedBy })`.
- `stop-location-suggestion.error.ts`: `NotFound` (404), `AlreadyDecided` (409), `WithoutPoint`,
  `PointTooImprecise` e `AmbiguousKey` (422), estendendo o `DomainError` do módulo `trips`. Os códigos
  vão para o catálogo central de códigos do módulo, sem string inline.
- **`applyGeocodedAddressCorrection(transaction, input)`**, extraído de `applyCorrection`:
  - recebe a transação de fora, sem abrir a sua;
  - recebe `origin` como parâmetro (`driver` para `driver_stamp`, `operator` para `office_pin` e para o
    `PATCH /geocoded-addresses`);
  - faz `returning({ id })` no insert da trilha e devolve o id.

  O `PATCH /geocoded-addresses` passa a chamá-la com `origin: 'operator'`, e o contrato dele não muda.
  O guarda do upsert (`source <> 'manual' or excluded.source = 'manual'`) é sempre verdadeiro com
  `excluded.source = 'manual'`, então a aplicação sempre grava. Um teste afirma isso, e `applied` só
  existe com o id devolvido.

- O use case não faz try/catch, porque o erro sobe até o filtro do router (`code-standart.md` §7).

## Fluxo da API

**Relato do motorista.** `report-stop-occurrence.use-case.ts` ganha o ramo `wrong_address`:

1. `findStopForDriver` com a janela de 24 h (RF10), só para este tipo;
2. validar `attachmentObjectId`: upload confirmado da mesma viagem e do mesmo motorista;
3. ler o pino atual pela `address_key` da parada e calcular a distância a partir do carimbo (a 196 já o
   grava);
4. gravar a sugestão (`driver_stamp`, `stop_id`, chave, fotografia do pino) na transação que já grava
   ocorrência + chave de idempotência;
5. o aviso reusa o disparo por tipo, com o template novo e o deep link (RF17).

**Registro pelo escritório (RF23).** `register-office-location-suggestion.use-case.ts`, nas rotas de
viagem do escritório (`trip-field-office-trip.routes.ts` ou arquivo irmão), com `occurrences.resolve`:

1. achar a parada pela empresa do token (`404` igual a inexistente), em qualquer estado de viagem;
2. ler o pino atual, calcular a distância entre ele e o ponto proposto, resolver a ambiguidade (só para
   devolver na resposta; o registro é aceito);
3. gravar, numa transação, a ocorrência `wrong_address` (canal `backoffice`, ator = operador, sem
   `on_behalf_of_driver_id`, sem carimbo), a sugestão `office_pin` com `proposed_*` e a chave de
   idempotência (`trip_field_reports`, com a `operation` própria);
4. disparar o mesmo aviso.

**Leitura para o app.** `drizzle-current-driver-trip.repository.ts` ganha `addressReportedAt` por parada:
`max(created_at)` de `trip_stop_occurrences` `wrong_address` daquela parada, pelo mesmo motorista,
numa consulta em lote por viagem, e não uma por parada.

**Decisão (escritório).** `decide-stop-location-suggestion.use-case.ts`:

1. `select ... for update` da sugestão por `(company_id, occurrence_id)`, com `join` na ocorrência para
   o carimbo e o ator do registro; ausente → 404;
2. contar os logradouros da empresa na chave (ver "Contagens") e resolver a ambiguidade;
3. `decideSuggestion`; `noop` devolve o estado atual (200), e os erros sobem;
4. `apply`: `applyGeocodedAddressCorrection(transaction, { addressKey, latitude, longitude, origin,
actorUserId, companyId })`, com o ponto de `resolveProposedPoint`; devolve o id da trilha;
5. `dismiss`: marca `dismissed` e `decided_*`;
6. `reopen`: volta a `pending`, limpa `decided_*` e grava `last_reopened_*`;
7. `audit_logs` em todas: `action` = `stop_location_suggestion.applied`/`.dismissed`/`.reopened`,
   `permission` = `occurrences.resolve`, `entity_type` = `trip_stop_location_suggestion`, snapshots
   `{ status, origin, addressKey, pinPrecision, reportedDistanceMeters, ambiguity, selfApplied }`, **sem
   coordenada**, com o `correlationId` da requisição.

**Contagens (RF13), todas escopadas por `company_id` e em lote:**

- `streetCount`: `buildClientStreetKey` distintos das notas da empresa cuja chave de destino físico é a
  `address_key`. Sai da mesma leitura de `nfe_addresses` que o relatório de endereços já faz, e não de
  uma quarta grafia da chave (spec 080).
- `recipientCount`: `recipient_key` distintos e não nulos das paradas da empresa com aquela
  `address_key` (197). Sem a 197, ou para parada anterior a ela, conta o documento do `dest` das notas.
- `otherPendingCount`: sugestões `pending` da empresa na mesma chave, menos esta.
- `pinChangedSinceReport`: a fotografia (lida pela empresa) comparada ao pino de `geocoded_addresses`
  (sem tenant, ADR-0044).

**Feed e linha do tempo.** `left join` da sugestão nas consultas de parada, escopado por `company_id`
na junção. O estado exibido e o filtro usam os cinco valores da RF16, derivados de `status` + `origin` +
`location_state` e nunca gravados; a reaberta é `pending`, com `reopened: true` para o subtexto. O
feed não devolve coordenada.

## Contrato HTTP

```
POST /me/trips/current/stops/:stopId/occurrences          trip.report   Idempotency-Key obrigatório
  { kind: 'wrong_address', description: string(≤500), documentId: null,
    location: {...} | null,              ← campo da 196
    attachmentObjectId: uuid | null }    ← 195, só em wrong_address
  201 { data: { id } }                           reenvio: mesma resposta
  400 details[] (attachmentObjectId em outro kind)
  aceita viagem completed há ≤ 24 h, só para wrong_address

POST /me/trips/current/stops/:stopId/occurrence-uploads             trip.report  (exceção "anexos" do D9)
POST /me/trips/current/stops/:stopId/occurrence-uploads/:id/confirm trip.report

GET /me/trips/current
  stops[].addressReportedAt: string | null      ← novo, sem coordenada

POST /trips/:tripId/stops/:stopId/location-suggestions   occurrences.resolve   Idempotency-Key obrigatório
  { proposedLatitude: number, proposedLongitude: number, description?: string(≤500) }   .strict()
  201 { data: { occurrenceId, suggestionId, distanceMeters|null, ambiguity } }   reenvio: mesma resposta
  400 details[]   403   404 (parada de outra empresa)   429

GET   /trip-occurrences/:id/location-suggestion   fleet.read
  200 { data: { origin, status, displayStatus, reopened, addressKey, currentPin|null, reportedPin|null,
        proposedPoint: { latitude, longitude, accuracyMeters|null, capturedAt|null }|null,
        locationState|null, distanceMeters|null, note, photoUrl|null,
        registeredBy: { name }, decidedBy: { name }|null, decidedAt|null,
        lastReopenedBy: { name }|null, lastReopenedAt|null, selfApplied|null,
        pinChangedSinceReport, otherPendingCount, recipientCount, streetCount,
        ambiguity: null|'no_number'|'multiple_streets' } }
  404 STOP_LOCATION_SUGGESTION_NOT_FOUND

PATCH /trip-occurrences/:id/location-suggestion   occurrences.resolve   limitador 120/300 s
  { status: 'applied' | 'dismissed' | 'pending' }        ← 'pending' reabre uma descartada
  200 { data: <detalhe> }   409 …_ALREADY_DECIDED
  422 …_WITHOUT_POINT | …_POINT_TOO_IMPRECISE | …_AMBIGUOUS_KEY
  404 …_NOT_FOUND   429 com Retry-After
```

O `POST` do escritório tem três níveis de aninhamento, acima dos dois de `apis.md`. Ele segue a forma
das rotas de parada do escritório que já existem (`/trips/:id/stops/:stopId/occurrences`), e manter a
família coerente pesa mais que a regra aqui.

O contrato é registrado em `docs/ai-context/api-transportada.md` e no núcleo do
`apps/api-transportada/CLAUDE.md` (documentação viva, `code-standart.md` §14).

## App do motorista

- `driverTrip.types.ts`:
  - `wrong_address` em `DRIVER_OCCURRENCE_KINDS` (paridade) e `DRIVER_PROBLEM_KINDS` sem ele;
  - item `stopAddressReport` em `DriverFieldReport`: `{ idempotencyKey, stopId, location | null, note,
photo | null, awaitingLocationUntil: string | null }`;
  - `addressReportedAt` na parada, validado em `driverTripResponse.validation.ts`.
- `pendingQueue`/`offlineQueue`: a drenagem pula o item com `awaitingLocationUntil` no futuro e
  `location` nulo. `applyReportLocation` completa o item e zera o prazo.
- `driverTripClient.service.ts:send`: ramo próprio na ordem foto → confirmação → `POST`.
- `stopAddressReport.service.ts`:
  - enfileirar: a foto que estoura `ATTACHMENT_QUEUE_LIMIT` sai do item, e o relato entra;
  - `resolveAddressReportStatus`: "na fila" pela fila, "enviada às HH:MM" por `addressReportedAt`.
- `useAddressReport.hook.ts`:
  - leitura ao abrir e idade da leitura (relógio injetável, para o teste);
  - releitura no "Enviar" acima de 30 s (`ADDRESS_REPORT_MAX_LOCATION_AGE_MS`);
  - foto, estado da folha e `captureRegistry` (`occurrence-dialog`).
- `DriverAddressReportSheet.component.tsx` (declarativo). O `DriverStopCard` ganha **só** o botão, o
  status e a montagem da folha.
- Locale pt-BR e en; ícone do conjunto existente (pino de mapa); `touch-target.contract.ts`.
- Fila: o rótulo "Correção de endereço" no que a 193 deixar em `/fila`, sem redesenhar a tela.
- API de demonstração do preview:
  - `POST .../stops/:id/occurrences` cai no `POST` genérico (linha 242), e o upload pela parada casa com
    `endsWith('/occurrence-uploads')`;
  - acrescentar `addressReportedAt` à parada devolvida depois do `POST`, para mostrar o "enviada";
  - o `location` nunca é impresso;
  - o que mudar vai para `evidence.md`.

## Painel

- Módulo `trip`:
  - `useStopLocationSuggestion.query.ts`, `useDecideStopLocationSuggestion.mutation.ts` (as três
    transições) e `useRegisterOfficeLocationSuggestion.mutation.ts`, com invalidação por
    `invalidateMutationEffect`: feed, detalhe da viagem, linha do tempo e rota da viagem;
  - `StopLocationSuggestionPanel.component.tsx` + `useStopLocationSuggestionPanel.hook.ts`: origem,
    estado, "reaberta", trilha de registro/decisão/reabertura, "Usar este ponto", "Descartar" e
    "Reabrir";
  - `OfficeLocationPinDialog.component.tsx` + `useOfficeLocationPin.hook.ts`: o mapa de arrastar pino,
    reaproveitando a interação do "Ajustar no mapa" (detalhe da viagem, "corrigir / salvar / cancelar no
    mapa", 080 T006; hoje chama `PATCH /geocoded-addresses` em `tripClient.service.ts:766`). Aqui o
    "salvar" chama a RF23. A execução extrai a interação de arrastar num componente comum aos dois
    usos, em vez de copiá-la;
  - "Endereço incorreto" na linha de cada parada do detalhe da viagem e como entrada separada no
    `TripStopOccurrenceDialog`; os dois abrem o mesmo diálogo, só com `occurrences.resolve`;
  - `/ocorrencias?ocorrencia=<id>` abre o detalhe (deep link do sino).
- Mapa do detalhe: se a 196 T6.2 já tiver entregue o mapa da linha do tempo (pino do evento + pino da
  parada), **reusar** esse componente. Senão, o primitivo MapLibre de `TripRouteMap`/`AssemblyVectorMap`,
  com telhas próprias (ADR-0044 §6). Nos dois casos: dois marcadores, círculo de precisão (só no GPS) e
  linha tracejada, sem biblioteca nova.
- `TripOccurrenceTable`/`TripOccurrenceFilters`: rótulo, origem, selo com subtexto "reaberta" e filtro
  dos cinco estados. `TripTimeline` e `TripOccurrences`: rótulo, origem e estado. Locale nas duas
  entradas de `occurrenceKind` de `trip.locale.json` (pt-BR acentuado, `locale-accents.contract.ts`).
- `OFFICE_STOP_OCCURRENCE_KINDS` nos chips do diálogo "em nome de"; `DRIVER_PROBLEM_KINDS` no módulo
  legado.
- Confirmação com o `Dialog` do design system. Ícones: pino de mapa em "Usar este ponto" e em "Endereço
  incorreto"; em "Descartar", o mesmo ícone que a tratativa (164) já usa para descartar, e nunca a
  lixeira, que no produto significa apagar; em "Reabrir", o ícone de desfazer/reabrir já usado no
  produto, se existir, ou texto sozinho (`web.md` §9).

## Worker

- `notification.constant.ts`: a chave `trip.occurrence-wrong-address` em paridade.
- **Expurgo da foto da fachada** (RNF1): no job que já apaga as fotos de ocorrência, ou numa rotina
  irmã do `trip.location.purge`. Apaga o objeto do storage e zera `attachment_object_id` da ocorrência
  `wrong_address` quando `coalesce(decided_at, created_at) < now() - 90 dias`, marcando
  `photo_purged_at`. É em lote, com teto, no molde do `trip-location-purge`. A execução localiza o job
  de fotos existente antes de escolher. Uma reaberta recomeça a contagem pela decisão seguinte, mas foto
  já apagada não volta.
- Nada no expurgo de posição: a tabela nova não tem ponto de pessoa.

## Riscos e mitigação

| risco                                                                       | mitigação                                                                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Chave sem logradouro junta ruas (cidade de CEP único)                       | regra de ambiguidade para as duas origens (ADR-0080 §3.3), CA12                                                            |
| A 196 atrasa ou muda de desenho                                             | T0.1 para e pergunta; a 195 usa da 196 só nomes de coluna e o `location` do corpo                                          |
| Motorista relata parado no pino errado, e o ponto não é a porta             | texto da folha ("toque quando estiver na porta certa"); a decisão é humana; o mapa mostra os dois pontos                   |
| Ponto velho de quem deixou a folha aberta                                   | releitura acima de 30 s e item fora da drenagem até 8 s (CA9)                                                              |
| Relato da última parada recusado porque a viagem fechou                     | janela de 24 h (RF10, CA11)                                                                                                |
| Ponto de GPS impreciso (galpão, laje) vira `rooftop`                        | teto de 100 m no servidor e na tela; acima disso, "Ajustar no mapa"                                                        |
| Operador registra e aplica o próprio pino sem outro olhar                   | permitido de propósito (ADR-0080 §6.2); `selfApplied` no audit e no detalhe; a regra de ambiguidade vale                   |
| "Ajustar no mapa" segue sob `trip.manage` e sem regra de ambiguidade        | pendência registrada na spec (fora do escopo da 195)                                                                       |
| `geocoded_addresses` compartilhada entre as empresas da instalação          | 084 T1d aceita para correções decididas pelo escritório (ADR-0080 §4), com humano, permissão e trilha por empresa          |
| Seis contratos quebram nas duas apps de front                               | atualizados na T1.2, com os testes das duas apps no aceite                                                                 |
| Separador alcançando registro ou decisão                                    | `occurrences.resolve` nas duas rotas e o contrato do separador na T3.1 e na T3.4                                           |
| Conflito com 192/193/194/196/197 no `DriverStopCard`, na fila e nos locales | folha e hook em arquivos próprios; rebase + `bun install --frozen-lockfile` antes de cada gate; conferir `git log` do card |
| Numeração de migration/ADR colidindo com outra sessão                       | conferir em `origin/staging` antes do push; `db:generate` = no changes                                                     |
| Mapa da viagem mostra o pino fora do traçado congelado                      | frase fixa no painel ("não é recalculada por esta correção"); ADR-0080 §4                                                  |
