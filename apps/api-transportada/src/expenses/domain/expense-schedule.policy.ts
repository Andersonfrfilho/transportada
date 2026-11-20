/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1/RF4: vencimento é data civil de America/Sao_Paulo, sem hora. A conta fixa gera uma janela de
 * competências (mês corrente + 3); cada recorrência cai em alguns meses e a quinzenal tem duas datas por mês
 * (`slot` 1 = dia 15, `slot` 2 = último dia).
 *
 * As regras moram no SDK (`@adatechnology/expense-contracts`); este arquivo só mantém os nomes que o módulo já
 * importava. Os contratos em `test/expenses/due-date.contract.ts` e `installments.contract.ts` continuam cobrando o
 * comportamento aqui.
 */
export {
  EXPENSE_GENERATION_WINDOW_MONTHS,
  competenceOfDate,
  listExpenseCompetenceWindow,
  resolveExpenseDueDate,
  resolveExpenseSlots,
} from '@adatechnology/expense-contracts'
export type {
  ExpenseScheduleSlot,
  ResolveExpenseDueDateParams,
} from '@adatechnology/expense-contracts'
