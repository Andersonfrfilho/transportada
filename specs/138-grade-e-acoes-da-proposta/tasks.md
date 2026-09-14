# Spec 138 — Tarefas

> 🤖 Modelo: `sonnet` em toda a fase.

- [x] **T1** Grade de números: reflow 2/3/6 colunas por `min-width`, `flex-wrap` no gatilho,
      `white-space: nowrap` no valor (`trip.module.css`, `TripProposalRow.component.tsx`)
- [x] **T2** Hover do cartão inteiro (`.proposalRow:hover`), removendo `.proposalTrigger:hover`
- [x] **T3** Ações como faixa de rodapé sob 64rem, ao lado da grade a partir daí
- [x] **T4** `formatDuration` em dias/horas/minutos, com rótulos traduzidos
      (`suggestionValuation.service.ts`, `routing.locale.json`/`.en.locale.json`)
- [x] **T5** Callsites: `TripProposalRow`, `TripProposalList`, `TripProposalDetail`,
      `SuggestionVehicleValuation`, `SuggestionValuationReport`
- [x] **T6** Contratos: `test/trip/proposal-actions.contract.ts` (grade, hover, ações dentro do
      cartão, sem `max-width`, componentes do design system) e
      `test/suggestion-valuation/response.contract.ts` (formatação nova)
- [x] **T7** Gates: `bun test`, `bun run typecheck`, `bun run lint`, `bun run format:check`,
      `make check`; evidência em `evidence.md`
