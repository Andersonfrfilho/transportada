/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5c (D9, RF10/RF11): "Mover para a NF X" — a foto do canhoto passa da nota errada para a
 * certa, sempre por clique de gente e dentro da mesma viagem. O contrato da rota é da T5b
 * (`POST .../proof/move`, `trip.manage`): corpo estrito `{ targetDocumentId, reason }` com motivo de
 * lista fechada. Aqui ficam a decisão de oferecer o botão, o corpo e a leitura da resposta.
 */
import type { CanhotoMismatch } from './canhotoMismatch.validation'
import { resolveCanhotoMismatch } from './canhotoMismatchPresentation.service'
import type { DeliveryProof } from './deliveryProof.service'
import { isOneOf, isRecord } from './tripGuards.validation'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

export const CANHOTO_MOVE_REASONS = ['wrong_document', 'driver_mistake', 'office_mistake'] as const
export type CanhotoMoveReason = (typeof CANHOTO_MOVE_REASONS)[number]

export type CanhotoMoveProofInput = Readonly<{
  documentId: string
  reason: CanhotoMoveReason
  targetDocumentId: string
  tripId: string
}>

export type CanhotoMoveResult = Readonly<{
  alreadyMoved: boolean
  review: string
  sourceDocumentId: string
  targetDocumentId: string
}>

/** Os códigos que a rota devolve e que têm frase própria; o resto cai em "não foi possível mover". */
export const CANHOTO_MOVE_ERROR_KEYS: Readonly<Record<string, string>> = {
  CANHOTO_MOVE_NOT_FLAGGED_FOR_TARGET: 'notFlaggedForTarget',
  CANHOTO_MOVE_SOURCE_NOT_PENDING: 'sourceNotPending',
  CANHOTO_MOVE_TARGET_ALREADY_APPROVED: 'targetAlreadyApproved',
  CANHOTO_MOVE_TARGET_HAS_PROOF: 'targetHasProof',
  CANHOTO_MOVE_TARGET_NOT_IN_TRIP: 'targetNotInTrip',
  CANHOTO_MOVE_TARGET_NOT_DELIVERED: 'targetNotDelivered',
}
export const CANHOTO_MOVE_FALLBACK_ERROR_KEY = 'requestFailed'

export type CanhotoMoveTarget = Readonly<{
  number: string
  series: string
  targetDocumentId: string
}>

/**
 * O destino só existe quando a nota certa é desta mesma viagem (D9a/d), ainda sem canhoto aprovado e
 * com vínculo vivo. Se tem entrega ou foto, a API recusa com 409 e a tela diz o porquê — o painel
 * não sabe disso de antemão. Só vale no canhoto pendente.
 */
export function resolveCanhotoMoveTarget(proof: DeliveryProof): CanhotoMoveTarget | undefined {
  const mismatch: CanhotoMismatch | undefined = resolveCanhotoMismatch(proof)
  const matched = mismatch?.matchedDocument
  if (matched === null || matched === undefined) return undefined
  if (!matched.sameTrip || matched.canhotoApproved || matched.tripDocumentId === null) {
    return undefined
  }
  return {
    number: matched.number,
    series: matched.series,
    targetDocumentId: matched.tripDocumentId,
  }
}

export function canhotoMoveBody(
  input: CanhotoMoveProofInput,
): Readonly<{ reason: CanhotoMoveReason; targetDocumentId: string }> {
  return { reason: input.reason, targetDocumentId: input.targetDocumentId }
}

export function isCanhotoMoveReason(value: string): value is CanhotoMoveReason {
  return (CANHOTO_MOVE_REASONS as readonly string[]).includes(value)
}

export function canhotoMoveResultFromApi(value: unknown): CanhotoMoveResult {
  if (
    !isRecord(value) ||
    typeof value.alreadyMoved !== 'boolean' ||
    !isNonEmptyString(value.sourceDocumentId) ||
    !isNonEmptyString(value.targetDocumentId) ||
    !isOneOf(value.review, ['pending', 'approved', 'rejected'])
  ) {
    throw new Error('CANHOTO_MOVE_RESPONSE_INVALID')
  }
  return {
    alreadyMoved: value.alreadyMoved,
    review: value.review,
    sourceDocumentId: value.sourceDocumentId,
    targetDocumentId: value.targetDocumentId,
  }
}
