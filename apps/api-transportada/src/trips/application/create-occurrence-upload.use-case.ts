/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T201/RF2/RF2a: o app pede a URL assinada de upload **antes** de existir a ocorrência —
 * o arquivo nunca passa pela API (RF2). A validação aqui é só a **forma declarada** (tipo, tamanho):
 * o `Content-Type` não entra na assinatura da URL, então esta barreira nunca é a garantia de tipo —
 * é a confirmação (`confirm-occurrence-upload.use-case.ts`), sobre o objeto de verdade, quem é.
 */
import {
  assertOccurrenceUploadRequestAccepted,
  buildOccurrenceUploadObjectKey,
} from '../domain/occurrence-attachment.policy.js'

/** Teto de expiração do pacote de storage (`createSignedUpload`) — vida curta de propósito. */
export const OCCURRENCE_UPLOAD_EXPIRES_IN_SECONDS = 900

export type OccurrenceUploadSigningPort = {
  createSignedUpload(input: {
    readonly bucket: string
    readonly contentLength: number
    /**
     * ⚠️ Não entra na assinatura da URL (`@aws-sdk/s3-request-presigner` marca `content-type` como
     * cabeçalho não-assinável) — nunca a garantia de tipo, só a forma. A confirmação, sobre os
     * bytes reais, é quem garante.
     */
    readonly contentType: string
    readonly expiresInSeconds: number
    readonly key: string
  }): Promise<URL>
}

export type OccurrenceUploadRequestPort = {
  insertPendingUpload(input: {
    readonly bucket: string
    readonly companyId: string
    readonly declaredSizeBytes: number
    readonly driverId: string
    readonly expiresAt: Date
    readonly id: string
    readonly mimeType: string
    readonly objectKey: string
    readonly tripId: string
  }): Promise<void>
}

export type CreateOccurrenceUploadInput = {
  readonly bucket: string
  readonly companyId: string
  readonly driverId: string
  readonly mimeType: string
  readonly newObjectId: () => string
  readonly now: Date
  readonly repository: OccurrenceUploadRequestPort
  readonly sizeBytes: number
  readonly storage: OccurrenceUploadSigningPort
  readonly tripId: string
}

export type CreateOccurrenceUploadResult = {
  readonly id: string
  readonly uploadUrl: URL
}

export async function createOccurrenceUpload(
  input: CreateOccurrenceUploadInput,
): Promise<CreateOccurrenceUploadResult> {
  assertOccurrenceUploadRequestAccepted({ mimeType: input.mimeType, sizeBytes: input.sizeBytes })

  const id = input.newObjectId()
  const objectKey = buildOccurrenceUploadObjectKey({
    companyId: input.companyId,
    objectId: id,
    tripId: input.tripId,
  })
  const expiresAt = new Date(input.now.getTime() + OCCURRENCE_UPLOAD_EXPIRES_IN_SECONDS * 1000)

  const uploadUrl = await input.storage.createSignedUpload({
    bucket: input.bucket,
    contentLength: input.sizeBytes,
    contentType: input.mimeType,
    expiresInSeconds: OCCURRENCE_UPLOAD_EXPIRES_IN_SECONDS,
    key: objectKey,
  })

  await input.repository.insertPendingUpload({
    bucket: input.bucket,
    companyId: input.companyId,
    declaredSizeBytes: input.sizeBytes,
    driverId: input.driverId,
    expiresAt,
    id,
    mimeType: input.mimeType,
    objectKey,
    tripId: input.tripId,
  })

  return { id, uploadUrl }
}
