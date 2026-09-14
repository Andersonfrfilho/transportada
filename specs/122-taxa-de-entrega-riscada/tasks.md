# Spec 122 — Tarefas

> 🤖 Modelo: `sonnet`

- [x] T1 — Contrato do frontend: `isGapStruckThrough` verdadeiro só para `FEATURE_ABSENT`, falso
      para as demais lacunas, marca segue o `gap` e não o `kind`, texto continua presente, CSS usa
      token existente (vermelho antes do código).
- [x] T2 — `valuationLedger.service.ts`: `STRUCK_THROUGH_GAPS` e `isGapStruckThrough` em
      `ValuationLedgerLine`.
- [x] T3 — `ValuationLedger.component.tsx`: classe `styles.ledgerGapAbsent` somada quando
      `line.isGapStruckThrough`.
- [x] T4 — `tripFinancials.module.css`: `.ledgerGapAbsent` com `text-decoration: line-through` e
      `var(--color-copper)`.
- [x] T5 — Ajustar o teste existente (`valuation-ledger.contract.ts`) para o campo novo.
- [x] T6 — `specs/122-*` (spec, tasks, evidence) e `make check`.

Verificação: `bun test ./test/trip-financials.contract.test.ts ./test/trip.contract.test.ts
./test/design-system.contract.test.ts` (apps/frontend-transportada), `bun run typecheck`,
`make check`.
