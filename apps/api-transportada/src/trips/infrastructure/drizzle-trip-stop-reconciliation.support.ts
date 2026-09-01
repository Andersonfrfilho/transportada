/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { tripDocuments, tripStops } from '../../database/trip.schema.js'
import type { TripStopReconciliationPort } from '../application/reconcile-trip-stops.use-case.js'
import type { TripTransaction } from './trip-queryable.type.js'

/** Implementação real de `TripStopReconciliationPort` sobre uma transação — compartilhada por todo
 * caminho que reconcilia parada (vínculo/desvínculo de nota, T007; desvio de endereço, T010b). */
export function createTripStopReconciliationPort(
  transaction: TripTransaction,
): TripStopReconciliationPort {
  return {
    async countLiveDocumentsAtStop(input) {
      const rows = await transaction
        .select({ id: tripDocuments.id })
        .from(tripDocuments)
        .where(
          and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.stopId, input.stopId)),
        )
      return rows.length
    },
    async createStop(input) {
      const [created] = await transaction
        .insert(tripStops)
        .values({
          addressKey: input.addressKey,
          companyId: input.companyId,
          label: input.label,
          sequence: input.sequence,
          tripId: input.tripId,
        })
        .returning()
      if (created === undefined) throw new Error('TRIP_STOP_CREATE_FAILED')
      return { addressKey: created.addressKey, id: created.id, sequence: created.sequence }
    },
    async deleteStop(input) {
      await transaction
        .delete(tripStops)
        .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.id, input.stopId)))
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
          ),
        )
        .limit(1)
      return found ?? null
    },
    async nextStopSequence(input) {
      const rows = await transaction
        .select({ sequence: tripStops.sequence })
        .from(tripStops)
        .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
      const max = rows.reduce(
        (accumulator, row) => (row.sequence > accumulator ? row.sequence : accumulator),
        0n,
      )
      return max + 1n
    },
  }
}
