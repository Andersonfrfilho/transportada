/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TripNotFoundError } from '../domain/trip.error.js'

export type TripStopSummary = {
  readonly addressKey: string
  readonly arrivedAt: string | null
  readonly completedAt: string | null
  readonly deliveryWindowEnd: string | null
  readonly deliveryWindowStart: string | null
  readonly documentIds: readonly string[]
  readonly id: string
  readonly label: string
  readonly sequence: number
}

export type ListTripStopsPort = {
  /** `null` quando a viagem não existe nesta empresa. */
  listStops(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripStopSummary[] | null>
}

export type ListTripStopsInput = {
  readonly companyId: string
  readonly repository: ListTripStopsPort
  readonly tripId: string
}

export type ListTripStopsResult = { readonly stops: readonly TripStopSummary[] }

/** Leitura simples — a parada já vem ordenada por `sequence` do repositório (spec 056 D3). */
export async function listTripStops(input: ListTripStopsInput): Promise<ListTripStopsResult> {
  const stops = await input.repository.listStops(input)
  if (stops === null) throw new TripNotFoundError()

  return { stops }
}
