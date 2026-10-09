/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257: acrescenta notas soltas a uma viagem que já saiu. Tudo roda na transação do repositório,
 * sob `SELECT trips … FOR NO KEY UPDATE`, e **em sequência**. Rota congelada, snapshot de despacho,
 * pedágio e ETA não são tocados (D5): `clearPlannedRoute` e o pedido de planta de carga não rodam aqui.
 */
import { and, eq, sql } from 'drizzle-orm'

import { tripDocuments, tripStops, trips } from '../../database/trip.schema.js'
import {
  reconcileStopOnLink,
  type TripStopReconciliationPort,
} from '../application/reconcile-trip-stops.use-case.js'
import type {
  LinkTripDocumentsAfterDispatchParams,
  LinkTripDocumentsAfterDispatchResult,
  LinkedAfterDispatchDocument,
} from '../application/trip-document-link-after-dispatch.types.js'
import { checkTripAcceptsLinkageAfterDispatch } from '../domain/trip-state.policy.js'
import { TripStateTransitionNotAllowedError } from '../domain/trip.error.js'
import { resolveNfeDestinationAddress } from './nfe-destination-address.support.js'
import { createTripStopReconciliationPort } from './drizzle-trip-stop-reconciliation.support.js'
import {
  countDocumentsWithoutCte,
  findLiveLinkedIds,
  hasAuthorizedManifest,
  insertLoadedLinks,
  recordLinkAudit,
  recordLinkEvent,
  recordLoadedEvents,
} from './trip-document-link-after-dispatch-write.persistence.js'
import { closePendingReviewsOnLink } from './trip-document-review-relink.support.js'
import type { TripTransaction } from './trip-queryable.type.js'

/** `null` é viagem inexistente nesta empresa. */
export async function applyTripDocumentLinkAfterDispatch(
  transaction: TripTransaction,
  params: LinkTripDocumentsAfterDispatchParams,
): Promise<LinkTripDocumentsAfterDispatchResult | null> {
  const tripStatus = await lockTripAndCheckWindow(transaction, params)
  if (tripStatus === null) return null

  const alreadyLinked = await findLiveLinkedIds(transaction, params)
  const pendingIds = params.nfeDocumentIds.filter((id) => !alreadyLinked.has(id))
  const created =
    pendingIds.length === 0
      ? []
      : await insertLoadedLinks(transaction, { ...params, nfeDocumentIds: pendingIds })

  const createdStopIds: string[] = []
  const linked: LinkedAfterDispatchDocument[] = []
  for (const record of created) {
    const stop = await reconcileOpenStop(transaction, {
      createdStopIds,
      nfeDocumentId: record.nfeDocumentId,
      params,
    })
    await transaction
      .update(tripDocuments)
      .set({ destinationOrigin: stop.destinationOrigin, stopId: stop.stopId })
      .where(and(eq(tripDocuments.companyId, params.companyId), eq(tripDocuments.id, record.id)))
    linked.push({
      nfeDocumentId: record.nfeDocumentId,
      stopId: stop.stopId,
      tripDocumentId: record.id,
    })
  }

  const linkedIds = new Set(linked.map((document) => document.nfeDocumentId))
  const skipped = params.nfeDocumentIds
    .filter((id) => !linkedIds.has(id))
    .map((nfeDocumentId) => ({ nfeDocumentId, reason: 'already_linked' as const }))
  if (linked.length === 0) {
    return {
      createdStopIds,
      documentsWithoutCte: 0,
      eventId: null,
      linked,
      mdfeDocumentDivergence: false,
      skipped,
      tripStatus,
    }
  }

  await recordLoadedEvents(transaction, {
    params,
    tripDocumentIds: linked.map((document) => document.tripDocumentId),
  })
  await touchTrip(transaction, params)
  await closePendingReviewsOnLink(transaction, {
    companyId: params.companyId,
    tripId: params.tripId,
  })

  const linkedNfeIds = linked.map((document) => document.nfeDocumentId)
  const documentsWithoutCte = await countDocumentsWithoutCte(transaction, {
    companyId: params.companyId,
    nfeDocumentIds: linkedNfeIds,
  })
  const mdfeDocumentDivergence = await hasAuthorizedManifest(transaction, params)
  const eventId = await recordLinkEvent(transaction, {
    createdStopIds,
    documentsWithoutCte,
    linked,
    mdfeDocumentDivergence,
    params,
  })
  await recordLinkAudit(transaction, {
    eventId,
    linkedCount: linked.length,
    mdfeDocumentDivergence,
    params,
  })

  return {
    createdStopIds,
    documentsWithoutCte,
    eventId,
    linked,
    mdfeDocumentDivergence,
    skipped,
    tripStatus,
  }
}

/** O status que o caso de uso leu é anterior ao lock; só este vale (ADR-0068, defeito 29). */
async function lockTripAndCheckWindow(
  transaction: TripTransaction,
  { companyId, tripId }: LinkTripDocumentsAfterDispatchParams,
) {
  const [trip] = await transaction
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
    .for('no key update')
    .limit(1)
  if (trip === undefined) return null

  const blockReason = checkTripAcceptsLinkageAfterDispatch(trip.status)
  if (blockReason !== null) throw new TripStateTransitionNotAllowedError(blockReason)
  return trip.status
}

async function touchTrip(
  transaction: TripTransaction,
  { companyId, tripId }: LinkTripDocumentsAfterDispatchParams,
): Promise<void> {
  await transaction
    .update(trips)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
}

type ReconcileOpenStopParams = {
  readonly createdStopIds: string[]
  readonly nfeDocumentId: string
  readonly params: LinkTripDocumentsAfterDispatchParams
}

/**
 * D5: a parada que o motorista já fechou não recebe nota — ele já passou por ali. Endereço repetido
 * numa parada fechada vira parada nova ao fim da sequência, sem ETA.
 */
async function reconcileOpenStop(
  transaction: TripTransaction,
  { createdStopIds, nfeDocumentId, params }: ReconcileOpenStopParams,
) {
  const noDestination = { destinationOrigin: null, stopId: null }
  const destination = await resolveNfeDestinationAddress(transaction, {
    companyId: params.companyId,
    nfeDocumentId,
  })
  if (destination === null) return noDestination

  const stop = await reconcileStopOnLink({
    addressComponents: destination.components,
    companyId: params.companyId,
    label: destination.label,
    repository: buildOpenStopOnlyPort(transaction, createdStopIds),
    tripId: params.tripId,
  })
  return { destinationOrigin: destination.origin, stopId: stop?.id ?? null }
}

function buildOpenStopOnlyPort(
  transaction: TripTransaction,
  createdStopIds: string[],
): TripStopReconciliationPort {
  const base = createTripStopReconciliationPort(transaction)
  return {
    ...base,
    async createStop(input) {
      const created = await base.createStop(input)
      createdStopIds.push(created.id)
      return created
    },
    async findStopByAddressKey(input) {
      const [found] = await transaction
        .select({
          addressKey: tripStops.addressKey,
          id: tripStops.id,
          sequence: tripStops.sequence,
        })
        .from(tripStops)
        .where(
          and(
            eq(tripStops.companyId, input.companyId),
            eq(tripStops.tripId, input.tripId),
            eq(tripStops.addressKey, input.addressKey),
            sql`${tripStops.arrivedAt} is null and ${tripStops.completedAt} is null`,
          ),
        )
        .limit(1)
      return found ?? null
    },
  }
}
