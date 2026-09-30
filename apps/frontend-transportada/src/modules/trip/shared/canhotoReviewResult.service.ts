/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.9: a resposta do `PATCH .../proof/review`. ⚠️ **Não é o `DeliveryProof`**: a view da
 * API usa `null` para ausente, pode trazer `not_applicable` e não traz o nome de quem conferiu. Por
 * isso tem tipo próprio e não entra no cache de `deliveryProofsQuery`, cujo guarda fechado
 * descartaria o comprovante inteiro em silêncio.
 */
import {
  DELIVERY_PROOF_CANHOTO_READ_SOURCE_OPTIONS,
  DELIVERY_PROOF_CANHOTO_REVIEW_OPTIONS,
  DELIVERY_PROOF_CANHOTO_REVIEW_ORIGIN_OPTIONS,
  DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS,
  TRIP_ERROR,
} from './trip.constant'
import type {
  DeliveryProofCanhotoReadSource,
  DeliveryProofCanhotoReview,
  DeliveryProofCanhotoReviewOrigin,
  DeliveryProofCanhotoReviewReason,
} from './deliveryProof.service'
import { isNullableString, isOneOf, isRecord } from './tripGuards.validation'

const NOT_APPLICABLE = 'not_applicable'

export type CanhotoReviewAction =
  | Readonly<{ action: 'approve' }>
  | Readonly<{
      action: 'reject'
      note?: string
      reason: DeliveryProofCanhotoReviewReason
    }>

export type CanhotoReviewProofInput = Readonly<{
  documentId: string
  review: CanhotoReviewAction
  tripId: string
}>

export type CanhotoReviewResult = Readonly<{
  canhotoReadNumber?: string
  canhotoReadSeries?: string
  canhotoReadSource?: DeliveryProofCanhotoReadSource
  canhotoReview: DeliveryProofCanhotoReview | typeof NOT_APPLICABLE
  canhotoReviewAt?: string
  canhotoReviewNote?: string
  canhotoReviewOrigin?: DeliveryProofCanhotoReviewOrigin
  canhotoReviewReason?: DeliveryProofCanhotoReviewReason
}>

function isNullableOption<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is null | TOption {
  return value === null || isOneOf(value, options)
}

/** `null` da API vira chave ausente, como no resto do painel. */
function optionalEntry<TKey extends string, TValue>(
  key: TKey,
  value: null | TValue,
): { [K in TKey]?: TValue } {
  return value === null ? {} : ({ [key]: value } as { [K in TKey]?: TValue })
}

export function canhotoReviewResultFromApi(input: unknown): CanhotoReviewResult {
  if (
    !isRecord(input) ||
    !(
      isOneOf(input.canhotoReview, DELIVERY_PROOF_CANHOTO_REVIEW_OPTIONS) ||
      input.canhotoReview === NOT_APPLICABLE
    ) ||
    !isNullableString(input.canhotoReadNumber) ||
    !isNullableString(input.canhotoReadSeries) ||
    !isNullableString(input.canhotoReviewAt) ||
    !isNullableString(input.canhotoReviewNote) ||
    !isNullableOption(input.canhotoReadSource, DELIVERY_PROOF_CANHOTO_READ_SOURCE_OPTIONS) ||
    !isNullableOption(input.canhotoReviewOrigin, DELIVERY_PROOF_CANHOTO_REVIEW_ORIGIN_OPTIONS) ||
    !isNullableOption(input.canhotoReviewReason, DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS)
  ) {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  return {
    canhotoReview: input.canhotoReview,
    ...optionalEntry('canhotoReadNumber', input.canhotoReadNumber),
    ...optionalEntry('canhotoReadSeries', input.canhotoReadSeries),
    ...optionalEntry('canhotoReadSource', input.canhotoReadSource),
    ...optionalEntry('canhotoReviewAt', input.canhotoReviewAt),
    ...optionalEntry('canhotoReviewNote', input.canhotoReviewNote),
    ...optionalEntry('canhotoReviewOrigin', input.canhotoReviewOrigin),
    ...optionalEntry('canhotoReviewReason', input.canhotoReviewReason),
  }
}
