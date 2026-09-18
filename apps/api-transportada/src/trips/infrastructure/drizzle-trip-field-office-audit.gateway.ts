/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { auditLogs } from '../../database/database.schema.js'
import type { TripFieldOfficeAuditPort } from '../application/trip-field-office-audit.port.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'

type TripDatabase = ReturnType<typeof createDrizzleProvider>['db']

const TRIP_ENTITY_TYPE = 'trip'
const TRIP_DRIVER_TARGET_TYPE = 'trip_driver'

/**
 * Uma linha por ação: quem clicou (`actorUserId`), em nome de quem (`targetId`), a viagem
 * (`entityId`) e o IP em `metadata` — sem PII (só o endereço, nunca dado de negócio).
 */
export function createDrizzleTripFieldOfficeAudit(
  database: TripDatabase,
): TripFieldOfficeAuditPort {
  return {
    async record(input) {
      await database.insert(auditLogs).values({
        action: input.action,
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: input.tripId,
        entityType: TRIP_ENTITY_TYPE,
        metadata: { ipAddress: input.ipAddress },
        permission: TRIP_REPORT_ON_BEHALF_PERMISSION,
        targetId: input.onBehalfOfDriverId,
        targetType: TRIP_DRIVER_TARGET_TYPE,
      })
    },
  }
}
