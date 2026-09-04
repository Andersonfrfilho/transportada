/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DispatchTripResult } from './dispatch-trip.use-case.js'
import { TripNotOfDriverError } from '../domain/trip.error.js'

export type DriverTripLinkagePort = {
  /** `false` cobre viagem alheia **e** viagem inexistente — o 403 não distingue, de propósito. */
  isTripOfDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly tripId: string
  }): Promise<boolean>
}

export type DispatchDriverTripInput = {
  readonly actorUserId: string
  readonly companyId: string
  /**
   * ADR-0058 §2: a máquina não muda — este é o mesmo `dispatchTrip` do escritório, com o mesmo
   * snapshot e a mesma idempotência (`unchanged` na repetição). Sem `force`: pendência de carga se
   * resolve no barracão, não na cabine.
   */
  readonly dispatch: (input: {
    readonly actorUserId: string
    readonly tripId: string
  }) => Promise<DispatchTripResult>
  readonly driverId: string
  readonly linkage: DriverTripLinkagePort
  readonly tripId: string
}

/**
 * ADR-0058 §1: o motorista vinculado (`trip_drivers`) despacha a própria viagem. Sem permissão
 * nova — o recorte é o vínculo, como em todo `/me/trips/current/*`.
 */
export async function dispatchDriverTrip(
  input: DispatchDriverTripInput,
): Promise<DispatchTripResult> {
  const isLinked = await input.linkage.isTripOfDriver({
    companyId: input.companyId,
    driverId: input.driverId,
    tripId: input.tripId,
  })
  if (!isLinked) throw new TripNotOfDriverError()

  return input.dispatch({ actorUserId: input.actorUserId, tripId: input.tripId })
}
