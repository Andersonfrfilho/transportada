/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8a (ADR-0094 §9.3–9.5): a marcação "devolver ao contratante", ortogonal ao eixo da nota.
 * `none → marked → returned`; desfazer volta a `none`; `returned` é terminal. Sem I/O.
 */
import {
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_RETURN_STATE as RETURN,
  CARGO_ARRIVAL_STATUS,
  type CargoArrivalDocumentState,
  type CargoArrivalReturnState,
  type CargoArrivalStatus,
} from '../../shared/cargo-arrival.constant.js'
import type { TripOccurrenceCaseStatus } from '../../database/trip.schema.js'

export const CARGO_ARRIVAL_RETURN_ACTION = {
  complete: 'complete',
  mark: 'mark',
  unmark: 'unmark',
} as const
export type CargoArrivalReturnAction =
  (typeof CARGO_ARRIVAL_RETURN_ACTION)[keyof typeof CARGO_ARRIVAL_RETURN_ACTION]

export const CARGO_ARRIVAL_RETURN_REFUSAL = {
  alreadyMarked: 'CARGO_ARRIVAL_RETURN_ALREADY_MARKED',
  closed: 'CARGO_ARRIVAL_CLOSED',
  decisionPending: 'CARGO_ARRIVAL_RETURN_DECISION_PENDING',
  inLiveTrip: 'CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP',
  notMarked: 'CARGO_ARRIVAL_RETURN_NOT_MARKED',
  occurrenceInvalid: 'CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID',
  returned: 'CARGO_ARRIVAL_DOCUMENT_RETURNED',
} as const
export type CargoArrivalReturnRefusal =
  (typeof CARGO_ARRIVAL_RETURN_REFUSAL)[keyof typeof CARGO_ARRIVAL_RETURN_REFUSAL]

/** Concluir a devolução é gesto físico: só depois de a tratativa da origem ter decisão (ajuste 8). */
const DECIDED_CASE_STATUSES: readonly TripOccurrenceCaseStatus[] = ['decided', 'closed']

export type CargoArrivalReturnMark = {
  readonly occurrenceId: string | null
  readonly state: CargoArrivalReturnState
}

export type DecideCargoArrivalReturnParams = {
  readonly action: CargoArrivalReturnAction
  readonly arrivalStatus: CargoArrivalStatus
  /** A tratativa da ocorrência que motivou a marcação; `null` quando o tipo não abre tratativa. */
  readonly caseStatus: TripOccurrenceCaseStatus | null
  readonly current: CargoArrivalReturnMark
  readonly isInLiveTrip: boolean
  /** Só para marcar: a ocorrência pedida, já conferida como desta nota; `null` quando não é. */
  readonly occurrence: { readonly id: string; readonly isCancelled: boolean } | null
}

export type CargoArrivalReturnDecision =
  | { readonly next: CargoArrivalReturnMark; readonly outcome: 'changed' }
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'refused'; readonly reason: CargoArrivalReturnRefusal }

const refused = (reason: CargoArrivalReturnRefusal): CargoArrivalReturnDecision => ({
  outcome: 'refused',
  reason,
})

function decideMark(params: DecideCargoArrivalReturnParams): CargoArrivalReturnDecision {
  const { current, occurrence } = params
  if (current.state === RETURN.returned) return refused(CARGO_ARRIVAL_RETURN_REFUSAL.returned)
  if (occurrence === null || occurrence.isCancelled) {
    return refused(CARGO_ARRIVAL_RETURN_REFUSAL.occurrenceInvalid)
  }
  if (current.state === RETURN.marked) {
    return current.occurrenceId === occurrence.id
      ? { outcome: 'unchanged' }
      : refused(CARGO_ARRIVAL_RETURN_REFUSAL.alreadyMarked)
  }
  if (params.isInLiveTrip) return refused(CARGO_ARRIVAL_RETURN_REFUSAL.inLiveTrip)
  return { next: { occurrenceId: occurrence.id, state: RETURN.marked }, outcome: 'changed' }
}

function decideUnmark({ current }: DecideCargoArrivalReturnParams): CargoArrivalReturnDecision {
  if (current.state === RETURN.returned) return refused(CARGO_ARRIVAL_RETURN_REFUSAL.returned)
  if (current.state === RETURN.none) return { outcome: 'unchanged' }
  return { next: { occurrenceId: null, state: RETURN.none }, outcome: 'changed' }
}

function decideComplete(params: DecideCargoArrivalReturnParams): CargoArrivalReturnDecision {
  const { caseStatus, current } = params
  if (current.state === RETURN.returned) return { outcome: 'unchanged' }
  if (current.state === RETURN.none) return refused(CARGO_ARRIVAL_RETURN_REFUSAL.notMarked)
  if (caseStatus !== null && !DECIDED_CASE_STATUSES.includes(caseStatus)) {
    return refused(CARGO_ARRIVAL_RETURN_REFUSAL.decisionPending)
  }
  return {
    next: { occurrenceId: current.occurrenceId, state: RETURN.returned },
    outcome: 'changed',
  }
}

const DECIDERS: Readonly<
  Record<
    CargoArrivalReturnAction,
    (params: DecideCargoArrivalReturnParams) => CargoArrivalReturnDecision
  >
> = { complete: decideComplete, mark: decideMark, unmark: decideUnmark }

/** Chegada fechada recusa tudo, como no eixo da nota; repetir o estado atual é no-op sem evento. */
export function decideCargoArrivalReturn(
  params: DecideCargoArrivalReturnParams,
): CargoArrivalReturnDecision {
  if (params.arrivalStatus === CARGO_ARRIVAL_STATUS.closed) {
    return refused(CARGO_ARRIVAL_RETURN_REFUSAL.closed)
  }
  return DECIDERS[params.action](params)
}

type ReturnAwareDocument = {
  readonly returnToContractor: CargoArrivalReturnState
  readonly separationState: CargoArrivalDocumentState
}

/** Vencida conta só a nota sem marca que falta separar: a marcada espera o contratante. */
export function isPendingSeparation(document: ReturnAwareDocument): boolean {
  return (
    document.returnToContractor === RETURN.none &&
    document.separationState !== CARGO_ARRIVAL_DOCUMENT_STATE.separated
  )
}

export type CargoArrivalClosePending = {
  readonly documentId: string
  readonly reason: 'marked_for_return' | 'not_separated'
}

/** Fecha com `returned`, ou sem marca e separada; marcada bloqueia (fechada, ficaria presa). */
export function findCargoArrivalClosePending(
  documents: readonly (ReturnAwareDocument & { readonly nfeDocumentId: string })[],
): readonly CargoArrivalClosePending[] {
  return documents.flatMap((document): CargoArrivalClosePending[] => {
    if (document.returnToContractor === RETURN.marked) {
      return [{ documentId: document.nfeDocumentId, reason: 'marked_for_return' }]
    }
    if (isPendingSeparation(document)) {
      return [{ documentId: document.nfeDocumentId, reason: 'not_separated' }]
    }
    return []
  })
}
