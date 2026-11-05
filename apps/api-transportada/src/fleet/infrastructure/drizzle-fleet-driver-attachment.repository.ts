/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  fleetDriverAttachmentOutbox,
  fleetDriverAttachments,
  fleetDrivers,
  identityUserProfiles,
} from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { storedObjects } from '../../database/storage.schema.js'
import type {
  FleetDriverAttachmentRepositoryPort,
  FleetDriverAttachmentSuggestionFields,
} from '../application/fleet-driver-attachment.port.js'
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

          if (input.replaceAttachmentId !== undefined) {
            await removeAttachmentRows(transaction, {
              attachmentId: input.replaceAttachmentId,
              companyId: input.companyId,
              driverId: input.driverId,
            })
          }

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

    async decideSuggestion({ attachmentId, companyId, decidedBy, decision, driverId }) {
      const scope = and(
        eq(fleetDriverAttachments.companyId, companyId),
        eq(fleetDriverAttachments.driverId, driverId),
        eq(fleetDriverAttachments.id, attachmentId),
      )
      // Uma escrita só: a decisão e o descarte da leitura saem juntos (D5).
      const [decided] = await database
        .update(fleetDriverAttachments)
        .set({ decidedAt: new Date(), decidedBy, decision, extractedFields: null })
        .where(and(scope, isNull(fleetDriverAttachments.decision)))
        .returning({ id: fleetDriverAttachments.id })
      if (decided !== undefined) return 'decided'

      const [existing] = await database
        .select({ id: fleetDriverAttachments.id })
        .from(fleetDriverAttachments)
        .where(scope)
        .limit(1)
      return existing === undefined ? 'not_found' : 'already_decided'
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
          type: fleetDriverAttachments.type,
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

    async list({ companyId, driverId }) {
      const rows = await database
        .select({
          createdAt: fleetDriverAttachments.createdAt,
          // Só o aviso: o que foi lido não sai por esta lista, que é de `fleet.read`.
          hasSuggestion: sql<boolean>`(${fleetDriverAttachments.extractedFields} is not null)`,
          id: fleetDriverAttachments.id,
          type: fleetDriverAttachments.type,
          uploadedById: fleetDriverAttachments.uploadedBy,
          uploadedByName: identityUserProfiles.name,
        })
        .from(fleetDriverAttachments)
        .leftJoin(
          identityUserProfiles,
          eq(identityUserProfiles.userId, fleetDriverAttachments.uploadedBy),
        )
        .where(
          and(
            eq(fleetDriverAttachments.companyId, companyId),
            eq(fleetDriverAttachments.driverId, driverId),
          ),
        )
        .orderBy(asc(fleetDriverAttachments.createdAt), asc(fleetDriverAttachments.id))
      return rows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        hasSuggestion: row.hasSuggestion,
        id: row.id,
        type: row.type,
        uploadedBy: { id: row.uploadedById, name: row.uploadedByName },
      }))
    },

    async readSuggestion({ attachmentId, companyId, driverId }) {
      const [row] = await database
        .select({
          decision: fleetDriverAttachments.decision,
          extractedFields: fleetDriverAttachments.extractedFields,
        })
        .from(fleetDriverAttachments)
        .where(
          and(
            eq(fleetDriverAttachments.companyId, companyId),
            eq(fleetDriverAttachments.driverId, driverId),
            eq(fleetDriverAttachments.id, attachmentId),
          ),
        )
        .limit(1)
      if (row === undefined) return { fields: null, isFound: false }
      if (row.decision !== null) return { fields: null, isFound: true }
      return { fields: pickSuggestionFields(row.extractedFields), isFound: true }
    },

    async remove({ attachmentId, companyId, driverId }) {
      return database.transaction(async (transaction) =>
        removeAttachmentRows(transaction, { attachmentId, companyId, driverId }),
      )
    },

    async removeAllForDriver({ companyId, driverId }) {
      return database.transaction(async (transaction) => {
        const rows = await transaction
          .select({
            attachmentId: fleetDriverAttachments.id,
            bucket: storedObjects.bucket,
            objectKey: storedObjects.objectKey,
            storedObjectId: storedObjects.id,
            type: fleetDriverAttachments.type,
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
            ),
          )
        if (rows.length === 0) return []

        await transaction.delete(fleetDriverAttachmentOutbox).where(
          and(
            eq(fleetDriverAttachmentOutbox.companyId, companyId),
            inArray(
              fleetDriverAttachmentOutbox.attachmentId,
              rows.map((row) => row.attachmentId),
            ),
          ),
        )
        await transaction
          .delete(fleetDriverAttachments)
          .where(
            and(
              eq(fleetDriverAttachments.companyId, companyId),
              eq(fleetDriverAttachments.driverId, driverId),
            ),
          )
        const now = new Date()
        await transaction
          .update(storedObjects)
          .set({ deletedAt: now, status: 'deleted', updatedAt: now })
          .where(
            and(
              eq(storedObjects.companyId, companyId),
              inArray(
                storedObjects.id,
                rows.map((row) => row.storedObjectId),
              ),
            ),
          )
        return rows.map(({ bucket, objectKey, storedObjectId, type }) => ({
          bucket,
          objectKey,
          storedObjectId,
          type,
        }))
      })
    },

    async findByType({ companyId, driverId, type }) {
      const [row] = await database
        .select({
          bucket: storedObjects.bucket,
          id: fleetDriverAttachments.id,
          objectKey: storedObjects.objectKey,
          storedObjectId: storedObjects.id,
          type: fleetDriverAttachments.type,
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
            eq(fleetDriverAttachments.type, type),
          ),
        )
        .limit(1)
      if (row === undefined) return null
      return {
        id: row.id,
        location: {
          bucket: row.bucket,
          objectKey: row.objectKey,
          storedObjectId: row.storedObjectId,
          type: row.type,
        },
      }
    },
  }
}

function readText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** A leitura é `jsonb` livre; daqui só sai o que a ficha sabe receber, e só se for texto. */
function pickSuggestionFields(
  extractedFields: unknown,
): FleetDriverAttachmentSuggestionFields | null {
  if (typeof extractedFields !== 'object' || extractedFields === null) return null
  const source = extractedFields as Record<string, unknown>
  const fields = {
    licenseCategory: readText(source, 'licenseCategory'),
    licenseNumber: readText(source, 'licenseNumber'),
  }
  return fields.licenseCategory === null && fields.licenseNumber === null ? null : fields
}

type Transaction = Parameters<Parameters<AggregateDocumentDatabase['transaction']>[0]>[0]

/**
 * Tira a linha do anexo e marca o objeto como apagado, juntos. O pedido de leitura da CNH sai antes: a
 * FK do outbox é `restrict`, e um evento para anexo que já não existe não tem o que ler.
 */
async function removeAttachmentRows(
  transaction: Transaction,
  input: { readonly attachmentId: string; readonly companyId: string; readonly driverId: string },
): Promise<boolean> {
  const scope = and(
    eq(fleetDriverAttachments.companyId, input.companyId),
    eq(fleetDriverAttachments.driverId, input.driverId),
    eq(fleetDriverAttachments.id, input.attachmentId),
  )
  const [attachment] = await transaction
    .select({ storedObjectId: fleetDriverAttachments.storedObjectId })
    .from(fleetDriverAttachments)
    .where(scope)
    .limit(1)
  if (attachment === undefined) return false

  await transaction
    .delete(fleetDriverAttachmentOutbox)
    .where(
      and(
        eq(fleetDriverAttachmentOutbox.companyId, input.companyId),
        eq(fleetDriverAttachmentOutbox.attachmentId, input.attachmentId),
      ),
    )
  await transaction.delete(fleetDriverAttachments).where(scope)

  const now = new Date()
  await transaction
    .update(storedObjects)
    .set({ deletedAt: now, status: 'deleted', updatedAt: now })
    .where(
      and(
        eq(storedObjects.companyId, input.companyId),
        eq(storedObjects.id, attachment.storedObjectId),
      ),
    )
  return true
}
