/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 (D7, D10, D11): o botão "Tirar do caminhão as N notas que não couberam". A nota sai
 * por decisão de alguém, nunca sozinha — sair muda o hash, recalcula a planta, e o empacotador não é
 * monotônico: sair sozinha seria um laço.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { tripDocuments } from '../../database/trip.schema.js'
import type {
  ReleaseUnplacedParams,
  ReleaseUnplacedResult,
} from '../application/trip-document-review.port.js'
import {
  assertCargoLayoutCurrent,
  selectReleasableDocuments,
  type ReleasableDocument,
} from '../domain/trip-document-review.policy.js'
import { TripCargoLayoutNotReadyError } from '../domain/trip-document-review.error.js'
import { TripCargoLayoutNotFoundError } from '../domain/trip.error.js'
import type { RequestCargoLayoutForTrip } from './eager-cargo-layout-request.support.js'
import { TRIP_DOCUMENT_REVIEW_AUDIT_ACTION } from './trip-document-review.constant.js'
import { releaseLiveLink } from './trip-document-review-link.support.js'
import {
  appendReviewAudit,
  insertReview,
  listReviewRecords,
  lockOpenTrip,
  readCurrentInputHash,
  readLayoutRow,
  toReviewView,
  unplacedOf,
  type StoredLayoutRow,
} from './trip-document-review.query.js'
import type { TripTransaction } from './trip-queryable.type.js'

type ReleaseDependencies = {
  readonly requestCargoLayoutForTrip: RequestCargoLayoutForTrip
}

async function readLiveLinks(
  transaction: TripTransaction,
  params: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly tripId: string
  },
): Promise<ReadonlyMap<string, string>> {
  if (params.nfeDocumentIds.length === 0) return new Map()
  const rows = await transaction
    .select({ id: tripDocuments.id, nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, params.companyId),
        eq(tripDocuments.tripId, params.tripId),
        inArray(tripDocuments.nfeDocumentId, [...params.nfeDocumentIds]),
        isNull(tripDocuments.releasedAt),
        isNull(tripDocuments.deliveredAt),
      ),
    )
  return new Map(
    rows.flatMap((row) => (row.nfeDocumentId === null ? [] : [[row.nfeDocumentId, row.id]])),
  )
}

async function releaseDocument(
  transaction: TripTransaction,
  params: ReleaseUnplacedParams & {
    readonly document: ReleasableDocument
    readonly layout: StoredLayoutRow
    readonly tripDocumentId: string
  },
): Promise<void> {
  if (!(await releaseLiveLink(transaction, params))) return
  const reviewId = await insertReview(transaction, {
    companyId: params.companyId,
    createdBy: params.userId,
    inputHash: params.layout.inputHash,
    layoutId: params.layout.id,
    nfeDocumentId: params.document.documentId,
    reason: params.document.reason,
    sourceTripDocumentId: params.tripDocumentId,
    sourceTripId: params.tripId,
  })
  await appendReviewAudit(transaction, {
    action: TRIP_DOCUMENT_REVIEW_AUDIT_ACTION.released,
    actorUserId: params.userId,
    companyId: params.companyId,
    correlationId: params.correlationId,
    metadata: {
      layoutId: params.layout.id,
      reason: params.document.reason,
      sourceTripId: params.tripId,
    },
    nfeDocumentId: params.document.documentId,
    reviewId,
  })
}

export async function releaseUnplacedFromLayout(
  transaction: TripTransaction,
  params: ReleaseUnplacedParams & ReleaseDependencies,
): Promise<ReleaseUnplacedResult> {
  const { companyId, layoutId, tripId } = params
  await lockOpenTrip(transaction, { companyId, tripId })

  const layout = await readLayoutRow(transaction, { companyId, layoutId })
  if (layout === undefined || layout.tripId !== tripId) throw new TripCargoLayoutNotFoundError()
  const selection = selectReleasableDocuments(unplacedOf(layout.layout))

  /** Repetir pela mesma planta devolve as mesmas entradas — antes do hash, que a saída já mudou. */
  const existing = await listReviewRecords(transaction, { companyId, layoutId })
  if (existing.length > 0) return { kept: selection.kept, reviews: existing.map(toReviewView) }

  if (layout.status !== 'ready' || layout.layout === null) throw new TripCargoLayoutNotReadyError()
  assertCargoLayoutCurrent({
    currentInputHash: await readCurrentInputHash(transaction, { companyId, tripId }),
    layoutInputHash: layout.inputHash,
  })

  const links = await readLiveLinks(transaction, {
    companyId,
    nfeDocumentIds: selection.released.map((document) => document.documentId),
    tripId,
  })
  for (const document of selection.released) {
    const tripDocumentId = links.get(document.documentId)
    if (tripDocumentId === undefined) continue
    await releaseDocument(transaction, { ...params, document, layout, tripDocumentId })
  }
  if (links.size > 0) {
    await params.requestCargoLayoutForTrip(transaction, {
      companyId,
      correlationId: params.correlationId,
      tripId,
    })
  }

  const created = await listReviewRecords(transaction, { companyId, layoutId })
  return { kept: selection.kept, reviews: created.map(toReviewView) }
}
