/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `apps/worker-transportada/src/cargo-layout/application/cargo-layout-budget.policy.ts`
 * (nenhuma app importa código de outra). A API reabre `queued`/`running` pelo mesmo lease com que o
 * worker reivindica; `test/trip-infrastructure/cargo-layout-lease.contract.ts` lê os dois fontes.
 */

/** Quanto a thread ganha além do próprio prazo antes de ser terminada: o prazo é checado entre fatias. */
export const CARGO_LAYOUT_THREAD_CEILING_MARGIN_MS = 10_000

const CARGO_LAYOUT_LEASE_SLACK_MS = 30_000

/** Topologia `cargo-layout.v1` do worker: `maxRetries: 2` mais a primeira tentativa. */
export const CARGO_LAYOUT_MAX_ATTEMPTS = 3

export const DEFAULT_CARGO_LAYOUT_TIME_BUDGET_MS = 120_000

/** Spec 145 D13: a tentativa N calcula com `base × 2^(N−1)` — 120 s, 240 s, 480 s no padrão. */
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

/** O lease do orçamento padrão (520 s) — o que vale quando `CARGO_LAYOUT_TIME_BUDGET_MS` está ausente. */
export const DEFAULT_CARGO_LAYOUT_LEASE_MS = resolveCargoLayoutLeaseMs({
  baseBudgetMs: DEFAULT_CARGO_LAYOUT_TIME_BUDGET_MS,
  maxAttempts: CARGO_LAYOUT_MAX_ATTEMPTS,
})
