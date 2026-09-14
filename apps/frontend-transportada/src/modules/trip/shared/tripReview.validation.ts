/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  hasExactKeys,
  isEveryItem,
  isNullableString,
  isOneOf,
  isRecord,
  isString,
} from './tripGuards.validation'
import { TRIP_ERROR } from './trip.constant'
import {
  TRIP_DOCUMENT_REVIEW_KEYS,
  TRIP_DOCUMENT_REVIEW_STATUSES,
  TRIP_SWAP_SUGGESTION_KEYS,
  type TripDocumentReview,
  type TripReviewKeptNote,
  type TripReviewPreview,
  type TripReviewRelease,
  type TripSwapSuggestion,
  type TripSwapSuggestions,
} from './tripReview.types'

const KEPT_REASONS = ['notMeasured', 'time_budget'] as const

function isNullableNumber(value: unknown): value is null | number {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

/** Chaves exatas: a fila não pode trazer de carona empresa, ator ou hash da planta. */
function isReview(value: unknown): value is TripDocumentReview {
  return (
    hasExactKeys(value, TRIP_DOCUMENT_REVIEW_KEYS) &&
    isString(value.createdAt) &&
    isString(value.id) &&
    isString(value.nfeDocumentId) &&
    isNullableString(value.nfeNumber) &&
    isString(value.reason) &&
    isNullableString(value.resolutionTripId) &&
    isNullableString(value.resolvedAt) &&
    isString(value.sourceTripId) &&
    isOneOf(value.status, TRIP_DOCUMENT_REVIEW_STATUSES) &&
    isNullableString(value.swappedReviewId)
  )
}

function isKeptNote(value: unknown): value is TripReviewKeptNote {
  return (
    hasExactKeys(value, ['documentId', 'reason']) &&
    isString(value.documentId) &&
    isOneOf(value.reason, KEPT_REASONS)
  )
}

function isSwapSuggestion(value: unknown): value is TripSwapSuggestion {
  return (
    hasExactKeys(value, TRIP_SWAP_SUGGESTION_KEYS) &&
    isString(value.nfeDocumentId) &&
    isNullableString(value.nfeNumber) &&
    isString(value.tripDocumentId) &&
    isNullableNumber(value.volumeDeltaPercent) &&
    isNullableNumber(value.volumeM3) &&
    isNullableNumber(value.weightDeltaPercent) &&
    isNullableNumber(value.weightKilograms)
  )
}

function invalid(): Error {
  return new Error(TRIP_ERROR.RESPONSE_INVALID)
}

export function createTripReviewAdapters() {
  return {
    previewFromApi(input: unknown): TripReviewPreview {
      if (!hasExactKeys(input, ['layoutId']) || !isNullableString(input.layoutId)) throw invalid()
      return { layoutId: input.layoutId }
    },
    releaseFromApi(input: unknown): TripReviewRelease {
      if (
        !hasExactKeys(input, ['kept', 'reviews']) ||
        !isEveryItem(input.kept, isKeptNote) ||
        !isEveryItem(input.reviews, isReview)
      ) {
        throw invalid()
      }
      return { kept: input.kept, reviews: input.reviews }
    },
    reviewFromApi(input: unknown): TripDocumentReview {
      if (!isReview(input)) throw invalid()
      return input
    },
    reviewsFromApi(input: unknown): readonly TripDocumentReview[] {
      if (!isEveryItem(input, isReview)) throw invalid()
      return input
    },
    swapSuggestionsFromApi(input: unknown): TripSwapSuggestions {
      if (
        !hasExactKeys(input, ['incoming', 'reviewId', 'suggestions']) ||
        !isRecord(input.incoming) ||
        !isNullableNumber(input.incoming.volumeM3) ||
        !isNullableNumber(input.incoming.weightKilograms) ||
        !isString(input.reviewId) ||
        !isEveryItem(input.suggestions, isSwapSuggestion)
      ) {
        throw invalid()
      }
      return {
        incoming: {
          volumeM3: input.incoming.volumeM3,
          weightKilograms: input.incoming.weightKilograms,
        },
        reviewId: input.reviewId,
        suggestions: input.suggestions,
      }
    },
  }
}
