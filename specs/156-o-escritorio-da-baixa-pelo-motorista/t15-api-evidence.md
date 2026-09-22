# Spec 156 — T15, correções da revisão na API

Evidência da parte **API** da T15 (revisão de código e de segurança das rotas do escritório). O
frontend foi corrigido por outro agente, no mesmo worktree, em commits próprios. Data: 2026-09-18.
Modelo: `opus`. Postgres de teste: o do `.env.test` (Docker, 65432) estava fora; toda integração
rodou num Postgres 18 nativo descartável no scratchpad (`127.0.0.1:65441`, via
`DRIZZLE_TEST_DATABASE_URL`).

## Commits

| hash       | grupo                    | o quê                                                                                    |
| ---------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `9b59781c` | C1 + M3                  | parada fecha sem chegada (office) e na maior hora das notas; fixture compartilhada       |
| `615aa25b` | A1 + M9 + `RETURNED_AT`  | `arrivedAt` opcional, sem `shiftPendingStops`; piso `trips.created_at`; códigos por hora |
| `6cee0b5b` | M6                       | `DOCUMENT_ALREADY_SETTLED` antes da janela e da transição; `'returned'` → constante      |
| `d928ad99` | A2 (D8)                  | assinatura exigida cobra foto + nome; documento selado; migration do CHECK               |
| `21e16bb6` | M1 + M2 + órfãos         | `field-proof` numa transação; não substitui canhoto do motorista; limpeza do upload      |
| `df701713` | órfãos (lote) + SECURITY | limpeza da foto do lote; varredura periódica ausente registrada                          |
| `f1584958` | M4                       | baixa de campo deriva `on_delivery_route` com `trip_status_events`                       |
| `6bd28ff7` | M5 + M10                 | mesmo notificador/sugestão do motorista; rótulos numa consulta; falha pós-commit em log  |
| `c72b3ab1` | M8 + M11 + seg B1        | `office.` nas operações; `audit_logs` na transação; reenvio/`changed:false` não auditam  |
| `cf292645` | seg M2 + B2 + B5 + M7    | rate limit Postgres; assinatura de bytes; lista fechada + 1 `file`; teto 960 KiB         |
| `ea53f639` | baixo                    | `startFieldTrip` esgotado → 409 `TRIP_STATUS_WRITE_CONFLICT`                             |
| `8c56a81f` | baixo                    | índices parciais das FKs `(company_id, on_behalf_of_driver_id)` nas 7 tabelas            |
| `ddc1f214` | M12                      | divisão por responsabilidade, `withFieldReport` por objeto, nomes de status              |
| `5471b5be` | aceites 1, 5, 11         | integração pelo caminho HTTP inteiro (roteador + authorize + logger espião)              |
| `c1a0cd56` | docs                     | ADR-0067, CLAUDE.md da API, SECURITY.md, spec/plan/tasks                                 |

## Item a item — teste que falhou antes, e passou depois

Todos os testes novos foram escritos e rodados **antes** da correção, e falharam pelo motivo
esperado; depois, verdes. Os de integração estão em `test/integration/trip-field-office-review.integration.ts`
(22 testes) e `test/integration/trip-field-office-router.integration.ts` (3 testes), ambos no
`test:integration` do `package.json`.

- **C1** — `entregar todas as notas de uma parada sem chegada…`, **sem** `seedStopArrival`. Antes:
  `PostgresError … viola a restrição de verificação "trip_stops_completed_requires_arrived_check"`
  (500). Depois: 201, `arrived_at` = `completed_at` = `deliveredAt`. `completeStopIfSettled` ganhou
  `fillMissingArrival` (só `office`): `arrived_at = coalesce(arrived_at, menor hora de baixa da
parada)`; `shiftPendingStops` não é chamado.
- **M3** — duas notas na mesma parada, baixadas às 10:00 e depois 09:30: `completed_at` 10:00,
  `arrived_at` 09:30, e o `trip_status_events` de `completed` com `occurred_at` 10:00 (antes: a hora
  da última digitada).
- **A1** — `arrive` com `arrivedAt`: `arrived_at` e `created_at` do evento na hora informada,
  `recorded_at` depois; a parada seguinte com `estimated_arrival_at` **inalterado**; o
  `dispatched → in_transit` com `occurred_at` = `arrivedAt`. `arrivedAt` no futuro → 400
  `ARRIVED_AT_IN_FUTURE`.
- **M9** — sem `trip_dispatch_snapshots`, `deliveredAt` anterior a `trips.created_at` → 400
  `DELIVERED_AT_BEFORE_DISPATCH` (antes: aceito). Consequência nos testes antigos: as seeds de viagem
  das integrações do escritório passaram a fixar `created_at` (`2026-09-17`), porque a hora
  informada fixa (`2026-09-18T09:00Z`) ficaria antes da criação real.
- **`RETURNED_AT_*`** — `returnedAt` antes do despacho → 400 `RETURNED_AT_BEFORE_DISPATCH` (antes:
  `DELIVERED_AT_BEFORE_DISPATCH`).
- **Aceite 8** — teste nomeado: `deliveredAt` no futuro → 400 `DELIVERED_AT_IN_FUTURE`.
- **M6** — entregar nota devolvida → 409 `DOCUMENT_ALREADY_SETTLED` (antes: 409
  `STATE_TRANSITION_NOT_ALLOWED`); devolver nota entregue com data fora da janela → 409
  `DOCUMENT_ALREADY_SETTLED` (antes: 400 da janela).
- **A2** — assinatura `required`: canhoto com nome em branco → 422
  `TRIP_DELIVERY_PROOF_RECEIVER_NAME_REQUIRED` (código novo); sem foto → 422
  `TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`. Documento digitado (`11144477735`, com `receiverDocument:
optional`): `receiver_document_masked = ***.444.777-**` e envelope gravado. Antes do CHECK relaxado:
  `trip_delivery_proofs_receiver_document_check` recusava — a migration aditiva
  `20260918170550_delivery_proof_office_receiver_document` (com `snapshot.json` e `rollback.sql`,
  que falha sem apagar se já houver documento selado de `office`) resolve.
- **M1** — `field-proof` sobre a foto do motorista → 409 `TRIP_DELIVERY_PROOF_ALREADY_CAPTURED`, a
  linha fica `driver_app` / `late_and_away` (o teste antigo "a pontualidade do motorista fica", que
  afirmava a substituição, foi reescrito para o comportamento novo). Escritório sobre escritório:
  substitui, e `audit_logs.metadata.replacedObjectId` = o `objectId` anterior.
- **M2** — contrato com o dublê: reserva da chave (`office.document.proof`), evento
  (`findDeliveryEventForProof`) e comprovante (`saveDeliveryProofWithinTransaction`) na mesma
  unidade de trabalho; `ReportFieldProofInput` não tem mais porta do pool.
- **Órfãos** — três contratos: a transação que desfaz depois do upload (`field-proof`,
  `field-delivery`, lote) apaga o objeto (`removed == stored`) e relança o erro original.
  `NfeStorageGateway.deleteObject` (provider `delete`). `docs/SECURITY.md` registra o que a limpeza
  por requisição não cobre.
- **M4** — primeira nota entregue pelo escritório numa parada com duas: `in_transit →
on_delivery_route`, canal `office`, em nome do motorista 1, `occurred_at` = `deliveredAt`. A nota
  que fecha a viagem grava **só** `in_transit → completed`. Interação com a T8b: o caminho do
  barracão que derivava isso (removido em `ad9a8d61`/`eb2e56d4`) não volta; a derivação mora na baixa
  de campo, trava a viagem `FOR NO KEY UPDATE` antes de contar as notas vivas, e nunca conclui (quem
  conclui é `completeTripIfSettled`, pelas paradas). `me-trip.integration` passou a esperar a
  conclusão a partir de `on_delivery_route` (o motorista nunca tocou em "iniciar trajeto").
- **M5** — contrato estático `test/composition/office-stop-occurrence.contract.ts`: as duas
  fábricas espalham o mesmo `stopOccurrenceFollowUp` (notificador + sugestão de cobrança). Antes: o
  escritório não mandava nenhum dos dois.
- **M10** — rótulos: uma leitura com as N notas (`readOccurrenceLabelsForDocuments`); a leitura que
  falha depois do commit vira `trip_office_occurrences_notification_failed` com `companyId`,
  `tripId` e o motivo — o lote continua 201.
- **M8** — `trip_field_reports.operation`: `office.document.deliver`, `office.stop.arrive`,
  `office.stop.occurrence` (antes: as do motorista).
- **M11 + seg B1** — aceite 7 pela rota: a mesma `Idempotency-Key` duas vezes → mesmo id, 1
  comprovante, 1 evento, **1** linha de auditoria (antes: 2), com `metadata.documentId`; `arrive`
  com `metadata.stopId`; `start-route` repetido (`changed: false`) não grava auditoria nova (antes:
  gravava); lote reenviado não grava outra linha.
- **Seg M2** — `test/rate-limited-routes.contract.test.ts`: as oito escritas do escritório com
  `store: 'postgres'` — lote 30/300 s (`trip-field-office-occurrences`), notas 300/300 s
  (`trip-field-office-documents`), viagem/parada 120/300 s (`trip-field-office-trip`). O teste de
  integração pelo roteador sobe com `DrizzleRateLimiterRepository` (sem ele o boot recusa).
- **Seg B2, B5, M7** — `test/trip-field-office/upload-hardening.contract.ts`: campo fora da lista e
  dois `file` → 400 em `field-delivery`, `field-proof` e `field-occurrences`; PNG declarado como JPEG
  e bytes arbitrários → 422 `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`; arquivo acima de
  `OFFICE_PROOF_MAX_BYTES` → 422 `TOO_LARGE`; o teto fica ≥ 64 KiB abaixo de
  `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES`.
- **M7 (decisão)** — o roteador **não** tem teto de corpo por rota; o corpo para em 1 MiB no
  `request-handler` (413) e o `Bun.serve` em 2 MiB. `DELIVERY_PROOF_MAX_BYTES` (2 MB) era
  inalcançável. O escritório passou a ter `OFFICE_PROOF_MAX_BYTES = 960 KiB` (983 040 bytes) no
  canhoto e na foto do lote — 64 KiB de folga para os campos e as fronteiras do multipart. O
  frontend reduz a ~900 KB. O teto do motorista (`DELIVERY_PROOF_MAX_BYTES`) não mudou.
- **Baixos** — `startFieldTrip` que esgota as três voltas → 409 `TRIP_STATUS_WRITE_CONFLICT` (antes:
  `changed: false`); comentário errado sobre `Idempotency-Key` no `field-proof` corrigido (rota e
  `main.ts`); índices: migration `20260918173348_trip_field_on_behalf_driver_indexes`, 7 índices
  parciais, `rollback.sql` só com `DROP INDEX`.
- **Aceite 1** (pelo roteador) — o `separator`, com as permissões reais do papel
  (`COMPANY_ROLE_PERMISSIONS.separator`), recebe **403** em `POST …/field-delivery` via
  `createRequestHandler` → `createRouter` → `AuthorizationService.authorize`; a nota fica `loaded`.
- **Aceite 5** (pelo roteador) — cinco notas, quatro entregues por `field-delivery` com foto e
  `delivered_at` próprio (05:00…08:00), uma pulada que continua `loaded` com `delivered_at` nulo; 4
  comprovantes.
- **Aceite 11** (pelo roteador, espião em runtime) — logger do `request-handler` e dos avisos do
  lote capturados numa baixa aceita (201), numa recusada (400, data no futuro) e num lote com foto
  (201): `JSON.stringify` de todas as linhas não contém o nome de quem recebeu, o CPF cru, o trecho
  mascarado `444.777`, a marca gravada dentro dos bytes da imagem nem a observação da ocorrência.

## M12 — padrões

- `report-document-delivery.use-case.ts` 480 → 73 linhas (fachada); `document-outcome.service.ts`
  167, `document-outcome-steps.service.ts` 190, `document-outcome-proof.service.ts` 96,
  `report-document-outcome.types.ts` 123.
- `register-office-document-occurrences.use-case.ts` 410 → 81; `office-occurrence-batch.service.ts`
  177, `office-occurrence-notification.service.ts` 63, `office-occurrence-batch.types.ts` 138.
- `trip-field-office.routes.ts` 530 → 44 (composição); `trip-field-office-trip.routes.ts` 264,
  `trip-field-office-document.routes.ts` 284, `trip-field-office.support.ts` 88 (caminho, política,
  alvo, `officeJsonResponse`, `buildOfficeContextInput`). As duas de rotas ficaram acima de 200:
  cada rota é uma declaração inteira de `defineRoute`, e dividir mais espalharia a mesma rota em dois
  arquivos.
- `trip-field-office.schema.ts` 290 → 111 (JSON); `office-field-delivery.schema.ts` 99,
  `office-field-occurrences.schema.ts` 86, `office-multipart.schema.ts` 74 (parse do `formData`
  compartilhado).
- `withFieldReport({ guard, perform, recall })` (§10), nos seis chamadores.
- `TripFieldDeliveryDocument` mudou para `application/trip-field-delivery-documents.types.ts`.
- `ACTIVE_TRIP_STATUSES` → `PROOF_REACHABLE_TRIP_STATUSES`, `CURRENT_DRIVER_TRIP_STATUSES`,
  `FIELD_REPORTABLE_TRIP_STATUSES`.
- **Tamanho registrado:** `drizzle-driver-field-report.repository.ts` tem **809 linhas** (era 646;
  +C1/M3, +M9, +M2, +M4, +M11). Não foi dividido, como pedido.

## Registros sem alteração

- **`tesseract.js` (lockfile da raiz):** `tesseract.js@7.0.0` declara
  `"postinstall": "opencollective-postinstall || true"` (só o aviso de doação). Nenhum
  `package.json` do monorepo tem `trustedDependencies`, e `bun pm untrusted` (Bun 1.3.14) responde
  "Found 0 untrusted dependencies with scripts" — o Bun não roda o script de dependência não
  confiável, e nada foi alterado.
- **`GET /delivery-charges` e `GET /delivery-clients/:id/charge-rules`** pedem `trip.read` e não
  recortam pelo vínculo: motorista e agregado leem as cobranças da empresa inteira. Pré-existente,
  fora do escopo, registrado em `docs/SECURITY.md` — decisão pendente.
- **IP da auditoria** vem do primeiro endereço de `x-forwarded-for` (forjável). Pré-existente,
  registrado em `docs/SECURITY.md`.
- **Decisões menores tomadas aqui (para o revisor conferir):** a chegada usa códigos
  `ARRIVED_AT_*` (espelho de `RETURNED_AT_*`); a assinatura de bytes errada responde com o código que
  a tela já conhece (`TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`) em vez de um novo; `arrived_at`
  preenchido pelo escritório é a **menor** hora de baixa da parada (a chegada precede a primeira
  entrega); o documento do recebedor no canal `office` não é exigido quando a configuração diz
  `required` (a exigência do ADR-0057 continua só na assinatura colhida).

## Gates

Rodados no fim, sobre `c1a0cd56` (os commits do frontend, de outro agente, entraram no meio e não
tocam a API):

| gate                                                                                     | resultado                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `bun run typecheck` (raiz)                                                               | exit 0                                             |
| `bun run lint` (raiz)                                                                    | exit 0                                             |
| `bun --env-file=../../.env.test test --timeout 120000` (API, contrato)                   | **6714 pass, 0 fail**, 180 arquivos                |
| `bun --env-file=../../.env.test run test:integration` (API, Postgres nativo descartável) | 459 pass, **17 fail** — todas de ambiente (abaixo) |
| as 4 suítes de banco que falharam, com `DATABASE_URL` no Postgres descartável            | **8 pass, 0 fail**                                 |
| `bun --env-file=../../.env.test run db:test` (migration + rollback)                      | **97 pass, 0 fail, 0 skip**                        |

As 17 falhas da integração são de ambiente, nenhuma das suítes da spec 156: 9 são
`database-availability`, `authentication-repository`, `tenant-context` e `auth-me`, que leem
`DATABASE_URL` direto (o Postgres do Docker, 65432, fora do ar — `ERR_POSTGRES_CONNECTION_CLOSED`) e
passam, 8/8, apontadas para o Postgres descartável; 8 são `cte-archive-gateway`,
`toll-booth-extract-storage` e `toll-booth-reload`, que precisam do MinIO local
(`OBJECT_STORAGE_UNAVAILABLE`, 59000 fora do ar). As suítes do escritório
(`trip-field-office`, `trip-field-office-review`, `trip-field-office-router`, `field-trip-target`,
`trip-field-authorship`, `me-trip`, `trip-timeline`, `driver-score`) rodaram com **0 falha e 0 skip**.
