/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: a foto da ocorrência de recebimento usa as mesmas chaves, a mesma retenção e a
 * mesma tabela de anexos da ocorrência de galpão (spec 161) — sobe dentro da transação, e quem a
 * chama envolve tudo em `runWithStoredObjectCleanup`, que apaga o objeto se a transação desfizer.
 */
import type { RemovableObjectStoragePort } from '../../trips/application/stored-object-cleanup.service.js'
import {
  buildOccurrenceAttachmentObjectKey,
  buildOccurrenceThumbnailObjectKey,
  resolveOccurrenceAttachmentRetentionUntil,
} from '../../trips/domain/occurrence-attachment.policy.js'
import type { CargoArrivalOccurrenceTransactionPort } from './cargo-arrival-occurrence.port.js'
import type { CargoArrivalOccurrenceAttachment } from './cargo-arrival-occurrence.types.js'

type StoreParams = {
  readonly bytes: Uint8Array
  readonly companyId: string
  readonly kind: 'original' | 'thumbnail'
  readonly mimeType: string
  readonly newObjectId: () => string
  readonly occurrenceId: string
  readonly retentionUntil: Date
  readonly storage: RemovableObjectStoragePort
  readonly transaction: CargoArrivalOccurrenceTransactionPort
}

async function storeObject(params: StoreParams): Promise<string> {
  const objectId = params.newObjectId()
  const keyInput = { companyId: params.companyId, objectId, occurrenceId: params.occurrenceId }
  const objectKey =
    params.kind === 'original'
      ? buildOccurrenceAttachmentObjectKey(keyInput)
      : buildOccurrenceThumbnailObjectKey(keyInput)
  const stored = await params.storage.store({
    bytes: params.bytes,
    companyId: params.companyId,
    mimeType: params.mimeType,
    objectId,
    objectKey,
  })
  await params.transaction.insertStoredObject({
    id: objectId,
    mimeType: params.mimeType,
    objectKey,
    purpose:
      params.kind === 'original' ? 'trip_occurrence_attachment' : 'trip_occurrence_thumbnail',
    retentionUntil: params.retentionUntil,
    sha256: stored.sha256,
    sizeBytes: params.bytes.byteLength,
  })
  return objectId
}

export type PersistCargoArrivalOccurrencePhotoParams = {
  readonly attachment: CargoArrivalOccurrenceAttachment
  readonly companyId: string
  readonly newObjectId: () => string
  readonly now: Date
  readonly occurrenceId: string
  readonly storage: RemovableObjectStoragePort
  readonly transaction: CargoArrivalOccurrenceTransactionPort
}

/** O original (prova) e a miniatura opcional; bytes já conferidos antes da transação. */
export async function persistCargoArrivalOccurrencePhoto(
  params: PersistCargoArrivalOccurrencePhotoParams,
): Promise<void> {
  const common = {
    companyId: params.companyId,
    newObjectId: params.newObjectId,
    occurrenceId: params.occurrenceId,
    retentionUntil: resolveOccurrenceAttachmentRetentionUntil(params.now),
    storage: params.storage,
    transaction: params.transaction,
  }
  const storedObjectId = await storeObject({
    ...common,
    bytes: params.attachment.bytes,
    kind: 'original',
    mimeType: params.attachment.mimeType,
  })
  const { thumbnail } = params.attachment
  const thumbnailObjectId =
    thumbnail === undefined
      ? null
      : await storeObject({
          ...common,
          bytes: thumbnail.bytes,
          kind: 'thumbnail',
          mimeType: thumbnail.mimeType,
        })
  await params.transaction.insertAttachment({
    occurrenceId: params.occurrenceId,
    storedObjectId,
    thumbnailObjectId,
  })
}
