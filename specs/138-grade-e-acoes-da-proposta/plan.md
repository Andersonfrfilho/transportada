# Spec 138 — Plano

> 🤖 Modelo: `sonnet` em toda a fase.

1. `trip.module.css`: `.proposalTrigger` (`flex-wrap: wrap`), `.proposalMetrics` (flex + reflow em
   2/3/6 colunas), `.proposalMetricValue` (nowrap), `.proposalRow:hover` (substitui
   `.proposalTrigger:hover`), `.proposalActions` (faixa de rodapé sob 64rem).
2. `TripProposalRow.component.tsx`: `Metric` publica `styles.proposalMetricValue` no `<span>` do
   valor; `formatDuration` recebe `durationUnits` (via `buildDurationUnitLabels(tRouting)`).
3. `TripProposalList.component.tsx` e `TripProposalDetail.component.tsx`: mesmo par de mudanças no
   `Total`/`facts` que leem `formatDuration`.
4. `SuggestionVehicleValuation.component.tsx` e `SuggestionValuationReport.component.tsx`: já usam
   `useTranslation('routing')` — só passam `buildDurationUnitLabels(t)`.
5. `suggestionValuation.service.ts`: `formatDuration` ganha o parâmetro `units` e a conta de
   dias/horas/minutos; `buildDurationUnitLabels` novo, exportado.
6. `routing.locale.json` / `routing.en.locale.json`: chave `duration.{days,hours,minutes}`.
7. Contratos: estende `test/trip/proposal-actions.contract.ts` (grade, hover, ações dentro do
   cartão, sem `max-width`) e `test/suggestion-valuation/response.contract.ts` (formatação nova).
8. Gates: `bun run --cwd apps/frontend-transportada test`, `bun run typecheck`, `bun run lint`,
   `make check` na raiz do worktree.
