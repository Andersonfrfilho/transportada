# Evidência — Spec 253

(Preencher por task: comando, resultado, commit, escaladas de modelo.)

## T1.1 🧠 — validação do contrato (architect, opus, 2026-10-07)

Parecer: **APROVADO COM AJUSTES**. 13 divergências do plano contra o código, todas corrigidas em
`plan.md`/`spec.md`/`tasks.md`: erros em `trips/domain/trip.error.ts` (não há `codes.ts`); sem OpenAPI
nesta API; envelope `page`; `INVALID_REQUEST`; `statusIn`; cursor `created_at::tripId::docId`; sem
`tripCode`; nota via `coalesce(nfe_document_id, freight_calculations.nfe_document_id)`; contratante
único por `(company_id, tax_id)`; `completed` total (inclui encerramento manual); canhoto via
`trip_stop_events.trip_document_id` e `stored_objects`; PDF por `GET` (`anyPermission` só em GET);
EXIF sem `sharp`, a confirmar em spike na T2.4.
Nomes: `TRIP_STATUSES_BEFORE_DISPATCH`, `TRIP_ON_ROAD_STATUSES`, `TRIP_DISPATCHED_STATUSES`,
`isTripDocumentClosed`, `TRIP_DOCUMENT_SEPARATION_STATUSES`, `TRIP_FIELD_READ_POLICY`,
`TRIP_FINANCIALS_POLICY`.

## T1.2 — política de tom do relatório (sonnet)

- `bun --env-file=../../.env.test test ./test/trip-report-tone.contract.test.ts --timeout 120000` (cwd=apps/api-transportada) → 11 pass, 0 fail.
- `bun run typecheck` → limpo. `bun run lint` → limpo (0 warnings).
- Arquivos: `src/trips/domain/resolve-trip-report-tone.policy.ts`, `test/trip-report-tone.contract.test.ts`, `test/trip-report-tone/policy.contract.ts`, registro em `package.json` (`test`).
- Commit: ver `git log --grep "spec 253 T1.2"` (hash no relatório da task; um commit não contém o próprio hash).

## T2.1 — schema, tipos e erros do relatório (sonnet)

- `bun --env-file=../../.env.test test ./test/trip-report-schema.contract.test.ts --timeout 120000` (cwd=apps/api-transportada) → 20 pass, 0 fail.
- `bun run typecheck` → limpo. `bun run lint` → limpo (0 warnings).
- Arquivos: `src/trips/presentation/trip-report.schema.ts` (query), `trip-report-row.schema.ts` (linha e envelope), `src/trips/domain/trip-report.types.ts`, `trip-report.constant.ts` (tetos 5000/200), `TripReportTooLargeError`/`TripProofReportTooLargeError` em `trip.error.ts`, `test/trip-report-schema.contract.test.ts` + `test/trip-report/*.contract.ts`, registro em `package.json`.
- Reuso: `parseAgainstSchema`, `parseListFilter` (`request-parsing.service.ts`) e `parseIsoDateTime` (`trip.schema.ts`) passaram a ser exportados; os parsers de `GET /trips` entram no Zod por `fromParser`, assim os erros saem juntos em `details`.
- Commit: ver `git log --grep "spec 253 T2.1"`.

## T2.2 — consulta e use case do relatório (sonnet)

- `bun --env-file=../../.env.test test ./test/trip-report-list.contract.test.ts --timeout 120000` (cwd=apps/api-transportada) → 14 pass, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-report.integration.ts` → 6 pass, 0 fail, contra o Postgres de teste (executou, não pulou): filtros no SQL, cursor entre páginas, nota liberada e viagem cancelada fora, nota por frete, contratante sem cadastro, empresa isolada.
- `bun run typecheck` → limpo. `bun run lint` → limpo (0 warnings).
- Arquivos: `src/trips/application/trip-report.port.ts`, `list-trip-report.use-case.ts`, `src/trips/infrastructure/trip-report.query.ts`, `drizzle-trip-report.repository.ts`, `test/trip-report-list/*`, `test/integration/trip-report.integration.ts`, `test/fixtures/trip-report-database.fixture.ts`, registro em `package.json` (`test` e `test:integration`).
- Tom por viagem com as notas da viagem inteira (uma consulta em lote, sem N+1); `total`/`excludedWithoutTrip` só na primeira página; teto 5000 → `TripReportTooLargeError`; sem `trip.financials` a chave `amount` some.
- Commit: ver `git log --grep "spec 253 T2.2"`.

## T2.3 — rota GET /v1/trip-document-report (sonnet)

- Lacuna da T2.2 (RF9): novo teste em `test/integration/trip-report.integration.ts` com `documentIdIn` incluindo nota sem viagem, nota de viagem cancelada e nota de outra empresa → `excludedWithoutTrip = 2`, `total = 1`. Passou sem mudar use case nem repositório.
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-report.integration.ts` (cwd=apps/api-transportada) → 7 pass, 0 fail, contra o Postgres de teste (executou, não pulou).
- E2E (caminho HTTP inteiro + Postgres, `.env.test`, o ambiente dos E2E existentes): `./test/integration/trip-document-report-end-to-end.integration.ts` → 3 pass, 0 fail (operador com valor, separador sem `amount`, isolamento por empresa, cursor pelo HTTP, `excludedWithoutTrip`, 400 com todos os erros, 403 ao motorista).
- Contrato da rota (`test/trip-report-http.contract.test.ts`) → 7 pass: 200, valor omitido sem `trip.financials`, `trip.report-on-behalf` lê, 400 `INVALID_REQUEST` com erros juntos, 401, 403 (use case não roda), 422 `TRIP_REPORT_TOO_LARGE`.
- Existentes tocados: `test/separator-role.contract.test.ts` (o separador alcança `GET /trip-document-report`, `fleet.read`; rota entrou no array e na lista exaustiva) + test-registry, composition, router, authorization, rate-limited-routes, trip-http, helper-role → 532 pass, 0 fail.
- `bun run typecheck` → limpo. `bun run lint` → limpo (0 warnings).
- Arquivos: `src/trips/presentation/trip-document-report.routes.ts` (rota; `TRIP_FIELD_READ_POLICY` e `TRIP_FINANCIALS_POLICY` passaram a ser exportadas de `trip.routes.ts`, que tem 2549 linhas), wiring em `src/main.ts`, `test/trip-report-http*`, `test/integration/trip-document-report-end-to-end.integration.ts`, `package.json`.
- O prefixo `/v1` é do edge: a rota é registrada como `/trip-document-report` (como `/trips`). Resposta `no-store`. O router não define `x-content-type-options` em nenhuma rota; não foi adicionado aqui.
- Commit: ver `git log --grep "spec 253 T2.3"`.
