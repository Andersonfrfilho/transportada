/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: vincular e soltar dentro da transação da fila. Soltar é marcar `released_at`, nunca
 * apagar (D7) — a mesma regra de `releaseDocument` e do cancelamento.
 */
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { tripDocuments } from '../../database/trip.schema.js'
import { reconcileStopOnUnlink } from '../application/reconcile-trip-stops.use-case.js'
import { TripDocumentReviewSwapTargetNotFoundError } from '../domain/trip-document-review.error.js'
import { TripDocumentAlreadyLinkedError } from '../domain/trip.error.js'
import {
  readDocumentStopIdBeforeRelease,
  reconcileLinkedDocumentStop,
} from './drizzle-trip.repository.js'
import { createTripStopReconciliationPort } from './drizzle-trip-stop-reconciliation.support.js'
import type { TripQueryable, TripTransaction } from './trip-queryable.type.js'

const LIVE_NFE_DOCUMENT_UNIQUE = 'trip_documents_live_nfe_document_unique'

export async function hasLiveLink(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly nfeDocumentId: string },
): Promise<boolean> {
  const [row] = await queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, params.companyId),
        eq(tripDocuments.nfeDocumentId, params.nfeDocumentId),
        isNull(tripDocuments.releasedAt),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** A nota viva no caminhão, entregue não: é a que pode sair numa troca. */
export async function requireSwappableLink(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly tripDocumentId: string; readonly tripId: string },
): Promise<{ readonly nfeDocumentId: string; readonly tripDocumentId: string }> {
  const [row] = await queryable
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, params.companyId),
        eq(tripDocuments.id, params.tripDocumentId),
        eq(tripDocuments.tripId, params.tripId),
        isNull(tripDocuments.releasedAt),
        isNull(tripDocuments.deliveredAt),
        isNotNull(tripDocuments.nfeDocumentId),
      ),
    )
    .limit(1)
  if (row?.nfeDocumentId === undefined || row.nfeDocumentId === null) {
    throw new TripDocumentReviewSwapTargetNotFoundError()
  }
  return { nfeDocumentId: row.nfeDocumentId, tripDocumentId: params.tripDocumentId }
}

/**
 * O vínculo com a parada reconciliada, como `linkDocument`. A nota viva em outra viagem é filtrada
 * antes (a violação abortaria a transação inteira); a corrida entre a leitura e o insert, o índice decide.
 */
export async function insertLiveLink(
  transaction: TripTransaction,
  params: { readonly companyId: string; readonly nfeDocumentId: string; readonly tripId: string },
): Promise<string> {
  if (await hasLiveLink(transaction, params)) throw new TripDocumentAlreadyLinkedError()
  const created = await insertLink(transaction, { ...params, released: false })

  const { destinationOrigin, stopId } = await reconcileLinkedDocumentStop(transaction, {
    companyId: params.companyId,
    freightCalculationId: null,
    nfeDocumentId: params.nfeDocumentId,
    tripId: params.tripId,
  })
  if (destinationOrigin !== null || stopId !== null) {
    await transaction
      .update(tripDocuments)
      .set({ destinationOrigin, stopId })
      .where(and(eq(tripDocuments.companyId, params.companyId), eq(tripDocuments.id, created)))
  }
  return created
}

/** O aceite que vincula e solta: a linha nasce solta, sem parada — a prova de que a nota foi daquela viagem. */
export async function insertReleasedLink(
  transaction: TripTransaction,
  params: { readonly companyId: string; readonly nfeDocumentId: string; readonly tripId: string },
): Promise<string> {
  return insertLink(transaction, { ...params, released: true })
}

async function insertLink(
  transaction: TripTransaction,
  params: {
    readonly companyId: string
    readonly nfeDocumentId: string
    readonly released: boolean
    readonly tripId: string
  },
): Promise<string> {
  try {
    const [created] = await transaction
      .insert(tripDocuments)
      .values({
        companyId: params.companyId,
        freightCalculationId: null,
        nfeDocumentId: params.nfeDocumentId,
        releasedAt: params.released ? sql`now()` : null,
        tripId: params.tripId,
      })
      .returning({ id: tripDocuments.id })
    if (created === undefined) throw new Error('TRIP_DOCUMENT_LINK_FAILED')
    return created.id
  } catch (error) {
    if (violatedUniqueConstraint(error) === LIVE_NFE_DOCUMENT_UNIQUE) {
      throw new TripDocumentAlreadyLinkedError()
    }
    throw error
  }
}

/** `false` quando o vínculo já não está vivo (entregue ou solto por outra transação). */
export async function releaseLiveLink(
  transaction: TripTransaction,
  params: { readonly companyId: string; readonly tripDocumentId: string },
): Promise<boolean> {
  // A parada é lida antes: o `RETURNING` do `UPDATE` já traz `stop_id` nulo (T010).
  const previousStopId = await readDocumentStopIdBeforeRelease(transaction, {
    companyId: params.companyId,
    documentId: params.tripDocumentId,
  })
  const [released] = await transaction
    .update(tripDocuments)
    .set({ releasedAt: sql`now()`, stopId: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(tripDocuments.companyId, params.companyId),
        eq(tripDocuments.id, params.tripDocumentId),
        isNull(tripDocuments.releasedAt),
        isNull(tripDocuments.deliveredAt),
      ),
    )
    .returning({ id: tripDocuments.id })
  if (released === undefined) return false

  if (previousStopId !== null) {
    await reconcileStopOnUnlink({
      companyId: params.companyId,
      repository: createTripStopReconciliationPort(transaction),
      stopId: previousStopId,
    })
  }
  return true
}
