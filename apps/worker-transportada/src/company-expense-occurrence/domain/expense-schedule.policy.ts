/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1/RF4: a conta fixa gera uma janela de competências (mês corrente + 3); cada recorrência cai em alguns
 * meses e a quinzenal tem duas datas por mês (`slot` 1 = dia 15, `slot` 2 = último dia).
 *
 * O calendário mora no SDK (`@adatechnology/expense-contracts`), o mesmo que a API importa: deixou de ser cópia por
 * valor. `test/company-expense-occurrence/parity.contract.ts` cobra que as duas apps reexportam do pacote, na mesma
 * versão.
 */
export {
  EXPENSE_GENERATION_WINDOW_MONTHS,
  listExpenseCompetenceWindow,
  resolveExpenseDueDate,
  resolveExpenseSlots,
} from '@adatechnology/expense-contracts'
export type { ExpenseRecurrence } from '@adatechnology/expense-contracts'

/** A data civil de `America/Sao_Paulo` no instante dado (`yyyy-mm-dd`). */
export function civilDateInSaoPaulo(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).format(instant)
}
