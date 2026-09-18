# ADR-0068 — Histórico de status da viagem e o canal `backoffice`

- **Status:** aceita
- **Emendada:** 2026-09-18, depois da validação do architect (trava, ator nos ports, FK do ator,
  `from_status`, rollback, `recorded_at`, sentido de `whatsapp`, transição ilegal).
- **Data:** 2026-09-18
- **Decisores:** usuário (tabela nova e canal novo, decididos na conversa da spec 158) e revisão Opus
- **Fecha:** a T1 da spec 158 (`specs/158-linha-do-tempo-da-viagem/`)
- **Complementa:** ADR-0067 §2 (autoria dos registros de campo). O vocabulário de `channel` ganha
  um valor; o significado de `office` ("o escritório em nome do motorista") não muda.

## Contexto

A spec 156 prometeu uma linha do tempo com autoria (aceite 2: "iniciar a rota … a linha do tempo
mostra 'por <usuária> (escritório) pelo motorista <nome>'"). Três coisas impedem isso hoje.

1. **A troca de status da viagem não deixa rastro.** `trips.status` guarda só o valor atual. Nove
   pontos de escrita, em oito métodos, o mudam (inventário abaixo). O start-route do motorista recebe `actorUserId` e o ignora.
2. **Não existe canal para "o escritório agindo por conta própria".** O vocabulário é
   `driver_app | office | whatsapp`, e `office` exige `on_behalf_of_driver_id`. Separar, carregar,
   planejar a rota, despachar e cancelar pela web não são ações em nome do motorista.
3. **`trip_document_events` tem autoria errada em todas as linhas.** A coluna `channel` existe
   (migration `20260918054353_trip_field_authorship`), mas nenhum dos dois escritores
   (`drizzle-trip-document.repository.ts:190`, `drizzle-trip-document-batch.repository.ts:150`) a
   preenche. Toda linha fica com o default `driver_app`, e o motorista **nunca** grava nessa tabela
   (ele usa `trip_stop_events`). Web e WhatsApp do operador passam pelos mesmos repositórios.

### Inventário das escritas de `trips.status` (`apps/api-transportada/src/trips/infrastructure/`)

| escrita                                                                                                             | de → para                                             | quem chama                                                       | canal                                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `drizzle-trip.repository.ts:108` `close`                                                                            | ≠ `completed` → `completed`                           | `POST /trips/:id/close` (web)                                    | `backoffice`                             |
| `drizzle-trip-route.repository.ts:74` `markRoutePlanned`                                                            | `draft` → `route_planned`                             | plan-route, aceite de sugestão, multi-veículo (web)              | `backoffice`                             |
| `drizzle-trip-route.repository.ts:198` `markCancelled`                                                              | ≠ `completed`/`cancelled` → `cancelled`               | `POST /trips/:id/cancel` (web)                                   | `backoffice`                             |
| `drizzle-trip-route.repository.ts:320` `dispatch`                                                                   | `route_planned`/`separating`/`loading` → `dispatched` | web, WhatsApp do operador, app do motorista                      | `backoffice` / `whatsapp` / `driver_app` |
| `drizzle-current-driver-trip.repository.ts:147` `updateStatus`                                                      | `dispatched` → `in_transit`; → `on_delivery_route`    | `/me/...` (motorista) e `/trips/:id/...` (escritório)            | `driver_app` / `office`                  |
| `drizzle-driver-field-report.repository.ts:282` `markTripInTransit`                                                 | `dispatched` → `in_transit`                           | chegada (motorista, escritório)                                  | `deriveFieldAuthorship`                  |
| `drizzle-driver-field-report.repository.ts:380` `completeTripIfSettled`                                             | on-road → `completed`                                 | entrega/devolução (motorista, escritório, WhatsApp do motorista) | `deriveFieldAuthorship`                  |
| `drizzle-trip-document.repository.ts:234` e `drizzle-trip-document-batch.repository.ts:200` `recalculateTripStatus` | derivado (`deriveTripStatus`)                         | transições de nota (web, WhatsApp do operador)                   | `backoffice` / `whatsapp`                |

As outras cinco `update(trips)` (`drizzle-trip-planned-route.repository.ts:89`,
`drizzle-trip-route.repository.ts:172,366`, `drizzle-driver-field-report.repository.ts:272`,
`trip-fiscal-readiness.query.ts:220`) não tocam em `status`. Worker, cron e scripts não escrevem em
`trips`. **Nenhuma escrita é de sistema:** todas têm um usuário humano como ator.

## Decisão

### 1. Tabela `trip_status_events`

```
id uuid pk, company_id uuid not null, trip_id uuid not null,
from_status text not null, to_status text not null,
actor_user_id uuid not null, channel varchar(16) not null,
on_behalf_of_driver_id uuid null,
occurred_at timestamptz not null default now(), recorded_at timestamptz not null default now()
```

- FK `(company_id, trip_id) → trips`, FK `(company_id, on_behalf_of_driver_id) → fleet_drivers`.
- **Sem FK de membership do ator** (precedente: `nfe.schema.ts:632-636`). Com ela
  (`ON DELETE RESTRICT`), `removeMembership` (`drizzle-company-user.repository.ts:519-531`) falharia para
  quem já planejou, cancelou ou fechou uma viagem — e falharia depois de já ter desvinculado o
  WhatsApp e desabilitado a conta no Keycloak. O ator é gravado a partir do contexto autenticado, e a
  leitura resolve o nome por membership escopado pela empresa; ator removido aparece sem nome.
- Checks: `channel in (vocabulário)`, `channel <> 'office' or on_behalf_of_driver_id is not null`,
  `from_status <> to_status`, `from_status in (TripStatus)` e `to_status in (TripStatus)`.
- Índice `(company_id, trip_id, occurred_at, id)`.
- `actor_user_id not null`: não há escrita de sistema hoje. Se um dia houver (cron que conclui
  viagem), a migration daquele dia afrouxa a coluna — não se cria agora um caminho sem dono.
- `from_status not null`: nada grava a criação da viagem, e não se cria um escritor só para isso (a
  criação já está em `trips.created_at`).
- `recorded_at not null default now()`, igual a `trip_stop_events.recorded_at`
  (`trip.schema.ts:774`). Nenhuma troca de status é retroativa hoje; a coluna existe para as duas
  tabelas terem a mesma forma.

### 2. Toda escrita de status grava o evento, na mesma transação, com o `from` confiável

- Um helper `recordTripStatusChange(transaction, params)` em
  `trip-status-event.persistence.ts` grava a linha. Ele é o **único** escritor da tabela.
- **`from_status` confiável, sem deadlock novo.**
  - `updateStatus` e `markTripInTransit` já fazem compare-and-set (`where status = <esperado>`):
    `from` é o esperado, e não precisam de trava. `markTripInTransit` passa a devolver `boolean`.
  - As demais (`close`, `markRoutePlanned`, `markCancelled`, `dispatch`, `completeTripIfSettled`, os
    dois `recalculateTripStatus`) leem o status com **`SELECT … FOR NO KEY UPDATE`
    imediatamente antes** do `UPDATE trips` — nunca `FOR UPDATE` e nunca no início da transação.
    `FOR UPDATE` conflita com o `FOR KEY SHARE` que toda inserção com FK para `trips` segura (o
    `dispatch` insere `trip_dispatch_snapshots` antes do update): dois despachos simultâneos
    virariam deadlock. E a ordem atual (notas → viagem) é mantida.
  - Nos `recalculateTripStatus`, a trava da viagem vem **antes** da leitura do tally de notas, que
    hoje pode vir defasado.
  - `markRoutePlanned` e `updateStatus`, hoje fora de transação, passam a rodar numa (update +
    evento). O retry de `start-field-trip.use-case.ts:119-136` continua: cada tentativa é uma
    transação própria.
- Só grava quando o status mudou de fato. `completeTripIfSettled` passa a devolver o `from` (são três
  possíveis).
- **Alcance do contrato estático:** todo arquivo de `src/` que contenha `.update(trips)` com a chave
  `status` no `set` tem de importar e chamar `recordTripStatusChange`; `set` montado com spread ou
  `sql` sobre `trips` é proibido nesses arquivos. A checagem por texto é a rede; a garantia de cada
  escritor é o teste de integração dele (spec 158 T3).

### 3. Canal `backoffice`

- `TRIP_FIELD_CHANNELS.backoffice = 'backoffice'`: ação da tela do escritório que **não** é em nome
  do motorista. Não exige `on_behalf_of_driver_id`.
- A migration refaz os seis `*_channel_check` com o valor novo (a lista antiga é subconjunto: nenhuma
  linha viola), como `NOT VALID` seguido de `VALIDATE CONSTRAINT`, para não segurar
  `ACCESS EXCLUSIVE` durante a varredura. `trip_delivery_proofs_receiver_check` compara
  `channel = 'office'` por igualdade e não muda.
- O rollback recusa, em bloco `DO $$`, se `trip_status_events` tiver **qualquer** linha ou se houver
  `backoffice` gravado em qualquer tabela — nunca apaga histórico.
- **Os ports passam a receber a autoria inteira** — `actorUserId`, `channel` e
  `onBehalfOfDriverId` —, não só o canal. Hoje não recebem ator: `close` (`drizzle-trip.repository.ts:102`,
  o ator está em `trip.use-case.ts:104`), `cancelTrip` (`cancel-trip.use-case.ts:9,16-20`),
  `PlanTripRouteInput` e o port `TripRoutePlanner` (`plan-trip-route.use-case.ts:43-50`,
  `route-suggestion.use-case.ts:59-65`), `markTripInTransit` e `completeTripIfSettled`
  (`driver-field-report.port.ts:111,130`). Os de nota (`TripDocumentWriteInput`,
  `TripDocumentBatchWriteInput`) já têm ator e ganham `channel`. A composição em `main.ts` decide: rotas web →
  `backoffice`; WhatsApp do operador → `whatsapp`; app do motorista → `driver_app`; escritório em
  nome do motorista → `deriveFieldAuthorship`.
- **`whatsapp` passa a cobrir também o operador.** Na ADR-0067 era só o WhatsApp do motorista. O
  canal sozinho não separa os dois; quem separa é o ator (e `on_behalf_of_driver_id` é sempre nulo
  nesse canal). A frase de autoria do WhatsApp passa a trazer o nome do ator ("por <nome> pelo
  WhatsApp").
- Os defaults de `channel` **ficam** (tirar exigiria migration e não ajuda: o contrato do §2 e os
  tipos obrigatórios nos ports são a garantia).

### 4. Histórico de `trip_document_events`: sem reescrita (spec 158 D3, saída b)

Não há como distinguir, de forma determinística, a linha vinda da web da vinda do WhatsApp do
operador: o ator é a pessoa real nos dois casos, `note` é nula nos dois, e nenhum dos dois grava
`audit_logs`. A única correlação é heurística (`meta_whatsapp.messages.payload` com o id da nota e o
horário) e falha no lote "todas as pendentes".

Daria para medir no agregado se o fluxo do operador pelo WhatsApp **já foi usado** alguma vez; se
nunca foi, um backfill `backoffice` seria exato. A medição é **dispensada** porque a saída (b) é
segura sem o número: **nada é reescrito**, e a regra de leitura é exata, não um corte de data: como o motorista nunca grava em `trip_document_events`, **`channel = 'driver_app'`
nessa tabela significa "canal não registrado"**, e a linha do tempo mostra só "por <usuária>". Linhas
novas saem com `backoffice` ou `whatsapp`. Se um dia um caminho do motorista passar a gravar ali, esta
regra cai junto — o contrato da leitura (spec 158 T5) cita esta seção.

## Consequências

- **`recorded_at` não serve, sozinho, para dizer "retroativo".** A migration da spec 156 preencheu o
  `recorded_at` das linhas antigas com a hora dela, e `created_at` (aplicação) e `recorded_at`
  (banco) diferem por milissegundos. A leitura só mostra "registrado em" quando `channel = 'office'`
  e a diferença passa de 60 s — o escritório é o único caminho que informa a hora do fato
  (ADR-0067 §3), e não existia linha `office` antes daquela migration.
- **Ordem entre fontes.** O evento de status da chegada e da entrega usa o mesmo `now` do caso de uso
  que grava o `trip_stop_event`. Empate é desfeito por `(occurred_at, prioridade do tipo, id)`: a
  chegada antes da troca de status que ela causa, a entrega antes da conclusão.
- **O evento pode registrar uma transição que a política proibiria.** `dispatch`, `markRoutePlanned`,
  `markCancelled` e `close` escrevem sem condição, com a precondição lida fora da transação. A
  tabela grava fielmente o que aconteceu; a guarda (`where status in (<origens permitidas>)`) é
  mudança de comportamento e fica registrada à parte (spec 158 T11), com o `close` aceitando
  `cancelled → completed`.
- A linha do tempo passa a ter o início de rota do motorista, que hoje se perde.
- Viagens anteriores ao deploy não têm histórico de status; a tela não inventa.
- Duas escritas ganham transação (`markRoutePlanned`, `updateStatus`) e todas ganham um `FOR UPDATE`
  por viagem: contenção só entre ações na mesma viagem, que já competem pelo status.
- `updateStatus` passa a gravar `updated_at`, que hoje esquece. Isso muda a ordem de
  `drizzle-trip-location.repository.ts:108` (`orderBy desc(updatedAt)`) — a viagem que acabou de
  iniciar a rota sobe, o que é o esperado.

## Achados registrados, fora desta decisão

- `close` aceita `cancelled → completed`: a checagem está em `trip.use-case.ts:106` e não passa por
  `checkTripTransition`. Registrado na T11 da spec 158.
- A entrega pelo motorista não leva a viagem a `on_delivery_route` (`markDocumentDelivered` não chama
  `deriveTripStatus`); só `completeTripIfSettled` age. Comportamento atual preservado.
