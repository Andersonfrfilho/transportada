/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: a foto da ocorrência em coleta vira **upload confirmado de ocorrência**
 * (`trip_occurrence_uploads`), pelo mesmo par do app: o pedido pendente e a confirmação
 * (`confirmOccurrenceUpload`), que confere tipo, tamanho e sha256 sobre os bytes de verdade e copia para
 * a chave final. A diferença é só que os bytes já estão no servidor (baixados do WhatsApp), então a
 * subida é direta, sem URL assinada.
 *
 * A foto do WhatsApp passa do teto da foto de ocorrência (512 KiB) com frequência: o app reduz no
 * navegador; aqui a redução é a mesma ideia, no servidor (JPEG, lado maior até 1600 px).
 */
import { randomUUID } from 'node:crypto'

import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import sharp from 'sharp'

import { ApiError } from '../../shared/api.error.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import {
  confirmOccurrenceUpload,
  type OccurrenceUploadConfirmationPort,
} from '../../trips/application/confirm-occurrence-upload.use-case.js'
import {
  OCCURRENCE_UPLOAD_EXPIRES_IN_SECONDS,
  type OccurrenceUploadRequestPort,
} from '../../trips/application/create-occurrence-upload.use-case.js'
import { FIELD_TRIP_TARGET_KIND } from '../../trips/application/field-trip-target.types.js'
import { isDeliveryProofMimeType } from '../../trips/domain/delivery-proof.policy.js'
import {
  buildOccurrenceUploadObjectKey,
  OCCURRENCE_PHOTO_MAX_BYTES,
  sha256Hex,
} from '../../trips/domain/occurrence-attachment.policy.js'
import { findDriverReachableDocument } from '../../trips/infrastructure/driver-reachable-document.query.js'
import {
  WhatsAppOccurrencePhotoRejectedError,
  type WhatsAppOccurrenceDraftPorts,
} from '../application/whatsapp-occurrence-draft.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** As tentativas de redução, da melhor para a mais leve. */
const REENCODE_STEPS = [
  { quality: 80, side: 1600 },
  { quality: 70, side: 1280 },
  { quality: 60, side: 1024 },
] as const

/** A foto como o upload de ocorrência aceita: imagem do tipo aceito e até o teto; senão JPEG reduzido. */
export async function fitOccurrencePhoto(input: {
  readonly bytes: Uint8Array
  readonly mimeType: string
}): Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }> {
  if (
    isDeliveryProofMimeType(input.mimeType) &&
    input.bytes.byteLength <= OCCURRENCE_PHOTO_MAX_BYTES
  ) {
    return input
  }
  for (const step of REENCODE_STEPS) {
    let output: Buffer
    try {
      output = await sharp(input.bytes)
        .rotate()
        .resize({ fit: 'inside', height: step.side, width: step.side, withoutEnlargement: true })
        .jpeg({ mozjpeg: true, quality: step.quality })
        .toBuffer()
    } catch {
      throw new WhatsAppOccurrencePhotoRejectedError()
    }
    if (output.byteLength <= OCCURRENCE_PHOTO_MAX_BYTES) {
      return { bytes: new Uint8Array(output), mimeType: 'image/jpeg' }
    }
  }
  throw new WhatsAppOccurrencePhotoRejectedError()
}

export function createWhatsAppOccurrencePhotoStore(deps: {
  readonly bucket: string
  readonly clock?: () => Date
  readonly database: Database
  readonly storage: NfeStorageGateway
  readonly uploads: OccurrenceUploadConfirmationPort & OccurrenceUploadRequestPort
}): WhatsAppOccurrenceDraftPorts['storePhoto'] {
  const clock = deps.clock ?? (() => new Date())
  return async ({ bytes, companyId, documentId, driverId, mimeType }) => {
    const reachable = await findDriverReachableDocument(deps.database, {
      companyId,
      documentId,
      target: { driverId, kind: FIELD_TRIP_TARGET_KIND.driver },
    })
    if (reachable === null) throw new WhatsAppOccurrencePhotoRejectedError()
    const photo = await fitOccurrencePhoto({ bytes, mimeType })
    const now = clock()
    const id = randomUUID()
    const objectKey = buildOccurrenceUploadObjectKey({
      companyId,
      objectId: id,
      tripId: reachable.tripId,
    })
    await deps.uploads.insertPendingUpload({
      bucket: deps.bucket,
      companyId,
      declaredSizeBytes: photo.bytes.byteLength,
      driverId,
      expiresAt: new Date(now.getTime() + OCCURRENCE_UPLOAD_EXPIRES_IN_SECONDS * 1000),
      id,
      mimeType: photo.mimeType,
      objectKey,
      tripId: reachable.tripId,
    })
    await deps.storage.storeObject({
      body: photo.bytes,
      bucket: deps.bucket,
      contentLength: photo.bytes.byteLength,
      contentType: photo.mimeType,
      key: objectKey,
      sha256: sha256Hex(photo.bytes),
    })
    try {
      const confirmed = await confirmOccurrenceUpload({
        companyId,
        id,
        now,
        repository: deps.uploads,
        storage: deps.storage,
        tripId: reachable.tripId,
      })
      return { uploadId: confirmed.id }
    } catch (error) {
      // Recusa da conferência (tipo, tamanho, objeto) é 4xx; o resto é erro de verdade e sobe.
      if (error instanceof ApiError && error.status < 500) {
        throw new WhatsAppOccurrencePhotoRejectedError()
      }
      throw error
    }
  }
}
