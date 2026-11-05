/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import {
  fleetDriverAttachmentOutbox,
  fleetDriverAttachments,
  fleetDrivers,
} from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { FleetDriverAttachmentRepositoryPort } from '../application/fleet-driver-attachment.port.js'
import { FleetDriverAttachmentTypeTakenError } from '../domain/fleet-driver-attachment.error.js'
import { FLEET_DRIVER_ATTACHMENT_READABLE_TYPES } from '../domain/fleet-driver-attachment.policy.js'
import { FleetDriverNotFoundError } from '../domain/fleet.error.js'
import type { AggregateDocumentDatabase } from './drizzle-aggregate-document.repository.js'

const STORAGE_PURPOSE = 'fleet_driver_attachment'
const TYPE_UNIQUE = 'fleet_driver_attachments_company_driver_type_unique'
const EXTRACTION_REQUESTED_EVENT = 'attachment.extraction.requested'

export function createDrizzleFleetDriverAttachmentRepository(
  database: AggregateDocumentDatabase,
): FleetDriverAttachmentRepositoryPort {
  return {
    async create(input) {
      try {
        return await database.transaction(async (transaction) => {
          const [driver] = await transaction
            .select({ id: fleetDrivers.id })
            .from(fleetDrivers)
            .where(
              and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)),
            )
            .limit(1)
          if (driver === undefined) throw new FleetDriverNotFoundError()

          await transaction.insert(storedObjects).values({
            bucket: input.bucket,
            companyId: input.companyId,
            id: input.storedObjectId,
            mimeType: input.mimeType,
            objectKey: input.objectKey,
            provider: input.provider,
            purpose: STORAGE_PURPOSE,
            sha256: input.sha256,
            sizeBytes: BigInt(input.sizeBytes),
            status: 'final',
          })

          const [row] = await transaction
            .insert(fleetDriverAttachments)
            .values({
              companyId: input.companyId,
              driverId: input.driverId,
              storedObjectId: input.storedObjectId,
              type: input.type,
              uploadedBy: input.uploadedBy,
            })
            .returning({
              createdAt: fleetDriverAttachments.createdAt,
              id: fleetDriverAttachments.id,
              type: fleetDriverAttachments.type,
              uploadedBy: fleetDriverAttachments.uploadedBy,
            })
          if (row === undefined) throw new Error('fleet driver attachment not created')

          /**
           * O pedido de leitura na **mesma transação** do anexo (ADR-0053): anexo sem evento é CNH que
           * nunca será lida, e evento sem anexo aponta para o nada. O payload leva **referência**.
           */
          if (FLEET_DRIVER_ATTACHMENT_READABLE_TYPES.includes(input.type)) {
            await transaction.insert(fleetDriverAttachmentOutbox).values({
              attachmentId: row.id,
              companyId: input.companyId,
              correlationId: input.correlationId,
              eventType: EXTRACTION_REQUESTED_EVENT,
              payload: {
                attachmentId: row.id,
                bucket: input.bucket,
                objectKey: input.objectKey,
                type: input.type,
              },
            })
          }

          return { ...row, createdAt: row.createdAt.toISOString() }
        })
      } catch (error: unknown) {
        if (violatedUniqueConstraint(error) === TYPE_UNIQUE) {
          throw new FleetDriverAttachmentTypeTakenError()
        }
        throw error
      }
    },

    async driverExists({ companyId, driverId }) {
      const [row] = await database
        .select({ id: fleetDrivers.id })
        .from(fleetDrivers)
        .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.id, driverId)))
        .limit(1)
      return row !== undefined
    },

    async findLocation({ attachmentId, companyId, driverId }) {
      const [row] = await database
        .select({
          bucket: storedObjects.bucket,
          objectKey: storedObjects.objectKey,
          storedObjectId: storedObjects.id,
        })
        .from(fleetDriverAttachments)
        .innerJoin(
          storedObjects,
          and(
            eq(storedObjects.companyId, fleetDriverAttachments.companyId),
            eq(storedObjects.id, fleetDriverAttachments.storedObjectId),
          ),
        )
        .where(
          and(
            eq(fleetDriverAttachments.companyId, companyId),
            eq(fleetDriverAttachments.driverId, driverId),
            eq(fleetDriverAttachments.id, attachmentId),
          ),
        )
        .limit(1)
      return row ?? null
    },

    async remove({ attachmentId, companyId, driverId }) {
      return database.transaction(async (transaction) => {
        const [row] = await transaction
          .delete(fleetDriverAttachments)
          .where(
            and(
              eq(fleetDriverAttachments.companyId, companyId),
              eq(fleetDriverAttachments.driverId, driverId),
              eq(fleetDriverAttachments.id, attachmentId),
            ),
          )
          .returning({ storedObjectId: fleetDriverAttachments.storedObjectId })
        if (row === undefined) return false

        const now = new Date()
        await transaction
          .update(storedObjects)
          .set({ deletedAt: now, status: 'deleted', updatedAt: now })
          .where(
            and(eq(storedObjects.companyId, companyId), eq(storedObjects.id, row.storedObjectId)),
          )
        return true
      })
    },
  }
}
