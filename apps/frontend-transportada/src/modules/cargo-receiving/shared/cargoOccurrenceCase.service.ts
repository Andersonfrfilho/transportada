/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CARGO_CASE_DECISION_KINDS,
  CARGO_CASE_NOTE_REQUIRED_ACTIONS,
} from './cargoOccurrenceCase.constant'
import type { CargoCaseAction, CargoCaseDecisionKind } from './cargoOccurrenceCase.types'
import type { CargoOccurrenceCaseStatus } from './cargoOccurrence.types'

export type CargoCaseActions = Readonly<{
  canCancel: boolean
  canClose: boolean
  canDecide: boolean
  canReturnToWarehouse: boolean
  canReview: boolean
  canSubmit: boolean
  /** O que o escritório pode decidir no lugar do contratante: nunca a reentrega. */
  decisionKinds: readonly CargoCaseDecisionKind[]
}>

const NO_DECISION_KINDS: readonly CargoCaseDecisionKind[] = []

/**
 * Espelha a máquina da API (`occurrence-case-state.policy.ts`): cada estado oferece só o que ela aceita — botão que a
 * API recusa seria botão morto. Cancelar sai de `recorded` e `under_review`; devolver ao galpão e enviar ao contratante
 * só de `under_review`. Decidir é de `awaiting_contractor`, encerrar de `decided`; os três terminais não oferecem nada.
 * Nada de estado da chegada: o contratante decide dias depois do fechamento dela.
 */
export function resolveCargoCaseActions(
  input: Readonly<{ canResolve: boolean; status: CargoOccurrenceCaseStatus | null }>,
): CargoCaseActions {
  const { canResolve, status } = input
  const canDecide = canResolve && status === 'awaiting_contractor'
  return {
    canCancel: canResolve && (status === 'recorded' || status === 'under_review'),
    canClose: canResolve && status === 'decided',
    canDecide,
    canReturnToWarehouse: canResolve && status === 'under_review',
    canReview: canResolve && status === 'recorded',
    canSubmit: canResolve && status === 'under_review',
    decisionKinds: canDecide ? CARGO_CASE_DECISION_KINDS : NO_DECISION_KINDS,
  }
}

export function isCaseNoteRequired(action: CargoCaseAction): boolean {
  return CARGO_CASE_NOTE_REQUIRED_ACTIONS.includes(action)
}
