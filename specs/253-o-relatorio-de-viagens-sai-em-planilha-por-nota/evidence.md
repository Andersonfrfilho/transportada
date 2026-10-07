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
