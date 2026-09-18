# Spec 159 — Plano

## Onde o código está hoje

Caminhos relativos a `apps/`.

| Peça               | Arquivo                                                                                                                                                                                                                                          | Estado                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Rotas do motorista | `api-transportada/src/trips/presentation/me-trip.routes.ts` (`/deliver` :314, `/proof` :396)                                                                                                                                                     | `/deliver` devolve `proofId: null`; `/proof` multipart sem posição.                                        |
| Entrega            | `trips/application/report-document-delivery.use-case.ts`                                                                                                                                                                                         | Só o canal `office` passa `proof` e recebe `TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`.                           |
| Comprovante        | `trips/application/attach-delivery-proof.use-case.ts`, `trips/presentation/delivery-proof.schema.ts:34-65`, `trips/infrastructure/drizzle-delivery-proof.repository.ts`                                                                          | Só confere `receiverDocument`; upsert por `(empresa, evento, kind)`.                                       |
| Tabela da foto     | `database/trip.schema.ts:1072` (`trip_delivery_proofs`)                                                                                                                                                                                          | Sem posição nem pontualidade.                                                                              |
| Evento             | `database/trip.schema.ts:742` (`trip_stop_events`)                                                                                                                                                                                               | `latitude/longitude/accuracy_meters/captured_at/recorded_at/channel/actor_user_id/on_behalf_of_driver_id`. |
| Parada             | `trip_stops.latitude/longitude` (`trip.schema.ts:330`)                                                                                                                                                                                           | Referência do local.                                                                                       |
| Configuração       | `database/company-delivery-proof-settings.schema.ts:28`, `trips/presentation/delivery-proof-settings.{routes,schema}.ts`, `trips/infrastructure/drizzle-delivery-proof-settings.repository.ts`, `trips/domain/delivery-proof-settings.policy.ts` | Quatro modos; sem parâmetros de pontualidade.                                                              |
| Distância          | `addresses/domain/coordinate-distance.ts:19` (`distanceInMetres`)                                                                                                                                                                                | Reaproveitar.                                                                                              |
| Janela de horário  | `trips/domain/field-delivery-timing.policy.ts:23-33`                                                                                                                                                                                             | Folga de 2 min; reaproveitar a constante.                                                                  |
| Snapshot           | `trips/application/find-current-driver-trip.use-case.ts`, `trips/infrastructure/drizzle-current-driver-trip.repository.ts:524` (`toDriverDocument`)                                                                                              | `deliveryProof` = só configuração.                                                                         |
| Motoristas         | `fleet/presentation/fleet.routes.ts:159`, `fleet/application/fleet-drivers.use-case.ts`, `fleet/infrastructure/drizzle-fleet-driver.repository.ts`                                                                                               | Sem nota.                                                                                                  |
| PWA                | `frontend-transportada/src/modules/driver-trip/` (`DriverStopCard`, `useDriverTrip.hook.ts:226`, `driverTripClient.service.ts:125`, `offlineAttachments.service.ts:69`)                                                                          | Anexo só entra na fila se houver `deliver` pendente.                                                       |
| Escritório         | `frontend-transportada/src/modules/trip/components/{TripQuickCreateDialog,TripProposalDetail,TripDeliveryProofSettingsPanel}.component.tsx`, `modules/fleet/components/Driver*.component.tsx`                                                    | Seletor sem nota; ficha sem nota.                                                                          |

## Desenho

### Domínio (puro, testável sem banco)

`trips/domain/delivery-proof-punctuality.policy.ts`

```ts
type ProofPunctuality = 'not_required' | 'on_time' | 'late' | 'away' | 'late_and_away'
classifyProofPunctuality(params: ClassifyProofPunctualityParams): ProofPunctuality
```

Entrada: modo `photo` resolvido, referência de tempo da entrega, `capturedAt` do cliente, recebimento no
servidor, posição da foto, posição da parada e do evento, `proofWindowMinutes`, `proofRadiusMeters`.
Aplica RF5 (limite do `capturedAt`) e RF6 (raio + precisão; sem posição = longe; sem referência = não
julga distância).

`fleet/domain/driver-score.policy.ts`

```ts
computeDriverScore(params: ComputeDriverScoreParams): DriverScoreResult
```

Recebe as entregas avaliáveis (data, pontualidade da foto ou ausência, modo resolvido atual) e os
parâmetros, devolve `{ score: number | null, penalties: DriverPenalty[] }`. `now` injetado. 90 dias é
constante `DRIVER_SCORE_WINDOW_DAYS`.

### Persistência (migration aditiva)

- `trip_delivery_proofs`: `latitude`, `longitude` numeric(10,7), `accuracy_meters` numeric(10,2),
  `captured_at` timestamptz — todos nulos; `punctuality varchar(16) not null default 'not_required'`
  com CHECK dos cinco valores.
- `company_delivery_proof_settings`: `proof_window_minutes int not null default 60`,
  `proof_radius_meters int not null default 300`, `late_penalty_points int not null default 5`,
  `missing_penalty_points int not null default 10`, `missing_after_hours int not null default 24`,
  com CHECKs de faixa.
- Índice para a nota: `trip_stop_events (company_id, kind, recorded_at)` se o plano da consulta pedir
  (medir com `EXPLAIN` na integração).

### Leitura da nota

`fleet/infrastructure/drizzle-driver-score.repository.ts` — uma consulta por empresa e lista de
motoristas: eventos `delivered` com `channel <> 'office'` nos últimos 90 dias, motorista resolvido por
`coalesce(on_behalf_of_driver_id, fleet_drivers.id via actor_user_id)`, `left join` na foto
`kind = 'photo'` do evento, CNPJ do destinatário da nota para resolver a exceção. O modo resolvido e o
cálculo ficam no domínio (`resolveProofSettingsForRecipient` + `computeDriverScore`).

Porta: `DriverScorePort.readScores({ companyId, driverIds, now })` e `readPenalties({ companyId,
driverId, now })`.

### API

- `/deliver`: resposta ganha `proofPending` (o use case lê a configuração resolvida pela porta de
  settings que o canal `office` já usa).
- `/proof`: schema aceita a posição; use case classifica e grava; resposta `{ id, punctuality }`.
- Snapshot: `proofPending` por documento (join na foto do último `delivered`) e `score` na raiz.
- `GET /fleet/drivers`: `score` por item. `GET /fleet/drivers/:id/score` novo, `fleet.read`.
- Settings: schema e repositório com os cinco campos novos.
- OpenAPI/Scalar é gerado das rotas — conferir que a rota nova aparece.

### Frontend

- PWA: tipo e validação do snapshot (`proofPending`, `score`); aviso no card; página
  `DriverPendingProofs.page.tsx`; `attachProof` lê posição e envia `capturedAt`; fila de anexos aceita
  item sem `deliver` pendente (evento já aceito) — muda `enqueueAttachment` para devolver ok quando o
  documento já está `delivered` no snapshot.
- Escritório: `DriverScoreBadge.component.tsx` compartilhado no módulo `fleet`; ordenação no seletor;
  seção de penalidades na ficha; campos novos no painel de configuração do comprovante.

## Riscos

- **Teste que fixa o comportamento atual:** `test/driver-trip/office-field-delivery.contract.ts:310`
  ("o caminho do motorista continua sem validar deliveredAt nem exigir foto") continua verdadeiro — a
  entrega segue sem recusa. Não remover; ampliar com `proofPending`.
- **WhatsApp** (`channel = 'whatsapp'`) entra na nota e na `proofPending`; não recebe `location` no
  `/proof` porque não usa essa rota.
- **Posição é dado pessoal:** nunca logar; a ficha mostra só motivo, não coordenada.
- **App nativo:** o contrato novo é compatível — campos opcionais no `/proof`, campos novos na resposta.
