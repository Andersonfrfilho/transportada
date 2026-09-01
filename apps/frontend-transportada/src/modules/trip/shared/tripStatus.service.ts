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

/**
 * ADR-0043 §1: separar e carregar são trabalho de **barracão** — espelha o ramo não-`isStreetWork`
 * de `checkTripAcceptsDocumentWork`. `draft` não basta: sem roteiro planejado o backend recusa com
 * `TRIP_ROUTE_NOT_PLANNED`, então oferecer o botão ali é oferecer uma falha garantida.
 */
export function canSeparateOrLoadDocuments(status: TripStatus): boolean {
  return status === 'route_planned' || status === 'separating' || status === 'loading'
}

/**
 * ADR-0043 §1: devolver é trabalho de **rua**, não de barracão — espelha o ramo `isStreetWork` de
 * `checkTripAcceptsDocumentWork`, que exige `isTripDispatched`. A nota só volta depois de a carga
 * ter saído; antes disso ela se desvincula, não se devolve. `completed` fica de fora por ser
 * terminal (o backend o barra antes de chegar no ramo de rua).
 */
export function canReturnDocuments(status: TripStatus): boolean {
  return status === 'dispatched' || status === 'in_transit'
}
