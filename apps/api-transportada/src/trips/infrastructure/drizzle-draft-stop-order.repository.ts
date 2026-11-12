/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: as leituras e a marca de origem do ordenador das paradas do rascunho. A escrita da ordem em si não passa por
 * aqui: é `reorderTripStops` → `DrizzleTripRouteRepository.reorderStops`, a mesma da 056.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { tripStops, trips } from '../../database/trip.schema.js'
import type {
  DraftStopCoordinate,
  OrderDraftTripStopsPort,
} from '../application/order-draft-trip-stops.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleDraftStopOrderRepository(database: Database): OrderDraftTripStopsPort {
  return {
    async readOrderingState({ companyId, tripId }) {
      const [trip] = await database
        .select({ status: trips.status, stopOrderSource: trips.stopOrderSource })
        .from(trips)
        .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
        .limit(1)
      if (trip === undefined) return null

      const rows = await database
        .select({
          addressKey: tripStops.addressKey,
          id: tripStops.id,
          sequence: tripStops.sequence,
        })
        .from(tripStops)
        .where(and(eq(tripStops.companyId, companyId), eq(tripStops.tripId, tripId)))
      return {
        stopOrderSource: trip.stopOrderSource,
        stops: rows.map((row) => ({
          addressKey: row.addressKey,
          id: row.id,
          sequence: Number(row.sequence),
        })),
        tripStatus: trip.status,
      }
    },

    async readStopCoordinates({ addressKeys }) {
      if (addressKeys.length === 0) return new Map()
      const rows = await database
        .select({
          addressKey: geocodedAddresses.addressKey,
          latitude: geocodedAddresses.latitude,
          longitude: geocodedAddresses.longitude,
          precision: geocodedAddresses.precision,
        })
        .from(geocodedAddresses)
        .where(inArray(geocodedAddresses.addressKey, [...addressKeys]))
      return new Map<string, DraftStopCoordinate>(
        rows.map((row) => [
          row.addressKey,
          {
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            precision: row.precision,
          },
        ]),
      )
    },

    async recordStopOrder({ companyId, errorCode, source, tripId }) {
      await database
        .update(trips)
        .set({ stopOrderErrorCode: errorCode, stopOrderSource: source })
        .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
    },
  }
}
