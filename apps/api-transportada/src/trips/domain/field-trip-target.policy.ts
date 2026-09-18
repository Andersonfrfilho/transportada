/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DriverNotOnTripError, TripWithoutDriverError } from './trip.error.js'

export type PickOnBehalfOfDriverParams = {
  readonly drivers: readonly { readonly driverId: string; readonly position: number }[]
  readonly requestedDriverId?: string
}

/**
 * ADR-0067 §2: em nome de qual motorista o escritório registra. Sem pedido, o de menor posição —
 * que é o 1, pela montagem da tripulação. O pedido é conferido contra a tripulação lida, nunca vai
 * para o `where`.
 */
export function pickOnBehalfOfDriver(params: PickOnBehalfOfDriverParams): string {
  const [first] = [...params.drivers].sort((left, right) => left.position - right.position)
  if (first === undefined) throw new TripWithoutDriverError()
  if (params.requestedDriverId === undefined) return first.driverId

  const isOnTrip = params.drivers.some((driver) => driver.driverId === params.requestedDriverId)
  if (!isOnTrip) throw new DriverNotOnTripError()

  return params.requestedDriverId
}
