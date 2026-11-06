/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomUUID } from 'node:crypto'

import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, sql } from 'drizzle-orm'

import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { whatsappDeliveryPreparations } from '../../database/whatsapp-delivery-preparation.schema.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import type {
  WhatsAppDeliveryPreparation,
  WhatsAppDeliveryPreparationMediaPort,
  WhatsAppDeliveryPreparationRepositoryPort,
} from '../application/whatsapp-delivery-preparation.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const OPEN_UNIQUE = 'whatsapp_delivery_preparations_company_document_open_unique'

const COLUMNS = {
  awaiting: whatsappDeliveryPreparations.awaiting,
  companyId: whatsappDeliveryPreparations.companyId,
  documentId: whatsappDeliveryPreparations.documentId,
  documentNumber: whatsappDeliveryPreparations.documentNumber,
  driverId: whatsappDeliveryPreparations.driverId,
  id: whatsappDeliveryPreparations.id,
  latitude: whatsappDeliveryPreparations.latitude,
  locationCapturedAt: whatsappDeliveryPreparations.locationCapturedAt,
  longitude: whatsappDeliveryPreparations.longitude,
  originChannel: whatsappDeliveryPreparations.originChannel,
  photos: whatsappDeliveryPreparations.photos,
  receivedBy: whatsappDeliveryPreparations.receivedBy,
  receiverName: whatsappDeliveryPreparations.receiverName,
  skipped: whatsappDeliveryPreparations.skipped,
  updatedAt: whatsappDeliveryPreparations.updatedAt,
  version: whatsappDeliveryPreparations.version,
}

type Row = {
  awaiting: null | string
  companyId: string
  documentId: string
  documentNumber: string
  driverId: string
  id: string
  latitude: null | string
  locationCapturedAt: Date | null
  longitude: null | string
  originChannel: WhatsAppDeliveryPreparation['originChannel']
  photos: WhatsAppDeliveryPreparation['photos']
  receivedBy: WhatsAppDeliveryPreparation['receivedBy']
  receiverName: null | string
  skipped: readonly string[]
  updatedAt: Date
  version: bigint
}

/** Spec 293 T15: a entrega em preparo, sempre por empresa. */
export function createDrizzleWhatsAppDeliveryPreparationRepository(
  database: Database,
): WhatsAppDeliveryPreparationRepositoryPort {
  const open = (companyId: string) =>
    and(
      eq(whatsappDeliveryPreparations.companyId, companyId),
      eq(whatsappDeliveryPreparations.status, 'open'),
    )

  return {
    async close(input) {
      const rows = await database
        .update(whatsappDeliveryPreparations)
        .set({
          awaiting: null,
          closedAt: sql`now()`,
          status: input.status,
          updatedAt: sql`now()`,
          version: sql`${whatsappDeliveryPreparations.version} + 1`,
        })
        .where(
          and(
            open(input.companyId),
            eq(whatsappDeliveryPreparations.id, input.id),
            eq(whatsappDeliveryPreparations.version, input.version),
          ),
        )
        .returning({ id: whatsappDeliveryPreparations.id })
      return rows.length === 1
    },

    async findOpenByDocument(input) {
      const [row] = await database
        .select(COLUMNS)
        .from(whatsappDeliveryPreparations)
        .where(
          and(open(input.companyId), eq(whatsappDeliveryPreparations.documentId, input.documentId)),
        )
        .limit(1)
      return row === undefined ? null : toPreparation(row)
    },

    async listOpenForDriver(input) {
      const rows = await database
        .select(COLUMNS)
        .from(whatsappDeliveryPreparations)
        .where(
          and(open(input.companyId), eq(whatsappDeliveryPreparations.driverId, input.driverId)),
        )
        .orderBy(
          desc(whatsappDeliveryPreparations.updatedAt),
          desc(whatsappDeliveryPreparations.id),
        )
        .limit(20)
      return rows.map(toPreparation)
    },

    async open(input) {
      try {
        const [row] = await database
          .insert(whatsappDeliveryPreparations)
          .values({
            companyId: input.companyId,
            documentId: input.documentId,
            documentNumber: input.documentNumber,
            driverId: input.driverId,
            originChannel: input.originChannel,
          })
          .returning(COLUMNS)
        if (row === undefined)
          throw new Error('whatsapp delivery preparation insert returned nothing')
        return toPreparation(row)
      } catch (error) {
        if (violatedUniqueConstraint(error) === OPEN_UNIQUE) return null
        throw error
      }
    },

    async save(input) {
      const { changes } = input
      const rows = await database
        .update(whatsappDeliveryPreparations)
        .set({
          awaiting: changes.awaiting,
          latitude: changes.location?.latitude ?? null,
          locationCapturedAt:
            changes.location === null ? null : new Date(changes.location.capturedAt),
          longitude: changes.location?.longitude ?? null,
          photos: [...changes.photos],
          receivedBy: changes.receivedBy,
          receiverName: changes.receiverName,
          skipped: [...changes.skipped],
          updatedAt: sql`now()`,
          version: sql`${whatsappDeliveryPreparations.version} + 1`,
        })
        .where(
          and(
            open(input.companyId),
            eq(whatsappDeliveryPreparations.id, input.id),
            eq(whatsappDeliveryPreparations.version, input.version),
          ),
        )
        .returning({ id: whatsappDeliveryPreparations.id })
      return rows.length === 1
    },
  }
}

function toPreparation(row: Row): WhatsAppDeliveryPreparation {
  const { latitude, locationCapturedAt, longitude, version, ...rest } = row
  return {
    ...rest,
    // O cliente da aplicação (`prepare: false`) devolve `bigint` como texto: a versão volta a ser número.
    version: BigInt(version),
    location:
      latitude === null || longitude === null
        ? null
        : {
            accuracyMeters: null,
            capturedAt: (locationCapturedAt ?? new Date()).toISOString(),
            latitude,
            longitude,
          },
  }
}

/**
 * As fotos à espera da baixa, no bucket privado (o mesmo dos comprovantes). A chave é por empresa e
 * preparação; depois da baixa o comprovante grava a sua cópia e esta é apagada.
 */
export function createWhatsAppDeliveryPreparationMedia(input: {
  readonly bucket: string
  readonly storage: NfeStorageGateway
}): WhatsAppDeliveryPreparationMediaPort {
  return {
    async read({ objectKey }) {
      const stream = await input.storage.getObjectStream({ bucket: input.bucket, key: objectKey })
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
    async remove({ objectKey }) {
      await input.storage.deleteObject({ bucket: input.bucket, key: objectKey })
    },
    async store({ bytes, companyId, mimeType, preparationId }) {
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const objectKey = `tenants/${companyId}/whatsapp-delivery-preparations/${preparationId}/${randomUUID()}`
      await input.storage.storeObject({
        body: bytes,
        bucket: input.bucket,
        contentLength: bytes.byteLength,
        contentType: mimeType,
        key: objectKey,
        sha256,
      })
      return { objectKey, sha256, sizeBytes: bytes.byteLength }
    },
  }
}
