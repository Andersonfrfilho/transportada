/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.1 (ADR-0094 §1): o eixo da nota na chegada, antes da viagem. É eixo próprio — nunca
 * `trip_documents.separation_status` — e só anda para frente, uma etapa por vez. Sem I/O: o relógio
 * entra por parâmetro.
 */
import {
  CARGO_ARRIVAL_DOCUMENT_STATE as STATE,
  CARGO_ARRIVAL_LIMITS,
  CARGO_ARRIVAL_STATUS,
  type CargoArrivalDocumentState,
  type CargoArrivalStatus,
} from '../../shared/cargo-arrival.constant.js'
import { CARGO_ARRIVAL_DOCUMENT_NOT_FOUND } from './cargo-arrival.error.js'

const HOUR_MS = 3_600_000

export const CARGO_ARRIVAL_INITIAL_DOCUMENT_STATE = STATE.expected

/** Sem volta: nem a spec nem o ADR preveem desfazer a conferência ou a separação. */
export const CARGO_ARRIVAL_TRANSITIONS: Readonly<
  Record<CargoArrivalDocumentState, readonly CargoArrivalDocumentState[]>
> = {
  expected: [STATE.received],
  received: [STATE.separated],
  separated: [],
}

export type CargoArrivalTransitionTarget = typeof STATE.received | typeof STATE.separated

export const CARGO_ARRIVAL_REFUSAL_REASON = {
  closed: 'CARGO_ARRIVAL_CLOSED',
  notReceived: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED',
  notAllowed: 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED',
} as const
export type CargoArrivalRefusalReason =
  (typeof CARGO_ARRIVAL_REFUSAL_REASON)[keyof typeof CARGO_ARRIVAL_REFUSAL_REASON]

export type CargoArrivalTransitionDecision =
  | { readonly outcome: 'changed' }
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'refused'; readonly reason: CargoArrivalRefusalReason }

export type DecideCargoArrivalTransitionParams = {
  readonly arrivalStatus: CargoArrivalStatus
  readonly from: CargoArrivalDocumentState
  readonly to: CargoArrivalTransitionTarget
}

/** Repetir a etapa em que a nota já está é no-op: não grava, não gera evento. */
export function decideCargoArrivalTransition({
  arrivalStatus,
  from,
  to,
}: DecideCargoArrivalTransitionParams): CargoArrivalTransitionDecision {
  if (arrivalStatus === CARGO_ARRIVAL_STATUS.closed) {
    return { outcome: 'refused', reason: CARGO_ARRIVAL_REFUSAL_REASON.closed }
  }
  if (from === to) return { outcome: 'unchanged' }
  if (CARGO_ARRIVAL_TRANSITIONS[from].includes(to)) return { outcome: 'changed' }
  if (from === STATE.expected) {
    return { outcome: 'refused', reason: CARGO_ARRIVAL_REFUSAL_REASON.notReceived }
  }
  return { outcome: 'refused', reason: CARGO_ARRIVAL_REFUSAL_REASON.notAllowed }
}

export type ResolveSeparationDueAtParams = {
  readonly arrivedAt: Date
  readonly separationWindowHours: number | null
}

/** Horas corridas, sem calendário: a janela é de relógio, o prazo em dias úteis é da spec 236. */
export function resolveSeparationDueAt({
  arrivedAt,
  separationWindowHours,
}: ResolveSeparationDueAtParams): Date | null {
  if (separationWindowHours === null) return null
  return new Date(arrivedAt.getTime() + separationWindowHours * HOUR_MS)
}

export type ArrivalProfileRules = {
  readonly deliveryDeadlineBusinessDays: number | null
  readonly isEnabled: boolean
  readonly separationWindowHours: number | null
}

export type CopiedArrivalRules = {
  readonly deliveryDeadlineBusinessDays: number | null
  readonly separationWindowHours: number | null
}

/**
 * ADR-0094 §2: a chegada copia as regras no registro, e editar o perfil depois nunca a refaz.
 * `null` é perfil ausente ou desligado — o contratante segue o fluxo de hoje (ADR-0048).
 */
export function copyArrivalRulesFromProfile(
  profile: ArrivalProfileRules | null,
): CopiedArrivalRules | null {
  if (profile === null || !profile.isEnabled) return null
  return {
    deliveryDeadlineBusinessDays: profile.deliveryDeadlineBusinessDays,
    separationWindowHours: profile.separationWindowHours,
  }
}

export function isArrivedAtTooFarInFuture(params: {
  readonly arrivedAt: Date
  readonly now: Date
}): boolean {
  return params.arrivedAt.getTime() - params.now.getTime() > CARGO_ARRIVAL_LIMITS.futureToleranceMs
}

export function isArrivedAtTooFarInPast(params: {
  readonly arrivedAt: Date
  readonly now: Date
}): boolean {
  return params.now.getTime() - params.arrivedAt.getTime() > CARGO_ARRIVAL_LIMITS.arrivedAtMaxAgeMs
}

export type IsSeparationOverdueParams = {
  readonly now: Date
  readonly pendingDocumentCount: number
  readonly separationDueAt: Date | null
}

/** Vencida é a separação que ainda falta depois do prazo; tudo separado nunca está vencido. */
export function isSeparationOverdue({
  now,
  pendingDocumentCount,
  separationDueAt,
}: IsSeparationOverdueParams): boolean {
  if (separationDueAt === null || pendingDocumentCount === 0) return false
  return now.getTime() > separationDueAt.getTime()
}

export type CargoArrivalDocumentOutcome =
  | { readonly documentId: string; readonly outcome: 'changed' | 'unchanged' }
  | { readonly documentId: string; readonly outcome: 'refused'; readonly reason: string }

export type CargoArrivalBatchRow = {
  readonly id: string
  readonly nfeDocumentId: string
  readonly separationState: CargoArrivalDocumentState
}

export type DecideCargoArrivalBatchParams<TRow extends CargoArrivalBatchRow> = {
  readonly arrivalStatus: CargoArrivalStatus
  readonly documentIds: readonly string[]
  readonly rows: readonly TRow[]
  readonly to: CargoArrivalTransitionTarget
}

/** Um resultado por nota pedida: a recusada fica no resultado dela e nunca derruba as outras. */
export function decideCargoArrivalBatch<TRow extends CargoArrivalBatchRow>({
  arrivalStatus,
  documentIds,
  rows,
  to,
}: DecideCargoArrivalBatchParams<TRow>): {
  readonly changed: readonly TRow[]
  readonly results: readonly CargoArrivalDocumentOutcome[]
} {
  const rowsByDocument = new Map(rows.map((row) => [row.nfeDocumentId, row]))
  const changed: TRow[] = []
  const results = documentIds.map((documentId): CargoArrivalDocumentOutcome => {
    const row = rowsByDocument.get(documentId)
    if (row === undefined) {
      return { documentId, outcome: 'refused', reason: CARGO_ARRIVAL_DOCUMENT_NOT_FOUND }
    }
    const decision = decideCargoArrivalTransition({ arrivalStatus, from: row.separationState, to })
    if (decision.outcome === 'refused') return { documentId, ...decision }
    if (decision.outcome === 'changed') changed.push(row)
    return { documentId, outcome: decision.outcome }
  })
  return { changed, results }
}
