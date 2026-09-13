/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Quanto a thread ganha além do próprio prazo antes de ser terminada: o prazo é checado entre fatias. */
export const CARGO_LAYOUT_THREAD_CEILING_MARGIN_MS = 10_000

const CARGO_LAYOUT_LEASE_SLACK_MS = 30_000

/** Spec 145 D13: a tentativa N calcula com `base × 2^(N−1)` — 60 s, 120 s, 240 s no padrão. */
export function resolveCargoLayoutBudgetMs(input: {
  readonly attempt: number
  readonly baseBudgetMs: number
}): number {
  return input.baseBudgetMs * 2 ** (Math.max(input.attempt, 1) - 1)
}

/**
 * Spec 145 D14: `running` mais velho que isto é órfão (worker morto no meio) e pode ser reivindicado
 * de novo. Nenhuma tentativa viva passa do maior degrau somado ao teto externo; a folga cobre a escrita.
 */
export function resolveCargoLayoutLeaseMs(input: {
  readonly baseBudgetMs: number
  readonly maxAttempts: number
}): number {
  return (
    resolveCargoLayoutBudgetMs({ attempt: input.maxAttempts, baseBudgetMs: input.baseBudgetMs }) +
    CARGO_LAYOUT_THREAD_CEILING_MARGIN_MS +
    CARGO_LAYOUT_LEASE_SLACK_MS
  )
}
