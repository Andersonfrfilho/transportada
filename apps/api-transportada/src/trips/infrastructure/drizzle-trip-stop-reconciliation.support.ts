/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, sql } from 'drizzle-orm'

import { deliveryCharges } from '../../database/delivery-client.schema.js'
import { tripDocuments, tripStops } from '../../database/trip.schema.js'
import { logStopRemindersRemovedWithStop } from '../../driver-stop-reminders/infrastructure/log-stop-reminders-removed-with-stop.persistence.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { TripStopReconciliationPort } from '../application/reconcile-trip-stops.use-case.js'
import { listStopsWithScheduledCanhotoPickup } from './canhoto-pickup.query.js'
import type { TripTransaction } from './trip-queryable.type.js'

/** Implementação real de `TripStopReconciliationPort` sobre uma transação — compartilhada por todo
 * caminho que reconcilia parada (vínculo/desvínculo de nota, T007; desvio de endereço, T010b). */
export function createTripStopReconciliationPort(
  transaction: TripTransaction,
  logger?: ApiLogger,
): TripStopReconciliationPort {
  return {
    /**
     * Spec 321 T3: a coleta de canhoto encaixada também ocupa a parada — a parada só de coleta não tem nota, e a
     * nota que sai de uma parada com coleta não pode apagá-la (a FK da coleta é `restrict`).
     */
    async countLiveDocumentsAtStop(input) {
      const rows = await transaction
        .select({ id: tripDocuments.id })
        .from(tripDocuments)
        .where(
          and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.stopId, input.stopId)),
        )
      const withPickup = await listStopsWithScheduledCanhotoPickup(transaction, {
        companyId: input.companyId,
        stopIds: [input.stopId],
      })
      /**
       * A cobrança lançada por uma ocorrência **da parada** (ex.: "cobrança no recebimento") também a ocupa: a FK
       * `delivery_charges_company_stop_occurrence_fk` é `restrict`, e apagar a parada que o motorista já tocou levava a
       * 500 ao mover a nota para outra viagem (spec 321, staging 21/11/2026). A parada fica, sem nota, como evidência.
       */
      const [charge] = await transaction
        .select({ id: deliveryCharges.id })
        .from(deliveryCharges)
        .where(
          and(
            eq(deliveryCharges.companyId, input.companyId),
            sql`${deliveryCharges.stopOccurrenceId} in (select id from trip_stop_occurrences where company_id = ${input.companyId} and stop_id = ${input.stopId})`,
          ),
        )
        .limit(1)
      return rows.length + (withPickup.has(input.stopId) ? 1 : 0) + (charge === undefined ? 0 : 1)
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
      await logStopRemindersRemovedWithStop(transaction, { ...input, logger })
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
