/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import type { TripCompanyContext, TripDetail } from './trip.port.js'

/** Spec 257 D6: o que o repositório grava — as notas soltas, o motivo e a trilha de quem pediu. */
export type LinkTripDocumentsAfterDispatchParams = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly nfeDocumentIds: readonly string[]
  readonly reason: string
  readonly tripId: string
}

export type LinkedAfterDispatchDocument = {
  readonly nfeDocumentId: string
  readonly stopId: string | null
  readonly tripDocumentId: string
}

export type SkippedAfterDispatchDocument = {
  readonly nfeDocumentId: string
  readonly reason: 'already_linked'
}

/** `eventId` é nulo quando nenhuma nota entrou: lote inteiro `skipped` não grava histórico. */
export type LinkTripDocumentsAfterDispatchResult = {
  readonly createdStopIds: readonly string[]
  readonly documentsWithoutCte: number
  readonly eventId: string | null
  readonly linked: readonly LinkedAfterDispatchDocument[]
  readonly mdfeDocumentDivergence: boolean
  readonly skipped: readonly SkippedAfterDispatchDocument[]
  readonly tripStatus: TripStatus
}

/** Spec 257 D2: o pedido do escritório — as notas soltas e o motivo. */
export type LinkTripDocumentsAfterDispatchInput = {
  readonly context: TripCompanyContext
  readonly correlationId: string
  readonly ipAddress: string
  readonly nfeDocumentIds: readonly string[]
  readonly reason: string
  readonly tripId: string
}

export type LinkTripDocumentsAfterDispatchResponse = {
  readonly link: LinkTripDocumentsAfterDispatchResult
  readonly trip: TripDetail
}
