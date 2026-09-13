/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Códigos estáveis (spec 145 D9, D15): a tela os traduz, e um código novo é mudança de contrato. */
export const CARGO_LAYOUT_ERROR = {
  failed: 'CARGO_LAYOUT_FAILED',
  timeBudgetExceeded: 'CARGO_LAYOUT_TIME_BUDGET_EXCEEDED',
  unavailable: 'CARGO_LAYOUT_UNAVAILABLE',
} as const

export type CargoLayoutErrorCode = (typeof CARGO_LAYOUT_ERROR)[keyof typeof CARGO_LAYOUT_ERROR]
