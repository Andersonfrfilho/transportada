/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripStatus } from './trip.types'

/** ADR-0043 §2 (D2): a partir daqui a carga já está na rua — nenhuma nota entra, nenhuma sai, e a
 * ordem das paradas está congelada no `trip_stop_snapshot`. */
const DISPATCHED_STATUSES: readonly TripStatus[] = ['dispatched', 'in_transit', 'completed']

export function isTripDispatched(status: TripStatus): boolean {
  return DISPATCHED_STATUSES.includes(status)
}

/** Mesma porta de não-retorno que `checkTripAcceptsLinkage` no backend (T013): vincular, desvincular
 * e reordenar parada só funcionam antes de `dispatched`, e nunca numa viagem cancelada. */
export function isTripEditable(status: TripStatus): boolean {
  return status !== 'cancelled' && !isTripDispatched(status)
}
