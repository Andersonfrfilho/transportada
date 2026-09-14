/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: mover e trocar como **uma** mudança na viagem, aplicada igual na prévia (numa transação
 * desfeita) e na ação (na transação que fica). É isso que faz o hash da prévia bater com o do destino
 * depois do vínculo. A trava é só o despacho, na origem e no destino (D13): CT-e não trava.
 */
import type { BuildCargoLayoutInputParams } from '../domain/cargo-layout-hash.types.js'
import { assertCargoLayoutCurrent } from '../domain/trip-document-review.policy.js'
import { TripDocumentReviewDoesNotFitError } from '../domain/trip-document-review.error.js'
import { readCargoLayoutInputParams } from './trip-cargo-layout-input.support.js'
import {
  insertLiveLink,
  releaseLiveLink,
  requireSwappableLink,
} from './trip-document-review-link.support.js'
import {
  lockOpenTrip,
  readCurrentInputHash,
  unplacedOf,
  type StoredLayoutRow,
  type TripDocumentReviewRecord,
} from './trip-document-review.query.js'
import type { TripDatabase, TripTransaction } from './trip-queryable.type.js'

export type ReviewChange =
  | { readonly kind: 'move'; readonly targetTripId: string }
  | { readonly kind: 'swap'; readonly outTripDocumentId: string }

export type AppliedReviewChange = {
  readonly linkedTripDocumentId: string
  /** Na troca: a nota que saiu do caminhão para dar lugar à da fila. */
  readonly swappedOut: { readonly nfeDocumentId: string; readonly tripDocumentId: string } | null
  readonly tripId: string
}

export async function applyReviewChange(
  transaction: TripTransaction,
  params: {
    readonly change: ReviewChange
    readonly companyId: string
    readonly review: TripDocumentReviewRecord
  },
): Promise<AppliedReviewChange> {
  const { change, companyId, review } = params
  await lockOpenTrip(transaction, { companyId, tripId: review.sourceTripId })

  if (change.kind === 'move') {
    if (change.targetTripId !== review.sourceTripId) {
      await lockOpenTrip(transaction, { companyId, tripId: change.targetTripId })
    }
    const linkedTripDocumentId = await insertLiveLink(transaction, {
      companyId,
      nfeDocumentId: review.nfeDocumentId,
      tripId: change.targetTripId,
    })
    return { linkedTripDocumentId, swappedOut: null, tripId: change.targetTripId }
  }

  const swappedOut = await requireSwappableLink(transaction, {
    companyId,
    tripDocumentId: change.outTripDocumentId,
    tripId: review.sourceTripId,
  })
  await releaseLiveLink(transaction, { companyId, tripDocumentId: swappedOut.tripDocumentId })
  const linkedTripDocumentId = await insertLiveLink(transaction, {
    companyId,
    nfeDocumentId: review.nfeDocumentId,
    tripId: review.sourceTripId,
  })
  return { linkedTripDocumentId, swappedOut, tripId: review.sourceTripId }
}

/** A planta validada tem de ser a da viagem depois da mudança, e com a nota dentro. */
export async function assertChangeFits(
  transaction: TripTransaction,
  params: {
    readonly companyId: string
    readonly layout: StoredLayoutRow
    readonly nfeDocumentId: string
    readonly tripId: string
  },
): Promise<void> {
  assertCargoLayoutCurrent({
    currentInputHash: await readCurrentInputHash(transaction, params),
    layoutInputHash: params.layout.inputHash,
  })
  const left = unplacedOf(params.layout.layout).some(
    (box) => box.documentId === params.nfeDocumentId,
  )
  if (left) throw new TripDocumentReviewDoesNotFitError()
}

class ReviewPreviewRollback extends Error {
  public constructor() {
    super('TRIP_DOCUMENT_REVIEW_PREVIEW_ROLLBACK')
  }
}

/** A entrada da planta da viagem **como ficaria**: a mudança é aplicada e desfeita, nada fica gravado. */
export async function simulateReviewChange(
  database: TripDatabase,
  params: {
    readonly change: ReviewChange
    readonly companyId: string
    readonly review: TripDocumentReviewRecord
  },
): Promise<BuildCargoLayoutInputParams | null> {
  const captured: { input: BuildCargoLayoutInputParams | null } = { input: null }
  try {
    await database.transaction(async (transaction) => {
      const applied = await applyReviewChange(transaction, params)
      captured.input = await readCargoLayoutInputParams(transaction, {
        companyId: params.companyId,
        tripId: applied.tripId,
      })
      throw new ReviewPreviewRollback()
    })
  } catch (error) {
    if (!(error instanceof ReviewPreviewRollback)) throw error
  }
  return captured.input
}
