/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E13): o que o envio do comprovante ao WhatsApp do motorista precisa — o arquivo registrado na ocorrência de
 * parada e o WhatsApp **verificado** do motorista da viagem (vínculo ativo). Toda junção leva `company_id`.
 */
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'

import { occurrenceConversationAttachments } from '../../database/occurrence-conversation.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import { tripDrivers, tripStopOccurrences, tripStops } from '../../database/trip.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { userWhatsAppPhones } from '../../database/user-whatsapp-phone.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type {
  DriverPayoutReceiptWhatsAppReaderPort,
  DriverPayoutReceiptWhatsAppTarget,
} from '../application/send-driver-payout-receipt-by-whatsapp.use-case.js'
import type { TripQueryable } from './trip-queryable.type.js'

const DELETED_OBJECT_STATUS = 'deleted'

export function createDrizzleDriverPayoutReceiptWhatsAppReader(
  database: TripQueryable,
): DriverPayoutReceiptWhatsAppReaderPort {
  return {
    async findTarget(input): Promise<DriverPayoutReceiptWhatsAppTarget | null> {
      const [occurrence] = await database
        .select({
          receiptObjectId: tripStopOccurrences.driverPayoutReceiptObjectId,
          tripId: tripStops.tripId,
        })
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
      if (occurrence === undefined) return null

      const [phone] = await database
        .select({ phone: userWhatsAppPhones.phone })
        .from(tripDrivers)
        .innerJoin(
          fleetDrivers,
          and(
            eq(fleetDrivers.companyId, tripDrivers.companyId),
            eq(fleetDrivers.id, tripDrivers.driverId),
          ),
        )
        .innerJoin(
          userCompanyMemberships,
          and(
            eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
            eq(userCompanyMemberships.id, fleetDrivers.membershipId),
            eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
          ),
        )
        .innerJoin(
          userWhatsAppPhones,
          and(
            eq(userWhatsAppPhones.userId, userCompanyMemberships.userId),
            isNotNull(userWhatsAppPhones.verifiedAt),
          ),
        )
        .where(
          and(
            eq(tripDrivers.companyId, input.companyId),
            eq(tripDrivers.tripId, occurrence.tripId),
            eq(tripDrivers.position, sql`1`),
          ),
        )
        .limit(1)

      const receipt =
        occurrence.receiptObjectId === null
          ? null
          : await findReceiptFile(database, input.companyId, occurrence.receiptObjectId)
      return { driverWhatsappPhone: phone?.phone ?? null, receipt }
    },
  }
}

async function findReceiptFile(
  database: TripQueryable,
  companyId: string,
  objectId: string,
): Promise<DriverPayoutReceiptWhatsAppTarget['receipt']> {
  const [row] = await database
    .select({
      bucket: storedObjects.bucket,
      fileName: occurrenceConversationAttachments.fileName,
      mimeType: occurrenceConversationAttachments.contentType,
      objectKey: storedObjects.objectKey,
      sizeBytes: occurrenceConversationAttachments.sizeBytes,
    })
    .from(storedObjects)
    .innerJoin(
      occurrenceConversationAttachments,
      and(
        eq(occurrenceConversationAttachments.companyId, storedObjects.companyId),
        eq(occurrenceConversationAttachments.storedObjectId, storedObjects.id),
      ),
    )
    .where(
      and(
        eq(storedObjects.companyId, companyId),
        eq(storedObjects.id, objectId),
        ne(storedObjects.status, DELETED_OBJECT_STATUS),
      ),
    )
    .limit(1)
  return row === undefined ? null : { ...row, sizeBytes: Number(row.sizeBytes) }
}
