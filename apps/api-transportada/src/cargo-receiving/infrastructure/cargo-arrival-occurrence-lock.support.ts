/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: as travas da ocorrência de recebimento e da marcação, na ordem da Fase 2 — a chegada
 * primeiro, a nota depois, as duas `for no key update` (nunca `for update`: a ocorrência nova pega
 * `FOR KEY SHARE` na nota pela FK, e as duas não se esperam).
 */
import { and, eq, sql } from 'drizzle-orm'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import { tripDocuments } from '../../database/trip.schema.js'
import type {
  LockedOccurrenceArrival,
  LockedOccurrenceDocument,
} from '../application/cargo-arrival-occurrence.types.js'
import type { ArrivalScope } from '../application/cargo-arrival-occurrence.port.js'
import {
  buildArrivalDocumentFilters,
  buildArrivalFilters,
  type Transaction,
} from './cargo-arrival-persistence.support.js'

/** Viva em viagem = `trip_documents` sem `released_at` (o padrão de `buildActiveTripLinkFilters`). */
const IN_LIVE_TRIP = sql<boolean>`exists (select 1 from ${tripDocuments} where ${tripDocuments.companyId} = ${cargoArrivalDocuments.companyId} and ${tripDocuments.nfeDocumentId} = ${cargoArrivalDocuments.nfeDocumentId} and ${tripDocuments.releasedAt} is null)`

export async function lockOccurrenceArrival(
  transaction: Transaction,
  scope: ArrivalScope,
): Promise<LockedOccurrenceArrival | null> {
  const [arrival] = await transaction
    .select({
      contractorId: cargoArrivals.contractorId,
      separationDueAt: cargoArrivals.separationDueAt,
      status: cargoArrivals.status,
    })
    .from(cargoArrivals)
    .where(and(...buildArrivalFilters(scope)))
    .for('no key update')
  return arrival ?? null
}

export async function lockOccurrenceDocument(
  transaction: Transaction,
  scope: ArrivalScope & { readonly nfeDocumentId: string },
): Promise<LockedOccurrenceDocument | null> {
  const [document] = await transaction
    .select({
      id: cargoArrivalDocuments.id,
      isInLiveTrip: IN_LIVE_TRIP.mapWith(Boolean),
      nfeDocumentId: cargoArrivalDocuments.nfeDocumentId,
      returnOccurrenceId: cargoArrivalDocuments.returnOccurrenceId,
      returnToContractor: cargoArrivalDocuments.returnToContractor,
      separationState: cargoArrivalDocuments.separationState,
    })
    .from(cargoArrivalDocuments)
    .where(
      and(
        ...buildArrivalDocumentFilters(scope),
        eq(cargoArrivalDocuments.nfeDocumentId, scope.nfeDocumentId),
      ),
    )
    .for('no key update')
  return document ?? null
}
