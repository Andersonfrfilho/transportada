/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF29: canhoto recusado **gera pendência de recaptura**. A fila de fotos pendentes do
 * motorista fechava a pendência ao ver qualquer comprovante de canhoto na nota; com a conferência,
 * "tem foto" deixou de significar "está comprovado" — um canhoto ilegível é exatamente uma foto que
 * existe e não serve.
 *
 * Isto não é portão (RF30): a nota continua entregue, a viagem continua andando, o CT-e continua
 * saindo. O que volta é o trabalho de refazer a foto.
 */
import {
  TRIP_DELIVERY_PROOF_CANHOTO_REJECTED_REVIEW,
  TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_OTHER_REASON,
  TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_REASONS,
  type TripDeliveryProofCanhotoReview,
  type TripDeliveryProofCanhotoReviewReason,
} from '../../database/trip.schema.js'

/**
 * A linha de `trip_delivery_proofs` do canhoto da nota, ou a ausência dela. Os três campos vêm de
 * uma junção à esquerda: `null` em todos é "nenhum canhoto chegou", não "conferência vazia".
 */
export type CanhotoRecaptureState = {
  readonly hasProof: boolean
  readonly note: null | string
  readonly reason: TripDeliveryProofCanhotoReviewReason | null
  readonly review: TripDeliveryProofCanhotoReview | null
}

/** O que o motorista vê para saber o que refazer — motivo da lista fechada, texto livre só em `other`. */
export type CanhotoRejection = {
  readonly note?: string
  readonly reason: TripDeliveryProofCanhotoReviewReason
}

function isRejected(state: CanhotoRecaptureState): boolean {
  return state.hasProof && state.review === TRIP_DELIVERY_PROOF_CANHOTO_REJECTED_REVIEW
}

/** `pending` e `not_applicable` fecham a pendência: o motorista já fez a parte dele. */
export function isDeliveryProofSettled(state: CanhotoRecaptureState): boolean {
  return state.hasProof && !isRejected(state)
}

/**
 * `undefined` quando não há recusa — e também na recusa sem motivo, que a CHECK do banco não deixa
 * nascer, mas um `UPDATE` à mão deixaria: a pendência vale sem a explicação, inventar uma não.
 */
export function resolveCanhotoRejection(
  state: CanhotoRecaptureState,
): CanhotoRejection | undefined {
  if (!isRejected(state)) return undefined
  const { note, reason } = state
  if (reason === null || !TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_REASONS.includes(reason)) {
    return undefined
  }
  if (reason !== TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_OTHER_REASON || note === null) return { reason }
  return { note, reason }
}
