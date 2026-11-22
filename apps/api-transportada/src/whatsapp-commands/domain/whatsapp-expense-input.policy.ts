/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 326 — o que o financeiro digita vira valor, data e dia da conta. Funções puras.
 *
 * As regras moram no SDK (`@adatechnology/expense-contracts`), o mesmo código que outras apps usam; este arquivo só
 * mantém os nomes que o módulo já importava.
 */
export {
  parseExpenseAmount,
  parseExpenseDueDate,
  parseExpenseDueDay,
} from '@adatechnology/expense-contracts'
