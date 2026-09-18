/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, sql } from 'drizzle-orm'

import { tripDocuments, tripDrivers, trips, tripStops } from '../../database/trip.schema.js'
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'
import type { AllowedActionsTripSnapshot } from '../domain/trip-allowed-actions.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Spec 156 D10. ⚠️ Todas as paradas e todas as notas da viagem, liberadas inclusive: o recorte de
 * "nota viva" é da política (`resolveTripHasRoute`), que espelha o SQL de `readRouteState` — filtrar
 * aqui seria uma terceira cópia da regra.
 */
export async function readTripActionSnapshot(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<AllowedActionsTripSnapshot | null> {
  const [tripRecord] = await queryable
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (tripRecord === undefined) return null

  const [stops, documents, [crew]] = await Promise.all([
    queryable
      .select({ arrivedAt: tripStops.arrivedAt, id: tripStops.id })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
      .orderBy(asc(tripStops.sequence)),
    queryable
      .select({
        id: tripDocuments.id,
        releasedAt: tripDocuments.releasedAt,
        separationStatus: tripDocuments.separationStatus,
        stopId: tripDocuments.stopId,
      })
      .from(tripDocuments)
      .where(
        and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)),
      )
      .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id)),
    queryable
      .select({ count: sql<number>`count(*)::int` })
      .from(tripDrivers)
      .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId))),
  ])

  return {
    documents: documents.map((document) => ({
      id: document.id,
      releasedAt: document.releasedAt?.toISOString() ?? null,
      separationStatus: document.separationStatus as TripDocumentSeparationStatus,
      stopId: document.stopId,
    })),
    hasDriver: (crew?.count ?? 0) > 0,
    status: tripRecord.status,
    stops: stops.map((stop) => ({
      arrivedAt: stop.arrivedAt?.toISOString() ?? null,
      id: stop.id,
    })),
  }
}
