/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 209: as duas consultas da foto do "Deu problema" — a parada que resolve a viagem do upload
 * (RF1) e o anexo que a foto completa quando chega depois da ocorrência (RF3).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { tripStopOccurrences, tripStops, trips } from '../../database/trip.schema.js'
import type { FieldTripTarget } from '../application/field-trip-target.types.js'
import { TRIP_ON_ROAD_STATUSES } from '../domain/trip-state.policy.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** O mesmo portão de `findStopForDriver`: a foto só nasce onde a ocorrência pode nascer. */
export async function findDriverReachableStop(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly stopId: string
    readonly target: FieldTripTarget
  },
): Promise<null | { readonly tripId: string }> {
  const [row] = await queryable
    .select({ tripId: tripStops.tripId })
    .from(tripStops)
    .innerJoin(trips, and(eq(trips.companyId, tripStops.companyId), eq(trips.id, tripStops.tripId)))
    .where(
      and(
        eq(tripStops.companyId, input.companyId),
        eq(tripStops.id, input.stopId),
        fieldTripTargetCondition(input.target),
        inArray(trips.status, [...TRIP_ON_ROAD_STATUSES]),
      ),
    )
    .limit(1)

  return row === undefined ? null : { tripId: row.tripId }
}

/**
 * RF3: completa o anexo **uma vez**. `attachment_object_id is null` no `where` é a regra inteira —
 * o reenvio nunca troca a foto que já está lá, e o registro novo (que já nasceu com ela) não muda.
 */
export async function attachUploadToStopOccurrence(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly objectId: string
    readonly occurrenceId: string
    readonly stopId: string
  },
): Promise<void> {
  await queryable
    .update(tripStopOccurrences)
    .set({ attachmentObjectId: input.objectId })
    .where(
      and(
        eq(tripStopOccurrences.companyId, input.companyId),
        eq(tripStopOccurrences.id, input.occurrenceId),
        eq(tripStopOccurrences.stopId, input.stopId),
        isNull(tripStopOccurrences.attachmentObjectId),
      ),
    )
}
