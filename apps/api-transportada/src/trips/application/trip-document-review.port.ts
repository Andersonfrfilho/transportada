/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: o que a rota pede à fila de revisão. `companyId` e `userId` vêm sempre do contexto
 * autenticado; outro tenant é "não existe" (404), nunca "proibido".
 */
import type {
  TripDocumentReviewReason,
  TripDocumentReviewStatus,
} from '../../database/trip-document-review.schema.js'
import type { KeptDocument, SwapSuggestion } from '../domain/trip-document-review.policy.js'

export type TripDocumentReviewView = {
  readonly createdAt: string
  readonly id: string
  readonly nfeDocumentId: string
  readonly nfeNumber: string | null
  readonly reason: TripDocumentReviewReason
  readonly resolutionTripId: string | null
  readonly resolvedAt: string | null
  readonly sourceTripId: string
  readonly status: TripDocumentReviewStatus
  readonly swappedReviewId: string | null
}

type ReviewActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

export type ReleaseUnplacedParams = ReviewActor & {
  readonly layoutId: string
  readonly tripId: string
}

export type ReleaseUnplacedResult = {
  /** D11 e o corte por prazo: as notas que ficaram, com o porquê. */
  readonly kept: readonly KeptDocument[]
  readonly reviews: readonly TripDocumentReviewView[]
}

export type ListTripDocumentReviewsParams = {
  readonly companyId: string
  readonly status?: TripDocumentReviewStatus
  readonly tripId?: string
}

export type SwapSuggestionsParams = {
  readonly companyId: string
  readonly reviewId: string
}

export type SwapSuggestionsResult = {
  readonly incoming: {
    readonly volumeM3: number | null
    readonly weightKilograms: number | null
  }
  readonly reviewId: string
  readonly suggestions: readonly SwapSuggestion[]
}

/** Mover (`targetTripId`) ou trocar (`outTripDocumentId`, no caminhão de origem) — um dos dois. */
export type PreviewChangeParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly reviewId: string
} & (
  | { readonly outTripDocumentId?: never; readonly targetTripId: string }
  | { readonly outTripDocumentId: string; readonly targetTripId?: never }
)

/** `null`: o destino não tem baú medido, e sem planta não há como validar a carga. */
export type PreviewChangeResult = {
  readonly layoutId: string | null
}

export type MoveReviewParams = ReviewActor & {
  readonly reviewId: string
  readonly targetTripId: string
  readonly validatedLayoutId: string
}

export type SwapReviewParams = ReviewActor & {
  readonly outTripDocumentId: string
  readonly reviewId: string
  readonly validatedLayoutId: string
}

export type SwapReviewResult = {
  readonly review: TripDocumentReviewView
  /** A nota que saiu na troca: volta para a mesma fila, pendente (D7). */
  readonly swappedOut: TripDocumentReviewView
}

export type TripDocumentReviewPort = {
  list(params: ListTripDocumentReviewsParams): Promise<readonly TripDocumentReviewView[]>
  listSwapSuggestions(params: SwapSuggestionsParams): Promise<SwapSuggestionsResult>
  move(params: MoveReviewParams): Promise<TripDocumentReviewView>
  previewChange(params: PreviewChangeParams): Promise<PreviewChangeResult>
  releaseUnplaced(params: ReleaseUnplacedParams): Promise<ReleaseUnplacedResult>
  swap(params: SwapReviewParams): Promise<SwapReviewResult>
}
