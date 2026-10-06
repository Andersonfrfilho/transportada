/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2/T3.4a: a foto da ocorrência de recebimento usa as mesmas chaves, a mesma retenção e a
 * mesma tabela de anexos da ocorrência de galpão (spec 161). O bucket recebe os bytes ANTES da
 * transação — assim a trava da chegada nunca espera o armazenamento —, e quem chama envolve tudo em
 * `runWithStoredObjectCleanup`, que apaga o objeto se algo depois desfizer. Dentro da transação só
 * entram as linhas.
 */
import type { RemovableObjectStoragePort } from '../../trips/application/stored-object-cleanup.service.js'
import {
  buildOccurrenceAttachmentObjectKey,
  buildOccurrenceThumbnailObjectKey,
  resolveOccurrenceAttachmentRetentionUntil,
} from '../../trips/domain/occurrence-attachment.policy.js'
import type {
  CargoArrivalOccurrenceTransactionPort,
  StoreOccurrenceObjectInput,
} from './cargo-arrival-occurrence.port.js'
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
}

async function storeObject(params: StoreParams): Promise<StoreOccurrenceObjectInput> {
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
  return {
    id: objectId,
    mimeType: params.mimeType,
    objectKey,
    purpose:
      params.kind === 'original' ? 'trip_occurrence_attachment' : 'trip_occurrence_thumbnail',
    retentionUntil: params.retentionUntil,
    sha256: stored.sha256,
    sizeBytes: params.bytes.byteLength,
  }
}

/** O que já está no bucket e falta ligar à ocorrência dentro da transação. */
export type UploadedCargoArrivalOccurrencePhoto = {
  readonly original: StoreOccurrenceObjectInput
  readonly thumbnail: StoreOccurrenceObjectInput | null
}

export type UploadCargoArrivalOccurrencePhotoParams = {
  readonly attachment: CargoArrivalOccurrenceAttachment
  readonly companyId: string
  readonly newObjectId: () => string
  readonly now: Date
  readonly occurrenceId: string
  readonly storage: RemovableObjectStoragePort
}

/** O original (prova) e a miniatura opcional; bytes já conferidos antes de tudo. */
export async function uploadCargoArrivalOccurrencePhoto(
  params: UploadCargoArrivalOccurrencePhotoParams,
): Promise<UploadedCargoArrivalOccurrencePhoto> {
  const common = {
    companyId: params.companyId,
    newObjectId: params.newObjectId,
    occurrenceId: params.occurrenceId,
    retentionUntil: resolveOccurrenceAttachmentRetentionUntil(params.now),
    storage: params.storage,
  }
  const original = await storeObject({
    ...common,
    bytes: params.attachment.bytes,
    kind: 'original',
    mimeType: params.attachment.mimeType,
  })
  const { thumbnail } = params.attachment
  return {
    original,
    thumbnail:
      thumbnail === undefined
        ? null
        : await storeObject({
            ...common,
            bytes: thumbnail.bytes,
            kind: 'thumbnail',
            mimeType: thumbnail.mimeType,
          }),
  }
}

/** Sem bucket: só as linhas, na transação da ocorrência. */
export async function persistCargoArrivalOccurrencePhoto(params: {
  readonly occurrenceId: string
  readonly photo: UploadedCargoArrivalOccurrencePhoto
  readonly transaction: CargoArrivalOccurrenceTransactionPort
}): Promise<void> {
  const { photo, transaction } = params
  await transaction.insertStoredObject(photo.original)
  if (photo.thumbnail !== null) await transaction.insertStoredObject(photo.thumbnail)
  await transaction.insertAttachment({
    occurrenceId: params.occurrenceId,
    storedObjectId: photo.original.id,
    thumbnailObjectId: photo.thumbnail?.id ?? null,
  })
}
