/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import {
  TRIP_DOCUMENT_ACTION,
  checkTripDocumentTransition,
  type TripDocumentAction,
} from '../domain/trip-state.policy.js'
import {
  TripDocumentNotFoundError,
  TripDocumentReturnReasonRequiredError,
  TripDocumentTransitionConflictError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import type { TripDocument } from './trip.port.js'

export type TripDocumentTransitionSnapshot = {
  readonly document: TripDocument
  readonly documentStatus: TripDocumentSeparationStatus
  readonly tripStatus: TripStatus
}

export type ApplyTripDocumentTransitionInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly fromStatus: TripDocumentSeparationStatus
  readonly note: string | null
  readonly returnReason: string | null
  readonly toStatus: TripDocumentSeparationStatus
  readonly tripId: string
}

export type TripDocumentTransitionOutcome = {
  readonly document: TripDocument
  /** `true` quando o `WHERE fromStatus = ...` não achou linha: alguém escreveu no intervalo. */
  readonly raced: boolean
  readonly tripStatus: TripStatus
}

export type TripDocumentTransitionPort = {
  applyTransition(input: ApplyTripDocumentTransitionInput): Promise<TripDocumentTransitionOutcome>
  findSnapshot(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocumentTransitionSnapshot | null>
}

export type TransitionTripDocumentInput = {
  readonly action: TripDocumentAction
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly note?: string | null
  readonly repository: TripDocumentTransitionPort
  readonly returnReason?: string | null
  readonly tripId: string
}

export type TransitionTripDocumentResult = {
  readonly document: TripDocument
  readonly tripStatus: TripStatus
}

/** Uma corrida real converge em uma ou duas tentativas; além disso é conflito, não retry infinito. */
const MAX_RACE_RETRIES = 3

/**
 * ADR-0043 §1, §4: valida pela T006, escreve estado + timestamp + evento na mesma transação (o
 * `repository.applyTransition` é quem garante isso), recalcula o estado da viagem. Idempotente
 * (RF-8) — repetir a mesma transição não escreve nada e não lança.
 */
export async function transitionTripDocument(
  input: TransitionTripDocumentInput,
): Promise<TransitionTripDocumentResult> {
  if (
    input.action === TRIP_DOCUMENT_ACTION.return &&
    (input.returnReason ?? '').trim().length === 0
  ) {
    throw new TripDocumentReturnReasonRequiredError()
  }

  return attempt(input, 0)
}

async function attempt(
  input: TransitionTripDocumentInput,
  retries: number,
): Promise<TransitionTripDocumentResult> {
  const snapshot = await input.repository.findSnapshot(input)
  if (snapshot === null) throw new TripDocumentNotFoundError()

  const transition = checkTripDocumentTransition({
    action: input.action,
    documentStatus: snapshot.documentStatus,
    tripStatus: snapshot.tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') {
    return { document: snapshot.document, tripStatus: snapshot.tripStatus }
  }

  const outcome = await input.repository.applyTransition({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    documentId: input.documentId,
    fromStatus: snapshot.documentStatus,
    note: input.note ?? null,
    returnReason:
      input.action === TRIP_DOCUMENT_ACTION.return ? (input.returnReason ?? null) : null,
    toStatus: transition.nextStatus,
    tripId: input.tripId,
  })

  if (!outcome.raced) return { document: outcome.document, tripStatus: outcome.tripStatus }
  if (retries >= MAX_RACE_RETRIES) throw new TripDocumentTransitionConflictError()

  return attempt(input, retries + 1)
}
