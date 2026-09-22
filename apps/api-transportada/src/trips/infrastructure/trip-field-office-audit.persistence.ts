/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { auditLogs } from '../../database/database.schema.js'
import type { TripFieldOfficeAuditInput } from '../application/trip-field-office-audit.port.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'
import type { TripTransaction } from './trip-queryable.type.js'

const TRIP_ENTITY_TYPE = 'trip'
const TRIP_DRIVER_TARGET_TYPE = 'trip_driver'

/**
 * Uma linha por ação, **na transação da ação** (spec 156 T15 M11): quem clicou (`actorUserId`), em
 * nome de quem (`targetId`), a viagem (`entityId`) e, em `metadata`, o IP e os ids opacos da nota,
 * da parada ou do objeto substituído — sem PII.
 */
export async function insertTripFieldOfficeAudit(
  transaction: TripTransaction,
  input: TripFieldOfficeAuditInput,
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: input.action,
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    correlationId: input.correlationId,
    entityId: input.tripId,
    entityType: TRIP_ENTITY_TYPE,
    metadata: {
      ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
      ...(input.documentIds === undefined ? {} : { documentIds: input.documentIds }),
      ipAddress: input.ipAddress,
      ...(input.replacedObjectId === undefined || input.replacedObjectId === null
        ? {}
        : { replacedObjectId: input.replacedObjectId }),
      ...(input.stopId === undefined ? {} : { stopId: input.stopId }),
    },
    permission: TRIP_REPORT_ON_BEHALF_PERMISSION,
    targetId: input.onBehalfOfDriverId,
    targetType: TRIP_DRIVER_TARGET_TYPE,
  })
}
