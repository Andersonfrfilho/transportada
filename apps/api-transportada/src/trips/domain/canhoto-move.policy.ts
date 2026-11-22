/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D9/RF10: quando o comprovante pode passar da NF errada (A) para a certa (B). Política
 * pura — não lê banco. O alerta (`CanhotoMismatch`) é o mesmo que o painel mostra: mover só
 * confirma aquilo que a pessoa está vendo, nunca escolhe a nota por conta própria.
 *
 * ⚠️ Mover **não aprova** (RF26 da 220 / ADR-0092): a foto entra em B como `pending`, e a
 * conferência humana continua.
 */
import type { TripDeliveryProofCanhotoReview } from '../../database/trip.schema.js'
import type { CanhotoMismatch } from './canhoto-mismatch.policy.js'
import {
  CanhotoMoveNotFlaggedForTargetError,
  CanhotoMoveSourceNotPendingError,
  CanhotoMoveTargetAlreadyApprovedError,
  CanhotoMoveTargetHasProofError,
  CanhotoMoveTargetNotDeliveredError,
  CanhotoMoveTargetNotInTripError,
} from './canhoto-move.error.js'

/** Lista fechada, sem texto livre (D9): o motivo vai à trilha como código. */
export const CANHOTO_MOVE_REASONS = ['wrong_document', 'driver_mistake', 'office_mistake'] as const
export type CanhotoMoveReason = (typeof CANHOTO_MOVE_REASONS)[number]

export const CANHOTO_MOVED_AUDIT_ACTION = 'trip.canhoto-proof.moved'

/** A nota de destino como a viagem a conhece; `null` na busca é "não é desta viagem". */
export type CanhotoMoveTarget = {
  /** O evento de entrega que receberá a foto; `null` quando a nota não foi entregue. */
  readonly deliveredEventId: null | string
  /** Algum canhoto (qualquer veredito) já mora no evento de entrega. */
  readonly hasCanhotoProof: boolean
}

export type CanhotoMoveDecisionInput = {
  readonly mismatch: CanhotoMismatch | null
  readonly sourceReview: TripDeliveryProofCanhotoReview
  readonly target: CanhotoMoveTarget | null
  readonly targetDocumentId: string
}

/** Devolve o evento de entrega de B, ou lança o 409 do primeiro impedimento. */
export function resolveCanhotoMoveEvent(input: CanhotoMoveDecisionInput): string {
  if (input.sourceReview !== 'pending') throw new CanhotoMoveSourceNotPendingError()

  const matched = input.mismatch?.matchedDocument ?? null
  if (matched === null || matched.tripDocumentId !== input.targetDocumentId) {
    throw new CanhotoMoveNotFlaggedForTargetError()
  }
  if (!matched.sameTrip || input.target === null) throw new CanhotoMoveTargetNotInTripError()
  if (matched.canhotoApproved) throw new CanhotoMoveTargetAlreadyApprovedError()
  if (input.target.hasCanhotoProof) throw new CanhotoMoveTargetHasProofError()
  if (input.target.deliveredEventId === null) throw new CanhotoMoveTargetNotDeliveredError()
  return input.target.deliveredEventId
}
