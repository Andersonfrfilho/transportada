/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 209 RF1: a rota irmã, por parada, do upload da 179 (`request-occurrence-upload.use-case.ts`).
 * A foto do "Deu problema" não tem nota, então a viagem vem da parada, e só de uma viagem na rua
 * deste motorista — o mesmo portão da própria ocorrência. O objeto nasce escopado por essa viagem,
 * nunca por id que o cliente mande (RF2b da 179).
 */
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
import { FIELD_TRIP_TARGET_KIND, type FieldTripTarget } from './field-trip-target.types.js'
import { TripStopNotReachableError } from '../domain/trip.error.js'

export type ReachableStopPort = {
  /** `null` quando a parada não é de uma viagem na rua deste motorista, nesta empresa. */
  findReachableStop(input: {
    readonly companyId: string
    readonly stopId: string
    readonly target: FieldTripTarget
  }): Promise<null | { readonly tripId: string }>
}

async function resolveReachableTripId(input: {
  readonly companyId: string
  readonly driverId: string
  readonly repository: ReachableStopPort
  readonly stopId: string
}): Promise<string> {
  const reachable = await input.repository.findReachableStop({
    companyId: input.companyId,
    stopId: input.stopId,
    target: { driverId: input.driverId, kind: FIELD_TRIP_TARGET_KIND.driver },
  })
  if (reachable === null) throw new TripStopNotReachableError()
  return reachable.tripId
}

export type RequestStopOccurrenceUploadInput = {
  readonly bucket: string
  readonly companyId: string
  readonly driverId: string
  readonly mimeType: string
  readonly newObjectId: () => string
  readonly now: Date
  readonly repository: OccurrenceUploadRequestPort & ReachableStopPort
  readonly sizeBytes: number
  readonly stopId: string
  readonly storage: OccurrenceUploadSigningPort
}

export async function requestStopOccurrenceUpload(
  input: RequestStopOccurrenceUploadInput,
): Promise<CreateOccurrenceUploadResult> {
  const tripId = await resolveReachableTripId(input)

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
    tripId,
  })
}

export type ConfirmReachableStopOccurrenceUploadInput = {
  readonly companyId: string
  readonly driverId: string
  readonly id: string
  readonly now: Date
  readonly repository: OccurrenceUploadConfirmationPort & ReachableStopPort
  readonly stopId: string
  readonly storage: OccurrenceUploadReadStoragePort
}

export async function confirmReachableStopOccurrenceUpload(
  input: ConfirmReachableStopOccurrenceUploadInput,
): Promise<ConfirmOccurrenceUploadResult> {
  const tripId = await resolveReachableTripId(input)

  return confirmOccurrenceUpload({
    companyId: input.companyId,
    id: input.id,
    now: input.now,
    repository: input.repository,
    storage: input.storage,
    tripId,
  })
}
