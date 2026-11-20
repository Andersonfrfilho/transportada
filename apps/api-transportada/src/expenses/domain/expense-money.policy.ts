/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RNF: dinheiro é `numeric` em string, nunca float. Soma em centavos (`bigint`).
 *
 * As regras moram no SDK (`@adatechnology/expense-contracts`), o mesmo código que outras apps usam; este arquivo só
 * mantém os nomes que o módulo já importava.
 */
export { formatCents, isCivilDate, parseMoneyToCents } from '@adatechnology/expense-contracts'
