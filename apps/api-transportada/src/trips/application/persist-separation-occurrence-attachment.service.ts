/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T6: grava a ocorrência de galpão junto com o original e a miniatura opcional — a
 * ocorrência, os até dois `stored_objects` e a linha de `trip_document_occurrence_attachments`,
 * todos na mesma transação. Se algo falhar depois de subir bytes ao bucket,
 * `runWithStoredObjectCleanup` remove o que já subiu (RF7/CA7b). O port de transação é injetado —
 * este arquivo não conhece Drizzle nem Postgres, só orquestra (`drizzle-separation-occurrence.
 * repository.ts` é quem implementa `SeparationOccurrenceUnitOfWork`).
 */
import {
  assertOccurrenceUploadAccepted,
  buildOccurrenceAttachmentObjectKey,
  buildOccurrenceThumbnailObjectKey,
  OCCURRENCE_PHOTO_MAX_BYTES,
  OCCURRENCE_THUMBNAIL_MAX_BYTES,
  resolveOccurrenceAttachmentRetentionUntil,
} from '../domain/occurrence-attachment.policy.js'
import type { RemovableObjectStoragePort } from './stored-object-cleanup.service.js'
import { runWithStoredObjectCleanup } from './stored-object-cleanup.service.js'
import type {
  TripOccurrence,
  TripOccurrenceAttachmentPosition,
} from './register-trip-occurrence.use-case.js'

export type SeparationOccurrenceSaveInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly note: string
  readonly occurrenceTypeId: string
  readonly productCode: string
  readonly stage: TripOccurrence['stage']
  readonly tripId: string
  readonly typeName: string
}

export type InsertStoredObjectInput = {
  readonly companyId: string
  readonly id: string
  readonly mimeType: string
  readonly objectKey: string
  readonly purpose: 'trip_occurrence_attachment' | 'trip_occurrence_thumbnail'
  readonly retentionUntil: Date
  readonly sha256: string
  readonly sizeBytes: number
}

export type InsertOccurrenceAttachmentInput = {
  readonly companyId: string
  readonly occurrenceId: string
  readonly storedObjectId: string
  readonly thumbnailObjectId: string | null
}

/** O que a transação sabe fazer — implementado pela infraestrutura sobre a mesma conexão. */
export type SeparationOccurrenceTransactionPort = {
  insertAttachment(
    input: InsertOccurrenceAttachmentInput,
  ): Promise<TripOccurrenceAttachmentPosition>
  insertStoredObject(input: InsertStoredObjectInput): Promise<void>
  saveOccurrence(input: SeparationOccurrenceSaveInput): Promise<null | TripOccurrence>
}

export type SeparationOccurrenceUnitOfWork = {
  execute<TResult>(
    operation: (transaction: SeparationOccurrenceTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export type PersistSeparationOccurrenceWithAttachmentParams = {
  readonly attachment: {
    readonly bytes: Uint8Array
    readonly mimeType: string
    readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
  }
  readonly input: SeparationOccurrenceSaveInput
  readonly newObjectId: () => string
  readonly now: () => Date
  readonly storage: RemovableObjectStoragePort
  readonly unitOfWork: SeparationOccurrenceUnitOfWork
}

export async function persistSeparationOccurrenceWithAttachment(
  params: PersistSeparationOccurrenceWithAttachmentParams,
): Promise<
  null | (TripOccurrence & { readonly attachments: readonly TripOccurrenceAttachmentPosition[] })
> {
  /**
   * Spec 161 T6 (RF7): teto, tipo e assinatura de bytes — do original e da miniatura, se veio uma
   * — conferidos **antes** de abrir a transação ou subir qualquer bytes ao bucket. Arquivo
   * recusado não gasta nenhum trabalho. Os tetos são os da web (D13); o canal WhatsApp (fase 4)
   * tem os seus próprios, validados no adapter dele, não aqui.
   */
  assertOccurrenceUploadAccepted({
    bytes: params.attachment.bytes,
    maxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
    mimeType: params.attachment.mimeType,
  })
  if (params.attachment.thumbnail !== undefined) {
    assertOccurrenceUploadAccepted({
      bytes: params.attachment.thumbnail.bytes,
      maxBytes: OCCURRENCE_THUMBNAIL_MAX_BYTES,
      mimeType: params.attachment.thumbnail.mimeType,
    })
  }

  return runWithStoredObjectCleanup({
    operation: (storage) =>
      params.unitOfWork.execute(async (transaction) => {
        const saved = await transaction.saveOccurrence(params.input)
        if (saved === null) return null

        const retentionUntil = resolveOccurrenceAttachmentRetentionUntil(params.now())

        const originalObjectId = params.newObjectId()
        const originalKey = buildOccurrenceAttachmentObjectKey({
          companyId: params.input.companyId,
          objectId: originalObjectId,
          occurrenceId: saved.id,
        })
        const originalStored = await storage.store({
          bytes: params.attachment.bytes,
          companyId: params.input.companyId,
          mimeType: params.attachment.mimeType,
          objectId: originalObjectId,
          objectKey: originalKey,
        })
        await transaction.insertStoredObject({
          companyId: params.input.companyId,
          id: originalObjectId,
          mimeType: params.attachment.mimeType,
          objectKey: originalKey,
          purpose: 'trip_occurrence_attachment',
          retentionUntil,
          sha256: originalStored.sha256,
          sizeBytes: params.attachment.bytes.byteLength,
        })

        let thumbnailObjectId: string | null = null
        const { thumbnail } = params.attachment
        if (thumbnail !== undefined) {
          thumbnailObjectId = params.newObjectId()
          const thumbnailKey = buildOccurrenceThumbnailObjectKey({
            companyId: params.input.companyId,
            objectId: thumbnailObjectId,
            occurrenceId: saved.id,
          })
          const thumbnailStored = await storage.store({
            bytes: thumbnail.bytes,
            companyId: params.input.companyId,
            mimeType: thumbnail.mimeType,
            objectId: thumbnailObjectId,
            objectKey: thumbnailKey,
          })
          await transaction.insertStoredObject({
            companyId: params.input.companyId,
            id: thumbnailObjectId,
            mimeType: thumbnail.mimeType,
            objectKey: thumbnailKey,
            purpose: 'trip_occurrence_thumbnail',
            retentionUntil,
            sha256: thumbnailStored.sha256,
            sizeBytes: thumbnail.bytes.byteLength,
          })
        }

        const attachmentRow = await transaction.insertAttachment({
          companyId: params.input.companyId,
          occurrenceId: saved.id,
          storedObjectId: originalObjectId,
          thumbnailObjectId,
        })

        return { ...saved, attachments: [attachmentRow] }
      }),
    storage: params.storage,
  })
}
