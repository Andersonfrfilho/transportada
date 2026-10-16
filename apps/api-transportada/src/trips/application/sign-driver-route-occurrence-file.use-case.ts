/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o link assinado (5 min) de um arquivo da ocorrência. Antes de assinar, o objeto
 * tem de ser foto, assinatura ou anexo do chat **desta** ocorrência, e a retenção não pode ter vencido:
 * o `objectId` do caminho nunca basta sozinho. A URL assinada não vai a log.
 */
import {
  DriverTripNotActiveError,
  TripOccurrenceAttachmentNotFoundError,
  TripOccurrenceNotFoundError,
} from '../domain/trip.error.js'
import { isRouteOccurrenceFileExpired } from '../domain/driver-route-occurrence.policy.js'
import type {
  DriverRouteOccurrenceReaderPort,
  DriverRouteOccurrenceSignedDownloadPort,
} from './driver-route-occurrence.port.js'
import type { OccurrenceKind } from './occurrence-resolution.port.js'

/** Cinco minutos, como a URL da foto da ocorrência (161) e a do anexo do chat (183). */
export const DRIVER_ROUTE_OCCURRENCE_FILE_URL_SECONDS = 300

const DEFAULT_FILE_NAME = 'ocorrencia'

/** Só o que o navegador exibe sem executar nada: html e svg do anexo do chat nunca abrem na origem da API. */
const INLINE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export type SignDriverRouteOccurrenceFileInput = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
  readonly objectId: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceKind
}

export type SignDriverRouteOccurrenceFileResult = {
  readonly expiresAt: string
  readonly url: string
}

export type SignDriverRouteOccurrenceFileUseCase = {
  readonly execute: (
    input: SignDriverRouteOccurrenceFileInput,
  ) => Promise<SignDriverRouteOccurrenceFileResult>
}

export function createSignDriverRouteOccurrenceFileUseCase(dependencies: {
  readonly clock: () => Date
  readonly reader: DriverRouteOccurrenceReaderPort
  readonly storage: DriverRouteOccurrenceSignedDownloadPort
}): SignDriverRouteOccurrenceFileUseCase {
  return {
    async execute(input) {
      const tripId = await dependencies.reader.findCurrentTripId(input)
      if (tripId === null) throw new DriverTripNotActiveError()
      const [facts] = await dependencies.reader.readOccurrences({
        companyId: input.companyId,
        driverUserId: input.driverUserId,
        target: { id: input.occurrenceId, kind: input.occurrenceKind },
        tripId,
      })
      if (facts === undefined) throw new TripOccurrenceNotFoundError()

      const now = dependencies.clock()
      const file = [
        ...facts.photos,
        ...(facts.signature === null ? [] : [facts.signature]),
        ...facts.chatAttachments,
      ].find((candidate) => candidate.objectId === input.objectId)
      if (file === undefined || isRouteOccurrenceFileExpired(file, now)) {
        throw new TripOccurrenceAttachmentNotFoundError()
      }

      const url = await dependencies.storage.createSignedDownload({
        bucket: file.bucket,
        disposition: INLINE_CONTENT_TYPES.has(file.contentType) ? 'inline' : 'attachment',
        expiresInSeconds: DRIVER_ROUTE_OCCURRENCE_FILE_URL_SECONDS,
        filename: file.fileName ?? DEFAULT_FILE_NAME,
        key: file.objectKey,
      })
      return {
        expiresAt: new Date(
          now.getTime() + DRIVER_ROUTE_OCCURRENCE_FILE_URL_SECONDS * 1000,
        ).toISOString(),
        url: url.toString(),
      }
    },
  }
}
