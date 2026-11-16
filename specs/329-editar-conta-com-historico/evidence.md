# Evidência — spec 329

- API: `test/expenses/expense-management.contract.ts` (histórico, paga/vencida intacta, competência futura nasce com o valor novo, sem
  linha para valor igual, competência inválida), `test/database-migration/company-expense-amount-changes.static.contract.ts`,
  `test/expenses/expense-routes.contract.ts` (rota do histórico).
- Worker: `test/company-expense-occurrence/parity.contract.ts` (mesma subconsulta). Os 5 testes do decodificador de canhoto
  (`worker_thread`) já falham neste ambiente por causa do ambiente, sem relação.
- Painel: `test/expenses/view.contract.ts` (link), `test/expenses/response.contract.ts` (histórico). 1496 pass.
- Banco real: `test/integration/expenses-repository.integration.ts` (13 categorias) roda na CI.
