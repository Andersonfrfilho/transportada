/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { UnplacedReason } from '@adatechnology/cargo-placement'

/** Códigos estáveis (spec 145 D9, D15): a tela os traduz, e um código novo é mudança de contrato. */
export const CARGO_LAYOUT_ERROR = {
  failed: 'CARGO_LAYOUT_FAILED',
  timeBudgetExceeded: 'CARGO_LAYOUT_TIME_BUDGET_EXCEEDED',
  unavailable: 'CARGO_LAYOUT_UNAVAILABLE',
} as const

export type CargoLayoutErrorCode = (typeof CARGO_LAYOUT_ERROR)[keyof typeof CARGO_LAYOUT_ERROR]

/** D13: a caixa que ficou de fora por prazo, não por espaço — `satisfies` prende o literal ao pacote. */
export const TIME_BUDGET_UNPLACED_REASON = 'time_budget' as const satisfies UnplacedReason
