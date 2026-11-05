# Evidência — 294

## T0.1 — ADR 0113 (2026-11-05)

- `git fetch && git ls-tree origin/staging docs/adr/` → maior número em `origin/staging` é 0112 (0109 não existe);
  **0113 livre**.
- Tabela de eventos confirmada em `apps/api-transportada/src/database/trip.schema.ts`: **`trip_stop_events`**
  (`tripStopEvents`, `kind ∈ {arrived, delivered, returned, occurrence, departed, departure_cancelled}`). Saída
  (`report-stop-departure.use-case.ts:123`), chegada (`report-stop-arrival.use-case.ts:119`) e baixa
  (`document-outcome-steps.service.ts:127`) gravam por `recordEvent` →
  `drizzle-driver-field-report.repository.ts:800` (`insert(tripStopEvents)`). A saída também marca
  `trip_stops.en_route_since` (`markStopEnRoute`). A baixa de campo não escreve em `trip_document_events`.
  `plan.md` atualizado.
- `grep -rn "trip_stop_location_suggestions\|address_correction_suggestions" src drizzle` → nada: a tabela da
  ADR-0080/195 nunca foi criada.
- `docs/adr/` não tem índice (`README`); a convenção é marcar a ADR antiga no cabeçalho. ADR-0080 ganhou
  "Substituída em parte por: ADR-0113".
- `npx prettier@3 --check` nos arquivos alterados → todos formatados.
- `grep -n "0113" docs/adr -r` → `0113-…md:1` e `0080-…md:6`.
