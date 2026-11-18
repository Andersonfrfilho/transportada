/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 343 (T6a): o grupo de WhatsApp do motorista da viagem da ocorrência (nota ou parada) e o telefone dele para a
 * marca. Toda junção leva `company_id`; o motorista é o principal da viagem (`position = 1`).
 */
import { and, eq, sql } from 'drizzle-orm'

import { fleetDrivers, fleetDriverWhatsappGroups } from '../../database/fleet.schema.js'
import {
  tripDocumentOccurrences,
  tripDocuments,
  tripDrivers,
  tripStopOccurrences,
  tripStops,
} from '../../database/trip.schema.js'
import type { DriverAddressGroupReaderPort } from '../application/send-driver-address-to-whatsapp-group.use-case.js'
import type { TripQueryable } from './trip-queryable.type.js'

export function createDrizzleDriverAddressGroupReader(
  database: TripQueryable,
): DriverAddressGroupReaderPort {
  return {
    async findTarget(input) {
      const [source] =
        input.occurrenceKind === 'stop'
          ? await database
              .select({ tripId: tripStops.tripId })
              .from(tripStopOccurrences)
              .innerJoin(
                tripStops,
                and(
                  eq(tripStops.companyId, tripStopOccurrences.companyId),
                  eq(tripStops.id, tripStopOccurrences.stopId),
                ),
              )
              .where(
                and(
                  eq(tripStopOccurrences.companyId, input.companyId),
                  eq(tripStopOccurrences.id, input.occurrenceId),
                ),
              )
              .limit(1)
          : await database
              .select({ tripId: tripDocuments.tripId })
              .from(tripDocumentOccurrences)
              .innerJoin(
                tripDocuments,
                and(
                  eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
                  eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
                ),
              )
              .where(
                and(
                  eq(tripDocumentOccurrences.companyId, input.companyId),
                  eq(tripDocumentOccurrences.id, input.occurrenceId),
                ),
              )
              .limit(1)
      if (source === undefined) return null

      const [driver] = await database
        .select({ groupJid: fleetDriverWhatsappGroups.groupJid, phone: fleetDrivers.phone })
        .from(tripDrivers)
        .innerJoin(
          fleetDrivers,
          and(
            eq(fleetDrivers.companyId, tripDrivers.companyId),
            eq(fleetDrivers.id, tripDrivers.driverId),
          ),
        )
        .leftJoin(
          fleetDriverWhatsappGroups,
          and(
            eq(fleetDriverWhatsappGroups.companyId, fleetDrivers.companyId),
            eq(fleetDriverWhatsappGroups.driverId, fleetDrivers.id),
          ),
        )
        .where(
          and(
            eq(tripDrivers.companyId, input.companyId),
            eq(tripDrivers.tripId, source.tripId),
            eq(tripDrivers.position, sql`1`),
          ),
        )
        .limit(1)
      if (driver === undefined) return null
      return {
        driverPhone: driver.phone === '' ? null : driver.phone,
        groupJid: driver.groupJid ?? null,
      }
    },
  }
}
