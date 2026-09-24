/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T201/RF2a: a **única** garantia de tipo. O `Content-Type` não entra na assinatura da URL
 * de upload — duas URLs com tipos diferentes e o mesmo tamanho saem idênticas — então é aqui, com o
 * objeto já enviado, que o servidor confere tipo, tamanho e sha256 de verdade (`head()` mais os
 * bytes), antes de o objeto virar `stored_objects` e poder ser referenciado por uma ocorrência.
 */
import {
  assertOccurrenceAttachmentAccepted,
  OCCURRENCE_PDF_MAX_BYTES,
  OCCURRENCE_PHOTO_MAX_BYTES,
  isOccurrencePdf,
  sha256Hex,
} from '../domain/occurrence-attachment.policy.js'
import { TripOccurrenceUploadNotReachableError } from '../domain/trip.error.js'

export type PendingOccurrenceUpload = {
  readonly bucket: string
  readonly expiresAt: Date
  readonly mimeType: string
  readonly objectKey: string
}

export type OccurrenceUploadConfirmationPort = {
  confirmUpload(input: {
    readonly bucket: string
    readonly companyId: string
    readonly id: string
    readonly mimeType: string
    readonly now: Date
    readonly objectKey: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<void>
  /** `null` quando o pedido não existe, não é desta empresa/viagem, ou já não está `pending`. */
  findPendingUpload(input: {
    readonly companyId: string
    readonly id: string
    readonly tripId: string
  }): Promise<null | PendingOccurrenceUpload>
}

export type OccurrenceUploadReadStoragePort = {
  getObjectStream(input: {
    readonly bucket: string
    readonly key: string
  }): Promise<ReadableStream<Uint8Array>>
  headObject(input: {
    readonly bucket: string
    readonly key: string
  }): Promise<{ readonly contentLength: number } | undefined>
}

export type ConfirmOccurrenceUploadInput = {
  readonly companyId: string
  readonly id: string
  readonly now: Date
  readonly repository: OccurrenceUploadConfirmationPort
  readonly storage: OccurrenceUploadReadStoragePort
  readonly tripId: string
}

export type ConfirmOccurrenceUploadResult = { readonly id: string }

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

export async function confirmOccurrenceUpload(
  input: ConfirmOccurrenceUploadInput,
): Promise<ConfirmOccurrenceUploadResult> {
  const pending = await input.repository.findPendingUpload({
    companyId: input.companyId,
    id: input.id,
    tripId: input.tripId,
  })
  if (pending === null) throw new TripOccurrenceUploadNotReachableError()
  if (pending.expiresAt.getTime() <= input.now.getTime()) {
    throw new TripOccurrenceUploadNotReachableError()
  }

  const location = { bucket: pending.bucket, key: pending.objectKey }
  const head = await input.storage.headObject(location)
  if (head === undefined) throw new TripOccurrenceUploadNotReachableError()

  /**
   * Confere o tamanho pelo `head()` **antes** de baixar os bytes — um upload maior que o teto não
   * precisa ser lido inteiro para ser recusado.
   */
  const maxBytes = isOccurrencePdf(pending.mimeType)
    ? OCCURRENCE_PDF_MAX_BYTES
    : OCCURRENCE_PHOTO_MAX_BYTES
  if (head.contentLength > maxBytes) {
    throw new TripOccurrenceUploadNotReachableError()
  }

  const bytes = await readAllBytes(await input.storage.getObjectStream(location))

  /**
   * A única checagem que decide se o tipo declarado bate com o arquivo de verdade — assinatura de
   * bytes, não `Content-Type` (RF2a). Lança `TripDeliveryProofRejectedError` quando não bate.
   */
  assertOccurrenceAttachmentAccepted({
    bytes,
    imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
    mimeType: pending.mimeType,
  })

  await input.repository.confirmUpload({
    bucket: pending.bucket,
    companyId: input.companyId,
    id: input.id,
    mimeType: pending.mimeType,
    now: input.now,
    objectKey: pending.objectKey,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
  })

  return { id: input.id }
}
