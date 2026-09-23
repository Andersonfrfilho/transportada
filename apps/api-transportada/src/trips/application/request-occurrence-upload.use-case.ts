/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T202: liga o pedido de upload (e a confirmação) à nota que o motorista está registrando
 * — a mesma consulta que `register-driver-occurrence.use-case.ts` já usa para achar a viagem
 * alcançável, para o objeto nascer escopado pela viagem certa (RF2b) sem o cliente escolher.
 *
 * Só o motorista (spec 156 T3 não se aplica aqui): o caminho do escritório continua sendo o
 * multipart existente (RF6) — esta URL assinada é nova só para a rua.
 */
import { FIELD_TRIP_TARGET_KIND, type FieldTripTarget } from './field-trip-target.types.js'
import {
  confirmOccurrenceUpload,
  type ConfirmOccurrenceUploadResult,
  type OccurrenceUploadConfirmationPort,
  type OccurrenceUploadReadStoragePort,
} from './confirm-occurrence-upload.use-case.js'
import {
  createOccurrenceUpload,
  type CreateOccurrenceUploadResult,
  type OccurrenceUploadRequestPort,
  type OccurrenceUploadSigningPort,
} from './create-occurrence-upload.use-case.js'
import { TripDocumentNotReachableError } from '../domain/trip.error.js'

export type ReachableDocumentPort = {
  findReachableDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  }): Promise<null | { readonly tripId: string }>
}

export type RequestOccurrenceUploadInput = {
  readonly bucket: string
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
  readonly mimeType: string
  readonly newObjectId: () => string
  readonly now: Date
  readonly repository: OccurrenceUploadRequestPort & ReachableDocumentPort
  readonly sizeBytes: number
  readonly storage: OccurrenceUploadSigningPort
}

export async function requestOccurrenceUpload(
  input: RequestOccurrenceUploadInput,
): Promise<CreateOccurrenceUploadResult> {
  const reachable = await input.repository.findReachableDocument({
    companyId: input.companyId,
    documentId: input.documentId,
    target: { driverId: input.driverId, kind: FIELD_TRIP_TARGET_KIND.driver },
  })
  if (reachable === null) throw new TripDocumentNotReachableError()

  return createOccurrenceUpload({
    bucket: input.bucket,
    companyId: input.companyId,
    driverId: input.driverId,
    mimeType: input.mimeType,
    newObjectId: input.newObjectId,
    now: input.now,
    repository: input.repository,
    sizeBytes: input.sizeBytes,
    storage: input.storage,
    tripId: reachable.tripId,
  })
}

export type ConfirmReachableOccurrenceUploadInput = {
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
  readonly id: string
  readonly now: Date
  readonly repository: OccurrenceUploadConfirmationPort & ReachableDocumentPort
  readonly storage: OccurrenceUploadReadStoragePort
}

export async function confirmReachableOccurrenceUpload(
  input: ConfirmReachableOccurrenceUploadInput,
): Promise<ConfirmOccurrenceUploadResult> {
  const reachable = await input.repository.findReachableDocument({
    companyId: input.companyId,
    documentId: input.documentId,
    target: { driverId: input.driverId, kind: FIELD_TRIP_TARGET_KIND.driver },
  })
  if (reachable === null) throw new TripDocumentNotReachableError()

  return confirmOccurrenceUpload({
    companyId: input.companyId,
    id: input.id,
    now: input.now,
    repository: input.repository,
    storage: input.storage,
    tripId: reachable.tripId,
  })
}
