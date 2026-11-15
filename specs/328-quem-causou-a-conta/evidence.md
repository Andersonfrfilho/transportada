# Evidência — spec 328

- API: `test/expenses/caused-by.contract.ts` (5), `test/database-migration/company-expense-caused-by.static.contract.ts`; suites expenses e migration verdes.
- WhatsApp: `test/whatsapp-commands/expense-flow-actions.contract.ts`, 917 pass / 0 fail no entrypoint.
- Painel: `bun run test` 1496 pass / 0 fail; typecheck limpo.
- API: `tsc --noEmit`, eslint e prettier limpos.
