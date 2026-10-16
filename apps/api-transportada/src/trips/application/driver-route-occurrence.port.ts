/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o que as leituras do motorista precisam do banco — a viagem atual dele e as
 * ocorrências dela, em lote (sem consulta por linha).
 */
import type { DriverRouteOccurrenceFacts } from '../domain/driver-route-occurrence.types.js'
import type { OccurrenceKind } from './occurrence-resolution.port.js'

export type DriverRouteOccurrenceReaderPort = {
  /** A viagem atual **não finalizada** do motorista; `null` sem ela. */
  findCurrentTripId(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<string | null>
  /**
   * As ocorrências da viagem (nota e parada, de qualquer autor). Com `target`, só ela e com o histórico
   * inteiro de eventos; sem, o último evento de cada tipo basta ao estado.
   */
  readOccurrences(input: {
    readonly companyId: string
    readonly driverUserId: string
    readonly target?: { readonly id: string; readonly kind: OccurrenceKind }
    readonly tripId: string
  }): Promise<readonly DriverRouteOccurrenceFacts[]>
}

export type DriverRouteOccurrenceSignedDownloadPort = {
  createSignedDownload(input: {
    readonly bucket: string
    readonly disposition: 'attachment' | 'inline'
    readonly expiresInSeconds: number
    readonly filename: string
    readonly key: string
  }): Promise<URL>
}
