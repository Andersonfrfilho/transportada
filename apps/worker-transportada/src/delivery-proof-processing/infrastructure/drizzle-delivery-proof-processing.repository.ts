/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { deliveryProofProcessingProofs as proofs } from '../../database/delivery-proof-processing.schema.js'
import { storedObjects } from '../../database/stored-object.schema.js'
import type {
  DeliveryProofProcessingRepositoryPort,
  NewProofObject,
  ProofToProcess,
} from '../application/delivery-proof-processing.port.js'
import type { DeliveryProofProcessingState } from '../../database/delivery-proof-processing.schema.js'

export type DeliveryProofProcessingDatabase = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_STATES = ['received', 'processing', 'processing_failed'] as const

type LoadedRow = Readonly<{
  document_id: null | string
  has_thumbnail: boolean
  mime_type: null | string
  object_id: string
  object_key: null | string
  bucket: null | string
  original_object_id: null | string
  proof_id: string
  readable: boolean
  size_bytes: bigint | null | number | string
  state: DeliveryProofProcessingState | null
  stop_event_id: string
  trip_id: null | string
}>

class SwapLostError extends Error {}

function toStoredObjectValues(companyId: string, object: NewProofObject) {
  return {
    bucket: object.bucket,
    companyId,
    id: object.objectId,
    mimeType: object.mimeType,
    objectKey: object.objectKey,
    provider: 's3',
    purpose: object.purpose,
    sha256: object.sha256,
    sizeBytes: BigInt(object.sizeBytes),
    status: 'final' as const,
  }
}

/**
 * Cada escrita carrega o `original_object_id` esperado e o estado: recaptura (outro original) e
 * tratamento concorrente (outro já trocou) viram `false`, nunca sobrescrita. O `SELECT` de leitura é
 * SQL literal, como a fila do canhoto: `trip_delivery_proofs` não tem `trip_id` nem `document_id`,
 * eles só existem nos joins.
 */
export function createDrizzleDeliveryProofProcessingRepository(
  database: DeliveryProofProcessingDatabase,
): DeliveryProofProcessingRepositoryPort {
  return {
    async finalizeReady(params) {
      return database.transaction(async (transaction) => {
        const closed = await transaction
          .update(proofs)
          .set({ originalObjectId: null, processingError: null, processingState: 'ready' })
          .where(
            and(
              eq(proofs.id, params.proofId),
              eq(proofs.companyId, params.companyId),
              eq(proofs.processingState, 'processing'),
              eq(proofs.originalObjectId, params.originalObjectId),
              sql`${proofs.objectId} <> ${params.originalObjectId}`,
            ),
          )
          .returning({ id: proofs.id })
        if (closed.length === 0) return false

        // A referência já caiu (FK `restrict`): agora o objeto pode ser marcado como apagado.
        await transaction
          .update(storedObjects)
          .set({ deletedAt: new Date(), status: 'deleted', updatedAt: new Date() })
          .where(
            and(
              eq(storedObjects.id, params.originalObjectId),
              eq(storedObjects.companyId, params.companyId),
            ),
          )
        return true
      })
    },

    async load(params) {
      const rows = (await database.execute(sql`
        select
          p."id" as proof_id,
          p."processing_state" as state,
          p."object_id" as object_id,
          p."original_object_id" as original_object_id,
          p."stop_event_id" as stop_event_id,
          (p."thumbnail_object_id" is not null) as has_thumbnail,
          (p."kind" = 'photo'
            and p."canhoto_review" = 'pending'
            and p."canhoto_read_source" is null
            and p."canhoto_read_attempted_at" is null) as readable,
          o."bucket" as bucket,
          o."object_key" as object_key,
          o."mime_type" as mime_type,
          o."size_bytes" as size_bytes,
          d."id" as document_id,
          d."trip_id" as trip_id
        from trip_delivery_proofs p
        left join stored_objects o
          on o."id" = p."original_object_id" and o."company_id" = p."company_id"
        left join trip_stop_events e
          on e."id" = p."stop_event_id" and e."company_id" = p."company_id"
        left join trip_documents d
          on d."id" = e."trip_document_id" and d."company_id" = e."company_id"
        where p."id" = ${params.proofId}::uuid and p."company_id" = ${params.companyId}::uuid
      `)) as unknown as readonly LoadedRow[]

      const [row] = rows
      return row === undefined ? undefined : toProof(row)
    },

    async markFailed(params) {
      const rows = await database
        .update(proofs)
        .set({ processingError: params.code, processingState: 'processing_failed' })
        .where(
          and(
            eq(proofs.id, params.proofId),
            eq(proofs.companyId, params.companyId),
            eq(proofs.originalObjectId, params.originalObjectId),
            inArray(proofs.processingState, [...ACTIVE_STATES]),
          ),
        )
        .returning({ id: proofs.id })
      return rows.length > 0
    },

    async markProcessing(params) {
      const rows = await database
        .update(proofs)
        .set({ processingError: null, processingState: 'processing' })
        .where(
          and(
            eq(proofs.id, params.proofId),
            eq(proofs.companyId, params.companyId),
            eq(proofs.originalObjectId, params.originalObjectId),
            inArray(proofs.processingState, [...ACTIVE_STATES]),
          ),
        )
        .returning({ id: proofs.id })
      return rows.length > 0
    },

    async swapToReduced(params) {
      try {
        return await database.transaction(async (transaction) => {
          await transaction
            .insert(storedObjects)
            .values(toStoredObjectValues(params.companyId, params.reduced))
          if (params.thumbnail !== null) {
            await transaction
              .insert(storedObjects)
              .values(toStoredObjectValues(params.companyId, params.thumbnail))
          }

          const swapped = await transaction
            .update(proofs)
            .set({
              objectId: params.reduced.objectId,
              ...(params.thumbnail === null
                ? {}
                : { thumbnailObjectId: params.thumbnail.objectId }),
            })
            .where(
              and(
                eq(proofs.id, params.proofId),
                eq(proofs.companyId, params.companyId),
                eq(proofs.processingState, 'processing'),
                eq(proofs.originalObjectId, params.originalObjectId),
                eq(proofs.objectId, params.originalObjectId),
              ),
            )
            .returning({ id: proofs.id })
          // Perdeu a corrida: desfaz as linhas de objeto também, para não sobrar `final` sem dono.
          if (swapped.length === 0) throw new SwapLostError()
          return true
        })
      } catch (error) {
        if (error instanceof SwapLostError) return false
        throw error
      }
    },
  }
}

function toProof(row: LoadedRow): ProofToProcess {
  const hasOriginal =
    row.original_object_id !== null &&
    row.bucket !== null &&
    row.object_key !== null &&
    row.mime_type !== null &&
    row.size_bytes !== null

  return {
    canhoto:
      row.trip_id === null || row.document_id === null
        ? null
        : { documentId: row.document_id, tripId: row.trip_id },
    canhotoReadable: row.readable,
    current: { objectId: row.object_id },
    hasThumbnail: row.has_thumbnail,
    original: hasOriginal
      ? {
          bucket: row.bucket as string,
          mimeType: row.mime_type as string,
          objectId: row.original_object_id as string,
          objectKey: row.object_key as string,
          sizeBytes: Number(row.size_bytes),
        }
      : null,
    proofId: row.proof_id,
    state: row.state,
    stopEventId: row.stop_event_id,
  }
}
