/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeFiscalEnvironment } from '../../database/nfe.schema.js'
import {
  ACCESS_KEY_LOOKUP_BUDGET_LIMIT,
  ACCESS_KEY_LOOKUP_BUDGET_WINDOW_MS,
} from './nfe-access-key-lookup-budget.constant.js'

export type RequeueCandidate = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly id: string
}

type BudgetRow = {
  readonly blockedUntil: Date | null
  readonly usedInWindow: number
  readonly windowStartedAt: Date
}

export function buildBudgetScopeKey(scope: {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
}): string {
  return `${scope.companyId}:${scope.environment}`
}

/**
 * Leitura sem reserva: a mesma conta que `reserve` faz, sem gastar a unidade. Busca já em voo
 * (`queued`/`querying`) ainda vai reservar, então sai do que resta: sem isso cada ciclo devolve o
 * orçamento inteiro de novo.
 */
export function computeRemainingBudget(params: {
  readonly inFlightCount: number
  readonly now: Date
  readonly row: BudgetRow | undefined
}): number {
  const { inFlightCount, now, row } = params
  return Math.max(0, computeUnreservedBudget({ now, row }) - inFlightCount)
}

function computeUnreservedBudget(params: {
  readonly now: Date
  readonly row: BudgetRow | undefined
}): number {
  const { now, row } = params
  if (row === undefined) return ACCESS_KEY_LOOKUP_BUDGET_LIMIT
  if (row.blockedUntil !== null && row.blockedUntil.getTime() > now.getTime()) return 0

  const isWindowExpired =
    row.windowStartedAt.getTime() <= now.getTime() - ACCESS_KEY_LOOKUP_BUDGET_WINDOW_MS
  if (isWindowExpired) return ACCESS_KEY_LOOKUP_BUDGET_LIMIT
  return Math.max(0, ACCESS_KEY_LOOKUP_BUDGET_LIMIT - row.usedInWindow)
}

/** `candidates` já chega da mais antiga para a mais nova; escopo sem orçamento conhecido não leva nada. */
export function selectLookupsToRequeue(params: {
  readonly candidates: readonly RequeueCandidate[]
  readonly remainingByScope: ReadonlyMap<string, number>
}): readonly RequeueCandidate[] {
  const remaining = new Map(params.remainingByScope)

  return params.candidates.filter((candidate) => {
    const key = buildBudgetScopeKey(candidate)
    const left = remaining.get(key) ?? 0
    if (left <= 0) return false
    remaining.set(key, left - 1)
    return true
  })
}
