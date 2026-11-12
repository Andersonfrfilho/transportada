/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { auditLogs } from '../../database/database.schema.js'
import type { FleetDriverAttachmentAuditPort } from '../application/fleet-driver-attachment.port.js'
import type { AggregateDocumentDatabase } from './drizzle-aggregate-document.repository.js'

const ATTACHMENT_ENTITY = 'fleet-driver-attachment'
const DRIVER_ENTITY = 'fleet-driver'
const AUDIT_PERMISSION_BY_ACTION = {
  attached: 'fleet.manage',
  removed: 'fleet.manage',
  replaced: 'fleet.manage',
  revealed: 'fleet.reveal',
} as const

/** Uma linha por ação, com ids opacos: o documento e o que ele diz nunca entram na trilha. */
export function createDrizzleFleetDriverAttachmentAudit(
  database: AggregateDocumentDatabase,
): FleetDriverAttachmentAuditPort {
  return {
    async record(input) {
      await database.insert(auditLogs).values({
        action: `fleet-driver-attachment.${input.action}`,
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: input.attachmentId,
        entityType: ATTACHMENT_ENTITY,
        metadata: { clientIp: input.clientIp, documentType: input.type },
        permission: AUDIT_PERMISSION_BY_ACTION[input.action],
        targetId: input.driverId,
        targetType: DRIVER_ENTITY,
      })
    },
  }
}
