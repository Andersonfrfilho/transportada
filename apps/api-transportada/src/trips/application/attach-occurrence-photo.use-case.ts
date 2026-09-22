/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T7 (RF6): o anexo adicional a uma ocorrência de galpão já registrada — segunda foto em
 * diante, até o teto de cinco. Mesma validação de upload de T6 (teto/tipo/assinatura de bytes), mas
 * sem criar ocorrência: resolve a ocorrência pela empresa do contexto (404 se não achar, 422 se a
 * etapa não é `separation`), confere o teto por mensagem amigável e grava o original + a miniatura
 * opcional na mesma transação. A trava de verdade contra a corrida da sexta foto é o unique de
 * posição e o CHECK no banco (T1) — mapeados para `TripOccurrenceAttachmentLimitError` dentro de
 * `insertOccurrenceAttachmentRow` (`drizzle-occurrence-attachment.repository.ts`).
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import {
  assertOccurrenceUploadAccepted,
  buildOccurrenceAttachmentObjectKey,
  buildOccurrenceThumbnailObjectKey,
  OCCURRENCE_ATTACHMENT_LIMIT,
  OCCURRENCE_PHOTO_MAX_BYTES,
  OCCURRENCE_THUMBNAIL_MAX_BYTES,
  resolveOccurrenceAttachmentRetentionUntil,
} from '../domain/occurrence-attachment.policy.js'
import {
  OccurrenceTypeNotSeparationError,
  TripOccurrenceAttachmentLimitError,
  TripOccurrenceNotFoundError,
} from '../domain/trip.error.js'
import type { TripOccurrenceAttachmentPosition } from './register-trip-occurrence.use-case.js'
import type { RemovableObjectStoragePort } from './stored-object-cleanup.service.js'
import { runWithStoredObjectCleanup } from './stored-object-cleanup.service.js'

export type AttachOccurrencePhotoAttachment = {
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
}

export type InsertOccurrenceAttachmentTransactionInput = {
  readonly companyId: string
  readonly occurrenceId: string
  readonly storedObjectId: string
  readonly thumbnailObjectId: string | null
}

export type InsertOccurrenceStoredObjectInput = {
  readonly companyId: string
  readonly id: string
  readonly mimeType: string
  readonly objectKey: string
  readonly purpose: 'trip_occurrence_attachment' | 'trip_occurrence_thumbnail'
  readonly retentionUntil: Date
  readonly sha256: string
  readonly sizeBytes: number
}

/** O que a transação sabe fazer — implementado sobre a mesma conexão. */
export type AttachOccurrencePhotoTransactionPort = {
  insertAttachment(
    input: InsertOccurrenceAttachmentTransactionInput,
  ): Promise<TripOccurrenceAttachmentPosition>
  insertStoredObject(input: InsertOccurrenceStoredObjectInput): Promise<void>
}

export type AttachOccurrencePhotoUnitOfWork = {
  execute<TResult>(
    operation: (transaction: AttachOccurrencePhotoTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export type AttachOccurrencePhotoPort = {
  countOccurrenceAttachments(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<number>
  /** `null` quando a ocorrência não é desta empresa — 404, nunca 403 (RF6). */
  findOccurrence(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | { readonly id: string; readonly stage: TripOccurrenceStage }>
  newObjectId(): string
  now(): Date
  storage: RemovableObjectStoragePort
  unitOfWork: AttachOccurrencePhotoUnitOfWork
}

export type AttachOccurrencePhotoInput = {
  readonly attachment: AttachOccurrencePhotoAttachment
  readonly companyId: string
  readonly occurrenceId: string
  readonly repository: AttachOccurrencePhotoPort
}

export async function attachOccurrencePhoto(
  input: AttachOccurrencePhotoInput,
): Promise<TripOccurrenceAttachmentPosition> {
  const { attachment, companyId, occurrenceId, repository } = input

  const occurrence = await repository.findOccurrence({ companyId, occurrenceId })
  if (occurrence === null) throw new TripOccurrenceNotFoundError()
  if (occurrence.stage !== TRIP_OCCURRENCE_STAGE.separation) {
    throw new OccurrenceTypeNotSeparationError()
  }

  /**
   * ⚠️ Teto, tipo e assinatura — **antes** de contar, de abrir transação ou de subir bytes.
   * Arquivo recusado não gasta nenhum trabalho (mesmo princípio de T6/`office-delivery-
   * proof.service.ts`).
   */
  assertOccurrenceUploadAccepted({
    bytes: attachment.bytes,
    maxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
    mimeType: attachment.mimeType,
  })
  if (attachment.thumbnail !== undefined) {
    assertOccurrenceUploadAccepted({
      bytes: attachment.thumbnail.bytes,
      maxBytes: OCCURRENCE_THUMBNAIL_MAX_BYTES,
      mimeType: attachment.thumbnail.mimeType,
    })
  }

  /**
   * ⚠️ **Não é a trava.** É só a mensagem amigável do caso comum, para não gastar upload numa
   * ocorrência já no teto. A trava de verdade contra a corrida da sexta foto é o unique de posição
   * e o CHECK no banco (T1), mapeados em `insertOccurrenceAttachmentRow`.
   */
  const currentCount = await repository.countOccurrenceAttachments({ companyId, occurrenceId })
  if (currentCount >= OCCURRENCE_ATTACHMENT_LIMIT) throw new TripOccurrenceAttachmentLimitError()

  return runWithStoredObjectCleanup({
    operation: (storage) =>
      repository.unitOfWork.execute(async (transaction) => {
        const retentionUntil = resolveOccurrenceAttachmentRetentionUntil(repository.now())

        const originalObjectId = repository.newObjectId()
        const originalKey = buildOccurrenceAttachmentObjectKey({
          companyId,
          objectId: originalObjectId,
          occurrenceId,
        })
        const originalStored = await storage.store({
          bytes: attachment.bytes,
          companyId,
          mimeType: attachment.mimeType,
          objectId: originalObjectId,
          objectKey: originalKey,
        })
        await transaction.insertStoredObject({
          companyId,
          id: originalObjectId,
          mimeType: attachment.mimeType,
          objectKey: originalKey,
          purpose: 'trip_occurrence_attachment',
          retentionUntil,
          sha256: originalStored.sha256,
          sizeBytes: attachment.bytes.byteLength,
        })

        let thumbnailObjectId: string | null = null
        const { thumbnail } = attachment
        if (thumbnail !== undefined) {
          thumbnailObjectId = repository.newObjectId()
          const thumbnailKey = buildOccurrenceThumbnailObjectKey({
            companyId,
            objectId: thumbnailObjectId,
            occurrenceId,
          })
          const thumbnailStored = await storage.store({
            bytes: thumbnail.bytes,
            companyId,
            mimeType: thumbnail.mimeType,
            objectId: thumbnailObjectId,
            objectKey: thumbnailKey,
          })
          await transaction.insertStoredObject({
            companyId,
            id: thumbnailObjectId,
            mimeType: thumbnail.mimeType,
            objectKey: thumbnailKey,
            purpose: 'trip_occurrence_thumbnail',
            retentionUntil,
            sha256: thumbnailStored.sha256,
            sizeBytes: thumbnail.bytes.byteLength,
          })
        }

        return transaction.insertAttachment({
          companyId,
          occurrenceId,
          storedObjectId: originalObjectId,
          thumbnailObjectId,
        })
      }),
    storage: repository.storage,
  })
}
