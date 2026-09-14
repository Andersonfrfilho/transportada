/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 148 T7: cópia por valor de `trip-document-review.schema.ts` da API — o bundle não carrega
 * código dela. `pending` sai uma vez: para outro caminhão, numa troca, ou vinculada por outro caminho.
 */
export const TRIP_DOCUMENT_REVIEW_STATUSES = ['pending', 'moved', 'swapped_in', 'relinked'] as const
export type TripDocumentReviewStatus = (typeof TRIP_DOCUMENT_REVIEW_STATUSES)[number]

export const TRIP_DOCUMENT_REVIEW_KEYS = [
  'createdAt',
  'id',
  'nfeDocumentId',
  'nfeNumber',
  'reason',
  'resolutionTripId',
  'resolvedAt',
  'sourceTripId',
  'status',
  'swappedReviewId',
] as const

export const TRIP_SWAP_SUGGESTION_KEYS = [
  'nfeDocumentId',
  'nfeNumber',
  'tripDocumentId',
  'volumeDeltaPercent',
  'volumeM3',
  'weightDeltaPercent',
  'weightKilograms',
] as const

export type TripDocumentReview = Readonly<{
  createdAt: string
  id: string
  nfeDocumentId: string
  nfeNumber: null | string
  reason: string
  resolutionTripId: null | string
  resolvedAt: null | string
  sourceTripId: string
  status: TripDocumentReviewStatus
  swappedReviewId: null | string
}>

/** D11 e o corte por prazo: a nota que fica no caminhão, com o porquê. */
export type TripReviewKeptNote = Readonly<{
  documentId: string
  reason: 'notMeasured' | 'time_budget'
}>

export type TripReviewRelease = Readonly<{
  kept: readonly TripReviewKeptNote[]
  reviews: readonly TripDocumentReview[]
}>

export type TripSwapSuggestion = Readonly<{
  nfeDocumentId: string
  nfeNumber: null | string
  tripDocumentId: string
  /** Negativo: o caminhão usa menos espaço com a troca. */
  volumeDeltaPercent: null | number
  volumeM3: null | number
  /** Negativo: o caminhão fica mais leve com a troca. */
  weightDeltaPercent: null | number
  weightKilograms: null | number
}>

export type TripSwapSuggestions = Readonly<{
  incoming: Readonly<{ volumeM3: null | number; weightKilograms: null | number }>
  reviewId: string
  suggestions: readonly TripSwapSuggestion[]
}>

/** `null`: o destino não tem baú medido, e sem planta não há como conferir a carga. */
export type TripReviewPreview = Readonly<{ layoutId: null | string }>

export type TripReviewChange =
  | Readonly<{ kind: 'move'; targetTripId: string }>
  | Readonly<{ kind: 'swap'; outTripDocumentId: string }>

export type TripReviewPreviewInput =
  | Readonly<{ reviewId: string; targetTripId: string }>
  | Readonly<{ outTripDocumentId: string; reviewId: string }>
