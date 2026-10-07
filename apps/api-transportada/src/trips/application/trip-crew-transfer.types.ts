/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import type { TripDriverLine } from '../domain/trip.policy.js'
import type { TripCompanyContext, TripDetail } from './trip.port.js'

/** Spec 249 D3: o pedido do escritório — motoristas, ajudantes e o motivo. Nunca o veículo (D2). */
export type TransferTripCrewInput = {
  readonly context: TripCompanyContext
  readonly correlationId: string
  readonly driverIds: readonly string[]
  readonly helperIds: readonly string[]
  readonly ipAddress: string
  readonly reason: string
  readonly tripId: string
}

/** O que o repositório grava: a tripulação já resolvida e a trilha de quem pediu. */
export type TransferTripCrewParams = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly correlationId: string
  readonly crew: readonly TripDriverLine[]
  readonly ipAddress: string
  readonly reason: string
  readonly tripId: string
}

/** Decimais de 2 casas como texto — dinheiro nunca trafega como número. */
export type TripCrewTransferSummary = {
  readonly costAfter: string
  readonly costBefore: string
  readonly costDifference: string
  readonly costHasGaps: boolean
  readonly id: string
  readonly mdfeDriverDivergence: boolean
}

export type TransferTripCrewResult = {
  readonly transfer: TripCrewTransferSummary
  readonly trip: TripDetail
}
