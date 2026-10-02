# Plano técnico — Feature 204

## Contexto e premissas

Leia antes:

- `spec.md` e a ADR-0086;
- as ADRs 0045 §6, 0057, 0067 §2–§3 e 0070;
- a spec 209, quando publicada;
- o `CLAUDE.md` da raiz e os de `apps/api-transportada`, `apps/frontend-driver` e
  `apps/frontend-transportada`.

### Pré-requisitos (conferidos na T0.1 contra `origin/staging`)

| Item                                                                                                              | Como conferir                                        | Se faltar                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| **209:** `attachmentObjectId` em qualquer motivo de `POST .../stops/:stopId/occurrences`                          | `me-trip.schema.ts`, contrato da 209                 | **parar e perguntar**; a Fase 3 não começa                |
| **209:** `POST /me/trips/current/stops/:stopId/occurrence-uploads` e `.../confirm`                                | `me-trip.routes.ts`                                  | idem                                                      |
| **209:** forma única do item de ocorrência de parada com foto, `send` único, "fila cheia → sem a foto, com aviso" | `driverTrip.types.ts`, `driverTripClient.service.ts` | **parar e perguntar**; a Fase 4 não começa                |
| **209:** a foto do "Deu problema" fora de `attachProof`                                                           | `DriverTripWorkspace.page.tsx`                       | idem                                                      |
| 196 T1.2 (`trip_stop_occurrences.captured_at`)                                                                    | `trip.schema.ts`                                     | **não** é pré-requisito: a espera usa `occurred_at` (D11) |
| 196 T5.0: API de demonstração versionada em `apps/frontend-driver/scripts/driver-preview-api.ts`                  | `ls apps/frontend-driver/scripts`                    | a T4.0 a versiona                                         |
| 208: tipo novo em `shared/occurrence-type-catalog.constant.ts`                                                    | `git log origin/staging -- <arquivo>`                | a 204 não edita esse arquivo                              |

### Premissas conferidas no código (2026-09-25)

- **Leitores de `stage`.** Todos os que decidem comparam com valor positivo:
  - `register-driver-occurrence.use-case.ts:99`;
  - `office-occurrence-batch.service.ts:38`;
  - `register-trip-occurrence.use-case.ts:300`;
  - `attach-occurrence-photo.use-case.ts:99`;
  - `list-field-occurrence-types.use-case.ts:41`;
  - `register-driver-flow-actions.ts:368,414`;
  - `register-operator-trip-flow-actions.ts:583,628`.

  `dispatch-readiness.query.ts:51` lê `trip_document_occurrences.stage`, que não ganha a etapa nova.

- **Validação do painel.** `isOccurrenceType` valida `stage` com vocabulário fechado
  (`tripResponse.validation.ts:1468-1530`). Sem tolerância, uma resposta com um tipo `charge` derruba a
  lista inteira no painel publicado.
- **Custo da viagem.** A valoração soma `delivery_charges` `recorded`/`submitted`/`approved`/`reimbursed`
  por `trip_id` (`trip-valuation.query.ts:467-479`), e a sugestão já grava `trip_id`
  (`drizzle-delivery-charge.repository.ts:52`).
- **Templates de aviso.** Moram no banco. O seed só insere `(key, channel, locale)` ausente
  (`notification-template-seed.service.ts:52-80`).
- **Postgres.** A imagem do `compose.yaml` (digest `742f40ea…`) é **17.10** (`PG_VERSION`); o servidor
  de produção é `postgres-ssl:18` (`docs/ops/backup-emergencia.md:29`); o local é 18. `ON DELETE SET NULL
(coluna)` exige 15 ou mais.
- **Apagar parada.** A parada que esvazia é apagada em `drizzle-trip-stop-reconciliation.support.ts:39-43`
  e em `drizzle-trip-route.repository.ts:822-824`; `trip_stop_occurrences` cai em cascata.
- **Eventos de chegada.** `trip_stop_events` tem `captured_at`, `created_at` e `recorded_at`.
- **Lançamento manual.** A rota é JSON (`deliveryChargeRecordSchema`, `delivery-charge.routes.ts:47-55`),
  sem arquivo.
- **Máscara do painel.** `TYPED_AMOUNT_MAX_DIGITS = 15` (`decimalAmount.service.ts:30`); a cópia na app
  usa 7.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada/src`)

| Camada           | Arquivo                                                                                                                                                                                                                                                | O que muda                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared           | `shared/trip-occurrence.constant.ts`                                                                                                                                                                                                                   | `COMPANY_OCCURRENCE_TYPE_STAGE` (três valores) e o tipo; `TRIP_OCCURRENCE_STAGE` não muda                                                          |
| shared           | `shared/delivery-charge-type.constant.ts` (novo)                                                                                                                                                                                                       | `DELIVERY_CHARGE_TYPES`/`MANUAL_DELIVERY_CHARGE_TYPES` saem de `delivery-client.schema.ts` (que reexporta), para o `trip.schema.ts` usar sem ciclo |
| shared           | `shared/charge-type-catalog.constant.ts` (novo)                                                                                                                                                                                                        | o catálogo de D4                                                                                                                                   |
| database         | `database/trip.schema.ts`                                                                                                                                                                                                                              | etapa, `delivery_charge_type` e CHECKs em `company_occurrence_types`; colunas e CHECKs em `trip_stop_occurrences`                                  |
| database         | `database/delivery-client.schema.ts`                                                                                                                                                                                                                   | `stop_occurrence_id`, FK, índice único parcial, predicado novo de `delivery_charges_suggested_unique`                                              |
| database         | `database/charge-type-catalog-seed.service.ts` (novo), `pre-deploy.service.ts`, `local-occurrence-type-seed.service.ts`                                                                                                                                | bootstrap da etapa `charge`                                                                                                                        |
| trips            | `trips/presentation/occurrence.schema.ts` (`occurrenceTypeSchema`), `trips/application/save-occurrence-type.use-case.ts`, `trips/domain/occurrence-settings.policy.ts`, `trips/infrastructure/delivery-proof-read.support.ts` (`:640`, `:766`, `:832`) | etapa `charge` no cadastro, com a forma fixa                                                                                                       |
| trips            | `trips/application/list-field-occurrence-types.use-case.ts`, `me-trip.routes.ts`                                                                                                                                                                       | a etapa como parâmetro; `GET /me/trips/current/charge-types`                                                                                       |
| trips            | `trips/domain/field-occurred-at.policy.ts` (novo, puro)                                                                                                                                                                                                | trava de `occurredAt`, reaproveitando os limites de `resolveTimeReference`                                                                         |
| trips            | `trips/domain/stop-wait.policy.ts` (novo, puro)                                                                                                                                                                                                        | `measureStopWait`                                                                                                                                  |
| trips            | `trips/presentation/me-trip.schema.ts`                                                                                                                                                                                                                 | `occurredAt`, `charge`                                                                                                                             |
| trips            | `trips/application/report-stop-occurrence.use-case.ts`, `driver-field-report.port.ts`, `trips/infrastructure/drizzle-driver-field-report.repository.ts`                                                                                                | ramos de cobrança e espera; `findFirstStopArrival`, `findChargeOccurrenceType`, `recordOccurrence` com as colunas novas                            |
| trips            | `trips/infrastructure/stop-occurrence-notifier.gateway.ts`, `trips/domain/stop-occurrence-notification.policy.ts`                                                                                                                                      | escolha da chave nova e os rótulos                                                                                                                 |
| trips            | `trips/infrastructure/trip-occurrence-feed.query.ts`, `trip-timeline-stop.query.ts`                                                                                                                                                                    | `charge`, `wait` e `occurredAt`, num `SELECT` por consulta                                                                                         |
| trips            | `trips/application/transition-trip-document.use-case.ts` (sem mudança de assinatura)                                                                                                                                                                   | nada; o pulo mora em `onDelivered`                                                                                                                 |
| delivery-clients | `application/suggest-delivery-charges.use-case.ts`                                                                                                                                                                                                     | `onStopChargeReported`; `onDelivered` pula (RF8)                                                                                                   |
| delivery-clients | repositório de `delivery_charges`, consulta de `GET /delivery-charges`, `presentation/delivery-charge.routes.ts`                                                                                                                                       | `stopOccurrence`, `ruleAmount`, `siblingRuleCharge`; `stopOccurrenceId` no lançamento manual                                                       |
| notification     | `notification/domain/notification-catalog.constant.ts`                                                                                                                                                                                                 | duas chaves e textos novos (seed)                                                                                                                  |
| composição       | `main.ts` (`:2184-2195`, `:3074-3080`)                                                                                                                                                                                                                 | `occurredAt` e `charge` do corpo; `missingAfterHours` da empresa para a trava                                                                      |

O worker **não muda**. Ele renderiza templates do banco pela chave do payload, e a cópia de chaves em
`worker-transportada/src/notification/notification.constant.ts` só é usada pelos gatilhos de CT-e e de
cobrança. A T0.1 confere se algum contrato de paridade exige as chaves novas lá; se exigir, entram só as
chaves.

### App do motorista (`apps/frontend-driver/src/modules/driver-trip`)

| Arquivo                                                                                | O que muda                                                                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `components/DriverStopOccurrenceForm.component.tsx`                                    | extraído do cartão (RF16), ou o da 209                                                  |
| `components/StopChargeFields.component.tsx` (novo)                                     | tipo, valor, nota, recibo                                                               |
| `components/StopWaitSummary.component.tsx` (novo)                                      | "Esperando há…"                                                                         |
| `hooks/useStopOccurrenceForm.hook.ts` (novo)                                           | estado, recibo reduzido ou PDF conferido, temporizador de um minuto com limpeza         |
| `shared/stopOccurrence.service.ts` (novo)                                              | `listMissingStopChargeFields`, `buildStopOccurrenceReport` (com `occurredAt`)           |
| `shared/stopWait.service.ts` (novo)                                                    | `resolveWaitReference` e o texto                                                        |
| `shared/driverMoney.service.ts` (novo, cópia por valor)                                | `maskTypedAmount`/`parseTypedAmount`/`formatAmount`, com `DRIVER_CHARGE_MAX_DIGITS = 7` |
| `shared/driverDuration.service.ts` (novo, cópia por valor)                             | `formatDuration`                                                                        |
| `shared/chargeTypesCache.service.ts` (novo)                                            | cópia por dono no molde de `occurrenceTypesCache.service.ts`                            |
| `shared/driverTrip.types.ts`, `driverTripClient.service.ts`, `offlineQueue.service.ts` | `occurredAt` e `charge?` na forma da 209; `listChargeTypes`                             |
| `pages/DriverTripWorkspace.page.tsx`, `hooks/useDriverTrip.hook.ts`                    | carga dos tipos de taxa; texto da fila cheia com cobrança                               |
| `shared/occurrenceNoticePreview.service.ts`, locales                                   | chaves novas e textos                                                                   |
| `scripts/driver-preview-api.ts`                                                        | versionado na T4.0, se a 196 T5.0 não o fez                                             |

### Painel (`apps/frontend-transportada/src/modules`)

| Arquivo                                                                                                                                 | O que muda                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `trip/shared/tripResponse.validation.ts`, `trip.constant.ts`, `trip.types.ts`, `trip/shared/occurrence.constant.ts`                     | tolerância (push 1)                             |
| `company-settings/components/OccurrenceTypeCatalogPanel.component.tsx`, `ChargeTypeCatalogSection.component.tsx` (novo), hook           | seção de taxas; a lista antiga esconde `charge` |
| `trip/shared/tripTimeline.service.ts`, `trip/components/TripTimeline.component.tsx`                                                     | motivo traduzido e detalhe                      |
| `trip/shared/tripOccurrenceFeedClient.service.ts`, `tripOccurrenceFeed.service.ts`, `trip/components/TripOccurrenceTable.component.tsx` | detalhe e "Lançar à mão"                        |
| `extra-charges/shared/extraChargesResponse.validation.ts`, `extraCharges.types.ts`, `pages/ExtraChargeWorkspace.page.tsx`               | os dois valores, o aviso de irmã, "Ver recibo"  |
| `driver-trip/shared/occurrenceNoticePreview.service.ts` (módulo legado)                                                                 | só o texto, pela paridade                       |

## Contratos/API/eventos

| Rota                                               | Permissão         | Muda                                                                                      | Erros novos                                                                  |
| -------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`/`PUT /company-settings/occurrence-types`     | `settings.manage` | `stage: 'charge'`, `deliveryChargeType`                                                   | 400 (categoria fora do manual; campo fora da forma fixa)                     |
| `GET /me/trips/current/charge-types`               | `trip.report`     | nova: `{ data: [{ id, name }] }`                                                          | 409 `DRIVER_NOT_REGISTERED`                                                  |
| `POST /me/trips/current/stops/:stopId/occurrences` | `trip.report`     | `occurredAt?`, `charge?: { amount, chargeOccurrenceTypeId }` (sobre a forma da 209)       | 400 só de forma                                                              |
| `POST /trips/:id/documents/:documentId/charges`    | `trip.manage`     | `stopOccurrenceId?`                                                                       | 422 `STOP_OCCURRENCE_CHARGE_MISMATCH`, 409 `STOP_OCCURRENCE_ALREADY_CHARGED` |
| `GET /trip-occurrences`                            | `trip.read`       | item de parada + `charge`, `wait`, `occurredAt` (sempre presentes, `null` fora do motivo) | —                                                                            |
| `GET /trips/:id/timeline`                          | `trip.read`       | `occurrence` do `stop.occurrence` + os mesmos três                                        | —                                                                            |
| `GET /delivery-charges`                            | `trip.manage`     | item + `stopOccurrence`, `ruleAmount`, `siblingRuleCharge` (sempre presentes)             | —                                                                            |

```ts
type StopOccurrenceCharge = {
  readonly amount: string // quatro casas
  readonly category: ManualDeliveryChargeType
  readonly typeName: string | null // null: "Outra taxa" sem tipo, ou corpo antigo
  readonly receiptPending: boolean
  readonly suggestionStatus: DeliveryChargeStatus | 'none'
}

type StopOccurrenceWait = {
  readonly startedAt: string | null
  readonly durationSeconds: number | null
  readonly clock: 'device' | 'server' | null
  readonly state: 'measured' | 'no_arrival' | 'clock_mismatch'
}
```

- **Aviso.** O trilho `notification.v1` continua o mesmo.
  - `trip.occurrence-unexpected-charge-amount` recebe `{ stopLabel, occurredAt, documentLabel,
chargeLabel }`.
  - `trip.occurrence-long-wait-duration` recebe `{ stopLabel, occurredAt, documentLabel, waitLabel }`.
  - As chaves antigas continuam para o caminho legado e para o escritório.
- **Placeholder ausente.** O renderizador do módulo de notificação o troca por "" (a T0.1 confere; se
  não trocar, a T3.5 faz o notificador sempre mandar a chave, com "").

## Dados, migration e rollback

Migration aditiva, uma pasta, `drizzle/<timestamp>_stop_occurrence_charge_and_wait/`, com `migration.sql`,
`rollback.sql` e `snapshot.json`. Ela é gerada depois do rebase sobre as migrations da 209, da 196 e da
195 que estiverem em `origin/staging`.

**`company_occurrence_types`:**

- `delivery_charge_type varchar(32)` anulável;
- `company_occurrence_types_stage_check` recriado com `separation`, `delivery`, `charge`;
- `company_occurrence_types_charge_category_check`: `(stage = 'charge') = (delivery_charge_type is not null)`
  e o valor na lista manual;
- `company_occurrence_types_charge_shape_check`: `stage <> 'charge'` ou (`attachment_mode = 'required'`,
  `not notifies`, `not emails_contractor`, `email_template_key is null`, `redelivery_policy = 'unset'`,
  `not leaves_document_behind`).

**`trip_stop_occurrences`**, nove colunas anuláveis, sem default e sem backfill:

| Coluna                      | Tipo            |
| --------------------------- | --------------- |
| `occurred_at`               | `timestamptz`   |
| `charge_amount`             | `numeric(14,4)` |
| `charge_type`               | `varchar(32)`   |
| `charge_type_name`          | `text`          |
| `charge_occurrence_type_id` | `uuid`          |
| `wait_started_at`           | `timestamptz`   |
| `wait_duration_seconds`     | `integer`       |
| `wait_clock`                | `varchar(8)`    |
| `wait_state`                | `varchar(16)`   |

| CHECK                                         | Regra                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `trip_stop_occurrences_charge_kind_check`     | `kind = 'unexpected_charge'` ou as quatro colunas de cobrança nulas                            |
| `trip_stop_occurrences_charge_amount_check`   | `charge_amount is null or charge_amount > 0`                                                   |
| `trip_stop_occurrences_charge_presence_check` | `(charge_amount is null) = (charge_type is null)`; nome e tipo só com valor                    |
| `trip_stop_occurrences_charge_type_check`     | `charge_type` nulo ou na lista manual                                                          |
| `trip_stop_occurrences_wait_kind_check`       | `kind = 'long_wait'` ou as quatro colunas de espera nulas                                      |
| `trip_stop_occurrences_wait_state_check`      | `wait_state` nulo ou em `measured`, `no_arrival`, `clock_mismatch`                             |
| `trip_stop_occurrences_wait_measured_check`   | `measured` exige início, duração `>= 0` e relógio; fora de `measured`, duração e relógio nulos |
| `trip_stop_occurrences_wait_clock_check`      | `wait_clock` nulo ou em `device`, `server`                                                     |

FK `trip_stop_occurrences_company_charge_type_fk` `(company_id, charge_occurrence_type_id)` →
`company_occurrence_types (company_id, id)`, `on delete restrict` (tipos nunca são apagados, só
aposentados), com índice parcial.

**`delivery_charges`:**

- `stop_occurrence_id uuid`, com FK `delivery_charges_company_stop_occurrence_fk` `(company_id,
stop_occurrence_id)` → `trip_stop_occurrences (company_id, id)` `ON DELETE SET NULL
(stop_occurrence_id)`. A forma com lista de colunas exige Postgres 15+ (CI 17.10, produção 18).
  - O Drizzle não expressa a lista de colunas: o `migration.sql` é escrito à mão e o schema TS declara
    `onDelete('set null')`.
  - A T1.3 prova com `db:generate` = `no_changes` que o gerador não tenta "consertar" a diferença.
  - O contrato de schema lê `pg_constraint.confdelsetcols` para garantir que o `company_id` não é
    anulado.
- `delivery_charges_stop_occurrence_unique` `(company_id, stop_occurrence_id) where stop_occurrence_id is
not null`.
- `delivery_charges_suggested_unique` recriado com `where status = 'suggested' and origin = 'recurring'`.

**`rollback.sql`:**

- recria `delivery_charges_suggested_unique` com o predicado antigo. Isso **falha** se já houver duas
  sugestões da mesma nota e categoria (Descarga + Chapa); o `rollback.sql` começa por uma consulta que
  as lista, e rollback com dado exige aprovação;
- tira a FK, o índice e a coluna de `delivery_charges`;
- tira os CHECKs, a FK e as nove colunas de `trip_stop_occurrences`;
- recria o CHECK de etapa com dois valores. Falha se houver tipo `charge`, e a mesma consulta de antes os
  lista;
- tira os dois CHECKs novos e a coluna de `company_occurrence_types`.

`docs/spec/domain-model.md` é atualizado na T1.3.

## Segurança e tenant

- `companyId` sempre do contexto. Tipo de taxa, nota, upload (209) e cobrança são procurados dentro da
  empresa.
- O que não é da empresa ou da viagem é tratado como ausente (D16), sem dizer se existe.
- A nota tem de ser da viagem. A da parada é garantida pela tela, porque a recusa no servidor perderia o
  relato de uma nota que mudou de parada entre o toque e a drenagem.
- O recibo passa pela conferência do servidor da 179/209 (`head()`: tipo, tamanho e sha256).
- **LGPD.** O recibo pode ter nome e CPF do chapa.
  - Ele não vai para log, a chave do objeto não tem dado pessoal, e ele só sai por URL assinada curta,
    para `trip.read` (feed) e `trip.manage` (`/repasses`).
  - `delivery_charges.proof_object_id` não é usado. A T0.1 confere que a página pública do lote não lê o
    recibo pela ocorrência.
  - Registro em `docs/SECURITY.md` na T6.3.
- Log só com ids opacos, `kind`, `channel` e estados. Sem valor, descrição, nome ou hora.

## Idempotência e concorrência

- O relato usa `stop.occurrence` e a chave do toque (`withFieldReport`), como hoje.
- A derivação é idempotente por `delivery_charges_stop_occurrence_unique` (`INSERT … ON CONFLICT DO
NOTHING`).
- O pulo da regra (`onDelivered`) é uma leitura antes do `insert`. Se ela correr junto com um relato, as
  duas sugestões podem nascer; o painel mostra o aviso de irmã, e nada é confirmado sem gente. Isso é
  aceito e fica registrado.
- A espera lê o primeiro `arrived` dentro da transação do relato.
- O lançamento manual com `stopOccurrenceId` é protegido pelo mesmo índice único (409).

## Observabilidade

- `stop_charge_without_amount` (info), `stop_charge_type_unknown` (warn), `stop_charge_receipt_pending`
  (info) e `stop_charge_document_unreachable` (warn): todos com `companyId`, `stopId` e `channel`.
- `delivery_charge_suggestion_failed` (warn), com `stopOccurrenceId`.
- `occurred_at_clamped` (debug), com o lado da trava e sem a hora.
- Tudo na máscara do `code-standart.md` §11, com `correlation-id`.

## Estratégia de testes

Contrato antes da implementação. Suíte nova no entrypoint nomeado; o aceite diz "a contagem subiu em N".

| App    | Suíte                                                                                                             | Entrypoint                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| API    | `test/trip-schema/stop-occurrence-charge-wait.contract.ts`                                                        | `test/trip-schema.contract.test.ts`            |
| API    | `test/trip-occurrence/charge-stage.contract.ts` (cadastro e recusa nas rotas de nota)                             | `test/trip-occurrence.contract.test.ts`        |
| API    | `test/delivery-client-schema/stop-occurrence-link.contract.ts`                                                    | `test/delivery-client-schema.contract.test.ts` |
| API    | `test/delivery-clients/stop-charge-suggestion.contract.ts`                                                        | `test/delivery-clients.contract.test.ts`       |
| API    | `test/driver-trip/stop-occurrence-charge.contract.ts`                                                             | `test/driver-trip.contract.test.ts`            |
| API    | `test/trip-domain/field-occurred-at.contract.ts`, `stop-wait-policy.contract.ts`                                  | `test/trip-domain.contract.test.ts`            |
| API    | `test/trip-occurrence/stop-notification.contract.ts` (estendida)                                                  | `test/trip-occurrence.contract.test.ts`        |
| API    | os `tenant-safety` do feed e da linha do tempo (estendidos)                                                       | `test/trip-schema.contract.test.ts`            |
| API    | `test/integration/charge-type-catalog-seed.integration.ts`                                                        | `test:integration` (à mão)                     |
| API    | `test/integration/stop-occurrence-charge.integration.ts` (as duas ordens, Descarga + Chapa, concorrência, margem) | `test:integration`                             |
| API    | `test/integration/stop-occurrence-wait.integration.ts`                                                            | `test:integration`                             |
| API    | `test/integration/stop-occurrence-stop-deleted.integration.ts` (esvaziar a parada)                                | `test:integration`                             |
| Driver | `stop-charge-form`, `stop-wait`, `stop-charge-queue`, `driver-money`, `charge-types-cache` (`.contract.ts`)       | `test/driver-trip.contract.test.ts`            |
| Painel | `test/trip/charge-stage-tolerance.contract.ts`, `stop-occurrence-detail.contract.ts`                              | `test/trip.contract.test.ts`                   |
| Painel | `test/company-settings/charge-type-section.contract.ts`                                                           | `test/company-settings.contract.test.ts`       |
| Painel | `test/extra-charges/stop-occurrence-suggestion.contract.ts`                                                       | `test/extra-charges.contract.test.ts`          |

Os comandos da API, a `make migration-test` e o preview estão no `tasks.md`.

## Ordem de deploy e rollback

1. **Push 1 — painel tolerante (T1.1).** Ele aceita a etapa `charge`, os campos novos e `null`. Sem ele,
   o cadastro de tipos e a linha do tempo quebram no painel publicado.
2. **Push 2 — banco, API e seeds (Fases 1–3).** Depende da 209 publicada. Sonda na T3.7.
3. **Push 3 — app e telas (Fases 4–5).** Só depois do preview e do "pode subir" do usuário.

**Rollback:**

- **Depois do push 3,** a API **não volta** para antes do push 2. A PWA em cache e as filas mandam
  `charge` e `occurredAt`, e o schema `.strict()` antigo responderia 400: os itens ficariam recusados na
  fila.
- **A ordem é:** reverter a app, esperar a atualização da PWA e a drenagem (a medição de
  `stop_charge_without_amount` deixa de cair), e só então considerar a API.
- **O `rollback.sql` com dado** exige aprovação humana.

## Riscos

| #   | Risco                                                                                  | Mitigação                                                                                 |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R1  | A 209 não publicou                                                                     | pré-requisito; as Fases 3 e 4 param e perguntam                                           |
| R2  | Chegada sem GPS drenada depois do toque: `clock_mismatch` ou duração curta em `server` | o painel diz o relógio. `occurredAt` no "Cheguei" é continuação (196/205)                 |
| R3  | O renderizador não trata placeholder ausente                                           | a T0.1 confere; o notificador manda "" sempre                                             |
| R4  | Ciclo de import entre schemas                                                          | constantes em `shared/`                                                                   |
| R5  | O `db:generate` quer reescrever a FK `SET NULL (coluna)`                               | 🧠 na T1.3 com o `architect`; contrato em `pg_constraint`                                 |
| R6  | O pulo da regra corre junto com o relato                                               | aceito; o aviso de irmã em `/repasses`                                                    |
| R7  | Conflito com 192, 193, 195, 196, 197, 203, 205, 206, 207, 208, 209                     | `git log origin/staging` antes de cada task; extração do formulário primeiro              |
| R8  | Número de spec, ADR ou migration colidir                                               | conferir em `origin/staging` antes do push; `db:generate` = `no_changes`                  |
| R9  | O `rollback.sql` falha com Descarga + Chapa ou com tipo `charge`                       | a consulta de pré-checagem no topo; aprovação humana                                      |
| R10 | O painel publicado sem o push 1 recebe um tipo `charge`                                | a ordem de deploy; a sonda da T3.7 confere o painel de staging carregando a tela de tipos |
