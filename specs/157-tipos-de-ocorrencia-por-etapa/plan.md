# Plano técnico

## Contexto e premissas

Tudo o que é preciso já existe: `listFieldOccurrenceTypes` (spec 156 T7.3) projeta os tipos de
rua, e `OccurrenceTypeRecord.stage` vem do cadastro. Sem migration.

## Arquitetura e arquivos afetados

- `src/trips/presentation/me-trip.routes.ts`: rota `GET ${API_ME_CURRENT_TRIP_PATH}/occurrence-types`,
  `DRIVER_REPORT_POLICY`, dependência nova `listFieldOccurrenceTypes`.
- `src/main.ts`: liga a dependência ao mesmo `listFieldOccurrenceTypes` da rota do escritório.
- `src/trips/domain/trip.error.ts`: `OccurrenceTypeNotSeparationError` (422).
- `src/trips/application/register-trip-occurrence.use-case.ts`: guarda de etapa logo após ler o tipo.
- `src/trips/presentation/trip.routes.ts`: corrige o comentário que afirmava a conferência.
- Frontend `driver-trip/shared/driverTripClient.service.ts` e `driverTrip.types.ts`.

## Contratos/API/eventos

- `GET /me/trips/current/occurrence-types` → `200 { data: [{ id, name }] }`.
- `POST /trips/:id/documents/:documentId/occurrences` passa a responder 422
  `OCCURRENCE_TYPE_NOT_SEPARATION` para tipo de rua.

## Dados, migration e rollback

Nenhuma migration. Rollback é reverter os commits.

## Segurança e tenant

- `companyId` do contexto. A rota nova não tem id de viagem (ADR-0045 §2) e não expõe o e-mail do
  tipo (`settings.manage`).
- RF4 fecha a elevação `trip.manage` → ocorrência de rua (o `separator` não tem `trip.report`).

## Idempotência e concorrência

Leitura pura; a guarda roda antes de qualquer escrita.

## Observabilidade

Sem mudança.

## Estratégia de testes

Contratos em `test/driver-trip/me-routes.contract.ts` e `test/trip-occurrence/register.contract.ts`;
os contratos de aviso que usavam tipo de rua na rota do galpão passam a usar tipo de galpão.

## Riscos

Algum cliente antigo mandando tipo de rua pela rota do galpão passa a receber 422 — os dois
clientes conhecidos já filtram `separation`.
