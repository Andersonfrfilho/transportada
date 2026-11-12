/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: o escopo mínimo que o ordenador das paradas do rascunho precisa do banco.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import type { TripStatus } from '../../database/trip.schema.js'
import type { StopOrderErrorCode, StopOrderSource } from '../domain/draft-stop-order.constant.js'

export type DraftStopOrderingStop = Readonly<{
  addressKey: string
  id: string
  sequence: number
}>

export type DraftStopOrderingState = Readonly<{
  /** Paradas da viagem, em qualquer ordem: o ordenador as ordena por `sequence`. */
  stops: readonly DraftStopOrderingStop[]
  stopOrderSource: StopOrderSource
  tripStatus: TripStatus
}>

export type DraftStopCoordinate = Readonly<{
  latitude: number
  longitude: number
  precision: GeocodingPrecision
}>

export type OrderDraftTripStopsPort = {
  /** Coordenada por `address_key`. A chave sem linha em `geocoded_addresses` simplesmente não vem. */
  readStopCoordinates(input: {
    readonly addressKeys: readonly string[]
  }): Promise<ReadonlyMap<string, DraftStopCoordinate>>
  readOrderingState(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<DraftStopOrderingState | null>
  /**
   * Grava a origem da ordem sem mexer nas paradas: o caso "a ordem já estava certa" e o caso da falha. `errorCode`
   * nulo limpa a falha anterior.
   */
  recordStopOrder(input: {
    readonly companyId: string
    readonly errorCode: StopOrderErrorCode | null
    readonly source: StopOrderSource
    readonly tripId: string
  }): Promise<void>
}
